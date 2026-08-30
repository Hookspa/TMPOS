// TEMPO — Edge Function "transcribe" retirada.
//
// Esta función aceptaba team_id del cliente y escribía ai_usage con service_role
// sin comprobar membresía. Tampoco puede reservar de forma segura un coste
// máximo: el tamaño comprimido de un archivo no impone un techo fiable sobre su
// duración facturable. Se conserva un handler 410 para que el próximo despliegue
// cierre también cualquier copia que siga activa en Supabase. No contiene keys,
// no crea un cliente privilegiado y no llama a ningún proveedor.

const ALLOWED_ORIGINS = new Set([
  "https://hookspa.github.io",
]);

Deno.serve((req) => {
  const origin = req.headers.get("Origin");
  const cors = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ error: "La transcripción no está disponible." }), {
    status: 410,
    headers: { ...cors, "content-type": "application/json" },
  });
});
