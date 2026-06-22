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
