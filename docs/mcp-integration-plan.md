# Plan de integración — El MCP de Tempo OS

> **Interno · Confidencial — HookSpa / Genios Musicales.** Estrategia de foso (pipeline k-anon) y
> secuencia gateada por discovery. No circular fuera del equipo.
> Fecha: 2026-07-22 · Contexto: build v0.75.0-alpha · Compañero de `posicionamiento-tempo-vs-chatmu.md`.

---

## 0. Qué es esto y por qué ahora

Tempo OS ya tenía planeado su propio **MCP**: una capa que le permita a Claude **ver todo lo que ya
está en el sistema** (releases, tracks, tareas, finanzas, roster) y ejecutar **herramientas de
marketing** sobre ello. Este documento diseña esa integración.

**Principio rector:** el MCP de Tempo **no** es un copiloto paralelo tipo Chatmu (mono-tenant,
stateless). Es una capa donde **Claude ejecuta y lee *dentro* del system of record de Tempo**, con:
- su **data** (el estado real del roster, no una copia),
- sus **permisos** (`can(verbo, módulo, scope)` + RLS — el MCP nunca ve más de lo que el usuario ve),
- su **auditoría** (`audit_log` append-only),
- su **medición** (`ai_usage`),
- y — en su fase madura — acceso a los **benchmarks k-anon** que ningún MCP mono-tenant puede tener.

Esto convierte a "un Chatmu" de competidor en **una feature nuestra** (ver documento de
posicionamiento, §5).

---

## 1. Precondición: el GATE A3 (validación de ICP)

**El MCP completo NO se construye antes de validar la hipótesis de concurrencia (H3) vía discovery.**
Esto es coherente con la decisión ya tomada de esperar el ICP, y con el GATE A3 que ya rige el Cockpit
completo y el pipeline k-anon en el `HANDOFF`.

| Fase del MCP | Precondición | Riesgo |
|---|---|---|
| Fase 0 (read-only) | Ninguna — se puede prototipar pre-A3 | Bajo |
| Fase 1 (marketing IA) | Ninguna — reusa IA existente | Bajo |
| Fase 2 (write + aprobaciones) | **A3 verde** (concurrencia validada) | Medio |
| Fase 3 (benchmarks k-anon) | **A3 verde + ≥3 releases cerrados** | Alto (foso) |

Señales de validación (de `posicionamiento §6`): ¿abren el Cockpit a diario?, ¿el dolor se describe como
"se me caen cosas entre lanzamientos"?, ¿piden compararse con otros sellos? Si A3 dice "2–3 drops se ven
bien en una hoja", el MCP se recorta a Fases 0–1 (utilidad) y no se invierte en el foso.

---

## 2. Arquitectura

El MCP server es una **capa delgada sobre Supabase que hereda RLS**, reutilizando el patrón ya probado de
la Edge Function `claude`.

```
   Claude (cliente MCP)
        │  (cada tool call lleva el JWT del usuario)
        ▼
   MCP server  ── resuelve identidad (getUser del JWT, patrón functions/claude/index.ts)
        │       ── aplica can(verbo, módulo, scope) + is_member/is_editor
        │       ── registra en audit_log ; mide en ai_usage
        ▼
   Supabase (RLS por team) ── artists · launches · tracks · tasks · comments ·
        │                     activity · approvals · release_snapshots
        │
        └── [Fase 3] RPC service-role k-anon ──► agregados de release_benchmarks
                        (NUNCA dato crudo cross-tenant; solo estadística k-anónima)
```

**Reglas de arquitectura (no negociables):**
1. **El MCP hereda RLS, no la reemplaza.** Cada tool corre con la identidad del usuario (su JWT). Si la
   UI no le muestra las finanzas de otro artista, el MCP tampoco. La seguridad server-side sigue siendo
   la fuente de verdad; el MCP no puede "pedir más".
2. **Reutiliza `can(verbo, módulo, scope)`** (`permissions.sql` / `team.js`) para autorizar cada tool —
   no se inventa un modelo de permisos paralelo.
3. **La key de Anthropic nunca sale del server** (igual que hoy en `functions/claude/index.ts`).
4. **Barrera k-anon inviolable:** el MCP jamás expone filas crudas de `release_benchmarks` ni de otro
   equipo. Solo agregados anónimos vía el RPC service-role, con el mismo umbral k del pipeline.
5. **Todo write queda auditado** (`audit_log`) y toda llamada IA medida (`ai_usage`), para cobro y
   trazabilidad.

---

## 3. Catálogo de tools (faseado)

### Fase 0 — Read-only (bajo riesgo · prototipable pre-A3)

Le dan a Claude "ojos" sobre el system of record, respetando `visibility`/`scope`.

| Tool | Qué devuelve | Reusa |
|---|---|---|
| `get_release(id)` | Ficha: tipo, fase, "Listo para lanzar %", tracklist, alertas | `releasePhase`, `releaseReady`, `releaseAlerts` (`crm.js`) |
| `list_tasks(filtro)` | Tareas por responsable/estado/release | tabla `tasks` (`collab.js`) |
| `whats_missing(release_id)` | Lista accionable de "Qué falta" | vista "Qué falta" (`tasksview.js`) |
| `get_recoupment(release_id)` | Inversión / ingresos / ROI / estado | `financeSummary` (`finance.js`) |
| `cockpit_action_queue()` | "Se cae esta semana", ordenado por riesgo | `cockpitActionItems`, `_cockpitRisk` (`dashboard.js`) |

### Fase 1 — Marketing IA (bajo riesgo · reusa IA existente)

Exponen como tools la IA que ya corre por `callClaude`.

| Tool | Qué hace | Reusa |
|---|---|---|
| `generate_ideas(release_id, n)` | Ideas de contenido desde ADN + letra | `generarIdeasIA` (`releases.js`) |
| `search_references(query)` | Busca en el banco (~6k refs) | banco / `refs_02.csv` |
| `campaign_dna_from_lyrics(release_id)` | Deriva Campaign DNA de la letra | `generarDNADesdeLetra` |
| `draft_report(release_id)` | Borrador de reporte del release | flujo `report.html` |

> Respeta los **contadores de plan** (`ideas_generadas_mes`, `banco_refreshes` en `plans_tiers.sql`) y
> mide en `ai_usage`.

### Fase 2 — Write con aprobación (medio riesgo · **post-A3**)

Claude deja de solo leer y empieza a **operar**, siempre dentro de los guardrails existentes.

| Tool | Qué hace | Guardrail |
|---|---|---|
| `create_task(...)` | Crea tarea ligada a release/track/artista | requiere `editar`/`gestionar_tareas` |
| `update_status(id, estado)` | Mueve una tarea de estado | `scope` + `editar` |
| `propose_approval(gate, release_id)` | Solicita un gate (propone → revisa → aprueba) | **nunca aprueba solo**; respeta los 9 gates |

> Regla dura: el MCP **nunca salta una aprobación**. `propose_approval` solo *solicita*; la decisión
> humana (o de quien tenga `aprobar_tareas`) se mantiene.

### Fase 3 — El foso: benchmarks k-anon (alto valor · **A3 + ≥3 releases**)

| Tool | Qué hace | Guardrail |
|---|---|---|
| `get_benchmarks(dims)` | "Tu cycle-time/ROI/espaciado vs mediana y p75 de releases comparables" | **solo agregados k-anónimos** vía RPC service-role; nunca dato crudo de otro equipo |

Este es el tool que **Chatmu no puede replicar**: requiere el sustrato multi-tenant + el pipeline k-anon
(ver `posicionamiento §2, Foso 3`). Es el que hace del MCP de Tempo algo estructuralmente distinto a un
MCP horizontal.

---

## 4. Seguridad y permisos (resumen)

- **Herencia de RLS:** identidad por JWT; el MCP no amplía privilegios. Mismo `can()` que la UI.
- **Scope:** `{artistIds, releaseIds}` acota qué toca cada tool; RLS lo refuerza server-side.
- **Auditoría:** todo write → `audit_log` (append-only). Toda llamada IA → `ai_usage`.
- **Secretos:** la key de Anthropic vive solo en el server (patrón `functions/claude/index.ts`).
- **k-anon:** frontera inviolable — solo agregados, umbral k, RPC service-role dedicado.

---

## 5. Modelo de negocio

- El MCP se cobra por **tier / asiento / uso**, apoyado en `plans_tiers.sql` (`free/pro/manager/custom`,
  asientos, contadores mensuales). `BILLING_ENFORCED` hoy **off**; la maquinaria ya está lista para
  prenderse sin refactor.
- Fases 0–1 pueden ser gancho de activación (utilidad inmediata); Fase 3 (benchmarks) es candidata a
  **tier premium** — es el valor que crece con la base instalada.

---

## 6. Diferenciación vs Chatmu (mapa a los fosos)

| Capacidad del MCP de Tempo | Foso que activa | ¿Puede un MCP mono-tenant como Chatmu? |
|---|---|---|
| Leer el estado real del roster / Cockpit | Foso 1 (concurrencia) | No — no tiene estado del roster |
| Operar con permisos por rol + aprobaciones + auditoría | Foso 2 (SoR multi-jugador) | No — es mono-usuario stateless |
| Benchmarks k-anon cross-tenant | Foso 3 (dato propietario) | **No — estructuralmente imposible** |

"MCP sobre tu system of record + dato cross-tenant" **>** "MCP horizontal stateless".

---

## 7. Roadmap y esfuerzo

| Fase | Gate | Esfuerzo aprox. | Qué NO hacer aún |
|---|---|---|---|
| 0 — read-only | ninguno | S (reusa builders existentes) | — |
| 1 — marketing IA | ninguno | S–M (envuelve `callClaude`) | — |
| 2 — write + aprobaciones | **A3 verde** | M | no adelantar antes del discovery |
| 3 — benchmarks k-anon | **A3 + ≥3 releases cerrados** | L (pipeline k-anon + RPC) | no construir el pipeline antes de tener masa de dato — igual que en el HANDOFF |

**Secuencia recomendada:** prototipar Fases 0–1 como prueba de concepto (bajo riesgo, valida el patrón
técnico del MCP sobre RLS) → **esperar A3** → si valida, Fase 2 y luego el foso (Fase 3). El camino
crítico sigue siendo el discovery, no el dev.

---

## 8. Verificación (cuando se construya)

- Cada tool corre con el JWT del usuario y **falla cerrado** si `can()` no autoriza (probar con un rol
  `lector` y un `abogado`: no deben poder leer finanzas vía MCP).
- Ningún tool devuelve filas crudas de otro `team_id` (probar aislamiento RLS con dos equipos).
- `get_benchmarks` nunca devuelve un grupo por debajo del umbral k (probar con <k releases).
- Todo write aparece en `audit_log`; toda llamada IA en `ai_usage`.
- Reusa builders existentes (no reimplementa `releaseReady`/`financeSummary`/`cockpitActionItems`).
