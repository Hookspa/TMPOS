// ══════════════════════════════════════════
// TAREAS — vista global (Sprint 7) · inbox "Mis tareas" + 5 vistas + "Qué falta"
// Lee de la tabla relacional `tasks` (js/collab.js). Mobile-first.
// ══════════════════════════════════════════

let _tv = { view: 'list', mine: true, q: '', estado: '', priority: '', depto: '', artistId: '', calMonth: null };

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
  if (_tv.q) { const q = _tv.q.toLowerCase(); list = list.filter(t => (t.titulo || '').toLowerCase().includes(q) || (t.responsable || '').toLowerCase().includes(q) || _relNameOf(t).toLowerCase().includes(q)); }
  return list;
}
const _PRI_ORDER = { critica: 0, urgente: 1, alta: 2, media: 3, baja: 4 };
function _sortTasks(list) {
  return list.slice().sort((a, b) => {
    const ad = a.dueDate || '9999', bd = b.dueDate || '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (_PRI_ORDER[a.priority] ?? 9) - (_PRI_ORDER[b.priority] ?? 9);
  });
}

// ── Vistas guardadas (localStorage por equipo) ──
function _savedViewsKey() { return 'ao_task_views_' + ((typeof _teamId !== 'undefined' && _teamId) ? _teamId : 'local'); }
function getSavedViews() { try { return JSON.parse(localStorage.getItem(_savedViewsKey())) || []; } catch (e) { return []; } }
function setSavedViews(a) { try { localStorage.setItem(_savedViewsKey(), JSON.stringify(a)); } catch (e) {} }
async function tvSaveView() {
  const name = (await uiPrompt('Nombre de la vista:', { title: 'Guardar vista' }) || '').trim(); if (!name) return;
  const v = getSavedViews().filter(x => x.name !== name);
  v.push({ name, cfg: { view: _tv.view, mine: _tv.mine, estado: _tv.estado, priority: _tv.priority, depto: _tv.depto, artistId: _tv.artistId, q: _tv.q } });
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
        ${arts.length > 1 ? `<select onchange="tvFilter('artistId',this.value)"><option value="">Artista: todos</option>${arts.map(a => `<option value="${a.id}" ${_tv.artistId === a.id ? 'selected' : ''}>${s(a.name)}</option>`).join('')}</select>` : ''}
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
  rel.innerHTML = `<option value="">— Ninguno —</option>` + ls.map(l => `<option value="${l.id}">${s(l.name)}</option>`).join('');
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
  return `<div class="tk-card" style="border-left-color:${blocked ? 'var(--accent2)' : (TASK_PRI_COLOR[t.priority] || 'var(--border)')}" onclick="openTaskContext('${t.id}')">
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
function tvList(list) { return _sortTasks(list).map(_taskCardHTML).join(''); }

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
    const cards = arr.map(t => `<div class="tk-kcard" draggable="true" ondragstart="tvDragStart(event,'${t.id}')" onclick="openTaskContext('${t.id}')">
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
    const pills = arr.slice(0, 3).map(t => { const c = TASK_PRI_COLOR[t.priority] || 'var(--accent)'; return `<div class="pill" style="background:${c}22;color:${c}" onclick="openTaskContext('${t.id}')" title="${s(t.titulo)}">${s(t.titulo)}</div>`; }).join('') + (arr.length > 3 ? `<div style="font-size:9px;color:var(--text-dim)">+${arr.length - 3} más</div>` : '');
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
    return `<div class="tk-tl-row" onclick="openTaskContext('${t.id}')">
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
