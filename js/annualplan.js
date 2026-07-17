// ══════════════════════════════════════════
// PLAN ANUAL — Gantt de lanzamientos del año (por artista + roster del label)
// Las barras se DERIVAN de los lanzamientos (campaña = fecha−preDays · estreno = fecha ·
// post = fecha+postDays), cero doble captura. Además, "canciones tentativas" viven en
// a.plan.tentatives para bosquejar el año antes de crear el lanzamiento.
// Diseño (DESIGN.md): barras neutras grafito, el drop usa color=ESTADO (no naranja),
// fechas en Space Mono tabular, grilla hairline de 12 meses, radios ≤8px.
// ══════════════════════════════════════════
let _planYear = new Date().getFullYear();
let planView = 'artista';          // 'artista' | 'roster'
function setPlanView(v) { planView = v; renderAnnualPlan(); }
function planPrevYear() { _planYear--; renderAnnualPlan(); }
function planNextYear() { _planYear++; renderAnnualPlan(); }

const _PLAN_MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
// Drop marker = color de estado del release (color = significado, nunca naranja decorativo).
function planStatusColor(status, tentative) {
  if (tentative) return 'var(--dim)';
  const m = { planning: 'var(--muted)', active: 'var(--ok)', bloqueado: 'var(--blocked)', analisis: 'var(--risk)', complete: 'var(--done)', cerrado: 'var(--done)' };
  return m[status] || 'var(--muted)';
}
function planStatusWord(status, tentative) {
  if (tentative) return 'Tentativa';
  return ((typeof STATUS_MAP !== 'undefined' && STATUS_MAP[status]) || {}).word || 'Planeando';
}

// ── Barras del año para un artista (lanzamientos reales + tentativas) ──
function _planBarsFor(artistId) {
  const out = [];
  (typeof launches !== 'undefined' ? launches : []).forEach(l => {
    if (l.artistId !== artistId || l.type === 'evergreen' || !l.date) return;
    out.push({ title: l.name || '(sin título)', date: l.date, pre: l.preDays != null ? l.preDays : 21, post: l.postDays != null ? l.postDays : 21, status: l.status || 'planning', launchId: l.id, tentative: false });
  });
  const a = (typeof artists !== 'undefined') ? artists.find(x => x.id === artistId) : null;
  ((a && a.plan && a.plan.tentatives) || []).forEach(tt => {
    if (!tt.targetDate) return;
    out.push({ title: tt.title || '(canción tentativa)', date: tt.targetDate, pre: tt.preDays != null ? tt.preDays : 21, post: tt.postDays != null ? tt.postDays : 21, status: 'planning', tentativeId: tt.id, tentative: true });
  });
  return out.sort((p, q) => (p.date || '').localeCompare(q.date || ''));
}
function _planParse(d) { const t = Date.parse((d || '') + 'T00:00:00Z'); return isNaN(t) ? null : t; }
function _planFrac(ms, y) { const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1); return Math.max(0, Math.min(100, (ms - start) / (end - start) * 100)); }

// Una barra Gantt (campaña → drop → post) dentro del riel de un año. Devuelve '' si cae fuera del año.
function _planBarHTML(bar, y) {
  const dropMs = _planParse(bar.date); if (dropMs == null) return null;
  const DAY = 864e5;
  const campMs = dropMs - (+bar.pre || 0) * DAY, postMs = dropMs + (+bar.post || 0) * DAY;
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  if (postMs < start || campMs >= end) return null;                    // esta barra no toca el año visible
  const C = _planFrac(campMs, y), R = _planFrac(dropMs, y), P = _planFrac(postMs, y);
  const col = planStatusColor(bar.status, bar.tentative);
  const dropInYear = dropMs >= start && dropMs < end;
  const dash = bar.tentative ? 'border:1px dashed var(--border);' : '';
  // campaña = gris tenue visible en ambos modos (antes usaba --raise = blanco en claro → invisible).
  const campSeg = R > C ? `<div style="position:absolute;left:${C}%;width:${R - C}%;top:6px;height:8px;background:color-mix(in srgb, var(--muted) 30%, transparent);border-radius:var(--radius-sm) 0 0 var(--radius-sm);${dash}"></div>` : '';
  const postSeg = P > R ? `<div style="position:absolute;left:${R}%;width:${P - R}%;top:8px;height:4px;background:color-mix(in srgb, var(--muted) 12%, transparent);border:1px solid var(--border);border-radius:0 var(--radius-sm) var(--radius-sm) 0"></div>` : '';
  const drop = dropInYear ? `<div title="Estreno ${s(bar.date)}" style="position:absolute;left:${R}%;top:2px;width:8px;height:16px;margin-left:-4px;background:${col};border-radius:2px"></div>` : '';
  return `<div class="pl-track" style="position:relative;flex:1;min-width:0;height:20px;background:repeating-linear-gradient(90deg,var(--hairline),var(--hairline) 1px,transparent 1px,transparent 8.3333%)">${campSeg}${postSeg}${drop}</div>`;
}

// Fila de una canción: etiqueta (título + fecha/estado) + riel.
function _planRowHTML(bar, y) {
  const track = _planBarHTML(bar, y);
  if (!track) return '';
  const dateTxt = (() => { const ms = _planParse(bar.date); if (ms == null) return ''; const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')} ${_PLAN_MONTHS[d.getUTCMonth()]}`; })();
  const open = bar.tentative ? '' : `onclick="planOpenLaunch('${bar.launchId}')" style="cursor:pointer"`;
  const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${planStatusColor(bar.status, bar.tentative)};margin-right:6px;vertical-align:middle"></span>`;
  return `<div class="pl-row" style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid var(--hairline)">
    <div class="pl-rowlabel" style="width:190px;flex:none" ${open}>
      <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dot}${s(bar.title)}${bar.tentative ? ' <span style="font-size:9px;font-family:var(--font-mono);color:var(--dim);border:1px dashed var(--border);border-radius:var(--radius-sm);padding:0 4px">TENTATIVA</span>' : ''}</div>
      <div style="font-size:10px;font-family:var(--font-mono);color:var(--dim);margin-top:2px;font-variant-numeric:tabular-nums">${dateTxt} · ${planStatusWord(bar.status, bar.tentative)}</div>
    </div>
    ${track}
  </div>`;
}

// Cabecera de 12 meses + línea de "hoy" (si el año visible es el actual).
function _planMonthHeader(y) {
  const cells = _PLAN_MONTHS.map(m => `<div style="flex:1;text-align:center;font-size:9px;font-family:var(--font-mono);color:var(--dim);letter-spacing:1px">${m}</div>`).join('');
  let hoy = '';
  const now = new Date();
  if (now.getFullYear() === y) { const f = _planFrac(Date.now(), y); hoy = `<div title="Hoy" style="position:absolute;left:calc(190px + 12px + (100% - 190px - 12px) * ${f} / 100);top:0;bottom:0;width:1px;background:var(--muted);opacity:.5"></div>`; }
  return `<div style="position:relative;display:flex;align-items:center;gap:12px;padding:0 0 6px;border-bottom:1px solid var(--border)">
    <div style="width:190px;flex:none;font-size:9px;font-family:var(--font-mono);color:var(--dim);letter-spacing:1px">${y}</div>
    <div style="flex:1;display:flex">${cells}</div>${hoy}</div>`;
}

// Un Gantt de un artista (solo el riel; sin editor).
function _planGanttForArtist(artistId, y) {
  const bars = _planBarsFor(artistId);
  const rows = bars.map(b => _planRowHTML(b, y)).filter(Boolean).join('');
  if (!rows) return `<div style="text-align:center;font-size:11px;font-family:var(--font-mono);color:var(--dim);padding:14px 0">— SIN CANCIONES EN ${y} —</div>`;
  return rows;
}

function planLegendHTML() {
  const sw = (col, lbl) => `<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:2px;background:${col}"></span>${lbl}</span>`;
  return `<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:10px;font-family:var(--font-mono);color:var(--muted);margin-top:10px">
    <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:20px;height:6px;background:color-mix(in srgb, var(--muted) 30%, transparent);border-radius:2px"></span>Campaña</span>
    <span style="display:inline-flex;align-items:center;gap:5px"><span style="width:20px;height:3px;background:var(--surface2);border:1px solid var(--border);border-radius:2px"></span>Post-lanzamiento</span>
    ${sw('var(--ok)', 'En campaña')} ${sw('var(--risk)', 'En análisis')} ${sw('var(--blocked)', 'Bloqueado')} ${sw('var(--muted)', 'Planeando')} ${sw('var(--done)', 'Lanzado')} ${sw('var(--dim)', 'Tentativa')}</div>`;
}

// Barra de navegación de año (compartida).
function planYearNavHTML() {
  return `<div style="display:flex;align-items:center;gap:10px">
    <button class="btn btn-ghost btn-sm" onclick="planPrevYear()" title="Año anterior" style="font-family:var(--font-mono)">‹</button>
    <span style="font-family:var(--font-mono);font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;min-width:52px;text-align:center">${_planYear}</span>
    <button class="btn btn-ghost btn-sm" onclick="planNextYear()" title="Año siguiente" style="font-family:var(--font-mono)">›</button></div>`;
}

// ── Vista ROSTER: un Gantt por artista (la visión del label con todos los artistas) ──
function annualRosterHTML() {
  const y = _planYear;
  const arts = (typeof artists !== 'undefined') ? artists.slice() : [];
  if (!arts.length) return `<div class="empty-hint">No hay artistas todavía.</div>`;
  const blocks = arts.map(a => {
    const bars = _planBarsFor(a.id);
    const rows = bars.map(b => _planRowHTML(b, y)).filter(Boolean).join('');
    const count = bars.filter(b => _planBarHTML(b, y)).length;
    return `<div style="margin-top:14px">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px">
        <div style="font-family:var(--font-display);font-size:18px;letter-spacing:.5px">${s(a.name)}</div>
        <div style="font-size:10px;font-family:var(--font-mono);color:var(--dim)">${count} canción(es) en ${y}</div></div>
      ${rows || `<div style="font-size:11px;font-family:var(--font-mono);color:var(--dim);padding:8px 0">— sin canciones planeadas este año —</div>`}
    </div>`;
  }).join('');
  return `<div class="panel">
    <div class="panel-head"><span class="ph-icon">${icon('calendar', 18)}</span><span class="ph-title">Plan anual del label</span><span class="ph-sub">todos los artistas · ${y}</span><div style="margin-left:auto">${planYearNavHTML()}</div></div>
    ${_planMonthHeader(y)}
    ${blocks}
    ${planLegendHTML()}</div>`;
}

// ── Vista ARTISTA: Gantt del artista activo + editor de tentativas ──
function annualArtistHTML() {
  const y = _planYear;
  const a = (typeof activeArtist === 'function') ? activeArtist() : null;
  if (!a) return `<div class="empty-hint">Selecciona un artista para ver su plan anual.</div>`;
  const gantt = `<div class="panel">
    <div class="panel-head"><span class="ph-icon">${icon('calendar', 18)}</span><span class="ph-title">Plan anual — ${s(a.name)}</span><span class="ph-sub">campaña · estreno · post-lanzamiento</span><div style="margin-left:auto">${planYearNavHTML()}</div></div>
    ${_planMonthHeader(y)}
    ${_planGanttForArtist(a.id, y)}
    ${planLegendHTML()}</div>`;
  return gantt + tentativesEditorHTML(a);
}

// Editor de canciones tentativas (borrador del año antes de crear el lanzamiento).
function tentativesEditorHTML(a) {
  const canEdit = (typeof canDo !== 'function') || canDo('edit_launch');
  const list = ((a.plan && a.plan.tentatives) || []);
  const rows = list.map(tt => `<div class="panel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
    <input class="input" style="flex:2;min-width:140px;font-size:13px;font-weight:600" value="${esc(tt.title)}" placeholder="Título de la canción" ${canEdit ? `onchange="setTentativeField('${tt.id}','title',this.value)"` : 'disabled'}>
    <div class="field" style="margin:0"><label style="font-size:9px">Fecha objetivo</label><input class="input" type="date" style="padding:5px 8px;font-size:12px" value="${esc(tt.targetDate)}" ${canEdit ? `onchange="setTentativeField('${tt.id}','targetDate',this.value)"` : 'disabled'}></div>
    <div class="field" style="margin:0;width:70px"><label style="font-size:9px">Pre (d)</label><input class="input" inputmode="numeric" style="padding:5px 8px;font-size:12px" value="${tt.preDays != null ? tt.preDays : 21}" ${canEdit ? `onchange="setTentativeField('${tt.id}','preDays',this.value)"` : 'disabled'}></div>
    <div class="field" style="margin:0;width:70px"><label style="font-size:9px">Post (d)</label><input class="input" inputmode="numeric" style="padding:5px 8px;font-size:12px" value="${tt.postDays != null ? tt.postDays : 21}" ${canEdit ? `onchange="setTentativeField('${tt.id}','postDays',this.value)"` : 'disabled'}></div>
    <input class="input" style="flex:1;min-width:120px;padding:5px 8px;font-size:12px" value="${esc(tt.notes)}" placeholder="Notas" ${canEdit ? `onchange="setTentativeField('${tt.id}','notes',this.value)"` : 'disabled'}>
    ${canEdit ? `<button class="btn btn-ghost btn-sm" onclick="tentativeToLaunch('${tt.id}')" title="Convertir en lanzamiento">${icon('releases', 12)} A lanzamiento</button>` : ''}
    ${canEdit ? `<button class="goal-btn reject" title="Quitar" onclick="removeTentative('${tt.id}')">${icon('close', 12)}</button>` : ''}
  </div>`).join('');
  return `<div class="panel">
    <div class="panel-head"><span class="ph-icon">${icon('plus', 18)}</span><span class="ph-title">Canciones tentativas</span><span class="ph-sub">bosqueja el año · conviértelas en lanzamiento cuando estén listas</span></div>
    <div class="empty-hint" style="margin-bottom:10px">Fechas objetivo de canciones que aún no son lanzamientos. Aparecen en el Gantt con borde punteado; al concretarse, "A lanzamiento" crea el release y la quita de aquí.</div>
    ${rows || '<div class="empty-hint">Sin canciones tentativas.</div>'}
    ${canEdit ? `<button class="btn btn-ghost" style="margin-top:8px" onclick="addTentative()">+ Canción tentativa</button>` : ''}</div>`;
}

// ── CRUD de tentativas ──
function _artistPlanEnsure(a) { a.plan = a.plan || {}; a.plan.tentatives = Array.isArray(a.plan.tentatives) ? a.plan.tentatives : []; return a.plan; }
function addTentative() {
  if (typeof requireCan === 'function' && !requireCan('edit_launch')) return;
  const a = (typeof activeArtist === 'function') ? activeArtist() : null; if (!a) return;
  _artistPlanEnsure(a).tentatives.push({ id: 'tt-' + Date.now(), title: '', targetDate: '', preDays: 21, postDays: 21, notes: '' });
  saveArtists(); renderAnnualPlan();
}
function setTentativeField(id, field, val) {
  if (typeof requireCan === 'function' && !requireCan('edit_launch')) return;
  const a = (typeof activeArtist === 'function') ? activeArtist() : null; if (!a) return;
  const tt = _artistPlanEnsure(a).tentatives.find(x => x.id === id); if (!tt) return;
  tt[field] = (field === 'preDays' || field === 'postDays') ? (parseInt(val, 10) || 0) : val;
  saveArtists();
  if (field === 'targetDate' || field === 'preDays' || field === 'postDays') renderAnnualPlan(); // el Gantt depende de estos
}
function removeTentative(id) {
  if (typeof requireCan === 'function' && !requireCan('edit_launch')) return;
  const a = (typeof activeArtist === 'function') ? activeArtist() : null; if (!a) return;
  const p = _artistPlanEnsure(a); p.tentatives = p.tentatives.filter(x => x.id !== id);
  saveArtists(); renderAnnualPlan();
}
async function tentativeToLaunch(id) {
  if (typeof requireCan === 'function' && !requireCan('edit_launch')) return;
  const a = (typeof activeArtist === 'function') ? activeArtist() : null; if (!a) return;
  const p = _artistPlanEnsure(a); const tt = p.tentatives.find(x => x.id === id); if (!tt) return;
  if (!s(tt.title).trim()) { if (typeof uiAlert === 'function') uiAlert('Ponle un título a la canción tentativa antes de convertirla.'); return; }
  const l = normalizeLaunch({ id: 'L-' + Date.now(), artistId: a.id, name: tt.title.trim(), date: tt.targetDate || '', status: 'planning', preDays: tt.preDays != null ? tt.preDays : 21, postDays: tt.postDays != null ? tt.postDays : 21, notes: tt.notes || '' });
  launches.push(l);
  p.tentatives = p.tentatives.filter(x => x.id !== id);
  saveLaunches(); saveArtists();
  if (typeof logActivity === 'function') { try { logActivity('created', `Lanzamiento creado desde plan anual: ${l.name}`, { artistId: a.id, releaseId: l.id }); } catch (e) {} }
  if (typeof uiToast === 'function') uiToast('✓ Lanzamiento creado');
  renderAnnualPlan();
}
function planOpenLaunch(id) {
  const l = (typeof launches !== 'undefined') ? launches.find(x => x.id === id) : null; if (!l) return;
  if (l.artistId && typeof currentArtistId !== 'undefined' && currentArtistId !== l.artistId) {
    currentArtistId = l.artistId;                                   // cambia de artista sin pasar por setActiveArtist (que anularía el launch)
    if (typeof saveActiveArtist === 'function') saveActiveArtist();
    if (typeof renderSidebarArtist === 'function') renderSidebarArtist();
  }
  if (typeof currentLaunchId !== 'undefined') currentLaunchId = id;
  if (typeof showPage === 'function') showPage('launch');
  if (typeof renderLaunchDetail === 'function') renderLaunchDetail();
}

// ── Render de la página ──
function renderAnnualPlan() {
  const tb = document.getElementById('plan-toolbar'); const body = document.getElementById('plan-body'); if (!body) return;
  const seg = (active, opts, fn) => `<div class="view-toggle">${opts.map(o => `<button class="${active === o[0] ? 'active' : ''}" onclick="${fn}('${o[0]}')">${o[1]}</button>`).join('')}</div>`;
  if (tb) tb.innerHTML = seg(planView, [['artista', 'Artista'], ['roster', 'Roster']], 'setPlanView');
  body.innerHTML = planView === 'roster' ? annualRosterHTML() : annualArtistHTML();
  if (typeof hydrateIcons === 'function') hydrateIcons(body);
}
