// ══════════════════════════════════════════
// CRM COLABORATIVO — Sprint 6 (Cimiento relacional)
// Capa de datos relacional: tasks · comments · activity · notifications · approvals.
// Filas propias (fork §8.2). comments/activity = append-only. Sync en nube best-effort.
// La UI rica (inbox, vistas, aprobaciones) llega en Sprints 7–9; aquí va el cimiento.
// ══════════════════════════════════════════

// ── Catálogos (objeto-tarea §8.4) ──
const TASK_ESTADOS = [
  ['backlog','Backlog'], ['pendiente','Pendiente'], ['en_progreso','En progreso'],
  ['en_revision','En revisión'], ['aprobado','Aprobado'], ['bloqueado','Bloqueado'],
  ['completado','Completado'], ['atrasado','Atrasado'],
];
const TASK_PRIORITIES = [['baja','Baja'],['media','Media'],['alta','Alta'],['urgente','Urgente'],['critica','Crítica']];
const TASK_DEPTS = [['audio','Audio'],['legal','Legal'],['marketing','Marketing'],['creativo','Creativo'],['distrib','Distribución'],['admin','Admin']];
const COMMENT_CANALES = [['general','General'],['legal','Legal'],['marketing','Marketing'],['audio','Audio'],['interno-privado','Interno (privado)']];
const APPROVAL_GATES = [
  ['cover','Cover'],['master','Máster'],['label_copy','Label Copy'],['split_sheet','Split sheet'],
  ['presupuesto','Presupuesto'],['calendario','Calendario'],['reporte','Reporte'],['campana','Campaña'],['publicacion','Publicación'],
];
const TASK_DONE = 'completado';
function _collabUid(p) { return p + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6).toString(36); }
function _meId()    { return (typeof _user !== 'undefined' && _user && _user.id) ? _user.id : 'local'; }
function _meEmail() { return (typeof _user !== 'undefined' && _user && _user.email) ? _user.email : ''; }
function _teamIdOr() { return (typeof _teamId !== 'undefined' && _teamId) ? _teamId : null; }

// ── Normalizadores ──
function normalizeTaskRow(t) {
  t = t || {};
  t.id = t.id || _collabUid('TSK');
  t.teamId = t.teamId || _teamIdOr();
  t.artistId = t.artistId || null;
  t.releaseId = t.releaseId || null;
  t.trackId = t.trackId || null;
  t.titulo = s(t.titulo);
  t.descripcion = s(t.descripcion);
  t.responsable = s(t.responsable);
  t.departamento = t.departamento || '';
  t.estado = t.estado || 'pendiente';
  t.priority = t.priority || 'media';
  t.startDate = t.startDate || '';
  t.dueDate = t.dueDate || '';
  t.snoozedUntil = t.snoozedUntil || ''; // cockpit: pospuesta hasta esta fecha (sale de la cola de acción hasta entonces)
  t.recurrence = t.recurrence || ''; // '' | 'weekly' | 'monthly'
  t.etiquetas = Array.isArray(t.etiquetas) ? t.etiquetas : [];
  t.checklistInterno = Array.isArray(t.checklistInterno) ? t.checklistInterno : [];
  t.deps = Array.isArray(t.deps) ? t.deps : [];
  t.adjuntos = Array.isArray(t.adjuntos) ? t.adjuntos : [];
  t.approvalId = t.approvalId || null;
  t.createdBy = t.createdBy || _meId();
  t.createdAt = t.createdAt || new Date().toISOString();
  t.updatedAt = t.updatedAt || t.createdAt;
  return t;
}
function normalizeComment(c) {
  c = c || {}; c.id = c.id || _collabUid('CMT'); c.teamId = c.teamId || _teamIdOr();
  c.artistId = c.artistId || null; c.releaseId = c.releaseId || null; c.trackId = c.trackId || null; c.taskId = c.taskId || null;
  c.canal = c.canal || 'general'; c.author = c.author || _meEmail() || _meId(); c.body = s(c.body);
  c.mentions = Array.isArray(c.mentions) ? c.mentions : []; c.createdAt = c.createdAt || new Date().toISOString();
  return c;
}
function normalizeActivity(a) {
  a = a || {}; a.id = a.id || _collabUid('ACT'); a.teamId = a.teamId || _teamIdOr();
  a.artistId = a.artistId || null; a.releaseId = a.releaseId || null; a.trackId = a.trackId || null; a.taskId = a.taskId || null;
  a.actor = a.actor || _meEmail() || _meId(); a.verb = a.verb || 'updated'; a.summary = s(a.summary);
  a.meta = a.meta || {}; a.createdAt = a.createdAt || new Date().toISOString();
  return a;
}
function normalizeNotif(n) {
  n = n || {}; n.id = n.id || _collabUid('NTF'); n.teamId = n.teamId || _teamIdOr();
  n.recipient = n.recipient || null; n.type = n.type || 'system'; n.title = s(n.title); n.body = s(n.body);
  n.link = n.link || null; n.isRead = !!n.isRead; n.createdAt = n.createdAt || new Date().toISOString();
  return n;
}
function normalizeApproval(ap) {
  ap = ap || {}; ap.id = ap.id || _collabUid('APR'); ap.teamId = ap.teamId || _teamIdOr();
  ap.artistId = ap.artistId || null; ap.releaseId = ap.releaseId || null; ap.trackId = ap.trackId || null; ap.taskId = ap.taskId || null;
  ap.gate = ap.gate || 'cover'; ap.estado = ap.estado || 'pendiente';
  ap.requestedBy = ap.requestedBy || _meId(); ap.decidedBy = ap.decidedBy || null; ap.decidedAt = ap.decidedAt || null;
  ap.note = s(ap.note); ap.data = ap.data || {}; ap.createdAt = ap.createdAt || new Date().toISOString();
  return ap;
}

// ── Estado en memoria + localStorage ──
function _loadArr(key, norm) { let a = []; try { a = JSON.parse(localStorage.getItem(key)); } catch (e) {} return (Array.isArray(a) ? a : []).map(norm); }
let tasks         = _loadArr('ao_tasks', normalizeTaskRow);
let comments      = _loadArr('ao_comments', normalizeComment);
let activity      = _loadArr('ao_activity', normalizeActivity);
let notifications = _loadArr('ao_notifications', normalizeNotif);
let approvals     = _loadArr('ao_approvals', normalizeApproval);
function saveTasksLocal()    { localStorage.setItem('ao_tasks', JSON.stringify(tasks)); }
function saveCommentsLocal() { localStorage.setItem('ao_comments', JSON.stringify(comments)); }
function saveActivityLocal() { localStorage.setItem('ao_activity', JSON.stringify(activity)); }
function saveNotifsLocal()   { localStorage.setItem('ao_notifications', JSON.stringify(notifications)); }
function saveApprovalsLocal(){ localStorage.setItem('ao_approvals', JSON.stringify(approvals)); }
function saveTasks()     { saveTasksLocal();     if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); }
function saveComments()  { saveCommentsLocal();  if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); }
function saveActivity()  { saveActivityLocal();  if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); }
function saveNotifs()    { saveNotifsLocal();    if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); }
function saveApprovals() { saveApprovalsLocal(); if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); }

// ── Consultas ──
function tasksOfRelease(id) { return tasks.filter(t => t.releaseId === id && !t.trackId); }
function tasksOfTrack(id)   { return tasks.filter(t => t.trackId === id); }
function tasksOfArtist(id)  { return tasks.filter(t => t.artistId === id); }
function taskById(id)       { return tasks.find(t => t.id === id) || null; }
function myTasks() {
  const me = _meId(), email = _meEmail();
  return tasks.filter(t => t.estado !== TASK_DONE && (t.responsable === me || (email && t.responsable === email)));
}
function commentsOf(scope) {
  return comments.filter(c =>
    (scope.taskId && c.taskId === scope.taskId) ||
    (!scope.taskId && scope.trackId && c.trackId === scope.trackId) ||
    (!scope.taskId && !scope.trackId && scope.releaseId && c.releaseId === scope.releaseId)
  ).sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
}
function activityOf(scope) {
  return activity.filter(a =>
    (scope.taskId && a.taskId === scope.taskId) ||
    (scope.releaseId && a.releaseId === scope.releaseId) ||
    (scope.artistId && a.artistId === scope.artistId)
  ).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
}
function myNotifications() { const me = _meId(); return notifications.filter(n => n.recipient === me).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1); }
function unreadNotifCount() { return myNotifications().filter(n => !n.isRead).length; }
function approvalsOfRelease(id) { return approvals.filter(a => a.releaseId === id); }

// ── Escritor de actividad (append-only) ──
function logActivity(verb, summary, scope, meta) {
  const a = normalizeActivity(Object.assign({ verb, summary, meta: meta || {} }, scope || {}));
  activity.push(a); saveActivityLocal();
  if (typeof scheduleCloudSync === 'function') scheduleCloudSync();
  if (typeof renderActivityBadgeMaybe === 'function') try { renderActivityBadgeMaybe(); } catch (e) {}
  return a;
}

// ── Notificaciones (append) ──
function notify(recipient, type, title, body, link) {
  if (!recipient) return null;
  const n = normalizeNotif({ recipient, type, title, body, link: link || null });
  notifications.push(n); saveNotifs();
  return n;
}
function markNotifRead(id) { const n = notifications.find(x => x.id === id); if (n && !n.isRead) { n.isRead = true; saveNotifs(); } }

// ── CRUD de tareas ──
function createTask(scope, fields) {
  const t = normalizeTaskRow(Object.assign({}, scope || {}, fields || {}));
  tasks.push(t); saveTasks();
  logActivity('created', 'Tarea creada: ' + (t.titulo || '(sin título)'), { artistId: t.artistId, releaseId: t.releaseId, trackId: t.trackId, taskId: t.id });
  if (t.responsable && t.responsable !== _meId()) notify(t.responsable, 'assigned', 'Tarea asignada', t.titulo, { taskId: t.id, releaseId: t.releaseId });
  return t;
}
function updateTaskRow(id, patch) {
  const t = taskById(id); if (!t) return null;
  const before = { estado: t.estado, responsable: t.responsable };
  Object.assign(t, patch); t.updatedAt = new Date().toISOString();
  saveTasks();
  if (patch.estado && patch.estado !== before.estado) logActivity('status_changed', `Estado → ${patch.estado}: ${t.titulo}`, { artistId: t.artistId, releaseId: t.releaseId, trackId: t.trackId, taskId: t.id });
  if (patch.responsable && patch.responsable !== before.responsable) {
    logActivity('assigned', `Asignada a ${patch.responsable}: ${t.titulo}`, { artistId: t.artistId, releaseId: t.releaseId, trackId: t.trackId, taskId: t.id });
    if (patch.responsable !== _meId()) notify(patch.responsable, 'assigned', 'Tarea asignada', t.titulo, { taskId: t.id, releaseId: t.releaseId });
  }
  // Recurrencia ligera: al completar una tarea recurrente, genera la siguiente ocurrencia.
  if (patch.estado === TASK_DONE && before.estado !== TASK_DONE && t.recurrence) _spawnRecurrence(t);
  if (patch.estado && patch.estado !== before.estado && typeof runAutomations === 'function') runAutomations(); // desbloqueo de dependientes, etc.
  return t;
}
// Avanza una fecha ISO según la recurrencia (semanal +7d, mensual +1 mes).
function _advanceDate(iso, rec) {
  if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); if (isNaN(d)) return '';
  if (rec === 'weekly') d.setDate(d.getDate() + 7);
  else if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
// Clona la tarea recurrente con fechas avanzadas y subtareas reiniciadas.
function _spawnRecurrence(t) {
  const rec = t.recurrence; if (rec !== 'weekly' && rec !== 'monthly') return;
  const baseDue = t.dueDate || new Date().toISOString().slice(0, 10);
  const nextDue = _advanceDate(baseDue, rec); if (!nextDue) return;
  const nextStart = t.startDate ? _advanceDate(t.startDate, rec) : '';
  const subs = (Array.isArray(t.checklistInterno) ? t.checklistInterno : []).map(x => ({ text: (x && x.text) || '', done: false }));
  createTask({ artistId: t.artistId, releaseId: t.releaseId, trackId: t.trackId }, {
    titulo: t.titulo, descripcion: t.descripcion, departamento: t.departamento, responsable: t.responsable,
    priority: t.priority, dueDate: nextDue, startDate: nextStart, etiquetas: (t.etiquetas || []).slice(),
    checklistInterno: subs, recurrence: rec, estado: 'pendiente',
  });
}
function deleteTaskRow(id) {
  const t = taskById(id); if (!t) return;
  tasks = tasks.filter(x => x.id !== id); saveTasks();
  logActivity('deleted', 'Tarea eliminada: ' + t.titulo, { artistId: t.artistId, releaseId: t.releaseId, trackId: t.trackId });
  if (typeof cloudDelete === 'function') cloudDelete('tasks', id);
}

// ── Comentarios (append-only) ──
function addComment(scope, canal, body, mentions) {
  const c = normalizeComment(Object.assign({ canal, body, mentions: mentions || [] }, scope || {}));
  comments.push(c); saveComments();
  logActivity('commented', 'Comentario en ' + (canal || 'general'), { artistId: c.artistId, releaseId: c.releaseId, trackId: c.trackId, taskId: c.taskId });
  (c.mentions || []).forEach(u => { if (u !== _meId()) notify(u, 'mention', 'Te mencionaron', body, { releaseId: c.releaseId, taskId: c.taskId }); });
  return c;
}

// ── Aprobaciones ──
function createApproval(scope, gate) {
  const ap = normalizeApproval(Object.assign({ gate }, scope || {}));
  approvals.push(ap); saveApprovals();
  logActivity('approval_request', 'Aprobación solicitada: ' + gate, { artistId: ap.artistId, releaseId: ap.releaseId, trackId: ap.trackId, taskId: ap.taskId });
  return ap;
}
function decideApproval(id, estado, note) {
  const ap = approvals.find(x => x.id === id); if (!ap) return null;
  ap.estado = estado; ap.decidedBy = _meId(); ap.decidedAt = new Date().toISOString(); if (note != null) ap.note = s(note);
  saveApprovals();
  logActivity(estado === 'aprobado' ? 'approved' : 'rejected', `Aprobación ${estado}: ${ap.gate}`, { artistId: ap.artistId, releaseId: ap.releaseId, trackId: ap.trackId });
  if (ap.requestedBy && ap.requestedBy !== _meId()) notify(ap.requestedBy, estado === 'aprobado' ? 'approved' : 'system', 'Aprobación ' + estado, ap.gate, { releaseId: ap.releaseId });
  // Automatización 8: calendario aprobado → crear tareas de publicación
  if (estado === 'aprobado' && ap.gate === 'calendario' && ap.releaseId && typeof onCalendarApproved === 'function') onCalendarApproved(ap.releaseId);
  return ap;
}

// ── Migración: tareas embebidas (release.tasks / track.tasks) → tabla tasks (idempotente) ──
function _mapOldEstado(e) { return e === 'hecho' ? 'completado' : (e === 'en_progreso' ? 'en_progreso' : 'pendiente'); }
function migrateEmbeddedTasks() {
  let changed = false;
  const have = new Set(tasks.map(t => t.id));
  (typeof launches !== 'undefined' ? launches : []).forEach(l => {
    (l.tasks || []).forEach(ot => {
      const id = 'TSK-' + (ot.id || _collabUid('x'));
      if (have.has(id)) return;
      tasks.push(normalizeTaskRow({ id, artistId: l.artistId, releaseId: l.id, titulo: ot.titulo, responsable: ot.responsable, dueDate: ot.dueDate, departamento: ot.capability || '', estado: _mapOldEstado(ot.estado), createdAt: ot.createdAt }));
      have.add(id); changed = true;
    });
  });
  (typeof tracks !== 'undefined' ? tracks : []).forEach(t => {
    const rel = (typeof launches !== 'undefined' ? launches : []).find(l => (l.tracklist || []).some(r => r.trackId === t.id));
    (t.tasks || []).forEach(ot => {
      const id = 'TSK-' + (ot.id || _collabUid('x'));
      if (have.has(id)) return;
      tasks.push(normalizeTaskRow({ id, artistId: t.artistId, releaseId: rel ? rel.id : null, trackId: t.id, titulo: ot.titulo, responsable: ot.responsable, dueDate: ot.dueDate, departamento: ot.capability || '', estado: _mapOldEstado(ot.estado), createdAt: ot.createdAt }));
      have.add(id); changed = true;
    });
  });
  if (changed) saveTasksLocal();
  return changed;
}

// ── Sync en nube (best-effort; no rompe si las tablas aún no existen) ──
function _taskToRow(t, now) { return { id: t.id, team_id: _teamIdOr(), artist_id: t.artistId, release_id: t.releaseId, track_id: t.trackId, assignee: t.responsable || null, departamento: t.departamento || null, estado: t.estado, priority: t.priority, due_date: t.dueDate || null, approval_id: t.approvalId, data: t, updated_at: now }; }
async function collabCloudSync(sb, now) {
  const tid = _teamIdOr();
  const sets = [
    ['tasks',         tasks.map(t => _taskToRow(t, now))],
    ['comments',      comments.map(c => ({ id: c.id, team_id: tid, artist_id: c.artistId, release_id: c.releaseId, track_id: c.trackId, task_id: c.taskId, canal: c.canal, author: c.author, body: c.body, mentions: c.mentions, created_at: c.createdAt }))],
    ['activity',      activity.map(a => ({ id: a.id, team_id: tid, artist_id: a.artistId, release_id: a.releaseId, track_id: a.trackId, task_id: a.taskId, actor: a.actor, verb: a.verb, summary: a.summary, meta: a.meta, created_at: a.createdAt }))],
    ['notifications', notifications.map(n => ({ id: n.id, team_id: tid, recipient: n.recipient, type: n.type, title: n.title, body: n.body, link: n.link, is_read: n.isRead, created_at: n.createdAt }))],
    ['approvals',     approvals.map(a => ({ id: a.id, team_id: tid, artist_id: a.artistId, release_id: a.releaseId, track_id: a.trackId, task_id: a.taskId, gate: a.gate, estado: a.estado, requested_by: a.requestedBy, decided_by: a.decidedBy, decided_at: a.decidedAt, note: a.note, data: a.data, created_at: a.createdAt }))],
  ];
  for (const [table, rows] of sets) {
    if (!rows.length) continue;
    try { await sb.from(table).upsert(rows); } catch (e) { /* tabla aún no creada → ignorar */ }
  }
}
async function collabCloudLoad(sb, tid) {
  try { const q = sb.from('tasks').select('data'); if (tid) q.eq('team_id', tid); const r = await q; if (!r.error) tasks = (r.data || []).map(x => normalizeTaskRow(x.data)); } catch (e) {}
  try { const q = sb.from('comments').select('*'); if (tid) q.eq('team_id', tid); const r = await q; if (!r.error) comments = (r.data || []).map(x => normalizeComment({ id: x.id, teamId: x.team_id, artistId: x.artist_id, releaseId: x.release_id, trackId: x.track_id, taskId: x.task_id, canal: x.canal, author: x.author, body: x.body, mentions: x.mentions, createdAt: x.created_at })); } catch (e) {}
  try { const q = sb.from('activity').select('*'); if (tid) q.eq('team_id', tid); q.order('created_at', { ascending: false }).limit(500); const r = await q; if (!r.error) activity = (r.data || []).map(x => normalizeActivity({ id: x.id, teamId: x.team_id, artistId: x.artist_id, releaseId: x.release_id, trackId: x.track_id, taskId: x.task_id, actor: x.actor, verb: x.verb, summary: x.summary, meta: x.meta, createdAt: x.created_at })); } catch (e) {}
  try { const q = sb.from('notifications').select('*'); if (tid) q.eq('team_id', tid); const r = await q; if (!r.error) notifications = (r.data || []).map(x => normalizeNotif({ id: x.id, teamId: x.team_id, recipient: x.recipient, type: x.type, title: x.title, body: x.body, link: x.link, isRead: x.is_read, createdAt: x.created_at })); } catch (e) {}
  try { const q = sb.from('approvals').select('*'); if (tid) q.eq('team_id', tid); const r = await q; if (!r.error) approvals = (r.data || []).map(x => normalizeApproval({ id: x.id, teamId: x.team_id, artistId: x.artist_id, releaseId: x.release_id, trackId: x.track_id, taskId: x.task_id, gate: x.gate, estado: x.estado, requestedBy: x.requested_by, decidedBy: x.decided_by, decidedAt: x.decided_at, note: x.note, data: x.data, createdAt: x.created_at })); } catch (e) {}
  saveTasksLocal(); saveCommentsLocal(); saveActivityLocal(); saveNotifsLocal(); saveApprovalsLocal();
}
