# Design System — TEMPO OS

> Fuente de verdad de diseño. Léela antes de cualquier decisión visual/UI.
> Creado por /design-consultation · 2026-06-29 · dirección: refinar & matar el slop.

## Lo memorable (ancla toda decisión)
**"Calma bajo presión — nada se te cae."** Cada decisión de diseño quita ruido para que lo único que necesita atención resalte. Si un elemento no ayuda a que el operador vea qué está en riesgo, sobra.

## Product Context
- **Qué es:** centro de mando de lanzamientos musicales — capa horizontal de orquestación de N lanzamientos en paralelo, encima de la cadena de valor.
- **Para quién:** equipo chico (2-5 personas) con roster multi-artista en LATAM.
- **Espacio:** software operativo serio. Pares de sensación: Linear, Height, Retool, Ramp. Competencia de mercado: Chatmu, Label OS, IndieMusicPro.
- **Tipo:** web app / dashboard (single-file `app.html` + `js/*.js`), dark-first, español.

## Aesthetic Direction
- **Dirección:** Industrial/utilitario con rigor editorial. Un instrumento denso, callado, de alta señal.
- **Nivel de decoración:** **mínima.** La tipografía y el espaciado hacen el trabajo. Cero decoración añadida.
- **Mood:** tablero de salidas / mission-control. Campo oscuro que se lee calmado; el color solo aparece donde algo te necesita.
- **Metáfora:** "mantén el ritmo" → numerales grandes tipo reloj/broadcast; textura de instrumento (retícula/hairline tenue), nunca ornamento.

## ⛔ Anti-slop (reglas duras — esto es lo que causó el "AI slop")
Prohibido en toda la app:
1. **Emoji ✨ (y 🚀🎯🔥 etc.) como glifo de acción.** Usar el set SVG de `js/icons.js`. (Había 236 ✨ en `app.html`.)
2. **Degradados como fill o CTA** (`linear-gradient` en botones, avatares, texto). Fills sólidos. (Había 26.)
3. **Glows** (`box-shadow` con rgba de acento, `--glow`). Sombra neutra sutil o ninguna. (Había 14.)
4. **Glass / blur** (`backdrop-filter`, `blur()`). Superficies sólidas. (Había 4.)
5. **Radios burbuja** (>8px en tarjetas/botones). Radios apretados.
6. **Naranja decorativo.** El naranja es SOLO acción/urgencia (ver Color).

## Typography
- **Display / métricas:** **Bebas Neue** — solo wordmark, hero y números grandes (días al drop, readiness %, stats). Aire editorial/broadcast que ata a "tempo". No usar para texto de UI.
- **Cuerpo / UI / headers:** **DM Sans** (400/500/600) — manda casi toda la interfaz. Más calmada que Bebas.
- **Datos / tablas:** **DM Sans** con `font-variant-numeric: tabular-nums` **obligatorio** en toda cifra/fecha (alineación en el cockpit). Números grandes destacados en Bebas.
- **Etiquetas / eyebrows / metadata:** **Space Mono** — mayúsculas pequeñas, `letter-spacing` ~1-2px. No para datos densos.
- **Loading:** Google Fonts — `Bebas+Neue`, `DM+Sans:opsz,wght@9..40,400;500;600;700`, `Space+Mono:wght@400;700`.
- **Escala (px):** eyebrow 10 · label 11 · body 13-14 · header UI 15-20 · métrica media 22-34 (Bebas) · hero/número grande 40-104 (Bebas).

## Color
- **Enfoque:** restringido. Neutros hacen ~90%; el color es significado, no decoración.
- **El naranja es señal, no relleno.** `#FF6B30` (dark) / `#D9521A` (light) = **solo** acción primaria y urgencia. Nunca avatares, fills, glows.
- **El color = estado (sistema nervioso del cockpit):** en-tiempo / en-riesgo / bloqueado / hecho.

### Dark (primario)
| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0a0b0c` | fondo (grafito neutro, sin tinte verde) |
| `--surface` | `#131517` | tarjetas, paneles |
| `--surface-2` | `#191c1f` | inputs, sub-superficie |
| `--raise` | `#1f2327` | elevado (barras, avatares) |
| `--border` | `#262a2e` | bordes |
| `--hairline` | `rgba(255,255,255,.05)` | separadores internos |
| `--text` | `#ECEDEE` | texto principal |
| `--muted` | `#9BA1A6` | secundario |
| `--dim` | `#6B7176` | terciario/metadata |
| `--accent` | `#FF6B30` | **acción/urgencia únicamente** |
| `--accent-fg` | `#180a02` | texto sobre naranja |
| `--ok` | `#3FB98A` | en tiempo |
| `--risk` | `#E8A33D` | en riesgo |
| `--blocked` | `#E5484D` | bloqueado/vencido |
| `--done` | `#5A6066` | hecho/atenuado |

### Light
`--bg #F4F5F6` · `--surface #FFFFFF` · `--surface-2 #F7F8F9` · `--border #E3E5E8` · `--text #16181A` · `--muted #5B6166` · `--dim #8A9096` · `--accent #D9521A` · `--accent-fg #FFFFFF` · `--ok #1F9D6B` · `--risk #B9791E` · `--blocked #C93338` · `--done #9AA0A6`
- **Dark mode:** es el modo primario. En light, bajar saturación del acento (naranja más oscuro `#D9521A`) para contraste ≥4.5:1.
- **Contraste:** todo texto ≥4.5:1 (mantener los fixes ya anotados en `app.html`).

## Spacing
- **Base:** 4px.
- **Densidad:** densa-cómoda (es un instrumento operativo, no una landing).
- **Escala:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48).

## Layout
- **Enfoque:** grid-disciplinado. Alineación predecible, densidad escaneable.
- **Cockpit:** **tablero por estado de riesgo** (kanban) — columnas Bloqueado → En riesgo → En tiempo → Post-drop, tarjetas de lanzamiento con readiness + días al drop, naranja solo en la acción. (Dirección "F", aprobada vía /design-shotgun 2026-06-29. Alternativas exploradas: tabla ancha "Torre de control", triage héroe+lista.)
- **Textura permitida:** UNA retícula/hairline tenue de fondo (`--grid: rgba(255,255,255,.02)`) para el "instrumento". Nada más.
- **Border radius:** `--radius-sm: 4px` · `--radius-md: 6px` · `--radius-lg: 8px` · `--radius-pill: 999px` (solo pills reales). Bajar el `--radius-lg` actual de 12 → 8.

## Motion
- **Enfoque:** mínimo-funcional. Solo transiciones que ayudan a comprender.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`.
- **Duración:** micro 50-100ms · corta 150-250ms (default UI) · media 250-400ms. Sin pulsos, sin glow animado, sin bounce.

## Decisions Log
| Fecha | Decisión | Razón |
|---|---|---|
| 2026-06-29 | Sistema de diseño inicial | Creado por /design-consultation. App derivó a "AI slop" (236 ✨, 26 degradados, 14 glows, 4 glass) por falta de fuente de verdad. |
| 2026-06-29 | Naranja degradado a señal pura (acción/urgencia) | Cuando el acento es raro, significa. Sirve a "nada se te cae": el ojo va solo a lo que te necesita. |
| 2026-06-29 | Color = estado (ok/risk/blocked/done) como lenguaje central | El cockpit legible de un vistazo; color deja de ser decoración. |
| 2026-06-29 | Neutros grafito (quitar tinte verde de `#101510`) | Más serio, menos "temático". |
| 2026-06-29 | Conservar stack Bebas/DM Sans/Space Mono, roles disciplinados | Es equity de marca; el problema era el uso, no las fuentes. |
| 2026-06-29 | Cockpit = tablero por estado de riesgo (kanban), dirección "F" | Elegida vía /design-shotgun sobre 6 direcciones. Fiel a DESIGN.md; el riesgo se lee de un vistazo por columna. Artefactos en `~/.gstack/projects/Hookspa-TMPOS/designs/cockpit-20260701/`. |
