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
function rankColor(rank){ return rank === 0 ? 'var(--accent2)' : rank === 1 ? 'var(--beat)' : rank === 3 ? '#4ade80' : 'var(--text-dim)'; }

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
function rosterLoadColor(n){ return n >= 3 ? 'var(--accent2)' : n === 2 ? 'var(--beat)' : n === 1 ? '#4ade80' : 'var(--surface2)'; }
function renderRosterHeatmap(){
  const host = document.getElementById('label-roster'); if (!host) return;
  const N = 10, weeks = rosterWeeks(N);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmt = d => `${d.getDate()} ${months[d.getMonth()]}`;
  const overloaded = weeks.filter(w => w.releases.length >= 3).length;
  // Tira tipo heatmap: una celda por semana, coloreada por carga.
  const cells = weeks.map(w => { const n = w.releases.length; const col = rosterLoadColor(n);
    return `<div title="${fmt(w.start)}–${fmt(w.end)} · ${n} release${n!==1?'s':''}" style="flex:1;min-width:52px;border-radius:8px;border:1px solid var(--border);background:${col};${n>=2?'color:#1a1a1a':'color:var(--text-muted)'};padding:8px 6px;text-align:center">
      <div style="font-size:9px;font-family:var(--font-mono);opacity:.85">${fmt(w.start)}</div>
      <div style="font-family:var(--font-display);font-size:20px;line-height:1.15">${n}</div>
    </div>`; }).join('');
  // Detalle: semanas con releases, con chips clicables y aviso de sobrecarga.
  const detail = weeks.filter(w => w.releases.length).map(w => { const n = w.releases.length; const col = rosterLoadColor(n);
    const chips = w.releases.map(r => { const art = (typeof artists !== 'undefined') ? artists.find(a => a.id === r.artistId) : null;
      return `<span class="chip" style="cursor:pointer" onclick="openLaunch('${r.id}')">${art ? esc(art.name) + ' · ' : ''}${esc(r.name)}</span>`; }).join(' ');
    const warn = n >= 3 ? `<span style="color:var(--accent2);font-size:11px;font-family:var(--font-mono)">sobrecargada · máx 2–3</span>`
              : (n === 2 ? `<span style="color:var(--beat);font-size:11px;font-family:var(--font-mono)">al límite</span>` : '');
    return `<div style="border:1px solid var(--border);border-left:3px solid ${col};border-radius:10px;padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:${chips?'6px':'0'};flex-wrap:wrap"><span style="font-size:13px;font-weight:600">${fmt(w.start)} – ${fmt(w.end)}</span><span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">${n} release${n!==1?'s':''}</span>${warn}</div>
      ${chips ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${chips}</div>` : ''}
    </div>`; }).join('') || `<div class="empty-hint">No hay releases con fecha en las próximas ${N} semanas.</div>`;
  const banner = overloaded ? `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:8px 12px;border-radius:8px;background:rgba(255,77,77,.08);margin-bottom:14px"><span class="dot dot--red"></span><span>${overloaded} semana${overloaded>1?'s':''} con 3+ releases — riesgo de auto-canibalización y carga del equipo.</span></div>` : '';
  host.innerHTML = banner + `<div style="display:flex;gap:6px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">${cells}</div>` + detail;
}
