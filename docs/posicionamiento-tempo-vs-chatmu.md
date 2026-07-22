# Posicionamiento — Tempo OS frente a Chatmu (y a la ola de MCPs)

> **Interno · Confidencial — HookSpa / Genios Musicales.** Contiene material de discovery y
> estrategia de foso (pipeline k-anon). No circular fuera del equipo.
> Fecha: 2026-07-22 · Contexto: build v0.75.0-alpha · Autor de referencia: Josh.

---

## 0. TL;DR

Chatmu 3.5 se anuncia como **"115 herramientas, 10 skills, cero fricción"**: un **MCP** que convierte a
Claude en un ejecutor de tareas de music business (editar video, ADN de fans, A&R predictivo, split
sheets, detección de álbumes IA, distribución/booking/contratos desde un chat).

**No nos deja fuera del mercado. Nos confirma la tesis.** Chatmu y Tempo OS son **categorías
distintas**:

- **Chatmu = una capa de herramientas de IA (MCP).** Mono-usuario, mono-tenant, sin estado
  persistente, orientada a "hazme esta tarea". Su eje competitivo es la **amplitud de capacidades**.
- **Tempo OS = un centro de mando de lanzamientos + system of record colaborativo.** Multi-jugador,
  multi-artista, con estado durable del roster, permisos por rol, capa de negocio (recoupment/ROI) y
  un **foso de datos cross-tenant** (benchmarks k-anon). Su eje es **orquestar N lanzamientos y
  acumular dato propietario que nadie más tiene**.

Que exista un Chatmu **valida el apetito** de la industria por tener a Claude operando sobre su
música. Ese apetito es exactamente el que el **MCP de Tempo OS** (ver `mcp-integration-plan.md`) va a
capturar — pero sobre nuestro system of record, nuestros permisos y nuestro dato. La jugada no es
competir tarea-por-tarea; es **absorber esa capa como una feature nuestra**.

---

## 1. El mapa de categorías

La confusión ("¿nos copiaron / nos superaron?") viene de comparar cosas de capas distintas. No compiten
en el mismo plano:

| Eje | Chatmu (MCP horizontal) | Tempo OS (centro de mando + SoR) |
|---|---|---|
| **Qué es** | Caja de herramientas de IA | Sistema donde el equipo opera y queda el registro |
| **Estado / persistencia** | Stateless (ejecuta y olvida) | System of record durable (ISRC, roster, historial) |
| **Usuarios** | Un operador en un chat | Equipo 2–5p multi-rol + roster multi-artista |
| **Multi-tenant** | Mono-tenant (tu cuenta) | Multi-tenant con aislamiento RLS por equipo |
| **Permisos** | Ninguno real (quien tiene el chat, todo) | `can(verbo, módulo, scope)` + RLS + `seat_role` |
| **Unidad de valor** | La tarea suelta | El lanzamiento orquestado (y N en paralelo) |
| **Capa de negocio** | No | Recoupment / ROI / reparto de ingresos por titular |
| **Dato propietario** | No (nada se acumula entre cuentas) | **Benchmarks k-anon cross-tenant** (el foso) |
| **White-label** | No | Sí (color/logo/nombre por workspace) |
| **Mercado** | Genérico, inglés-first | LATAM-native (español, pagos locales, flujo de sello) |

**Lectura clave:** Chatmu compite en el eje horizontal ("¿cuántas cosas sabe hacer Claude?"). Tempo OS
compite en el eje vertical ("¿el equipo saca N lanzamientos sin que se caiga nada, y qué aprende de su
propio historial que nadie más sabe?"). Un competidor puede tener 500 tools y seguir sin resolver lo
segundo.

---

## 2. Los tres fosos de Tempo OS

Un "foso" (moat) no es una feature bonita: es algo que un competidor **no puede replicar copiando la
pantalla**. Tempo OS tiene tres, en orden creciente de dificultad de copia.

### Foso 1 — Centro de mando de concurrencia

El wedge del producto (post-Council, jun 2026): **"Toma el control. Mantén el ritmo."** No es "otra
herramienta de tareas" — es la capa que deja a un equipo chico sacar **N lanzamientos en paralelo sin
que se caiga nada**.

Evidencia en el producto:
- **Cockpit** — vista de todos los lanzamientos activos del roster, **ordenados por riesgo**
  (vencidas·bloqueadas·alertas rojas·proximidad al drop·readiness baja), con una **cola de acción
  "se cae esta semana"** (posponer / mover / escalar reales sobre las tareas).
- **Roster heatmap** — carga del equipo por semana, aviso de sobrecarga, cuellos de botella visibles.
- **"Listo para lanzar %"** + macro-fase auto-calculada + **"Qué falta"** accionable por release.

Un MCP stateless **no orquesta N lanzamientos** porque no tiene estado del roster ni una noción de "lo
que se cae esta semana". Puede armarte un split sheet; no puede decirte cuál de tus seis drops está en
rojo hoy.

### Foso 2 — System of record multi-jugador

Tempo OS es el lugar donde el equipo entero coordina y **queda el registro**:
- Modelo durable `Sello → Artista → Release → Track` (track por ISRC, reutilizable entre releases).
- Capa colaborativa relacional: `tasks / comments / activity / notifications / approvals`
  (`collab.sql`), con **`activity` append-only** (seguro ante concurrencia por diseño).
- **Permisos reales**: `can(verbo, módulo, scope)` sobre la matriz de capacidades; `role`
  (owner/editor/lector) = fuente de verdad de RLS; `seat_role` = preset de negocio (10 roles:
  abogado, marketing, productor, ingeniero, diseñador, artista…); `scope` jsonb acota por
  artista/release. *El abogado no ve finanzas; el diseñador solo sus assets.*
- **Aprobaciones por gate** (9: cover, máster, label copy, split, presupuesto, calendario, reporte,
  campaña, publicación) + **auditoría** append-only (`audit_log`: quién vio/copió/descargó qué).

Un copiloto mono-usuario **no tiene** quién-aprobó-qué, ni permisos por rol, ni un feed de actividad
inmutable. Estas cosas solo existen cuando hay un sistema multi-jugador con estado — no cuando hay un
chat con tools.

### Foso 3 — Dato propietario cross-tenant (benchmarks k-anon) · **el foso de largo plazo**

Este es el diferenciador estructural que **un MCP mono-tenant como Chatmu es incapaz de construir**, no
por falta de esfuerzo sino por su arquitectura.

Cómo funciona en Tempo OS:
- Al **cerrar** un release, `buildReleaseSnapshot()` calcula en el cliente un rollup operativo y de
  resultado: **cycle-time (mediana/p90)** desde el log `activity`, **latencia de los 9 gates**, **lead
  time** (primera tarea → drop), **espaciado** de contenido, **inversión / ROI / recoupment**, y
  **resultado d1 / d7 / d28** (streams por ventana), más dimensiones de género / tipo / etapa. Se
  guarda en `release_snapshots` (tabla del propio equipo, RLS por team).
- Cuando hay masa crítica (≥3 releases cerrados), esos snapshots alimentan un **pipeline k-anon
  cross-tenant** (`release_benchmarks` + RPC service-role + sync server-side): **agregados anónimos
  entre sellos** — "tu cycle-time de máster vs la mediana de releases comparables", "tu ROI vs el p75",
  "tu espaciado vs lo que funciona". Nunca dato crudo de otro equipo; solo estadística k-anónima.

Por qué es un foso y no una feature:
1. **Efecto de red de datos.** Cada sello que cierra un release mejora el benchmark para todos. El
   valor crece con la base instalada — algo que un competidor nuevo (o un MCP) no puede comprar.
2. **Estructuralmente imposible para un MCP mono-tenant.** Chatmu opera dentro de la cuenta de un
   usuario; no tiene un sustrato multi-tenant donde acumular y anonimizar dato entre clientes. No es
   que "todavía no lo hicieron": su arquitectura no lo permite.
3. **Lo que el equipo NO ve en un demo.** Precisamente por eso es foso: no se copia mirando la app. Se
   construye con años de releases cerrados.

> **Estado:** este foso está **gateado por el GATE A3** (discovery). El snapshot por-equipo ya se
> captura (`release_snapshots`, SQL corrido); el pipeline k-anon cross-tenant **no se construye** hasta
> que el discovery confirme la concurrencia como dolor y haya ≥3 releases cerrados. Ver §4 y §5.

---

## 3. Zona de solape honesta (dónde Chatmu sí nos roza)

Ser honestos evita sorpresas en un pitch. Chatmu **sí** toca algunas superficies que Tempo OS también
tiene:

| Lo que Chatmu ofrece | Dónde vive en Tempo OS | Veredicto |
|---|---|---|
| Editar video / contenido con curación | Generador de contenido + banco de ~6k refs + calendario | Feature horizontal; ya la tenemos vía `callClaude` |
| ADN psicográfico de fans | ADN de artista / campaña (parcial) | Solape parcial; nuestro ADN es de posicionamiento, no de audiencia data |
| A&R predictivo (descubrir artistas) | **No lo tenemos** | Fuera de nuestro wedge actual (roster propio, no scouting) |
| Split sheets / registro / metadata PRO | Label Copy completo + Legal por canción + reparto de ingresos | **Más profundo en Tempo** (system of record, no un doc suelto) |
| Detección de álbumes IA | No lo tenemos | Fuera de wedge |
| Distribución / reportes / booking / contratos | Reportes IA + snapshot de cierre; distribución/booking no | Solape parcial |

**Conclusión del solape:** lo que se solapa son **features horizontales** (contenido, reportes, splits)
— cosas que nuestro propio MCP absorberá y que además, en Tempo, viven **dentro del system of record**
(un split no es un PDF suelto: es un registro con estado, aprobación, ruteo a Legal y reparto de
ingresos conectado a recoupment). Lo que **no** se solapa es el backbone: orquestación de N drops,
multi-jugador y el foso de datos.

---

## 4. El riesgo real (dónde sí hay que prestar atención)

El riesgo no es Chatmu hoy. Es una tendencia: **la IA (Claude + MCPs) comoditiza las tareas sueltas.**
Cuando "armar un split" o "editar un video" sea gratis desde cualquier chat, el valor de esas tareas
tiende a cero.

Implicación estratégica: **el valor de Tempo no puede descansar en las tareas.** Tiene que descansar en
las dos cosas que la comoditización *no* toca:
1. **El centro de mando** (orquestar la concurrencia — Foso 1) y **el system of record multi-jugador**
   (Foso 2).
2. **El dato propietario** (Foso 3) — lo único que se vuelve *más* valioso mientras las tareas se
   abaratan, porque nadie más lo tiene.

Si nos posicionáramos como "las 115 tools pero en español", perderíamos: ese es un juego de amplitud
que un MCP horizontal siempre ganará. Nos posicionamos como **el sistema donde esas tools corren sobre
tu operación y tu dato**.

---

## 5. Respuesta estratégica: absorber, no competir tarea-por-tarea

La jugada frente a Chatmu (y a la ola de MCPs) no es defensiva. Es **integrar la capa que ellos venden,
dentro de nuestro foso**:

- **Tempo OS expone su propio MCP** — Claude ejecuta y lee tareas *dentro* de Tempo, con nuestra data,
  nuestros permisos (`can`/RLS/`scope`), nuestra auditoría y — en su fase madura — **acceso a los
  benchmarks k-anon que ningún competidor tiene**. Ver `mcp-integration-plan.md`.
- Esto convierte "un Chatmu" de competidor en **una feature nuestra**: el mismo "cero fricción" del
  chat, pero sobre un system of record real y con dato que el chat solo nunca tendrá.
- **Secuencia disciplinada:** el MCP se construye **detrás del GATE A3**, igual que el pipeline k-anon.
  No se adelanta al discovery. Coherente con la decisión de esperar a validar el ICP.

---

## 6. Amarre con el GATE A3 / validación de ICP

El wedge de "orquestar N lanzamientos" es **H3, una hipótesis sin validar**. Todo lo de arriba asume que
la **concurrencia** es un dolor real para el ICP (equipo chico 2–5p con roster multi-artista). El
discovery (entrevistas BK, sem 3–4) es el que lo confirma o lo tumba.

Señales que **confirman** el posicionamiento (→ construir MCP Fase 2+ y foso k-anon):
- El equipo abre el **Cockpit a diario** (métrica ya instrumentada: "¿lo abren a diario?").
- Reportan el dolor como "se me caen cosas entre lanzamientos", no "necesito hacer una tarea más rápido".
- Piden comparar su desempeño contra otros ("¿voy bien de cycle-time / ROI?") → apetito por benchmarks.

Señales que lo **tumban** (→ degradar Cockpit a feature, redirigir dev):
- "Con 2–3 lanzamientos lo veo bien en una hoja de cálculo" → la concurrencia no es el dolor.
- El valor percibido está en las tareas sueltas (contenido/splits), no en la orquestación → nos empuja
  al terreno horizontal donde un MCP gana; habría que replantear el wedge.

**Regla:** no se invierte en el MCP completo ni en el foso k-anon antes de que A3 dé luz verde. El
camino crítico es discovery, no dev.

---

## 7. Guion de objeciones (para venta / pitch interno)

**"¿Por qué no solo uso Claude con un MCP como Chatmu?"**
> Porque un MCP te ejecuta tareas, pero no es donde tu equipo opera ni donde queda el registro. No sabe
> cuál de tus seis lanzamientos está en rojo hoy, no controla quién aprobó el máster, no separa lo que
> ve el abogado de lo que ve el diseñador, y no aprende de tu historial para decirte si vas bien contra
> otros sellos. Tempo es ese sistema — y además, pronto, te deja usar a Claude *dentro* de él.

**"Chatmu tiene 115 herramientas y ustedes no."**
> El número de herramientas es el eje donde un MCP horizontal siempre va a ir adelante — y a nosotros no
> nos hace falta ganarlo. Nuestro valor es que esas herramientas corran sobre tu operación real y tu
> dato. Estamos integrando esa capa como nuestro propio MCP; la diferencia es sobre qué corre.

**"¿No los van a copiar?"**
> Pueden copiar cualquier pantalla. Lo que no pueden copiar es el dato que se acumula cuando muchos
> sellos cierran lanzamientos en la plataforma: benchmarks anónimos entre sellos que se vuelven más
> valiosos con cada release. Un MCP mono-tenant no tiene dónde construir eso.

**"¿Y el mercado gringo con herramientas en inglés?"**
> Están pensadas para el flujo US y en inglés. Tempo está construido para el flujo de sello/artista de
> LATAM, en español, con pagos locales y white-label para que el sello ponga su marca.

---

## 8. Una línea para recordar

> Chatmu vende **herramientas**. Tempo OS es **el sistema donde el equipo opera, y el único que aprende
> de todo lo que la industria lanza.** Las herramientas se comoditizan; el sistema de registro y el dato,
> no.
