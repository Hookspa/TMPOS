// ══════════════════════════════════════════
// FINANZAS — inversión por categoría, plan vs real, recoupment (Sprint 4)
// ══════════════════════════════════════════
const EXPENSE_CATS = [['meta','Meta Ads'],['tiktok','TikTok Ads'],['dsp','Spotify / DSP'],['prod','Producción'],['influencers','Influencers'],['radio','Radio'],['pr','PR'],['playlisting','Playlisting'],['otros','Otros']];
const EXPENSE_METODOS = ['Tarjeta','Transferencia','Efectivo','PayPal','Otro'];
function catLabel(k){ const c = EXPENSE_CATS.find(x => x[0] === k); return c ? c[1] : (k || 'Otros'); }
function expensesByCat(l){ const m = {}; (l.expenses || []).forEach(e => { m[e.categoria] = (m[e.categoria] || 0) + (+e.monto || 0); }); return m; }
function sumExpenses(l){ return (l.expenses || []).reduce((a, e) => a + (+e.monto || 0), 0); }
function financeSummary(l){
  const inversion = sumExpenses(l);
  const ingresos = +((l.recoup && l.recoup.ingresos) || 0);
  const roi = inversion > 0 ? Math.round((ingresos - inversion) / inversion * 100) : null;
  const recoupPct = inversion > 0 ? Math.min(100, Math.round(ingresos / inversion * 100)) : 0;
  const estado = (inversion > 0 && ingresos >= inversion) ? 'recuperado' : (ingresos > 0 ? 'parcial' : 'no_recuperado');
  return { inversion, ingresos, roi, recoupPct, estado };
}
const _signedMoney = n => (n < 0 ? '-' : '') + money(Math.abs(n));

function releaseInversionHTML(l){
  if(!canDo('ver_finanzas') && !canDo('editar_finanzas')) return `<div class="empty-hint">No tienes acceso a las finanzas de este release.</div>`;
  const editable = canDo('editar_finanzas');
  const fs = financeSummary(l), byCat = expensesByCat(l), b = l.budget || {};
  const estadoColor = { no_recuperado:'var(--accent2)', parcial:'var(--beat)', recuperado:'#4ade80' }[fs.estado];
  const card = (label, val, sub, col) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="${col ? `color:${col}` : ''}">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  const planRows = EXPENSE_CATS.map(([k, lbl]) => { const plan = +(b[k] || 0), real = byCat[k] || 0; if (!plan && !real) return ''; const diff = plan - real;
    return `<tr><td style="padding:6px 8px">${lbl}</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${money(plan)}</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${money(real)}</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:${diff < 0 ? 'var(--accent2)' : 'var(--text-muted)'}">${_signedMoney(diff)}</td></tr>`; }).filter(Boolean).join('');
  const gastos = (l.expenses || []).slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map(e => `<div class="panel" style="display:flex;gap:10px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <span class="chip on" style="cursor:default;font-size:10px;text-transform:uppercase;letter-spacing:1px">${s(catLabel(e.categoria))}</span>
      <div style="flex:1;min-width:120px"><div style="font-size:13px;font-weight:600">${money(+e.monto || 0)}${e.proveedor ? ` <span style="color:var(--text-muted);font-size:12px;font-weight:400">· ${s(e.proveedor)}</span>` : ''}</div>
        <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${s(e.fecha) || ''}${e.metodo ? ' · ' + s(e.metodo) : ''}${e.note ? ' · ' + s(e.note) : ''}</div></div>
      ${e.reciboLink ? `<a href="${safeUrl(e.reciboLink)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);font-family:var(--font-mono)">↗ recibo</a>` : ''}
      ${editable ? `<button class="goal-btn reject" title="Quitar" onclick="quitarGasto('${e.id}')">${icon('close',12)}</button>` : ''}
    </div>`).join('');
  const addForm = editable ? `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('plus',18)}</span><span class="ph-title">Registrar gasto</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px">
        <div class="field"><label>Monto</label><input class="input" id="exp-monto" inputmode="decimal" placeholder="0"></div>
        <div class="field"><label>Categoría</label><select class="input" id="exp-cat">${EXPENSE_CATS.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
        <div class="field"><label>Proveedor</label><input class="input" id="exp-prov" placeholder="Meta, agencia…"></div>
        <div class="field"><label>Fecha</label><input class="input" id="exp-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Método</label><select class="input" id="exp-metodo">${EXPENSE_METODOS.map(m => `<option>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Link recibo</label><input class="input" id="exp-recibo" placeholder="https://…"></div>
      </div>
      <div class="field" style="margin-top:8px"><label>Nota</label><input class="input" id="exp-note"></div>
      <button class="btn btn-primary" style="margin-top:10px" onclick="agregarGasto()">Agregar gasto</button></div>` : '';
  return `
    <div class="dashboard-grid" style="margin-bottom:16px">
      ${card('Inversión total', money(fs.inversion), `${(l.expenses || []).length} gasto(s)`)}
      ${card('Ingresos', money(fs.ingresos), '')}
      ${card('Recoupment', fs.recoupPct + '%', fs.estado.replace('_', ' '), estadoColor)}
      ${card('ROI', fs.roi == null ? '—' : fs.roi + '%', fs.roi == null ? 'sin inversión' : '', fs.roi == null ? '' : (fs.roi >= 0 ? '#4ade80' : 'var(--accent2)'))}
    </div>
    <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('finance',18)}</span><span class="ph-title">Recoupment</span><span class="ph-sub">ingresos vs inversión</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${fs.recoupPct}%;background:${estadoColor}"></div></div>
      ${editable ? `<div class="field" style="margin-top:12px;max-width:240px"><label>Ingresos acumulados (US$)</label><input class="input" value="${fs.ingresos || ''}" inputmode="decimal" placeholder="0" onchange="setRecoupIngresos(this.value)"></div>` : ''}
    </div>
    <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('chart',18)}</span><span class="ph-title">Plan vs. gasto real</span><span class="ph-sub">por categoría</span></div>
      <table style="width:100%;border-collapse:collapse"><thead><tr style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);text-transform:uppercase">
        <th style="text-align:left;padding:6px 8px">Categoría</th><th style="text-align:right;padding:6px 8px">Plan</th><th style="text-align:right;padding:6px 8px">Real</th><th style="text-align:right;padding:6px 8px">Dif.</th></tr></thead>
        <tbody>${planRows || '<tr><td colspan="4" style="padding:10px;color:var(--text-dim)">Sin presupuesto ni gastos aún.</td></tr>'}</tbody></table>
    </div>
    ${gastos ? `<div class="panel-head" style="margin:4px 0 8px"><span class="ph-icon">${icon('receipt',18)}</span><span class="ph-title">Gastos (${(l.expenses || []).length})</span></div>${gastos}` : ''}
    ${addForm}`;
}
function agregarGasto(){
  if(!requireCan('editar_finanzas')) return;
  const l = launches.find(x => x.id === currentLaunchId); if(!l) return;
  const monto = parseFloat(document.getElementById('exp-monto').value);
  if(!monto){ uiAlert('Pon el monto del gasto.'); return; }
  l.expenses = l.expenses || [];
  l.expenses.push({ id:'ex-'+Date.now(), monto, categoria:document.getElementById('exp-cat').value, proveedor:(document.getElementById('exp-prov').value||'').trim(), fecha:document.getElementById('exp-fecha').value, metodo:document.getElementById('exp-metodo').value, reciboLink:(document.getElementById('exp-recibo').value||'').trim(), note:(document.getElementById('exp-note').value||'').trim() });
  saveLaunches(); renderReleaseTab('inversion'); uiToast('✓ Gasto registrado');
}
function quitarGasto(id){ if(!requireCan('editar_finanzas')) return; const l = launches.find(x => x.id === currentLaunchId); if(!l) return; l.expenses = (l.expenses||[]).filter(e => e.id !== id); saveLaunches(); renderReleaseTab('inversion'); }
function setRecoupIngresos(val){ if(!requireCan('editar_finanzas')) return; const l = launches.find(x => x.id === currentLaunchId); if(!l) return; l.recoup = l.recoup || {}; l.recoup.ingresos = parseFloat(val) || 0; saveLaunches(); renderReleaseTab('inversion'); }

// ══════════════════════════════════════════
// B3 — Captura de dato propietario (snapshot del rollup operativo AL CIERRE)
// Versión "ahora" (barata): se calcula en el cliente y se guarda local + 1 upsert best-effort.
// NO es el pipeline k-anon cross-tenant (diferido a ≥3 releases). Grano = artista-proyecto.
// Anclado en B3 spec §2 (cycle del log activity, gates de approvals, lead/espaciado, finanzas, resultado d1/7/28).
// ══════════════════════════════════════════
const B3_DEPTS = ['audio', 'legal', 'marketing', 'creativo', 'distrib', 'admin'];
function _b3Median(a) { if (!a || !a.length) return null; const x = a.slice().sort((p, q) => p - q); const m = Math.floor(x.length / 2); return x.length % 2 ? x[m] : Math.round((x[m - 1] + x[m]) / 2); }
function _b3Pct(a, p) { if (!a || !a.length) return null; const x = a.slice().sort((q, r) => q - r); return x[Math.min(x.length - 1, Math.floor(p / 100 * x.length))]; }
function _b3Days(aIso, bIso) { const a = Date.parse(aIso), b = Date.parse(bIso); if (isNaN(a) || isNaN(b)) return null; return Math.round((b - a) / 864e5); }
// Cuándo se completó una tarea = último activity status_changed→completado (NO updatedAt; B3 §2.1).
function _b3TaskCompletedAt(taskId) {
  let best = null;
  (typeof activity !== 'undefined' ? activity : []).forEach(a => {
    if (a.taskId === taskId && a.verb === 'status_changed' && (/completad/i.test(a.summary) || (a.meta && a.meta.estado === TASK_DONE))) {
      if (!best || a.createdAt > best) best = a.createdAt;
    }
  });
  return best;
}
// Resultado en ventanas d1/d7/d28 desde metricEntries (streams), con tolerancia (B3 §2.7).
function _b3ResultWindows(l) {
  const out = { d1: null, d7: null, d28: null };
  if (!l.date) return out;
  const drop = Date.parse(l.date + 'T00:00:00'); if (isNaN(drop)) return out;
  const entries = (l.metricEntries || []).filter(e => e && e.date && /stream/i.test(e.metric || ''));
  [['d1', 1, 1], ['d7', 7, 3], ['d28', 28, 7]].forEach(([k, w, tol]) => {
    const target = drop + w * 864e5; let best = null, bestDiff = Infinity;
    entries.forEach(e => { const t = Date.parse(e.date + 'T00:00:00'); if (isNaN(t)) return; const diff = Math.abs(t - target) / 864e5; if (diff <= tol && diff < bestDiff) { best = +e.value || 0; bestDiff = diff; } });
    if (best != null) out[k] = { streams: best };
  });
  return out;
}
function buildReleaseSnapshot(l) {
  const art = (typeof artists !== 'undefined' ? artists.find(a => a.id === l.artistId) : null) || {};
  const rtasks = (typeof tasks !== 'undefined') ? tasks.filter(t => t.releaseId === l.id) : [];
  const byDept = {}; B3_DEPTS.forEach(d => byDept[d] = 0);
  rtasks.forEach(t => { const d = B3_DEPTS.includes(t.departamento) ? t.departamento : 'admin'; byDept[d]++; });
  // cycle time (tareas completadas)
  const cyc = [], cycByDept = {}; B3_DEPTS.forEach(d => cycByDept[d] = []); let estimadas = 0;
  rtasks.forEach(t => {
    if (t.estado !== TASK_DONE) return;
    let completed = _b3TaskCompletedAt(t.id); if (!completed) { completed = t.updatedAt; estimadas++; }
    const cd = _b3Days(t.createdAt, completed);
    if (cd != null && cd >= 0) { cyc.push(cd); cycByDept[B3_DEPTS.includes(t.departamento) ? t.departamento : 'admin'].push(cd); }
  });
  const cycDeptMed = {}; B3_DEPTS.forEach(d => cycDeptMed[d] = _b3Median(cycByDept[d]));
  // lead time = primera tarea creada → drop
  let firstCreated = null; rtasks.forEach(t => { if (!firstCreated || t.createdAt < firstCreated) firstCreated = t.createdAt; });
  const lead = (firstCreated && l.date) ? _b3Days(firstCreated, l.date + 'T00:00:00') : null;
  // latencia de gates (9 aprobaciones)
  const rappr = (typeof approvals !== 'undefined') ? approvals.filter(a => a.releaseId === l.id) : [];
  const gateLat = {};
  (typeof APPROVAL_GATES !== 'undefined' ? APPROVAL_GATES : []).forEach(([g]) => {
    const ds = rappr.filter(a => a.gate === g && a.decidedAt).map(a => _b3Days(a.createdAt, a.decidedAt)).filter(x => x != null && x >= 0);
    if (ds.length) gateLat[g] = _b3Median(ds);
  });
  // espaciado de contenido
  const fechas = (l.cal || []).map(c => c.fecha).filter(Boolean).sort();
  const gaps = []; for (let i = 1; i < fechas.length; i++) { const d = _b3Days(fechas[i - 1] + 'T00:00:00', fechas[i] + 'T00:00:00'); if (d != null) gaps.push(d); }
  const fin = (typeof financeSummary === 'function') ? financeSummary(l) : { inversion: 0, ingresos: 0, roi: null, recoupPct: 0, estado: 'no_recuperado' };
  const res = _b3ResultWindows(l);
  // etapa de carrera (proxy: nº de releases previos del artista)
  const prev = (typeof launches !== 'undefined') ? launches.filter(x => x.artistId === l.artistId && x.type !== 'evergreen' && (x.createdAt || 0) < (l.createdAt || Date.now())).length : 0;
  const etapa = prev <= 1 ? 'emergente' : (prev <= 4 ? 'en_desarrollo' : 'establecido');
  const snap = {
    releaseId: l.id, releaseName: l.name, capturedAt: new Date().toISOString(), drop_date: l.date || null,
    genero: s(art.genre) || '', tipo_release: l.type || 'single', etapa_carrera: etapa,
    n_tareas_total: rtasks.length, n_tareas_por_depto: byDept,
    cycle_days_mediana: _b3Median(cyc), cycle_days_p90: _b3Pct(cyc, 90), cycle_days_por_depto: cycDeptMed, cycle_estimadas: estimadas,
    lead_time_dias: lead, gate_latency_dias: gateLat, espaciado_mediano_dias: _b3Median(gaps), readiness_final_pct: (typeof releaseReady === 'function') ? releaseReady(l).pct : null,
    inversion: fin.inversion, ingresos: fin.ingresos, roi: fin.roi, recoup_pct: fin.recoupPct, recoup_estado: fin.estado,
    resultado_d1: res.d1, resultado_d7: res.d7, resultado_d28: res.d28,
  };
  // completitud = campos clave no-nulos / esperados (filas parciales son válidas, B3 §6.3)
  const keys = [snap.genero, snap.n_tareas_total, snap.cycle_days_mediana, snap.lead_time_dias, snap.espaciado_mediano_dias, snap.readiness_final_pct, snap.inversion, snap.roi, snap.resultado_d7];
  snap.completitud = Math.round(keys.filter(x => x != null && x !== '').length / keys.length * 100);
  return snap;
}
function loadReleaseSnapshots() { try { return JSON.parse(localStorage.getItem('ao_release_snapshots')) || []; } catch (e) { return []; } }
function releaseSnapshot(id) { return loadReleaseSnapshots().find(x => x.releaseId === id) || null; }
function captureReleaseSnapshot(id, opts) {
  const l = (typeof launches !== 'undefined') ? launches.find(x => x.id === id) : null; if (!l) return null;
  const snap = buildReleaseSnapshot(l);
  const arr = loadReleaseSnapshots(); const i = arr.findIndex(x => x.releaseId === id);
  if (i >= 0) arr[i] = snap; else arr.push(snap);          // idempotente por releaseId
  try { localStorage.setItem('ao_release_snapshots', JSON.stringify(arr)); } catch (e) {}
  _snapshotCloudUpsert(snap);                                // best-effort 1 upsert (tabla del propio equipo)
  if (!(opts && opts.silent) && typeof uiToast === 'function') uiToast('✓ Snapshot de cierre capturado');
  if (typeof renderReleaseTab === 'function' && (typeof currentLaunchId !== 'undefined') && currentLaunchId === id) renderReleaseTab('resumen');
  return snap;
}
async function _snapshotCloudUpsert(snap) {
  if (typeof getSb !== 'function' || typeof authed !== 'function' || !authed()) return;
  try {
    const sb = await getSb(); if (!sb) return;
    await sb.from('release_snapshots').upsert([{ release_id: snap.releaseId, team_id: (typeof _teamId !== 'undefined' ? _teamId : null), genero: snap.genero, tipo_release: snap.tipo_release, etapa_carrera: snap.etapa_carrera, completitud: snap.completitud, data: snap, captured_at: snap.capturedAt }]);
  } catch (e) { /* tabla aún no creada → no-op (degrada limpio) */ }
}
// Panel en el Resumen del release: muestra el snapshot capturado + botón para capturar/actualizar.
function snapshotPanelHTML(l) {
  if (!l) return '';
  const snap = releaseSnapshot(l.id);
  const canCap = (typeof canDo !== 'function') || canDo('edit_launch');
  const btn = canCap ? `<button class="btn btn-ghost" style="margin-left:auto;padding:4px 10px;font-size:11px" onclick="captureReleaseSnapshot('${l.id}')">${icon('save', 12)} ${snap ? 'Actualizar' : 'Capturar'} snapshot</button>` : '';
  const head = `<div class="panel-head"><span class="ph-icon">${icon('chart', 18)}</span><span class="ph-title">Snapshot de cierre</span><span class="ph-sub">dato operativo del lanzamiento</span>${btn}</div>`;
  if (!snap) return `<div class="panel">${head}<div class="empty-hint">Aún sin snapshot. Se captura solo al cerrar el release, o con el botón. Mide cómo se corrió: tareas, cycle-time, latencia de gates, lead time, espaciado, inversión/ROI y resultado.</div></div>`;
  const stat = (lbl, val) => `<div class="stat-card"><div class="stat-label">${lbl}</div><div class="stat-value" style="font-size:22px">${val == null ? '—' : val}</div></div>`;
  const gates = Object.keys(snap.gate_latency_dias || {}).length;
  const r7 = snap.resultado_d7 && snap.resultado_d7.streams != null ? (snap.resultado_d7.streams.toLocaleString('es') + ' streams') : '—';
  const grid = `<div class="dash-kpis" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:10px">
    ${stat('Tareas', snap.n_tareas_total)}
    ${stat('Cycle mediana', snap.cycle_days_mediana == null ? '—' : snap.cycle_days_mediana + 'd')}
    ${stat('Lead time', snap.lead_time_dias == null ? '—' : snap.lead_time_dias + 'd')}
    ${stat('Espaciado', snap.espaciado_mediano_dias == null ? '—' : snap.espaciado_mediano_dias + 'd')}
    ${stat('Readiness', snap.readiness_final_pct == null ? '—' : snap.readiness_final_pct + '%')}
    ${stat('Inversión', money(snap.inversion || 0))}
    ${stat('ROI', snap.roi == null ? '—' : snap.roi + '%')}
    ${stat('Gates medidos', gates)}
  </div>`;
  const meta = `<div style="font-size:10px;font-family:var(--font-mono);color:var(--text-dim)">${snap.genero || 's/género'} · ${snap.tipo_release} · ${snap.etapa_carrera} · resultado d7: ${r7} · completitud ${snap.completitud}% · capturado ${new Date(snap.capturedAt).toLocaleString('es')}${snap.cycle_estimadas ? ' · ' + snap.cycle_estimadas + ' cycle estimado(s)' : ''}</div>`;
  return `<div class="panel">${head}${grid}${meta}</div>`;
}
