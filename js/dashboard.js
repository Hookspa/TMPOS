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
