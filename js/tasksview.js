// ══════════════════════════════════════════
// TAREAS — vista global (Sprint 7) · inbox "Mis tareas" + 5 vistas + "Qué falta"
// Lee de la tabla relacional `tasks` (js/collab.js). Mobile-first.
// ══════════════════════════════════════════

let _tv = { view: 'list', mine: true, q: '', estado: '', priority: '', depto: '', artistId: '', tag: '', groupBy: 'none', sortBy: 'due', calMonth: null };

// ── Colores / etiquetas ──
const TASK_ESTADO_COLOR = {
  backlog: 'var(--text-dim)', pendiente: '#7d8a99', en_progreso: 'var(--accent)', en_revision: 'var(--beat)',
  aprobado: '#4ade80', bloqueado: 'var(--accent2)', completado: '#4ade80', atrasado: 'var(--accent2)',
};
const TASK_PRI_COLOR = { baja: 'var(--text-dim)', media: 'var(--text-muted)', alta: 'var(--beat)', urgente: 'var(--accent)', critica: 'var(--accent2)' };
function _estLabel(e) { const x = TASK_ESTADOS.find(s2 => s2[0] === e); return x ? x[1] : e; }
function _priLabel(p) { const x = TASK_PRIORITIES.find(s2 => s2[0] === p); return x ? x[1] : p; }
function estadoChip(e) { const c = TASK_ESTADO_COLOR[e] || 'var(--text-dim)'; return `<span class="tk-chip" style="background:${c}1f;color:${c}"><span class="dot" style="width:7px;height:7px;background:${c}"></span>${_estLabel(e)}</span>`; }
function priChip(p) { const c = TASK_PRI_COLOR[p] || 'var(--text-dim)'; return `<span class="tk-pri" style="color:${c}"><span class="pdot" style="background:${c}"></span>${_priLabel(p)}</span>`; }

function _relNameOf(t) {
  const l = (typeof launches !== 'undefined') ? launches.find(x => x.id === t.releaseId) : null;
  let n = l ? s(l.name) : '—';
  if (t.trackId && typeof tracks !== 'undefined') { const tr = tracks.find(x => x.id === t.trackId); if (tr && tr.title) n += ' · ' + s(tr.title); }
  return n;
}
function _artNameOf(t) { const a = (typeof artists !== 'undefined') ? artists.find(x => x.id === t.artistId) : null; return a ? s(a.name) : ''; }
function _dueInfo(t) {
  if (!t.dueDate) return { label: '', cls: '' };
  const dr = (typeof diasRestantes === 'function') ? diasRestantes(t.dueDate) : null;
  const done = t.estado === TASK_DONE || t.estado === 'aprobado';
  let cls = '', label;
  if (dr === 0) { cls = done ? '' : 'today'; label = 'HOY'; }
  // Staleness escalates independently of priority: mild rust under 30d late, stronger red past that —
  // never reuses the priority palette (TASK_PRI_COLOR) so the two signals stay readable apart.
  else if (dr < 0) { cls = done ? '' : (dr < -30 ? 'over-long' : 'over'); label = Math.abs(dr) + 'd atrás'; }
  else label = 'en ' + dr + 'd';
  return { label, cls };
}
function _meMatch(t) { const me = _meId(), email = _meEmail(); return t.responsable === me || (email && t.responsable === email); }

// ── Navegar al contexto de la tarea (release / track + pestaña Tareas) ──
function openTaskContext(id) {
  const t = taskById(id); if (!t) return;
  if (t.artistId && typeof currentArtistId !== 'undefined' && currentArtistId !== t.artistId) {
    try { if (typeof setActiveArtist === 'function') setActiveArtist(t.artistId); else currentArtistId = t.artistId; } catch (e) { currentArtistId = t.artistId; }
  }
  if (!t.releaseId) return;
  if (typeof openLaunch === 'function') openLaunch(t.releaseId);
  setTimeout(() => {
    if (t.trackId && typeof openTrack === 'function') { openTrack(t.trackId); if (typeof setTrackTab === 'function') setTrackTab('tareas'); }
    else if (typeof setReleaseTab === 'function') setReleaseTab('tareas');
  }, 60);
}

// ── Filtrado ──
function tvFilteredTasks() {
  let list = tasks.slice();
  if (_tv.mine) list = list.filter(_meMatch);
  if (_tv.estado) list = list.filter(t => t.estado === _tv.estado);
  if (_tv.priority) list = list.filter(t => t.priority === _tv.priority);
  if (_tv.depto) list = list.filter(t => t.departamento === _tv.depto);
  if (_tv.artistId) list = list.filter(t => t.artistId === _tv.artistId);
  if (_tv.tag) list = list.filter(t => (Array.isArray(t.etiquetas) ? t.etiquetas : []).includes(_tv.tag));
  if (_tv.q) { const q = _tv.q.toLowerCase(); list = list.filter(t => (t.titulo || '').toLowerCase().includes(q) || (t.responsable || '').toLowerCase().includes(q) || _relNameOf(t).toLowerCase().includes(q)); }
  return list;
}
const _PRI_ORDER = { critica: 0, urgente: 1, alta: 2, media: 3, baja: 4 };
function _sortTasks(list) {
  const by = _tv.sortBy || 'due';
  return list.slice().sort((a, b) => {
    if (by === 'priority') { const d = (_PRI_ORDER[a.priority] ?? 9) - (_PRI_ORDER[b.priority] ?? 9); if (d) return d; }
    else if (by === 'created') { const ac = a.createdAt || '', bc = b.createdAt || ''; if (ac !== bc) return ac < bc ? 1 : -1; } // más nuevas primero
    else if (by === 'titulo') { const at = (a.titulo || '').toLowerCase(), bt = (b.titulo || '').toLowerCase(); if (at !== bt) return at < bt ? -1 : 1; }
    // default / desempate: fecha y luego prioridad
    const ad = a.dueDate || '9999', bd = b.dueDate || '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (_PRI_ORDER[a.priority] ?? 9) - (_PRI_ORDER[b.priority] ?? 9);
  });
}
// ── Agrupación configurable (vista Lista) ──
const _GROUP_LABELS = { none: 'Ninguno', estado: 'Estado', responsable: 'Responsable', priority: 'Prioridad', depto: 'Departamento', artistId: 'Artista' };
const _SORT_LABELS = { due: 'Fecha', priority: 'Prioridad', created: 'Creación', titulo: 'Nombre' };
function _groupKey(t, gb) {
  if (gb === 'estado') return t.estado || 'pendiente';
  if (gb === 'responsable') return t.responsable || '(sin asignar)';
  if (gb === 'priority') return t.priority || 'media';
  if (gb === 'depto') return t.departamento || '(sin área)';
  if (gb === 'artistId') return t.artistId || '(sin artista)';
  return '';
}
function _groupLabel(gb, k) {
  if (gb === 'estado') return estadoChip(k);
  if (gb === 'priority') return priChip(k);
  if (gb === 'depto') { const x = TASK_DEPTS.find(d => d[0] === k); return `${icon('tag', 12)} ${x ? x[1] : (k || '(sin área)')}`; }
  if (gb === 'artistId') { const a = (typeof artists !== 'undefined') ? artists.find(x => x.id === k) : null; return `${icon('person', 12)} ${a ? s(a.name) : (k || '(sin artista)')}`; }
  if (gb === 'responsable') return `${icon('person', 12)} ${(k === '(sin asignar)') ? k : ((typeof _memberLabel === 'function') ? _memberLabel(k) : k)}`;
  return s(k);
}
function _groupSorter(gb) {
  if (gb === 'estado') { const ord = {}; TASK_ESTADOS.forEach((x, i) => ord[x[0]] = i); return (a, b) => (ord[a] ?? 99) - (ord[b] ?? 99); }
  if (gb === 'priority') { return (a, b) => (_PRI_ORDER[a] ?? 9) - (_PRI_ORDER[b] ?? 9); }
  return (a, b) => a < b ? -1 : 1;
}

// ── Vistas guardadas (localStorage por equipo) ──
function _savedViewsKey() { return 'ao_task_views_' + ((typeof _teamId !== 'undefined' && _teamId) ? _teamId : 'local'); }
function getSavedViews() { try { return JSON.parse(localStorage.getItem(_savedViewsKey())) || []; } catch (e) { return []; } }
function setSavedViews(a) { try { localStorage.setItem(_savedViewsKey(), JSON.stringify(a)); } catch (e) {} }
async function tvSaveView() {
  const name = (await uiPrompt('Nombre de la vista:', { title: 'Guardar vista' }) || '').trim(); if (!name) return;
  const v = getSavedViews().filter(x => x.name !== name);
  v.push({ name, cfg: { view: _tv.view, mine: _tv.mine, estado: _tv.estado, priority: _tv.priority, depto: _tv.depto, artistId: _tv.artistId, tag: _tv.tag, groupBy: _tv.groupBy, sortBy: _tv.sortBy, q: _tv.q } });
  setSavedViews(v); renderTareas(); uiToast('Vista guardada');
}
function tvApplyView(name) {
  const v = getSavedViews().find(x => x.name === name); if (!v) return;
  Object.assign(_tv, v.cfg); renderTareas();
}
function tvDeleteView() {
  const sel = document.getElementById('tv-saved'); const name = sel && sel.value; if (!name) { uiToast('Elige una vista guardada'); return; }
  setSavedViews(getSavedViews().filter(x => x.name !== name)); renderTareas(); uiToast('Vista eliminada');
}

// ── Setters ──
function tvSetView(v) { _tv.view = v; if (v === 'calendar' && !_tv.calMonth) _tv.calMonth = new Date(); renderTareas(); }
function tvScope(mine) { _tv.mine = mine; renderTareas(); }
function tvFilter(key, val) { _tv[key] = val; tvRenderBody(); updateTaskBadge(); }
function tvSearch(val) { _tv.q = val; tvRenderBody(); }
function tvCalNav(delta) { const d = _tv.calMonth || new Date(); _tv.calMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1); tvRenderBody(); }
function setTaskEstadoInline(id, val) { updateTaskRow(id, { estado: val }); tvRenderBody(); updateTaskBadge(); }
// Asignar/cambiar responsable desde la vista de Tareas → se refleja en el release/track (misma tabla).
function setTaskRespInline(id, val) {
  if (typeof requireCan === 'function' && !requireCan('gestionar_tareas')) return;
  updateTaskRow(id, { responsable: val });
  // refresca el panel del release/track si está abierto en esa tarea
  const t = taskById(id);
  if (t && typeof currentLaunchId !== 'undefined' && currentLaunchId === t.releaseId && typeof renderReleaseTab === 'function') {
    if (t.trackId && typeof renderTrackTab === 'function') renderTrackTab('tareas'); else renderReleaseTab('tareas');
  }
  tvRenderBody();
}

// ── Badge del nav ──
function updateTaskBadge() {
  const n = (typeof myTasks === 'function') ? myTasks().length : 0;
  const el = document.getElementById('nav-tasks-badge');
  if (el) { if (n) { el.textContent = n; el.style.display = ''; } else { el.style.display = 'none'; } }
  // misma cuenta en la barra de pestañas inferior (móvil)
  const tabEl = document.getElementById('tab-tasks-badge');
  if (tabEl) { if (n) { tabEl.textContent = n > 9 ? '9+' : n; tabEl.style.display = ''; } else { tabEl.style.display = 'none'; } }
}

// ── Render principal ──
const TV_TABS = [['list','Lista','checklist'],['kanban','Kanban','dashboard'],['calendar','Calendario','calendar'],['timeline','Timeline','trend'],['assignee','Por responsable','team'],['quefalta','Qué falta','warning']];
function renderTareas() {
  updateTaskBadge();
  const head = document.getElementById('tareas-head'); if (!head) return;
  const mineCount = (typeof myTasks === 'function') ? myTasks().length : 0;
  const allOpen = tasks.filter(t => t.estado !== TASK_DONE).length;
  const arts = (typeof artists !== 'undefined') ? artists : [];
  const saved = getSavedViews();
  const allTags = [...new Set(tasks.flatMap(t => Array.isArray(t.etiquetas) ? t.etiquetas : []))].filter(Boolean).sort();
  head.innerHTML = `
    <div class="dash-head">
      <div>
        <h2 id="tareas-title">${_tv.mine ? 'Mis tareas' : 'Todas las tareas'}</h2>
        <div class="dash-sub">${_tv.mine ? mineCount + ' abierta' + (mineCount === 1 ? '' : 's') + ' asignadas a ti' : allOpen + ' abiertas en el equipo'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="tv-seg">
          <button class="${_tv.mine ? 'on' : ''}" onclick="tvScope(true)">Mías</button>
          <button class="${!_tv.mine ? 'on' : ''}" onclick="tvScope(false)">Todas</button>
        </div>
        ${canDo('gestionar_tareas') ? `<button class="btn btn-primary" onclick="openNewTask()">+ Nueva tarea</button>` : ''}
      </div>
    </div>
    <div class="tv-toolbar">
      <div class="tv-tabs">${TV_TABS.map(t => `<div class="tv-tab ${_tv.view === t[0] ? 'active' : ''}" onclick="tvSetView('${t[0]}')">${icon(t[2], 13)} ${t[1]}</div>`).join('')}</div>
      ${_tv.view === 'quefalta' ? '' : `<div class="tv-filters">
        <input class="tv-search" placeholder="Buscar tarea…" value="${s(_tv.q)}" oninput="tvSearch(this.value)">
        <select onchange="tvFilter('estado',this.value)"><option value="">Estado: todos</option>${TASK_ESTADOS.map(x => `<option value="${x[0]}" ${_tv.estado === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>
        <select onchange="tvFilter('priority',this.value)"><option value="">Prioridad: todas</option>${TASK_PRIORITIES.map(x => `<option value="${x[0]}" ${_tv.priority === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>
        <select onchange="tvFilter('depto',this.value)"><option value="">Depto: todos</option>${TASK_DEPTS.map(x => `<option value="${x[0]}" ${_tv.depto === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>
        ${allTags.length ? `<select onchange="tvFilter('tag',this.value)"><option value="">Tag: todos</option>${allTags.map(tg => `<option value="${esc(tg)}" ${_tv.tag === tg ? 'selected' : ''}>${esc(tg)}</option>`).join('')}</select>` : ''}
        ${arts.length > 1 ? `<select onchange="tvFilter('artistId',this.value)"><option value="">Artista: todos</option>${arts.map(a => `<option value="${a.id}" ${_tv.artistId === a.id ? 'selected' : ''}>${s(a.name)}</option>`).join('')}</select>` : ''}
        ${_tv.view === 'list' ? `<select title="Agrupar por" onchange="tvFilter('groupBy',this.value)">${Object.keys(_GROUP_LABELS).map(k => `<option value="${k}" ${_tv.groupBy === k ? 'selected' : ''}>Agrupar: ${_GROUP_LABELS[k]}</option>`).join('')}</select>` : ''}
        ${(_tv.view === 'list' || _tv.view === 'kanban' || _tv.view === 'assignee' || _tv.view === 'timeline') ? `<select title="Ordenar por" onchange="tvFilter('sortBy',this.value)">${Object.keys(_SORT_LABELS).map(k => `<option value="${k}" ${_tv.sortBy === k ? 'selected' : ''}>Ordenar: ${_SORT_LABELS[k]}</option>`).join('')}</select>` : ''}
        <select id="tv-saved" onchange="if(this.value)tvApplyView(this.value)"><option value="">Vistas guardadas…</option>${saved.map(v => `<option value="${s(v.name)}">${s(v.name)}</option>`).join('')}</select>
        <button class="btn btn-ghost" style="padding:6px 10px;font-size:11px" onclick="tvSaveView()">${icon('save', 13)} Guardar</button>
        ${saved.length ? `<button class="btn btn-ghost" style="padding:6px 10px;font-size:11px" onclick="tvDeleteView()">${icon('trash', 13)}</button>` : ''}
      </div>`}
    </div>`;
  tvRenderBody();
}

function tvRenderBody() {
  const body = document.getElementById('tareas-body'); if (!body) return;
  const list = tvFilteredTasks();
  if (_tv.view === 'quefalta') { body.innerHTML = tvQueFalta(); return; }
  if (!list.length) { body.innerHTML = `<div class="tk-empty">${icon('check', 28)}<div style="margin-top:10px">Sin tareas que mostrar con estos filtros.</div></div>`; return; }
  if (_tv.view === 'list')      body.innerHTML = tvList(list);
  else if (_tv.view === 'kanban')   body.innerHTML = tvKanban(list);
  else if (_tv.view === 'calendar') body.innerHTML = tvCalendar(list);
  else if (_tv.view === 'timeline') body.innerHTML = tvTimeline(list);
  else if (_tv.view === 'assignee') body.innerHTML = tvAssignee(list);
}

// ══════════════════════════════════════════
// NUEVA TAREA (global) — se puede linkear a un módulo (departamento) y, opcionalmente, a un artista/release.
// No requiere abrir ninguna sección: la tarea aparece en esta lista y, si tiene release, en su pestaña Tareas.
// ══════════════════════════════════════════
function openNewTask() {
  if (!requireCan('gestionar_tareas')) return;
  const arts = (typeof artists !== 'undefined') ? artists : [];
  const m = document.getElementById('modal-newtask'); if (!m) return;
  const body = document.getElementById('newtask-body');
  body.innerHTML = `
    <div class="field" style="margin-bottom:12px"><label>Tarea</label>
      <input class="input" id="nt-titulo" placeholder="¿Qué hay que hacer?" onkeydown="if(event.key==='Enter')submitNewTask()"></div>
    <div class="field-grid" style="margin-bottom:12px">
      <div class="field"><label>Módulo / área</label>
        <select class="input" id="nt-depto"><option value="">— Ninguno —</option>${TASK_DEPTS.map(x => `<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Responsable</label>
        ${(typeof assigneeSelectHTML === 'function') ? assigneeSelectHTML('', 'id="nt-resp"') : '<select class="input" id="nt-resp"><option value="">— Sin asignar —</option></select>'}</div>
    </div>
    <div class="field-grid" style="margin-bottom:12px">
      <div class="field"><label>Prioridad</label>
        <select class="input" id="nt-pri">${TASK_PRIORITIES.map(x => `<option value="${x[0]}" ${x[0] === 'media' ? 'selected' : ''}>${x[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha límite</label><input type="date" class="input" id="nt-due"></div>
    </div>
    <div class="field-grid" style="margin-bottom:6px">
      <div class="field"><label>Artista <span style="color:var(--text-dim)">(opcional)</span></label>
        <select class="input" id="nt-artist" onchange="ntFillReleases()"><option value="">— Ninguno —</option>${arts.map(a => `<option value="${a.id}">${s(a.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Release <span style="color:var(--text-dim)">(opcional)</span></label>
        <select class="input" id="nt-release"><option value="">— Ninguno —</option></select></div>
    </div>
    <div class="empty-hint" style="margin:4px 0 14px">Puedes crear la tarea sin artista ni release (queda como tarea suelta del workspace) y linkearla solo a un módulo.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="cerrarNewTask()">Cancelar</button>
      <button class="btn btn-primary" onclick="submitNewTask()">Crear tarea</button>
    </div>`;
  m.classList.add('open');
  if (typeof hydrateIcons === 'function') hydrateIcons(m);
  setTimeout(() => { const i = document.getElementById('nt-titulo'); if (i) i.focus(); }, 50);
}
function ntFillReleases() {
  const aid = (document.getElementById('nt-artist') || {}).value || '';
  const rel = document.getElementById('nt-release'); if (!rel) return;
  const ls = (typeof launches !== 'undefined') ? launches.filter(l => (!aid || l.artistId === aid) && l.type !== 'evergreen') : [];
  rel.innerHTML = `<option value="">— Ninguno —</option>` + ls.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
}
function cerrarNewTask(e) { if (!e || e.target === document.getElementById('modal-newtask')) document.getElementById('modal-newtask').classList.remove('open'); }
function submitNewTask() {
  if (!requireCan('gestionar_tareas')) return;
  const titulo = ((document.getElementById('nt-titulo') || {}).value || '').trim();
  if (!titulo) { const i = document.getElementById('nt-titulo'); if (i) i.style.borderColor = 'var(--accent2)'; return; }
  const releaseId = (document.getElementById('nt-release') || {}).value || null;
  let artistId = (document.getElementById('nt-artist') || {}).value || null;
  if (releaseId && typeof launches !== 'undefined') { const l = launches.find(x => x.id === releaseId); if (l) artistId = l.artistId; } // coherencia
  const fields = {
    titulo,
    departamento: (document.getElementById('nt-depto') || {}).value || '',
    responsable: (document.getElementById('nt-resp') || {}).value || '',
    priority: (document.getElementById('nt-pri') || {}).value || 'media',
    dueDate: (document.getElementById('nt-due') || {}).value || '',
  };
  createTask({ artistId: artistId || null, releaseId: releaseId || null, trackId: null }, fields);
  document.getElementById('modal-newtask').classList.remove('open');
  if (typeof uiToast === 'function') uiToast('✓ Tarea creada');
  renderTareas();
}

// ── Vista: Lista ──
function _taskCardHTML(t) {
  const done = t.estado === TASK_DONE || t.estado === 'aprobado';
  const du = _dueInfo(t);
  const blocked = (typeof taskIsBlocked === 'function') && taskIsBlocked(t);
  return `<div class="tk-card" onclick="openTaskDetail('${t.id}')">
    <div class="tk-main">
      <div class="tk-title ${done ? 'done' : ''}">${blocked ? `<span style="color:var(--accent2)" title="${(typeof blockedReason === 'function') ? blockedReason(t) : 'Bloqueada'}">${icon('lock', 12)}</span> ` : ''}${s(t.titulo) || '(sin título)'}</div>
      <div class="tk-meta">${icon('releases', 11)} ${_relNameOf(t)}${t.departamento ? ' · ' + _priLabelDept(t.departamento) : ''}${!t.responsable ? ' · <span style="color:var(--accent2)">sin responsable</span>' : ''}</div>
    </div>
    <div class="tk-right" onclick="event.stopPropagation()">
      ${priChip(t.priority)}
      ${du.label ? `<span class="tk-due ${du.cls}">${du.label}</span>` : ''}
      ${(typeof assigneeSelectHTML === 'function') ? assigneeSelectHTML(t.responsable, `onchange="setTaskRespInline('${t.id}',this.value)"`, 'padding:5px 7px;font-size:11px;width:auto;max-width:130px') : ''}
      <select class="input" style="padding:5px 7px;font-size:11px;width:auto" onchange="setTaskEstadoInline('${t.id}',this.value)">${TASK_ESTADOS.map(x => `<option value="${x[0]}" ${t.estado === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>
    </div>
  </div>`;
}
function _priLabelDept(d) { const x = TASK_DEPTS.find(s2 => s2[0] === d); return x ? x[1] : d; }
function tvList(list) {
  const sorted = _sortTasks(list);
  const gb = _tv.groupBy || 'none';
  if (gb === 'none') return sorted.map(_taskCardHTML).join('');
  const groups = {};
  sorted.forEach(t => { const k = _groupKey(t, gb); (groups[k] = groups[k] || []).push(t); });
  return Object.keys(groups).sort(_groupSorter(gb)).map(k =>
    `<div class="tk-group-h">${_groupLabel(gb, k)} <span style="color:var(--text-dim)">· ${groups[k].length}</span></div>${groups[k].map(_taskCardHTML).join('')}`
  ).join('');
}

// ── Vista: Por responsable ──
function tvAssignee(list) {
  const groups = {};
  list.forEach(t => { const k = t.responsable || '(sin asignar)'; (groups[k] = groups[k] || []).push(t); });
  return Object.keys(groups).sort().map(k => {
    const arr = _sortTasks(groups[k]);
    return `<div class="tk-group-h">${icon('person', 13)} ${s(k)} <span style="color:var(--text-dim)">· ${arr.length}</span></div>${arr.map(_taskCardHTML).join('')}`;
  }).join('');
}

// ── Vista: Kanban (columnas por estado, drag&drop) ──
function tvKanban(list) {
  const cols = TASK_ESTADOS.map(([est, lbl]) => {
    const arr = _sortTasks(list.filter(t => t.estado === est));
    const c = TASK_ESTADO_COLOR[est];
    const cards = arr.map(t => `<div class="tk-kcard" draggable="true" ondragstart="tvDragStart(event,'${t.id}')" onclick="openTaskDetail('${t.id}')">
        <div class="ktitle">${((typeof taskIsBlocked === 'function') && taskIsBlocked(t)) ? `<span style="color:var(--accent2)">${icon('lock', 11)}</span> ` : ''}${s(t.titulo) || '(sin título)'}</div>
        <div class="kmeta">${priChip(t.priority)} ${_dueInfo(t).label ? `<span class="tk-due ${_dueInfo(t).cls}">${_dueInfo(t).label}</span>` : ''} <span style="color:var(--text-dim)">${_relNameOf(t)}</span></div>
      </div>`).join('') || `<div style="font-size:11px;color:var(--text-dim);padding:6px 2px">—</div>`;
    return `<div class="tk-col" data-est="${est}" ondragover="tvDragOver(event,this)" ondragleave="this.classList.remove('drop')" ondrop="tvDrop(event,this,'${est}')">
      <div class="tk-col-head"><span class="dot" style="width:8px;height:8px;background:${c}"></span>${lbl}<span class="cnt">${arr.length}</span></div>${cards}</div>`;
  }).join('');
  return `<div class="tk-kanban">${cols}</div>`;
}
function tvDragStart(e, id) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; }
function tvDragOver(e, el) { e.preventDefault(); el.classList.add('drop'); }
function tvDrop(e, el, est) { e.preventDefault(); el.classList.remove('drop'); const id = e.dataTransfer.getData('text/plain'); if (id) { updateTaskRow(id, { estado: est }); tvRenderBody(); updateTaskBadge(); } }

// ── Vista: Calendario (mes; tareas por dueDate) ──
function tvCalendar(list) {
  const base = _tv.calMonth || new Date();
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1), startDow = (first.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayISO2 = new Date().toISOString().slice(0, 10);
  const byDay = {};
  list.forEach(t => { if (t.dueDate && t.dueDate.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`) { const d = +t.dueDate.slice(8, 10); (byDay[d] = byDay[d] || []).push(t); } });
  const noDate = list.filter(t => !t.dueDate).length;
  const dows = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
  let cells = dows.map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) cells += `<div class="cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const arr = byDay[d] || [];
    const pills = arr.slice(0, 3).map(t => { const c = TASK_PRI_COLOR[t.priority] || 'var(--accent)'; return `<div class="pill" style="background:${c}22;color:${c}" onclick="openTaskDetail('${t.id}')" title="${s(t.titulo)}">${s(t.titulo)}</div>`; }).join('') + (arr.length > 3 ? `<div style="font-size:9px;color:var(--text-dim)">+${arr.length - 3} más</div>` : '');
    cells += `<div class="cell ${iso === todayISO2 ? 'today' : ''}"><div class="dnum">${d}</div>${pills}</div>`;
  }
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <button class="btn btn-ghost" style="padding:5px 10px" onclick="tvCalNav(-1)">←</button>
      <div style="font-family:var(--font-display);font-size:18px;letter-spacing:1px">${MESES_CAL[month]} ${year}</div>
      <button class="btn btn-ghost" style="padding:5px 10px" onclick="tvCalNav(1)">→</button>
      ${noDate ? `<span style="margin-left:auto;font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${noDate} sin fecha</span>` : ''}
    </div><div class="tk-cal">${cells}</div>`;
}

// ── Vista: Timeline (barras por fecha) ──
function tvTimeline(list) {
  const withDue = _sortTasks(list.filter(t => t.dueDate));
  const noDue = list.filter(t => !t.dueDate);
  if (!withDue.length) return `<div class="tk-empty">Ninguna tarea con fecha. Asigna fechas para ver la línea de tiempo.</div>`;
  const ds = withDue.map(t => +new Date(t.dueDate + 'T00:00:00'));
  const min = Math.min.apply(null, ds), max = Math.max.apply(null, ds), span = (max - min) || 1;
  const rows = withDue.map(t => {
    const x = ((+new Date(t.dueDate + 'T00:00:00') - min) / span) * 100;
    const c = TASK_PRI_COLOR[t.priority] || 'var(--accent)';
    const du = _dueInfo(t);
    return `<div class="tk-tl-row" onclick="openTaskDetail('${t.id}')">
      <div style="width:160px;min-width:120px;flex-shrink:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s(t.titulo)}</div>
      <div style="flex:1;position:relative;height:14px"><div class="tk-tl-bar" style="position:absolute;left:${Math.max(0, x - 1)}%;width:14px;background:${c}"></div></div>
      <div style="width:90px;text-align:right;font-size:11px;font-family:var(--font-mono);color:${du.cls === 'over' ? 'var(--accent2)' : 'var(--text-muted)'}">${fmtDateShort(t.dueDate)}</div>
    </div>`;
  }).join('');
  return `<div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-bottom:10px">${fmtDateShort(withDue[0].dueDate)} → ${fmtDateShort(withDue[withDue.length - 1].dueDate)}${noDue.length ? ` · ${noDue.length} sin fecha` : ''}</div>${rows}`;
}

// ── Vista: "Qué falta" (accionable, cross-release) ──
function tvQueFalta() {
  const arts = (typeof artists !== 'undefined') ? artists : [];
  const ls = (typeof launches !== 'undefined') ? launches.slice() : [];
  const rels = (_tv.artistId ? ls.filter(l => l.artistId === _tv.artistId) : ls);
  const blocks = rels.map(l => {
    const alerts = (typeof releaseAlerts === 'function') ? releaseAlerts(l) : [];
    const overdue = tasks.filter(t => t.releaseId === l.id && t.dueDate && t.estado !== TASK_DONE && (typeof diasRestantes === 'function') && diasRestantes(t.dueDate) < 0);
    const blocked = tasks.filter(t => t.releaseId === l.id && t.estado === 'bloqueado');
    if (!alerts.length && !overdue.length && !blocked.length) return '';
    const items = [
      ...alerts.map(a => `<div class="qf-item"><span class="dot ${a.level === 'red' ? 'dot--red' : 'dot--yellow'}"></span><span style="flex:1">${a.text}</span>${a.action ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:11px" onclick="event.stopPropagation();${a.action.fn}">${a.action.label}</button>` : ''}</div>`),
      ...overdue.map(t => `<div class="qf-item"><span class="dot dot--red"></span><span style="flex:1">Tarea vencida: ${s(t.titulo)}</span><span class="tk-due over">${_dueInfo(t).label}</span></div>`),
      ...blocked.map(t => `<div class="qf-item">${icon('lock', 13)}<span style="flex:1">Bloqueada: ${s(t.titulo)}</span></div>`),
    ].join('');
    const ph = (typeof releasePhase === 'function') ? releasePhase(l) : '';
    return `<div class="qf-rel">
      <div class="qf-rel-h" onclick="openLaunch('${l.id}')">
        <span class="dot" style="width:9px;height:9px;background:${(typeof phaseColor === 'function') ? phaseColor(ph) : 'var(--accent)'}"></span>
        <strong style="font-size:15px">${s(l.name)}</strong>
        <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${_artNameOf({ artistId: l.artistId })} · ${ph}${l.date ? ' · ' + (diasRestantes(l.date) >= 0 ? 'en ' + diasRestantes(l.date) + 'd' : 'ya salió') : ''}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--accent)">Abrir ${icon('link', 11)}</span>
      </div>${items}</div>`;
  }).filter(Boolean).join('');
  if (!blocks) return `<div class="tk-empty">${icon('check', 28)}<div style="margin-top:10px">Nada pendiente accionable. Todos los releases en orden.</div></div>`;
  return `<div class="empty-hint" style="margin-bottom:14px">Lo que bloquea o falta para cada lanzamiento — accionable, cruzando todos los releases${_tv.artistId ? ' del artista filtrado' : ''}.</div>${blocks}`;
}

// ══════════════════════════════════════════
// DETALLE DE TAREA (Sprint A #1, estilo ClickUp) — panel rico reusando .boxdrop
// Expone descripción, subtareas, tags, adjuntos, deps, comentarios y actividad
// (todo ya vive en el modelo de collab.js). Edición inline con autosave.
// 2 columnas: principal (descripción + subtareas + tabs Comentarios/Actividad) + riel de propiedades.
// ══════════════════════════════════════════
let _tdId = null, _tdTab = 'coment';
function _tdInjectStyles() {
  if (document.getElementById('td-styles')) return;
  const st = document.createElement('style'); st.id = 'td-styles';
  st.textContent = `
  .td-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:0}
  .td-main{padding:20px 22px;border-right:1px solid var(--border)}
  .td-side{padding:16px 20px}
  .td-block{margin-bottom:20px}
  .td-label{font-size:10px;font-family:var(--font-mono);color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px}
  .td-title-input{flex:1;background:transparent;border:1px solid transparent;border-radius:6px;color:var(--text);font-family:var(--font-display);font-size:18px;letter-spacing:.5px;padding:6px 8px}
  .td-title-input:hover{border-color:var(--border)} .td-title-input:focus{border-color:var(--accent);outline:none;background:var(--surface2)}
  .td-desc{min-height:78px;width:100%;font-size:13px;line-height:1.55}
  .td-sub{display:flex;align-items:center;gap:9px;padding:4px 0}
  .td-sub-text{flex:1;background:transparent;border:1px solid transparent;border-radius:5px;color:var(--text);font-size:13px;padding:4px 6px}
  .td-sub-text:hover{border-color:var(--border)} .td-sub-text:focus{border-color:var(--accent);outline:none}
  .td-sub-text.done{text-decoration:line-through;color:var(--text-muted)}
  .td-prog{height:5px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-bottom:8px}
  .td-prog-fill{height:100%;background:#4ade80;transition:width .2s}
  .td-prog-n{margin-left:auto;color:var(--text-dim);font-weight:400}
  .td-cmt{padding:8px 0;border-bottom:1px solid var(--border)}
  .td-cmt-h{display:flex;align-items:baseline;gap:8px;margin-bottom:3px}
  .td-cmt-author{font-size:12px;font-weight:600}
  .td-cmt-ago{font-size:10px;font-family:var(--font-mono);color:var(--text-dim)}
  .td-cmt-body{font-size:13px;line-height:1.5;color:var(--text-muted);white-space:pre-wrap}
  .td-act-row{display:flex;align-items:center;gap:8px;font-size:12px;padding:5px 0;color:var(--text-muted)}
  .td-prop{padding:9px 0;border-bottom:1px solid var(--border)}
  .td-prop-l{font-size:10px;font-family:var(--font-mono);color:var(--text-dim);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}
  .td-tags{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
  .td-tag-add{font-size:11px;color:var(--accent);cursor:pointer;background:none;border:1px dashed var(--border);border-radius:10px;padding:2px 8px}
  .td-att{display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 0}
  .td-att a{color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  @media(max-width:720px){.td-grid{grid-template-columns:1fr}.td-main{border-right:0;border-bottom:1px solid var(--border)}}`;
  document.head.appendChild(st);
}
function openTaskDetail(id) {
  const t = taskById(id); if (!t) return;
  _tdInjectStyles();
  _tdId = id; _tdTab = 'coment';
  let ov = document.getElementById('td-overlay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'td-overlay'; ov.className = 'boxdrop-overlay';
    ov.onclick = e => { if (e.target === ov) closeTaskDetail(); };
    document.body.appendChild(ov);
  }
  document.addEventListener('keydown', _tdEsc);
  ov.classList.add('open');
  tdRender();
}
function _tdEsc(e) { if (e.key === 'Escape') closeTaskDetail(); }
function closeTaskDetail() {
  const ov = document.getElementById('td-overlay'); if (ov) ov.classList.remove('open');
  _tdId = null; document.removeEventListener('keydown', _tdEsc);
  if (typeof tvRenderBody === 'function') tvRenderBody();
  if (typeof updateTaskBadge === 'function') updateTaskBadge();
}
function _tdTask() { return _tdId ? taskById(_tdId) : null; }
function tdPatch(patch) {
  const t = _tdTask(); if (!t) return;
  if (typeof requireCan === 'function' && !requireCan('gestionar_tareas')) return;
  updateTaskRow(t.id, patch); tdRender();
}
function tdRender() {
  const ov = document.getElementById('td-overlay'); const t = _tdTask(); if (!ov || !t) return;
  const editable = (typeof canDo === 'function') ? canDo('gestionar_tareas') : true;
  ov.innerHTML = `<div class="boxdrop" style="width:880px" onclick="event.stopPropagation()">
    <div class="boxdrop-header">
      <input class="td-title-input" value="${esc(t.titulo)}" placeholder="Título de la tarea" ${editable ? '' : 'disabled'} onchange="tdPatch({titulo:this.value})">
      <select class="input" style="width:auto;padding:6px 9px;font-size:12px" ${editable ? '' : 'disabled'} onchange="tdPatch({estado:this.value})">${TASK_ESTADOS.map(x => `<option value="${x[0]}" ${t.estado === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>
      <button class="boxdrop-close" onclick="closeTaskDetail()">${icon('close', 16)}</button>
    </div>
    <div class="boxdrop-body" style="padding:0">
      <div class="td-grid"><div class="td-main">${tdMain(t, editable)}</div><div class="td-side">${tdSide(t, editable)}</div></div>
    </div>
  </div>`;
  if (typeof hydrateIcons === 'function') hydrateIcons(ov);
  const ti = ov.querySelector('.td-title-input'); if (ti && !s(t.titulo)) setTimeout(() => ti.focus(), 40);
}
function tdMain(t, editable) {
  const subs = Array.isArray(t.checklistInterno) ? t.checklistInterno : [];
  const done = subs.filter(x => x && x.done).length, pct = subs.length ? Math.round(done / subs.length * 100) : 0;
  const subsHTML = subs.map((x, i) => `<div class="td-sub"><input type="checkbox" ${x && x.done ? 'checked' : ''} ${editable ? '' : 'disabled'} onchange="tdToggleSub(${i})"><input class="td-sub-text ${x && x.done ? 'done' : ''}" value="${esc((x && x.text) || '')}" ${editable ? '' : 'disabled'} onchange="tdSetSub(${i},this.value)">${editable ? `<button class="goal-btn reject" title="Quitar" onclick="tdDelSub(${i})">${icon('close', 11)}</button>` : ''}</div>`).join('');
  return `
    <div class="td-block">
      <div class="td-label">${icon('file', 13)} Descripción</div>
      <textarea class="textarea td-desc" placeholder="Agrega detalles, contexto, links…" ${editable ? '' : 'disabled'} onchange="tdPatch({descripcion:this.value})">${s(t.descripcion)}</textarea>
    </div>
    <div class="td-block">
      <div class="td-label">${icon('checklist', 13)} Subtareas ${subs.length ? `<span class="td-prog-n">${done}/${subs.length}</span>` : ''}</div>
      ${subs.length ? `<div class="td-prog"><div class="td-prog-fill" style="width:${pct}%"></div></div>` : ''}
      ${subsHTML}
      ${editable ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px;margin-top:6px" onclick="tdAddSub()">+ Subtarea</button>` : ''}
    </div>
    <div class="td-block">
      <div class="boxdrop-tabs" style="padding:0;margin-bottom:12px">
        <div class="boxdrop-tab ${_tdTab === 'coment' ? 'active' : ''}" onclick="tdTab('coment')">Comentarios</div>
        <div class="boxdrop-tab ${_tdTab === 'activ' ? 'active' : ''}" onclick="tdTab('activ')">Actividad</div>
      </div>
      ${_tdTab === 'coment' ? tdComments(t, editable) : tdActivity(t)}
    </div>`;
}
function tdComments(t, editable) {
  const cs = (typeof commentsOf === 'function') ? commentsOf({ taskId: t.id }) : [];
  const list = cs.length ? cs.map(c => `<div class="td-cmt"><div class="td-cmt-h"><span class="td-cmt-author">${esc((typeof _memberLabel === 'function') ? _memberLabel(c.author) : c.author)}</span><span class="td-cmt-ago">${(typeof _ago === 'function') ? _ago(c.createdAt) : ''}</span></div><div class="td-cmt-body">${esc(c.body)}</div></div>`).join('') : `<div class="empty-hint" style="margin:0 0 10px">Sin comentarios todavía.</div>`;
  return `${list}${editable ? `<div style="margin-top:12px"><textarea class="textarea" id="td-cmt-input" placeholder="Escribe un comentario…" style="min-height:54px;font-size:13px"></textarea><button class="btn btn-primary" style="margin-top:6px;font-size:12px;padding:6px 12px" onclick="tdAddComment()">Comentar</button></div>` : ''}`;
}
function tdActivity(t) {
  const a = (typeof activityOf === 'function') ? activityOf({ taskId: t.id }) : [];
  if (!a.length) return `<div class="empty-hint" style="margin:0">Sin actividad registrada.</div>`;
  return a.map(x => `<div class="td-act-row"><span class="dot" style="width:6px;height:6px;background:var(--text-dim)"></span><span style="flex:1">${esc(x.summary)}</span><span class="td-cmt-ago">${(typeof _ago === 'function') ? _ago(x.createdAt) : ''}</span></div>`).join('');
}
function tdSide(t, editable) {
  const dis = editable ? '' : 'disabled';
  const tags = Array.isArray(t.etiquetas) ? t.etiquetas : [];
  const atts = Array.isArray(t.adjuntos) ? t.adjuntos : [];
  const deps = Array.isArray(t.deps) ? t.deps : [];
  const _url = u => (typeof safeUrl === 'function') ? safeUrl(u) : esc(u);
  const row = (label, ctrl) => `<div class="td-prop"><div class="td-prop-l">${label}</div><div>${ctrl}</div></div>`;
  return `
    ${row('Responsable', (typeof assigneeSelectHTML === 'function') ? assigneeSelectHTML(t.responsable, `onchange="tdPatch({responsable:this.value})"`, 'width:100%;font-size:12px;padding:6px 8px') : '—')}
    ${row('Prioridad', `<select class="input" style="width:100%;font-size:12px;padding:6px 8px" ${dis} onchange="tdPatch({priority:this.value})">${TASK_PRIORITIES.map(x => `<option value="${x[0]}" ${t.priority === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>`)}
    ${row('Departamento', `<select class="input" style="width:100%;font-size:12px;padding:6px 8px" ${dis} onchange="tdPatch({departamento:this.value})"><option value="">—</option>${TASK_DEPTS.map(x => `<option value="${x[0]}" ${t.departamento === x[0] ? 'selected' : ''}>${x[1]}</option>`).join('')}</select>`)}
    ${row('Fecha límite', `<input type="date" class="input" style="width:100%;font-size:12px;padding:6px 8px" value="${s(t.dueDate)}" ${dis} onchange="tdPatch({dueDate:this.value})">`)}
    ${row('Tags', `<div class="td-tags">${tags.map((tg, i) => `<span class="tk-chip" style="background:var(--surface2)">${esc(tg)}${editable ? ` <span style="cursor:pointer;opacity:.6" onclick="tdDelTag(${i})">×</span>` : ''}</span>`).join('')}${editable ? `<button class="td-tag-add" onclick="tdAddTag()">+ tag</button>` : ''}</div>`)}
    ${row('Dependencias', `<button class="btn btn-ghost" style="width:100%;font-size:12px;padding:6px 8px;${deps.length ? 'color:var(--accent)' : ''}" ${dis} onclick="openDepsPicker('${t.id}')">${icon('link', 12)} ${deps.length ? deps.length + ' dependencia(s)' : 'Agregar'}</button>`)}
    ${row('Adjuntos', `<div>${atts.map((a, i) => `<div class="td-att"><a href="${_url((a && a.url) || '#')}" target="_blank" rel="noopener">${esc((a && a.name) || 'archivo')}</a>${editable ? `<span style="cursor:pointer;opacity:.6" onclick="tdDelAtt(${i})">×</span>` : ''}</div>`).join('')}${editable ? `<button class="td-tag-add" style="margin-top:4px" onclick="tdAddAtt()">+ adjunto</button>` : ''}</div>`)}
    <div class="td-prop" style="border:0;margin-top:4px">
      <div class="td-prop-l">Contexto</div>
      <div style="font-size:12px;line-height:1.5;color:var(--text-muted)">${esc(_artNameOf(t) ? _artNameOf(t) + ' · ' : '')}${esc(_relNameOf(t))}${t.releaseId ? `<br><button class="btn btn-ghost" style="font-size:11px;padding:4px 8px;margin-top:6px" onclick="tdOpenInRelease()">Abrir en release ${icon('link', 11)}</button>` : ''}</div>
    </div>`;
}
function tdTab(w) { _tdTab = w; tdRender(); }
function tdToggleSub(i) { const t = _tdTask(); if (!t) return; const a = (t.checklistInterno || []).slice(); if (!a[i]) return; a[i] = Object.assign({}, a[i], { done: !a[i].done }); tdPatch({ checklistInterno: a }); }
function tdSetSub(i, v) { const t = _tdTask(); if (!t) return; const a = (t.checklistInterno || []).slice(); if (!a[i]) return; a[i] = Object.assign({}, a[i], { text: s(v) }); tdPatch({ checklistInterno: a }); }
async function tdAddSub() { const t = _tdTask(); if (!t) return; const txt = ((await uiPrompt('Subtarea:', { title: 'Nueva subtarea' })) || '').trim(); if (!txt) return; const a = (t.checklistInterno || []).slice(); a.push({ text: txt, done: false }); tdPatch({ checklistInterno: a }); }
function tdDelSub(i) { const t = _tdTask(); if (!t) return; const a = (t.checklistInterno || []).slice(); a.splice(i, 1); tdPatch({ checklistInterno: a }); }
async function tdAddTag() { const t = _tdTask(); if (!t) return; const tg = ((await uiPrompt('Tag:', { title: 'Nuevo tag' })) || '').trim(); if (!tg) return; const a = (t.etiquetas || []).slice(); if (!a.includes(tg)) a.push(tg); tdPatch({ etiquetas: a }); }
function tdDelTag(i) { const t = _tdTask(); if (!t) return; const a = (t.etiquetas || []).slice(); a.splice(i, 1); tdPatch({ etiquetas: a }); }
async function tdAddAtt() { const t = _tdTask(); if (!t) return; const url = ((await uiPrompt('URL del adjunto:', { title: 'Adjunto' })) || '').trim(); if (!url) return; const name = ((await uiPrompt('Nombre (opcional):')) || url).trim(); const a = (t.adjuntos || []).slice(); a.push({ name, url }); tdPatch({ adjuntos: a }); }
function tdDelAtt(i) { const t = _tdTask(); if (!t) return; const a = (t.adjuntos || []).slice(); a.splice(i, 1); tdPatch({ adjuntos: a }); }
function tdAddComment() {
  const t = _tdTask(); if (!t) return;
  const inp = document.getElementById('td-cmt-input'); const body = ((inp && inp.value) || '').trim(); if (!body) return;
  if (typeof addComment === 'function') addComment({ taskId: t.id, releaseId: t.releaseId, artistId: t.artistId, trackId: t.trackId }, 'general', body, []);
  tdRender();
}
function tdOpenInRelease() { const t = _tdTask(); if (!t) return; closeTaskDetail(); if (typeof openTaskContext === 'function') openTaskContext(t.id); }
