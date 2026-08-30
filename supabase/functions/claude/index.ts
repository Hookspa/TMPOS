// Tempo OS — Edge Function "claude"
// Proxy seguro a la API de Anthropic: la API key vive como secreto en el servidor,
// nunca en el cliente. Solo usuarios autenticados pueden llamarla.
// Despliega con verify_jwt = ON (por defecto).
// Secretos requeridos: ANTHROPIC_API_KEY, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
// AI_MONTHLY_TEAM_CAP_USD es opcional: por defecto limita a USD 25 por equipo/mes.
// Se cambia sin tocar código: supabase secrets set AI_MONTHLY_TEAM_CAP_USD=25
// Requisito de base: ejecutar supabase/sql/ai_spend_cap.sql en el SQL Editor.
// No hay migraciones automáticas: si faltan sus RPC de reserva/finalización, el
// tope falla cerrado con 503 y la IA queda indisponible hasta instalarlas.
//
// Modelo de confianza: el cuerpo del request lo controla el cliente y NADA de lo
// que llega se usa sin validar. La validación pura (lista blanca de modelos, techo
// de max_tokens y prompt, formato de team_id, saneo de feature) vive en
// ./validate.mjs para poder probarla sin Deno; aquí queda HTTP, autorización y
// registro. Lo que este archivo agrega sobre validate.mjs es lo que necesita red:
// la membresía real y la reserva/finalización atómica del gasto en la base.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { costOf, validateBody } from "./validate.mjs";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_AI_MONTHLY_TEAM_CAP_USD = 25;
const monthlyCapSetting = Deno.env.get("AI_MONTHLY_TEAM_CAP_USD");
const normalizedMonthlyCapSetting = monthlyCapSetting?.trim();
const configuredMonthlyCap = monthlyCapSetting === undefined
  ? DEFAULT_AI_MONTHLY_TEAM_CAP_USD
  : /^\d+(?:\.\d+)?$/.test(normalizedMonthlyCapSetting || "")
    ? Number(normalizedMonthlyCapSetting)
    : Number.NaN;
const AI_MONTHLY_TEAM_CAP_USD = configuredMonthlyCap;
// El conteo previo evita reservar ~4x por tratar cada byte UTF-8 como token. La
// API lo documenta como estimación, por eso se conserva un margen amplio.
const AI_INPUT_RESERVATION_OVERHEAD_TOKENS = 1024;
const ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS = 30_000;
const ANTHROPIC_REQUEST_TIMEOUT_MS = 120_000;
const USAGE_FINALIZE_ATTEMPTS = 2;
const USAGE_FINALIZE_RETRY_DELAY_MS = 120;
const AI_PROVIDER_FAILURE_MESSAGE = "El proveedor de IA no pudo completar la solicitud.";

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
        .select("user_id, role")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .maybeSingle();
      // Un fallo de la consulta no puede interpretarse como "sí es miembro":
      // ante la duda se niega el acceso.
      if (memberErr) return j({ error: "no se pudo verificar la membresía" }, 503);
      if (!member) return j({ error: "no eres miembro de ese equipo" }, 403);
      if (member.role !== "owner" && member.role !== "editor") {
        return j({ error: "no tienes permiso para usar IA en ese equipo" }, 403);
      }
    } else {
      // Los clientes viejos no siempre enviaban team_id. Se deriva únicamente
      // cuando la pertenencia es inequívoca; jamás se registra consumo sin equipo.
      const { data: memberships, error: membershipsErr } = await supa
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", user.id)
        .in("role", ["owner", "editor"])
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

    // ── Tope antiabuso de IA (servidor, independiente de planes y billing) ──
    // Un valor configurado pero inválido es un error, no permiso para gastar con
    // otro tope accidental. Cero es un kill switch válido.
    if (!Number.isFinite(AI_MONTHLY_TEAM_CAP_USD) || AI_MONTHLY_TEAM_CAP_USD < 0) {
      return j({ error: "no se pudo verificar el uso mensual de IA" }, 503);
    }

    // El conteo ocurre server-side y no acepta precios ni tokens del cliente. Si
    // Anthropic no puede estimarlo, se falla cerrado antes de reservar o generar.
    let countResponse: Response;
    let countData: any;
    try {
      countResponse = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: mdl,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS),
      });
      countData = await countResponse.json();
    } catch (_) {
      return j({ error: "no se pudo verificar el uso mensual de IA" }, 503);
    }
    const countedInputTokens = countResponse.ok && Number.isSafeInteger(countData?.input_tokens)
      && countData.input_tokens >= 0
      ? countData.input_tokens
      : null;
    if (countedInputTokens === null) {
      return j({ error: "no se pudo verificar el uso mensual de IA" }, 503);
    }

    // Reserva el conteo estimado con margen más todos los tokens de salida
    // permitidos. El coste real sustituye la reserva al terminar la llamada.
    const maxInputTokens = countedInputTokens + AI_INPUT_RESERVATION_OVERHEAD_TOKENS;
    const reservedCost = costOf(mdl, maxInputTokens, maxTokens);
    if (!Number.isFinite(reservedCost) || reservedCost <= 0) {
      return j({ error: "no se pudo verificar el uso mensual de IA" }, 503);
    }
    const { data: reservation, error: reservationErr } = await supa.rpc("reserve_ai_spend", {
      p_team_id: teamId,
      p_user_id: user.id,
      p_model: mdl,
      p_feature: feat,
      p_reserved_cost: reservedCost,
      p_monthly_cap: AI_MONTHLY_TEAM_CAP_USD,
    });
    if (reservationErr || !reservation || typeof reservation !== "object") {
      return j({ error: "no se pudo verificar el uso mensual de IA" }, 503);
    }
    if (reservation.status === "not_authorized") {
      return j({ error: "no eres miembro de ese equipo" }, 403);
    }
    if (reservation.status === "cap_reached") {
      return j({ error: "Este equipo alcanzó su tope mensual de IA. Se renueva el 1 del mes siguiente." }, 429);
    }
    const reservationId = reservation.status === "reserved" && typeof reservation.reservation_id === "string"
      ? reservation.reservation_id
      : null;
    if (!reservationId) return j({ error: "no se pudo verificar el uso mensual de IA" }, 503);

    async function releaseReservation() {
      try {
        const { data, error } = await supa.rpc("release_ai_spend_v2", {
          p_reservation_id: reservationId,
          p_user_id: user.id,
        });
        const status = data && typeof data === "object" ? data.status : null;
        if (!error && (status === "released" || status === "already_released")) return true;
        console.error(JSON.stringify({
          evento: "ai_spend_release_failed",
          reservation_id: reservationId,
          team_id: teamId,
          detalle: error?.message || "respuesta inválida",
        }));
      } catch (e) {
        console.error(JSON.stringify({
          evento: "ai_spend_release_failed",
          reservation_id: reservationId,
          team_id: teamId,
          detalle: String(e),
        }));
      }
      return false;
    }

    // ── Llamada a Anthropic (la key nunca sale del servidor) ──
    let r: Response;
    let data: any;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
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
        signal: AbortSignal.timeout(ANTHROPIC_REQUEST_TIMEOUT_MS),
      });
      data = await r.json();
    } catch (_) {
      await releaseReservation();
      return j({ error: AI_PROVIDER_FAILURE_MESSAGE }, 502);
    }
    if (data?.error || !data || !r.ok) {
      await releaseReservation();
      return j({ error: AI_PROVIDER_FAILURE_MESSAGE }, 502);
    }

    const text = (data.content || []).map((b: any) => b.text || "").join("");
    const usage = data.usage || {};

    // ── Registro de uso (para control de coste / dashboard admin) ──
    // La finalización inserta ai_usage y elimina la reserva en una sola transacción.
    // Si falla, la reserva máxima permanece y evita abrir un hueco en el tope.
    const inTok = Number.isSafeInteger(usage.input_tokens) && usage.input_tokens >= 0
      ? usage.input_tokens
      : null;
    const outTok = Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0
      ? usage.output_tokens
      : null;
    const actualCost = inTok !== null && outTok !== null ? costOf(mdl, inTok, outTok) : Number.NaN;
    let logged = true;
    let insertError: unknown = null;
    if (!Number.isFinite(actualCost) || actualCost < 0 || actualCost > reservedCost) {
      insertError = new Error("uso o coste del proveedor inválido");
    } else {
      for (let attempt = 1; attempt <= USAGE_FINALIZE_ATTEMPTS; attempt++) {
        try {
          const { data: finalized, error } = await supa.rpc("finalize_ai_spend_v2", {
            p_reservation_id: reservationId,
            p_user_id: user.id,
            p_in_tokens: inTok,
            p_out_tokens: outTok,
            p_actual_cost: actualCost,
          });
          const status = finalized && typeof finalized === "object" ? finalized.status : null;
          if (!error && (status === "finalized" || status === "already_finalized")) {
            insertError = null;
            break;
          }
          insertError = error || new Error("respuesta inválida al finalizar");
        } catch (e) {
          insertError = e;
        }
        if (attempt < USAGE_FINALIZE_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, USAGE_FINALIZE_RETRY_DELAY_MS));
        }
      }
    }
    if (insertError) {
      logged = false;
      // Sin secretos ni prompt: solo lo necesario para detectar el fallo.
      console.error(JSON.stringify({
        evento: "ai_usage_finalize_failed",
        reservation_id: reservationId,
        user_id: user.id,
        team_id: teamId,
        model: mdl,
        in_tokens: inTok,
        out_tokens: outTok,
        intentos: USAGE_FINALIZE_ATTEMPTS,
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
