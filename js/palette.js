// ══════════════════════════════════════════
// COMMAND PALETTE (Cmd/Ctrl-K) — salto rápido a artista, lanzamiento, sección o
// referencia del banco. Una sola caja para navegar sin cazar en el menú (útil con
// múltiples artistas y ~6k referencias). HANDOFF #4.
// ══════════════════════════════════════════
let _cmdkItems = [];
let _cmdkSel = 0;
let _cmdkOpen = false;

function cmdkEnsureDOM() {
  if (document.getElementById('cmdk')) return;
  const o = document.createElement('dialog');
  o.className = 'cmdk-overlay';
  o.id = 'cmdk';
  o.setAttribute('aria-label', 'Buscar');
  o.innerHTML =
    '<div class="cmdk-panel">' +
      '<input class="cmdk-input" id="cmdk-input" autocomplete="off" spellcheck="false" placeholder="Buscar artista, lanzamiento, sección…">' +
      '<div class="cmdk-results" id="cmdk-results"></div>' +
      '<div class="cmdk-hint"><span>&uarr;&darr; moverse</span><span>&crarr; abrir</span><span>esc cerrar</span></div>' +
    '</div>';
  document.body.appendChild(o);
  o.addEventListener('click', e => { if (e.target === o) cmdkClose(); });
  const inp = document.getElementById('cmdk-input');
  inp.addEventListener('input', () => cmdkRender(inp.value));
  inp.addEventListener('keydown', cmdkKeydown);
}

function cmdkBaseIndex() {
  const items = [];
  const sections = [
    ['compas', 'Dashboard', 'dashboard'], ['lanzamientos', 'Lanzamientos', 'releases'],
    ['tareas', 'Tareas', 'checklist'], ['campanias', 'Campañas activas', 'megaphone'],
    ['perfil', 'Perfil del Artista', 'artist'], ['adn', 'ADN Artístico', 'dna'],
    ['banco', 'Banco de Referencias', 'references']
  ];
  sections.forEach(([id, label, ic]) => items.push({ type: 'Sección', label, sub: '', icon: ic, run: () => showPage(id) }));
  const arts = (typeof artists !== 'undefined' && Array.isArray(artists)) ? artists : [];
  arts.forEach(a => items.push({ type: 'Artista', label: a.name || 'Artista', sub: a.genre || '', icon: 'artist', run: () => { setActiveArtist(a.id); showPage('compas'); } }));
  const lns = (typeof launches !== 'undefined' && Array.isArray(launches)) ? launches : [];
  lns.filter(l => l.type !== 'evergreen').forEach(l => {
    const a = arts.find(x => x.id === l.artistId);
    items.push({ type: 'Lanzamiento', label: l.name || 'Lanzamiento', sub: a ? a.name : '', icon: 'releases', run: () => { if (typeof openLaunch === 'function') openLaunch(l.id); } });
  });
  return items;
}

// Referencias del banco: no se precargan (son miles); se buscan solo al escribir ≥2 chars.
function cmdkRefMatches(q) {
  if (q.length < 2) return [];
  const refs = (typeof referencias !== 'undefined' && Array.isArray(referencias)) ? referencias : [];
  const out = [];
  for (let i = 0; i < refs.length && out.length < 8; i++) {
    const r = refs[i];
    const hay = ((r.titulo || '') + ' ' + (r.hook || '')).toLowerCase();
    if (hay.indexOf(q) >= 0) {
      out.push({ type: 'Referencia', label: r.titulo || r.hook || 'Referencia', sub: (r.cat || (r.cats && r.cats[0]) || ''), icon: 'references', run: () => showPage('banco') });
    }
  }
  return out;
}

function cmdkRender(q) {
  q = (q || '').trim().toLowerCase();
  let list = _cmdkItems;
  if (q) {
    list = _cmdkItems.filter(it => (it.label + ' ' + (it.sub || '') + ' ' + it.type).toLowerCase().indexOf(q) >= 0);
    list = list.concat(cmdkRefMatches(q));
  }
  list = list.slice(0, 40);
  _cmdkVisible = list;
  if (_cmdkSel >= list.length) _cmdkSel = Math.max(0, list.length - 1);
  const host = document.getElementById('cmdk-results');
  if (!list.length) { host.innerHTML = '<div class="cmdk-empty">Sin resultados</div>'; return; }
  host.innerHTML = list.map((it, i) =>
    `<button type="button" class="cmdk-item${i === _cmdkSel ? ' sel' : ''}" data-i="${i}" onmousemove="cmdkHover(${i})" onclick="cmdkRun(${i})">` +
      `<span class="cmdk-ic">${(typeof icon === 'function') ? icon(it.icon, 16) : ''}</span>` +
      `<span class="cmdk-label">${esc(it.label)}${it.sub ? ` <span class="cmdk-sub">${esc(it.sub)}</span>` : ''}</span>` +
      `<span class="cmdk-type">${esc(it.type)}</span>` +
    `</button>`
  ).join('');
}
let _cmdkVisible = [];

function cmdkHover(i) { if (i === _cmdkSel) return; _cmdkSel = i; cmdkSyncSel(); }
function cmdkSyncSel() {
  const host = document.getElementById('cmdk-results'); if (!host) return;
  [...host.children].forEach((el, i) => el.classList.toggle('sel', i === _cmdkSel));
  const sel = host.children[_cmdkSel]; if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
}
function cmdkRun(i) {
  const it = _cmdkVisible[i != null ? i : _cmdkSel];
  if (!it) return;
  cmdkClose();
  try { it.run(); } catch (e) { console.warn('cmdk run error', e); }
}
function cmdkKeydown(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdkSel = Math.min(_cmdkVisible.length - 1, _cmdkSel + 1); cmdkSyncSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdkSel = Math.max(0, _cmdkSel - 1); cmdkSyncSel(); }
  else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(); }
  else if (e.key === 'Escape') { e.preventDefault(); cmdkClose(); }
}
function cmdkOpen() {
  cmdkEnsureDOM();
  _cmdkItems = cmdkBaseIndex();
  _cmdkSel = 0;
  _cmdkOpen = true;
  const o = document.getElementById('cmdk');
  if (typeof tempoDialogOpen === 'function') tempoDialogOpen(o); else o.showModal();
  const inp = document.getElementById('cmdk-input');
  inp.value = '';
  cmdkRender('');
  setTimeout(() => inp.focus(), 0);
}
function cmdkClose() {
  _cmdkOpen = false;
  const o = document.getElementById('cmdk');
  if (o) { if (typeof tempoDialogClose === 'function') tempoDialogClose(o); else if (o.open) o.close(); }
}
function cmdkToggle() { _cmdkOpen ? cmdkClose() : cmdkOpen(); }

document.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); cmdkToggle(); }
  else if (e.key === 'Escape') { const m = document.getElementById('modal-ayuda'); if (m && m.classList.contains('open')) { e.preventDefault(); m.classList.remove('open'); } }
});

// ══════════════════════════════════════════
// AYUDA (modal) — guía de módulos, primeros pasos y atajos de teclado
// ══════════════════════════════════════════
function cmdkModLabel() { return /Mac|iPhone|iPad|iPod/.test((navigator.platform || '') + ' ' + (navigator.userAgent || '')) ? '⌘' : 'Ctrl '; }
function cmdkKeyLabel() { return cmdkModLabel() + 'K'; }
function ayudaHTML() {
  const k = cmdkKeyLabel();
  const steps = [
    ['Crea tu lanzamiento', 'Con "+ Nuevo Lanzamiento". Single, EP o álbum — todo cuelga de aquí.'],
    ['Pega la letra de la canción', 'En Lanzamientos → Generar ideas. La letra alimenta el ADN de campaña, las ideas y el pitch.'],
    ['Genera el contenido del lanzamiento', 'Caption, guion y hashtags por pieza, desde el ADN del artista y de la campaña.'],
    ['Arma tu Plan de Medios y Objetivos', 'Plataformas y montos en el Plan de Medios; metas SMART en Objetivos.'],
    ['Sigue todo desde el Dashboard', 'Riesgo de lanzamientos, tareas y la franja ON AIR con el próximo lanzamiento.'],
  ];
  const mods = [
    ['dashboard', 'Dashboard', 'Roster: riesgo de lanzamientos + salud, y el zoom por artista.'],
    ['releases', 'Lanzamientos', 'Cada lanzamiento y su ficha: estado, música, campaña, plan de medios y tareas.'],
    ['checklist', 'Tareas', 'To-dos del equipo con vistas: lista, kanban, calendario, Gantt…'],
    ['megaphone', 'Campañas activas', 'Las campañas en curso del workspace, de un vistazo.'],
    ['artist', 'Perfil & ADN Artístico', 'Identidad, bio y el ADN del artista (wizard con IA).'],
    ['references', 'Banco de Referencias', 'Miles de ideas de contenido; marca con ★ las de tu lanzamiento.'],
    ['ai', 'Generadores con IA', 'ADN de campaña desde la letra, ideas, contenido por pieza, pitch, objetivos y estrategia.'],
    ['search', 'Buscar (' + k + ')', 'Salta a cualquier artista, lanzamiento, sección o referencia.'],
  ];
  const shortcuts = [
    [[k], 'Abrir la búsqueda / paleta de comandos'],
    [['↑', '↓'], 'Moverte por los resultados'],
    [['↵'], 'Abrir el resultado seleccionado'],
    [['Esc'], 'Cerrar la búsqueda o cualquier ventana'],
  ];
  return `
    <div class="help-sec">
      <div class="help-sec-title">Primeros pasos</div>
      ${steps.map((st, i) => `<div class="help-step"><span class="hs-n">${i + 1}</span><div class="hs-body"><div class="hs-t">${st[0]}</div><div class="hs-d">${st[1]}</div></div></div>`).join('')}
    </div>
    <div class="help-sec">
      <div class="help-sec-title">Módulos y herramientas</div>
      ${mods.map(m => `<div class="help-mod"><span class="hm-ic">${(typeof icon === 'function') ? icon(m[0], 16) : ''}</span><div style="flex:1;min-width:0"><div class="hm-t">${m[1]}</div><div class="hm-d">${m[2]}</div></div></div>`).join('')}
    </div>
    <div class="help-sec">
      <div class="help-sec-title">Atajos de teclado</div>
      ${shortcuts.map(sc => `<div class="help-kbd-row"><span>${sc[1]}</span><span class="hk-keys">${sc[0].map(key => `<span class="kbd">${key}</span>`).join('')}</span></div>`).join('')}
    </div>`;
}
function abrirAyuda() {
  const body = document.getElementById('ayuda-body'); if (body) body.innerHTML = ayudaHTML();
  const m = document.getElementById('modal-ayuda'); if (m) m.classList.add('open');
}
function cerrarAyuda(e) {
  if (e && e.target && e.target.id !== 'modal-ayuda') return;
  const m = document.getElementById('modal-ayuda'); if (m) m.classList.remove('open');
}
// Etiqueta de tecla en la caja de búsqueda de la barra (⌘K / Ctrl K según plataforma).
(function () {
  function setKbd() { const el = document.getElementById('ts-kbd'); if (el) el.textContent = cmdkKeyLabel(); }
  if (document.readyState !== 'loading') setKbd(); else document.addEventListener('DOMContentLoaded', setKbd);
})();
