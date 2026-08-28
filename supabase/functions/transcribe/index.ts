// Tempo OS — Edge Function "transcribe"
// Proxy seguro a un proveedor de transcripción (OpenAI Whisper).
// Recibe el audio como multipart/form-data (campo "file") y devuelve { text }.
// La API key vive como secreto en el servidor, nunca en el cliente.
// Solo usuarios autenticados pueden llamarla. Despliega con verify_jwt = ON (por defecto).
//
// Secretos requeridos (supabase secrets set):
//   OPENAI_API_KEY  — key del proveedor de transcripción
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta la plataforma)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Modelo y precio (US$ por minuto de audio) para el costo estimado.
const MODEL = "whisper-1";
const PRICE_PER_MIN = 0.006;

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
    // Usuario autenticado (del JWT que envía el cliente)
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: ud } = await supa.auth.getUser(token);
    const user = ud?.user;
    if (!user) return j({ error: "no autorizado" }, 401);

    // Audio entrante (multipart/form-data)
    const inForm = await req.formData();
    const file = inForm.get("file");
    if (!(file instanceof File)) return j({ error: "missing file" }, 400);
    // Guarda de tamaño (Whisper: 25 MB máx.)
    if (file.size > 25 * 1024 * 1024) return j({ error: "El audio supera 25 MB" }, 200);

    const team_id = inForm.get("team_id");
    const language = inForm.get("language"); // opcional: 'es', 'en'…

    // Reenvío al proveedor de transcripción (la key nunca sale del servidor)
    const fwd = new FormData();
    fwd.append("file", file, (file as File).name || "audio.mp3");
    fwd.append("model", MODEL);
    fwd.append("response_format", "verbose_json"); // trae `duration` para el costo
    if (language) fwd.append("language", String(language));

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: fwd,
    });
    const data = await r.json();
    if (data.error) return j({ error: data.error.message || "Error de transcripción" }, 200);

    const text: string = data.text || "";
    const duration: number = +data.duration || 0; // segundos
    const cost = duration / 60 * PRICE_PER_MIN;

    // Métrica de uso (para cobro / dashboard admin). Best-effort.
    try {
      await supa.from("ai_usage").insert({
        team_id: team_id || null,
        user_id: user.id,
        model: MODEL,
        in_tokens: Math.round(duration), // guardamos los segundos de audio como referencia
        out_tokens: 0,
        cost,
        feature: "transcribe",
      });
    } catch (_) { /* la métrica es best-effort */ }

    return j({ text, duration, cost }, 200);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
