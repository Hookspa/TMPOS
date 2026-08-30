// TEMPO — validación pura de la Edge Function "claude".
//
// Vive aparte de index.ts a propósito: sin Deno instalado no hay forma de correr
// la función, y esta es justo la parte donde un error silencioso es un agujero de
// seguridad (lista blanca de modelos, techo de gasto, saneo del registro de uso).
// Como .mjs sin tipos lo importan igual Deno (la función) y Node (las pruebas).
// Todo aquí es puro: sin red, sin base, sin Deno.env.

// Modelo por defecto. Anthropic retiró claude-3-5-haiku el 2026-02-19 (404 en
// cualquier llamada), y los ajustes guardados en el cliente traen ese id: se
// remapea aquí además de en js/releases.js para cubrir clientes sin recargar.
export const DEFAULT_MODEL = 'claude-haiku-4-5';

// Modelos retirados → reemplazo vigente.
export const MODEL_MIGRATION = {
  'claude-3-5-haiku-latest': 'claude-haiku-4-5',
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5',
  'claude-3-haiku-20240307': 'claude-haiku-4-5',
  'claude-3-5-sonnet-latest': 'claude-sonnet-5',
  'claude-3-7-sonnet-20250219': 'claude-sonnet-5',
  'claude-sonnet-4-20250514': 'claude-sonnet-5',
  'claude-3-opus-latest': 'claude-opus-5',
  'claude-3-opus-20240229': 'claude-opus-5',
};

// Precios de lista (US$ por 1M tokens: [entrada, salida]) para el costo estimado.
// Espejo de AI_MODEL_PRICES en js/releases.js — si cambia una, cambia la otra.
// Esta tabla es TAMBIÉN la lista blanca de modelos: un id fuera de aquí se
// rechaza en vez de cobrarse a un precio inventado.
export const PRICES = {
  'claude-haiku-4-5': [1.00, 5.00],
  // Sonnet 5 cuesta temporalmente 2/10 hasta 2026-08-31. Conservamos 3/15,
  // el precio de lista, porque sobreestimar cuatro días es más seguro que
  // agregar lógica de fechas efímera y evita que cliente y servidor diverjan.
  'claude-sonnet-5': [3.00, 15.00],
  'claude-sonnet-4-6': [3.00, 15.00],
  'claude-opus-5': [5.00, 25.00],
  'claude-opus-4-8': [5.00, 25.00],
};

// Techos del lado del servidor. El cliente pide lo que quiera; esto es lo que
// puede gastar por llamada. El prompt más grande que arma la app (letra +
// referencias + ADN) está bien por debajo de 60k caracteres.
//
// 8000 NO es arbitrario: es exactamente el techo que ya se impone el cliente en
// js/releases.js (`Math.min(8000, count * 320 + 700)` al generar ideas). Un cap
// menor recorta el JSON de 12 ideas en adelante y parseIdeasJSON falla en
// silencio — ya pasó con un cap de 4000. Si ese calculo del cliente cambia,
// este numero cambia con el; hay una prueba que lo exige.
export const MAX_TOKENS_CAP = 8000;
export const DEFAULT_MAX_TOKENS = 2000;
export const MAX_PROMPT_CHARS = 60000;
export const MAX_FEATURE_CHARS = 40;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function costOf(model, inTok, outTok) {
  const p = PRICES[model] || PRICES[DEFAULT_MODEL];
  return inTok / 1e6 * p[0] + outTok / 1e6 * p[1];
}

// Resuelve el modelo pedido: remapea ids retirados y exige que el resultado esté
// en la lista blanca. Devuelve null si no lo está, para responder 400 en vez de
// reenviar un id arbitrario a Anthropic.
export function resolveModel(model) {
  if (model != null && typeof model !== 'string') return null;
  const raw = (typeof model === 'string' ? model : '').trim() || DEFAULT_MODEL;
  const resolved = MODEL_MIGRATION[raw] || raw;
  return PRICES[resolved] ? resolved : null;
}

// max_tokens acotado a un entero dentro del techo. Un valor absurdo, negativo o
// no numérico cae a un default seguro en vez de propagarse a Anthropic.
export function resolveMaxTokens(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_MAX_TOKENS;
  const n = Math.floor(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_TOKENS;
  return Math.min(n, MAX_TOKENS_CAP);
}

// feature es texto libre que termina en una columna de ai_usage. Se acota a un
// charset y largo seguros para que no pueda romper el INSERT del registro: si el
// cliente puede reventar ese INSERT, el consumo de IA deja de quedar registrado.
export function sanitizeFeature(v) {
  if (typeof v !== 'string') return null;
  const clean = v.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, MAX_FEATURE_CHARS);
  return clean || null;
}

// Valida el cuerpo completo. Devuelve { ok:true, value } o { ok:false, status, error }
// para que index.ts solo traduzca el resultado a HTTP.
export function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'cuerpo inválido' };
  }
  const { prompt, model, max_tokens, team_id, feature } = body;

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return { ok: false, status: 400, error: 'missing prompt' };
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, status: 400, error: `prompt demasiado largo (máximo ${MAX_PROMPT_CHARS} caracteres)` };
  }

  const mdl = resolveModel(model);
  if (!mdl) return { ok: false, status: 400, error: 'modelo no permitido' };

  // team_id llega del cliente: se valida el formato antes de consultarlo, si no
  // un string cualquiera revienta la query por tipo.
  let teamId = null;
  if (team_id != null && team_id !== '') {
    if (!isUuid(team_id)) return { ok: false, status: 400, error: 'team_id inválido' };
    teamId = team_id;
  }

  return {
    ok: true,
    value: {
      prompt,
      model: mdl,
      maxTokens: resolveMaxTokens(max_tokens),
      teamId,
      feature: sanitizeFeature(feature),
    },
  };
}
