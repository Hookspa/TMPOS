// Tempo OS — Edge Function "claude"
// Proxy seguro a la API de Anthropic: la API key vive como secreto en el servidor,
// nunca en el cliente. Solo usuarios autenticados pueden llamarla.
// Despliega con verify_jwt = ON (por defecto).
//
// Modelo de confianza: el cuerpo del request lo controla el cliente y NADA de lo
// que llega se usa sin validar. La validación pura (lista blanca de modelos, techo
// de max_tokens y prompt, formato de team_id, saneo de feature) vive en
// ./validate.mjs para poder probarla sin Deno; aquí queda HTTP, autorización y
// registro. Lo que este archivo agrega sobre validate.mjs es lo que necesita red:
// la membresía real del usuario en el equipo y el INSERT en ai_usage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { costOf, validateBody } from "./validate.mjs";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const USAGE_INSERT_ATTEMPTS = 2;
const USAGE_RETRY_DELAY_MS = 120;

const ALLOWED_ORIGINS = new Set([
  "https://hookspa.github.io",
]);

Deno.serve(async (req) => {
  // CORS es una protección del NAVEGADOR: no detiene curl ni scripts. La
  // autorización real es el JWT + la membresía; esta lista no limita la seguridad.
  const origin = req.headers.get("Origin");
  const cors = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
  function j(obj: unknown, status: number) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return j({ error: "cuerpo inválido" }, 400);
    }

    // ── Validación de entradas (antes de gastar un centavo) ──
    const check = validateBody(raw);
    if (!check.ok) return j({ error: check.error }, check.status);
    const { prompt, model: mdl, maxTokens, teamId: requestedTeamId, feature: feat } = check.value;

    // ── Identidad (del JWT que envía el cliente) ──
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: ud } = await supa.auth.getUser(token);
    const user = ud?.user;
    if (!user) return j({ error: "no autorizado" }, 401);

    // ── Autorización: identidad ≠ membresía ──
    // Sin esta comprobación cualquier usuario autenticado podía mandar el team_id
    // de otro equipo y cargarle su consumo de IA.
    let teamId = requestedTeamId;
    if (teamId) {
      const { data: member, error: memberErr } = await supa
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .maybeSingle();
      // Un fallo de la consulta no puede interpretarse como "sí es miembro":
      // ante la duda se niega el acceso.
      if (memberErr) return j({ error: "no se pudo verificar la membresía" }, 503);
      if (!member) return j({ error: "no eres miembro de ese equipo" }, 403);
    } else {
      // Los clientes viejos no siempre enviaban team_id. Se deriva únicamente
      // cuando la pertenencia es inequívoca; jamás se registra consumo sin equipo.
      const { data: memberships, error: membershipsErr } = await supa
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(2);
      if (membershipsErr) return j({ error: "no se pudo verificar la membresía" }, 503);
      if (!memberships?.length) return j({ error: "no perteneces a ningún equipo" }, 403);
      if (memberships.length > 1) {
        return j({ error: "perteneces a más de un equipo; envía team_id explícitamente" }, 400);
      }
      teamId = memberships[0].team_id;
      // La base no debería devolver una membresía sin equipo, pero esta guarda
      // impide que una fila corrupta alcance Anthropic o ai_usage con NULL.
      if (!teamId) return j({ error: "no se pudo determinar el equipo" }, 503);
    }

    // ── Llamada a Anthropic (la key nunca sale del servidor) ──
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: mdl,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await r.json();
    if (data.error) return j({ error: data.error.message }, 200);
    if (!r.ok) return j({ error: `Anthropic respondió ${r.status}` }, 200);

    const text = (data.content || []).map((b: any) => b.text || "").join("");
    const usage = data.usage || {};

    // ── Registro de uso (para cobro / dashboard admin) ──
    // Ya no es best-effort silencioso: todos los campos vienen validados, así que
    // el cliente no puede provocar el fallo para consumir IA sin quedar registrado.
    // Si aun así falla, es un problema de infraestructura y se reporta.
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    let logged = true;
    const usageRow = {
      team_id: teamId,
      user_id: user.id,
      model: mdl,
      in_tokens: inTok,
      out_tokens: outTok,
      cost: costOf(mdl, inTok, outTok),
      feature: feat,
    };
    let insertError: unknown = null;
    for (let attempt = 1; attempt <= USAGE_INSERT_ATTEMPTS; attempt++) {
      try {
        const { error } = await supa.from("ai_usage").insert(usageRow);
        if (!error) {
          insertError = null;
          break;
        }
        insertError = error;
      } catch (e) {
        insertError = e;
      }
      if (attempt < USAGE_INSERT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, USAGE_RETRY_DELAY_MS));
      }
    }
    if (insertError) {
      logged = false;
      // Sin secretos ni prompt: solo lo necesario para detectar el fallo.
      console.error(JSON.stringify({
        evento: "ai_usage_insert_failed",
        user_id: user.id,
        team_id: teamId,
        model: mdl,
        in_tokens: inTok,
        out_tokens: outTok,
        intentos: USAGE_INSERT_ATTEMPTS,
        detalle: insertError && typeof insertError === "object" && "message" in insertError
          ? String(insertError.message)
          : String(insertError),
      }));
    }

    // Se devuelve el texto igual (ya se pagó), pero el fallo queda visible en la
    // respuesta en vez de desaparecer.
    return j(logged ? { text, usage } : { text, usage, logged: false }, 200);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
