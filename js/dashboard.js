// ══════════════════════════════════════════
// DASHBOARDS — rollups de señales CRM (Sprint 5)
// (sin emojis; señales con puntos de color)
// ══════════════════════════════════════════
function artistReleasesAll(artId){ return launches.filter(l => l.artistId === artId && l.type !== 'evergreen'); }
// Legal pendiente del release = tracks con split sin firmar + documentos legales no firmados/aprobados
function releaseLegalPending(l){
  let n = 0;
  (typeof tracksOfLaunch === 'function' ? tracksOfLaunch(l) : []).forEach(t => {
    const lg = (t.checklist && t.checklist.legal) || {};
    if (!lg.splitFirmado) n++;
    (t.legal || []).forEach(d => { if (d.state === 'pendiente' || d.state === 'enviado') n++; });
  });
  return n;
}
function artistLegalPending(artId){ return artistReleasesAll(artId).reduce((a, l) => a + releaseLegalPending(l), 0); }
function artistAlertCount(artId){ return (typeof releaseAlerts === 'function') ? artistReleasesAll(artId).reduce((a, l) => a + releaseAlerts(l).length, 0) : 0; }
function artistFinance(artId){
  let inv = 0, ing = 0;
  artistReleasesAll(artId).forEach(l => { if (typeof sumExpenses === 'function') inv += sumExpenses(l); ing += +((l.recoup && l.recoup.ingresos) || 0); });
  return { inv, ing, roi: inv > 0 ? Math.round((ing - inv) / inv * 100) : null };
}
function upcomingReleases(days, artId){
  return launches.filter(l => (!artId || l.artistId === artId) && l.status !== 'complete' && l.date && (typeof diasRestantes === 'function') && diasRestantes(l.date) >= 0 && diasRestantes(l.date) <= days);
}
function nextRelease(artId){
  const up = launches.filter(l => (!artId || l.artistId === artId) && l.status !== 'complete' && l.date && (typeof diasRestantes === 'function') && diasRestantes(l.date) >= 0)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return up[0] || null;
}
// Punto de color reutilizable (reemplaza emojis de semáforo)
function dotHTML(color, size){ return `<span style="display:inline-block;width:${size || 8}px;height:${size || 8}px;border-radius:50%;background:${color};flex:0 0 auto"></span>`; }
function rankColor(rank){ return rank === 0 ? 'var(--accent2)' : rank === 1 ? 'var(--beat)' : rank === 3 ? 'var(--ok)' : 'var(--text-dim)'; }

// ══════════════════════════════════════════
// HEATMAP DE ROSTER — carga semanal de lanzamientos (vista de sello, Tier 2 #5)
// ══════════════════════════════════════════
// Próximas n semanas desde el lunes de la semana actual, con los releases del roster en cada una.
function rosterWeeks(n){
  const today = new Date();
  const day = (today.getDay() || 7);                 // 1=lunes … 7=domingo
  const monday = new Date(today); monday.setDate(today.getDate() - (day - 1)); monday.setHours(0,0,0,0);
  const all = (typeof launches !== 'undefined') ? launches.filter(l => l.type !== 'evergreen' && l.date) : [];
  const weeks = [];
  for (let i = 0; i < n; i++){
    const start = new Date(monday); start.setDate(monday.getDate() + i*7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const key = (typeof _isoWeekKey === 'function') ? _isoWeekKey(start.toISOString().slice(0,10)) : '';
    const releases = all.filter(l => (typeof _isoWeekKey === 'function') && _isoWeekKey(l.date) === key)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''));
    weeks.push({ key, start, end, releases });
  }
  return weeks;
}
// Color de carga (alineado al guardarraíl: máx 2–3/semana).
function rosterLoadColor(n){ return n >= 3 ? 'var(--accent2)' : n === 2 ? 'var(--beat)' : n === 1 ? 'var(--ok)' : 'var(--surface2)'; }
function renderRosterHeatmap(){ const host = document.getElementById('label-roster'); if (host) host.innerHTML = rosterHeatmapHTML(); }
function rosterHeatmapHTML(){
  const N = 10, weeks = rosterWeeks(N);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmt = d => `${d.getDate()} ${months[d.getMonth()]}`;
  const overloaded = weeks.filter(w => w.releases.length >= 3).length;
  // Tira tipo heatmap: una celda por semana, coloreada por carga.
  const cells = weeks.map(w => { const n = w.releases.length; const col = rosterLoadColor(n);
    return `<div title="${fmt(w.start)}–${fmt(w.end)} · ${n} release${n!==1?'s':''}" style="flex:1;min-width:52px;border-radius:8px;border:1px solid var(--border);background:${col};${n>=2?'color:#1a1a1a':'color:var(--text-muted)'};padding:8px 6px;text-align:center">
      <div style="font-size:var(--text-2xs);font-family:var(--font-ui);opacity:.85">${fmt(w.start)}</div>
      <div style="font-family:var(--font-ui);font-weight:var(--fw-num);font-variant-numeric:tabular-nums;font-size:var(--text-lg);line-height:var(--lh-tight)">${n}</div>
    </div>`; }).join('');
  // Detalle: semanas con releases, con chips clicables y aviso de sobrecarga.
  const detail = weeks.filter(w => w.releases.length).map(w => { const n = w.releases.length; const col = rosterLoadColor(n);
    const chips = w.releases.map(r => { const art = (typeof artists !== 'undefined') ? artists.find(a => a.id === r.artistId) : null;
      return `<span class="chip" style="cursor:pointer" onclick="openLaunch('${r.id}')">${art ? esc(art.name) + ' · ' : ''}${esc(r.name)}</span>`; }).join(' ');
    const warn = n >= 3 ? `<span style="color:var(--accent2);font-size:var(--text-xs);font-family:var(--font-ui)">sobrecargada · máx 2–3</span>`
              : (n === 2 ? `<span style="color:var(--beat);font-size:var(--text-xs);font-family:var(--font-ui)">al límite</span>` : '');
    return `<div style="border:1px solid var(--border);border-left:3px solid ${col};border-radius:8px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${chips?'6px':'0'};flex-wrap:wrap"><span style="font-size:var(--text-base);font-weight:600">${fmt(w.start)} – ${fmt(w.end)}</span><span style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted)">${n} release${n!==1?'s':''}</span>${warn}</div>
      ${chips ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${chips}</div>` : ''}
    </div>`; }).join('') || `<div class="empty-hint">No hay releases con fecha en las próximas ${N} semanas.</div>`;
  const banner = overloaded ? `<div style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);padding:8px 12px;border-radius:8px;background:rgba(255,77,77,.08);margin-bottom:14px"><span class="dot dot--red"></span><span>${overloaded} semana${overloaded>1?'s':''} con 3+ releases — riesgo de auto-canibalización y carga del equipo.</span></div>` : '';
  return banner + `<div style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">${cells}</div>` + detail;
}

// ══════════════════════════════════════════
// COCKPIT DE LANZAMIENTOS (vista de portafolio · sonda de discovery, pivote post-Council)
// Reusa releaseReady/releasePhase/releaseAlerts/diasRestantes + tasks. NO es el foso completo (gated A3).
// Forma: cola de acción (lo que se cae esta semana) + tabla de N lanzamientos ordenada por riesgo.
// ══════════════════════════════════════════
function cockpitLaunches() {
  const all = (typeof launches !== 'undefined') ? launches : [];
  return all.filter(l => l.type !== 'evergreen' && l.status !== 'complete' && l.status !== 'cerrado');
}
function _cockpitTasks(l) { return (typeof tasks !== 'undefined') ? tasks.filter(t => t.releaseId === l.id) : []; }
function _cockpitRisk(l) {
  const d = (l.date && typeof diasRestantes === 'function') ? diasRestantes(l.date) : null;
  const ts = _cockpitTasks(l);
  const overdue = ts.filter(t => t.estado !== TASK_DONE && t.dueDate && diasRestantes(t.dueDate) < 0).length;
  const blocked = ts.filter(t => t.estado === 'bloqueado').length;
  const alerts = (typeof releaseAlerts === 'function') ? releaseAlerts(l) : [];
  const reds = alerts.filter(a => a.level === 'red').length, yellows = alerts.filter(a => a.level === 'yellow').length;
  const pct = (typeof releaseReady === 'function') ? releaseReady(l).pct : 0;
  const nearDrop = d != null && d >= 0 && d <= 30;
  let score = overdue * 8 + blocked * 5 + reds * 10 + (nearDrop ? yellows * 3 : 0);
  if (d != null) { if (d < 0) score += 15; else if (d <= 7) score += 20; else if (d <= 14) score += 10; else if (d <= 30) score += 4; }
  if (d != null && d >= 0 && d <= 21 && pct < 60) score += Math.round((60 - pct) / 3);
  return { score, d, overdue, blocked, reds, yellows, pct, alerts };
}
// ¿La tarea está pospuesta (snooze) y aún vigente? → sale de la cola hasta su fecha.
function _cockpitSnoozed(t) { return t && t.snoozedUntil && (typeof diasRestantes === 'function') && diasRestantes(t.snoozedUntil) >= 0; }
// Cola de acción cross-lanzamiento: lo que se cae esta semana en todo el roster.
// Los ítems basados en tarea llevan `tid` + `kind:'task'` → habilitan recordar/mover/escalar.
function cockpitActionItems() {
  const out = [];
  cockpitLaunches().forEach(l => {
    const art = (typeof artists !== 'undefined') ? artists.find(a => a.id === l.artistId) : null;
    const an = art ? art.name : '—';
    const ts = _cockpitTasks(l);
    ts.filter(t => t.estado !== TASK_DONE && t.dueDate && diasRestantes(t.dueDate) < 0 && !_cockpitSnoozed(t)).forEach(t =>
      out.push({ sev: 3, kind: 'task', tid: t.id, lid: l.id, tab: 'trabajo', art: an, rel: l.name, text: `Tarea vencida: ${s(t.titulo) || 'sin título'} · ${-diasRestantes(t.dueDate)}d`, ord: diasRestantes(t.dueDate) }));
    ts.filter(t => t.estado === 'bloqueado' && !_cockpitSnoozed(t)).forEach(t =>
      out.push({ sev: 2, kind: 'task', tid: t.id, lid: l.id, tab: 'trabajo', art: an, rel: l.name, text: `Bloqueada: ${s(t.titulo) || 'sin título'}`, ord: 5000 }));
    ((typeof releaseAlerts === 'function') ? releaseAlerts(l) : []).filter(a => a.level === 'red').forEach(a =>
      out.push({ sev: 3, kind: 'alert', lid: l.id, tab: 'resumen', art: an, rel: l.name, text: s(a.text), ord: 4000 }));
    const d = (l.date && typeof diasRestantes === 'function') ? diasRestantes(l.date) : null;
    const pct = (typeof releaseReady === 'function') ? releaseReady(l).pct : 0;
    if (d != null && d >= 0 && d <= 7 && pct < 70) out.push({ sev: 3, kind: 'drop', lid: l.id, tab: 'resumen', art: an, rel: l.name, text: `Drop en ${d}d con readiness ${pct}%`, ord: d });
  });
  out.sort((a, b) => b.sev - a.sev || a.ord - b.ord);
  return out;
}
// ── Acciones de la cola (sobre datos propios del equipo) ──
function _cockpitRerender() { if (typeof renderCompas === 'function') renderCompas(); } // el cockpit vive dentro del Dashboard (Roster→Riesgo)
function cockpitSnooze(tid, days) {
  if (typeof requireCan === 'function' && !requireCan('gestionar_tareas')) return;
  const t = (typeof taskById === 'function') ? taskById(tid) : null; if (!t) return;
  const d = new Date(); d.setDate(d.getDate() + (days || 3));
  if (typeof updateTaskRow === 'function') updateTaskRow(tid, { snoozedUntil: d.toISOString().slice(0, 10) });
  if (typeof uiToast === 'function') uiToast(`✓ Pospuesta ${days || 3}d`);
  _cockpitRerender();
}
async function cockpitReschedule(tid) {
  if (typeof requireCan === 'function' && !requireCan('gestionar_tareas')) return;
  const t = (typeof taskById === 'function') ? taskById(tid) : null; if (!t) return;
  const val = await uiPrompt('Nueva fecha límite (AAAA-MM-DD):', { title: 'Mover tarea', value: t.dueDate || '' });
  if (!val) return;
  if (typeof updateTaskRow === 'function') updateTaskRow(tid, { dueDate: val.trim() });
  if (typeof uiToast === 'function') uiToast('✓ Fecha movida');
  _cockpitRerender();
}
async function cockpitEscalate(tid) {
  if (typeof requireCan === 'function' && !requireCan('gestionar_tareas')) return;
  const t = (typeof taskById === 'function') ? taskById(tid) : null; if (!t) return;
  const who = await uiPrompt('Escalar / reasignar a (nombre o correo del responsable):', { title: 'Escalar tarea', value: t.responsable || '' });
  if (!who || !who.trim()) return;
  if (typeof updateTaskRow === 'function') updateTaskRow(tid, { responsable: who.trim() }); // auto-notifica + registra actividad
  if (typeof uiToast === 'function') uiToast('✓ Escalada a ' + who.trim());
  _cockpitRerender();
}
// Abre el lanzamiento del cockpit (cambia de artista si hace falta + pestaña).
function cockpitOpen(id, tab) {
  const l = (typeof launches !== 'undefined') ? launches.find(x => x.id === id) : null; if (!l) return;
  if (typeof setActiveArtist === 'function' && l.artistId) setActiveArtist(l.artistId);
  if (typeof openLaunch === 'function') { openLaunch(id); if (tab) setTimeout(() => { if (typeof setReleaseTab === 'function') setReleaseTab(tab); }, 90); }
}
// Riesgo de lanzamientos (cockpit) — builder puro que consume Compás.
function cockpitBodyHTML() {
  const rows = cockpitLaunches().map(l => ({ l, r: _cockpitRisk(l) }))
    .sort((a, b) => b.r.score - a.r.score || ((a.r.d == null ? 9999 : a.r.d) - (b.r.d == null ? 9999 : b.r.d)));
  if (!rows.length) return '<div class="empty-hint">No hay lanzamientos activos. Crea uno para verlo aquí.</div>';
  const countLine = `<div style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted);margin-bottom:14px">${rows.length} lanzamiento${rows.length === 1 ? '' : 's'} activo${rows.length === 1 ? '' : 's'} · ordenados por riesgo</div>`;
  // ── Cola de acción ──
  const items = cockpitActionItems().slice(0, 6);
  const queue = items.length ? `
    <div class="panel" style="margin:0 0 18px;border-color:rgba(255,77,77,.25)">
      <div class="panel-head"><span class="ph-icon">${icon('warning', 18)}</span><span class="ph-title">Se cae esta semana</span><span class="ph-sub">${items.length} cosa${items.length === 1 ? '' : 's'} que necesitan acción</span></div>
      ${items.map(it => {
        const taskActs = (it.kind === 'task' && it.tid) ? `
          <button class="btn btn-ghost btn-sm" style="font-size:var(--text-2xs);padding:2px 7px" title="Posponer 3 días" onclick="event.stopPropagation();cockpitSnooze('${it.tid}',3)">${icon('clock', 10)} Posponer</button>
          <button class="btn btn-ghost btn-sm" style="font-size:var(--text-2xs);padding:2px 7px" title="Mover fecha límite" onclick="event.stopPropagation();cockpitReschedule('${it.tid}')">${icon('calendar', 10)} Mover</button>
          <button class="btn btn-ghost btn-sm" style="font-size:var(--text-2xs);padding:2px 7px" title="Escalar / reasignar" onclick="event.stopPropagation();cockpitEscalate('${it.tid}')">${icon('invite', 10)} Escalar</button>` : '';
        return `<div role="button" tabindex="0" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:${it.sev >= 3 ? 'rgba(255,77,77,.07)' : 'rgba(255,170,0,.07)'};margin-bottom:6px;cursor:pointer;flex-wrap:wrap" onclick="cockpitOpen('${it.lid}','${it.tab}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cockpitOpen('${it.lid}','${it.tab}')}">
        <span class="dot ${it.sev >= 3 ? 'dot--red' : 'dot--yellow'}"></span>
        <div style="flex:1;min-width:140px"><div style="font-size:var(--text-base)">${esc(it.text)}</div><div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${esc(it.art)} · ${esc(it.rel)}</div></div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">${taskActs}<span class="chip" style="cursor:pointer">Abrir →</span></div>
      </div>`; }).join('')}
    </div>` : `<div class="panel" style="margin:0 0 18px"><div style="display:flex;align-items:center;gap:8px;font-size:var(--text-base)"><span class="dot dot--green"></span> Nada urgente esta semana. Todo bajo control.</div></div>`;
  // ── Tabla de lanzamientos (una fila c/u, ordenada por riesgo) ──
  const rowsHTML = rows.map(({ l, r }) => {
    const art = (typeof artists !== 'undefined') ? artists.find(a => a.id === l.artistId) : null;
    const phase = (typeof releasePhase === 'function') ? releasePhase(l) : '—';
    const pcol = (typeof phaseColor === 'function') ? phaseColor(phase) : 'var(--text-dim)';
    const rcol = (typeof readyColor === 'function') ? readyColor(r.pct) : 'var(--accent)';
    const topAlert = (r.alerts.find(a => a.level === 'red') || r.alerts.find(a => a.level === 'yellow'));
    const dLabel = r.d == null ? 's/fecha' : (r.d < 0 ? `salió hace ${-r.d}d` : `${r.d}d`);
    const dColor = r.d == null ? 'var(--text-dim)' : (r.d < 0 ? 'var(--ok)' : (r.d <= 7 ? 'var(--accent2)' : (r.d <= 21 ? 'var(--beat)' : 'var(--text-muted)')));
    const badges = [
      r.overdue ? `<span class="chip" style="cursor:default;color:var(--accent2);border-color:rgba(255,77,77,.3)">${r.overdue} vencida${r.overdue === 1 ? '' : 's'}</span>` : '',
      r.blocked ? `<span class="chip" style="cursor:default;color:var(--beat)">${r.blocked} bloqueada${r.blocked === 1 ? '' : 's'}</span>` : '',
    ].filter(Boolean).join('');
    return `<div role="button" tabindex="0" onclick="cockpitOpen('${l.id}','resumen')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cockpitOpen('${l.id}','resumen')}" style="cursor:pointer;border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="flex:1.4;min-width:190px">
        <div style="font-size:var(--text-md);font-weight:600">${esc(l.name)}</div>
        <div style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted);margin-top:2px">${esc(art ? art.name : '—')}${art && art.genre ? ' · ' + esc(art.genre) : ''}</div>
      </div>
      <div style="flex:0 0 auto"><span class="chip" style="cursor:default;color:${pcol};border-color:${pcol}55">${esc(phase)}</span></div>
      <div style="flex:1;min-width:130px">
        <div style="display:flex;justify-content:space-between;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);margin-bottom:3px"><span>LISTO</span><span style="color:${rcol}">${r.pct}%</span></div>
        <div class="progress-track" style="height:5px"><div class="progress-fill" style="width:${r.pct}%;background:${rcol}"></div></div>
        ${topAlert ? `<div style="font-size:var(--text-2xs);color:var(--text-muted);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(topAlert.text)}"><span class="dot ${topAlert.level === 'red' ? 'dot--red' : 'dot--yellow'}" style="margin-right:4px"></span>${esc(topAlert.text)}</div>` : ''}
      </div>
      <div style="flex:0 0 auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${badges}</div>
      <div style="flex:0 0 auto;min-width:130px;display:flex;justify-content:flex-end">${(typeof dropClockHTML === 'function') ? dropClockHTML(l) : ''}</div>
    </div>`;
  }).join('');
  return countLine + queue + rowsHTML;
}

// ══════════════════════════════════════════
// TABLERO POR ESTADO DE RIESGO (dirección "F", DESIGN.md) — mismo dato que la tabla, en kanban.
// Columnas: Bloqueado → En riesgo → En tiempo → Post-drop. El naranja solo en la acción del bloqueado.
// ══════════════════════════════════════════
function _cockpitState(l, r) {
  if (r.d != null && r.d < 0) return 'post';                                   // ya salió
  if (r.blocked || r.reds || r.overdue) return 'blocked';                      // hay algo rojo
  if ((r.yellows && r.d != null && r.d >= 0 && r.d <= 30) || (r.d != null && r.d >= 0 && r.d <= 14 && r.pct < 70)) return 'risk';
  return 'ok';
}
// Momento firma 03 (DESIGN.md v2): el silencio. All-clear como recompensa, no empty-state ilustrado.
function _verifiedStamp() { const n = new Date(); const p2 = x => String(x).padStart(2, '0'); return `${p2(n.getHours())}:${p2(n.getMinutes())}`; }
function silenceBlockHTML() { return `<div class="silence"><b>— SILENCIO —</b>NADA BLOQUEADO · VERIFICADO ${_verifiedStamp()}</div>`; }
function allClearHTML() { return `<div class="all-clear"><div class="ac-line">TODO EN TEMPO.</div><div class="ac-sub">ROSTER VERIFICADO · ${_verifiedStamp()}</div></div>`; }
function cockpitBoardHTML() {
  const list = cockpitLaunches();
  if (!list.length) return '<div class="empty-hint">No hay lanzamientos activos. Crea uno para verlo aquí.</div>';
  const cols = {
    blocked: { label: 'Bloqueado', color: 'var(--blocked)', items: [] },
    risk:    { label: 'En riesgo', color: 'var(--risk)',    items: [] },
    ok:      { label: 'En tiempo', color: 'var(--ok)',      items: [] },
    post:    { label: 'Post-drop', color: 'var(--done)',    items: [] },
  };
  list.map(l => ({ l, r: _cockpitRisk(l) }))
    .sort((a, b) => b.r.score - a.r.score || ((a.r.d == null ? 9999 : a.r.d) - (b.r.d == null ? 9999 : b.r.d)))
    .forEach(x => cols[_cockpitState(x.l, x.r)].items.push(x));
  const card = ({ l, r }, showAct) => {
    const art = (typeof artists !== 'undefined') ? artists.find(a => a.id === l.artistId) : null;
    const phase = (typeof releasePhase === 'function') ? releasePhase(l) : '—';
    const rcol = r.pct >= 80 ? 'var(--ok)' : r.pct >= 40 ? 'var(--risk)' : 'var(--blocked)';
    const topAlert = r.alerts.find(a => a.level === 'red') || r.alerts.find(a => a.level === 'yellow');
    const dLabel = r.d == null ? 's/f' : (r.d < 0 ? 'live' : r.d);
    const dCol = r.d == null ? 'var(--text-dim)' : (r.d < 0 ? 'var(--done)' : (r.d <= 7 ? 'var(--blocked)' : (r.d <= 21 ? 'var(--risk)' : 'var(--text)')));
    const act = (showAct && topAlert) ? `<button class="btn btn-primary" style="width:100%;margin-top:9px;font-size:var(--text-xs);padding:6px 8px" onclick="event.stopPropagation();cockpitOpen('${l.id}','resumen')">→ Resolver</button>` : '';
    return `<div role="button" tabindex="0" onclick="cockpitOpen('${l.id}','resumen')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();cockpitOpen('${l.id}','resumen')}" style="cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:11px;margin-bottom:9px">
      <div style="font-size:var(--text-base);font-weight:600">${esc(l.name)}</div>
      <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);text-transform:uppercase;margin:1px 0 8px">${esc(art ? art.name : '—')}</div>
      <div class="progress-track" style="height:3px;margin-bottom:8px"><div class="progress-fill" style="width:${r.pct}%;background:${rcol}"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px">
        <div style="font-size:var(--text-xs);color:var(--text-muted);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${topAlert ? esc(topAlert.text) : esc(phase)}">${topAlert ? esc(topAlert.text) : esc(phase)}</div>
        <div style="font-family:var(--font-ui);font-weight:700;font-variant-numeric:tabular-nums;font-size:var(--text-lg);line-height:.9;color:${dCol};flex:0 0 auto">${esc(String(dLabel))}</div>
      </div>${act}</div>`;
  };
  const colHTML = (key) => {
    const c = cols[key];
    const empty = (key === 'blocked' && typeof silenceBlockHTML === 'function') ? silenceBlockHTML() : '<div style="font-size:var(--text-xs);color:var(--text-dim);padding:6px 4px">—</div>';
    return `<div style="flex:1;min-width:0;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-lg);padding:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;font-family:var(--font-ui);font-size:var(--text-2xs);letter-spacing:var(--track-caps);text-transform:uppercase;color:${c.color};padding:2px 4px 10px;border-bottom:1px solid var(--border);margin-bottom:10px"><span>${c.label}</span><span>${c.items.length}</span></div>
      ${c.items.map(x => card(x, key === 'blocked')).join('') || empty}
    </div>`;
  };
  const count = list.length;
  const line = `<div style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted);margin-bottom:14px">${count} lanzamiento${count === 1 ? '' : 's'} activo${count === 1 ? '' : 's'} · por estado de riesgo</div>`;
  // El silencio como recompensa: si nada está bloqueado ni en riesgo, el cockpit es una sola línea.
  if (!cols.blocked.items.length && !cols.risk.items.length && typeof allClearHTML === 'function') return line + allClearHTML();
  return line + `<div style="display:flex;gap:12px;align-items:flex-start;overflow-x:auto;padding-bottom:6px">${['blocked', 'risk', 'ok', 'post'].map(colHTML).join('')}</div>`;
}

// ══════════════════════════════════════════
// SALUD DEL ROSTER (antes "Label") — builder puro único (lo comparten Compás y la pág. Label legacy)
// ══════════════════════════════════════════
function rosterHealthHTML() {
  if (!(typeof artists !== 'undefined') || !artists.length) return '<div class="empty-hint">No hay artistas en este equipo todavía.</div>';
  const perf = artists.map(a => ({ art: a, p: artistPerformance(a) }));
  perf.sort((x, y) => (x.p.rank - y.p.rank) || ((x.p.avg == null ? 999 : x.p.avg) - (y.p.avg == null ? 999 : y.p.avg)));
  const need = perf.filter(x => x.p.rank === 0).length;
  const proximos = upcomingReleases(30).length;
  const legalPend = artists.reduce((a, ar) => a + artistLegalPending(ar.id), 0);
  const fin = artists.reduce((acc, ar) => { const f = artistFinance(ar.id); acc.inv += f.inv; acc.ing += f.ing; return acc; }, { inv: 0, ing: 0 });
  const card = (label, val, sub, col) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="${col ? `color:${col}` : ''}">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  const stats = `<div class="dash-kpis" style="margin-bottom:22px">` +
    card('Artistas', artists.length, '') +
    card('Necesitan atención', need, need ? 'priorízalos' : 'todo en orden', need ? 'var(--accent2)' : '') +
    card('Próximos a salir', proximos, '≤ 30 días') +
    card('Legal pendiente', legalPend, legalPend ? 'requiere acción' : 'al día', legalPend ? 'var(--beat)' : '') +
    card('Recoupment', fin.inv ? Math.min(100, Math.round(fin.ing / fin.inv * 100)) + '%' : '—', `inv ${money(fin.inv)} · ing ${money(fin.ing)}`) +
    `</div>`;
  const list = perf.map(({ art, p }) => {
    const col = rankColor(p.rank);
    const launchInfo = p.latest ? `${s(p.latest.name)} · ${(STATUS_MAP[p.latest.status] || {}).tag || p.latest.status}` : 'sin lanzamientos';
    const cierre = p.end ? `${p.end}${p.dleft != null ? ` (${p.dleft >= 0 ? 'en ' + p.dleft + 'd' : Math.abs(p.dleft) + 'd atrás'})` : ''}` : '—';
    const bar = p.avg != null ? `<div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;max-width:180px;margin-top:6px"><div style="height:100%;width:${Math.min(100, p.avg)}%;background:${col}"></div></div>` : '';
    const alerts = artistAlertCount(art.id), legal = artistLegalPending(art.id), next = nextRelease(art.id);
    const chips = [
      alerts ? `<span class="chip" style="cursor:default;color:var(--accent2)">${alerts} alerta${alerts > 1 ? 's' : ''}</span>` : '',
      legal ? `<span class="chip" style="cursor:default;color:var(--beat)">legal: ${legal}</span>` : '',
      next ? `<span class="chip" style="cursor:default">próximo: ${s(next.name)} · ${diasRestantes(next.date) >= 0 ? 'en ' + diasRestantes(next.date) + 'd' : 'hoy'}</span>` : '',
    ].filter(Boolean).join(' ');
    return `<div data-artist-id="${esc(art.id)}" onclick="setActiveArtist(this.dataset.artistId);showPage('lanzamientos')" style="cursor:pointer;border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div class="artist-avatar" style="width:40px;height:40px;font-size:var(--text-md)">${up(art.name).slice(0, 1)}</div>
      <div style="flex:1;min-width:200px">
        <div style="font-size:var(--text-md);font-weight:600;display:flex;align-items:center;gap:8px">${dotHTML(col, 10)} ${esc(art.name)}</div>
        <div style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted);margin-top:2px">${launchInfo} · cierre ${cierre}</div>
        ${chips ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${chips}</div>` : ''}
        ${bar}
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--font-ui);font-weight:var(--fw-num);font-variant-numeric:tabular-nums;font-size:var(--text-2xl);letter-spacing:var(--track-tight);color:${col}">${p.avg != null ? p.avg + '%' : '—'}</div>
        <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${s(p.label)}${p.totalGoals ? ` · ${p.met}/${p.totalGoals} metas` : ''}</div>
      </div>
    </div>`;
  }).join('');
  const heat = `<div class="section-header" style="margin-top:8px"><div class="section-title">Carga semanal del roster</div></div>` + rosterHeatmapHTML();
  return stats + heat + `<div class="section-header" style="margin-top:18px"><div class="section-title">Artistas</div></div>` + list;
}

// ══════════════════════════════════════════
// COMPÁS — centro de mando (rebautiza el Cockpit y absorbe el Label) · toggle Roster/Artista
// ══════════════════════════════════════════
let compasView = 'roster';        // 'roster' | 'artista' — Hoy primero; panorama por artista a un clic
let compasRosterTab = 'riesgo';   // 'riesgo' | 'salud'
let _compasEmbedded = false;
function setCompasView(v) { compasView = v; renderCompas(); }
function setCompasRosterTab(t) { compasRosterTab = t; renderCompas(); }
let compasRiskView = 'tabla';     // 'tabla' | 'tablero' (dirección F, kanban por estado)
function setCompasRiskView(v) { compasRiskView = v; renderCompas(); }
// Devuelve el #page-dashboard a .content cuando salimos de la mira Artista (patrón embebido).
function compasRestore() {
  if (!_compasEmbedded) return;
  const dash = document.getElementById('page-dashboard'); const content = document.querySelector('.content');
  if (dash && content) { dash.classList.remove('active', 'embedded'); dash.style.display = 'none'; content.appendChild(dash); }
  _compasEmbedded = false;
}
function renderCompas() {
  const tb = document.getElementById('compas-toolbar'); const body = document.getElementById('compas-body'); if (!body) return;
  const seg = (active, opts, fn) => `<div class="view-toggle">${opts.map(o => `<button class="${active === o[0] ? 'active' : ''}" onclick="${fn}('${o[0]}')">${o[1]}</button>`).join('')}</div>`;
  if (tb) tb.innerHTML = seg(compasView, [['roster', 'Hoy'], ['artista', 'Panorama del artista']], 'setCompasView')
    + (compasView === 'roster' ? `<div class="cmp-sub" style="margin-left:8px">${seg(compasRosterTab, [['riesgo', 'Riesgo de lanzamientos'], ['salud', 'Salud del roster'], ['plan', 'Plan anual']], 'setCompasRosterTab')}</div>` : '')
    + ((compasView === 'roster' && compasRosterTab === 'riesgo') ? `<div class="cmp-sub" style="margin-left:8px">${seg(compasRiskView, [['tabla', 'Tabla'], ['tablero', 'Tablero']], 'setCompasRiskView')}</div>` : '');
  if (compasView === 'artista') {
    if (!_compasEmbedded) {
      body.innerHTML = '';
      const dash = document.getElementById('page-dashboard');
      if (dash) { dash.classList.add('embedded'); dash.style.display = 'block'; body.appendChild(dash); _compasEmbedded = true; }
    }
    if (typeof renderDashboard === 'function') renderDashboard();
    return;
  }
  compasRestore(); // si veníamos de Artista, devuelve el dashboard a su sitio
  let inner;
  if (compasRosterTab === 'plan' && typeof annualRosterHTML === 'function') inner = annualRosterHTML();
  else if (compasRosterTab === 'salud') inner = rosterHealthHTML();
  else inner = compasRiskView === 'tablero' ? cockpitBoardHTML() : cockpitBodyHTML();
  body.innerHTML = inner;
  if (typeof hydrateIcons === 'function') hydrateIcons(body);
}
