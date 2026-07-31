// ══════════════════════════════════════════
// ACCOUNTABILITY — Sprint 9 (UI sobre las tablas de collab.js)
// Aprobaciones por gate · comentarios con canales + @menciones · feed de actividad · notificaciones in-app.
// ══════════════════════════════════════════

function _ago(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime(); if (isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60); if (min < 60) return 'hace ' + min + ' min';
  const h = Math.floor(min / 60); if (h < 24) return 'hace ' + h + ' h';
  const d = Math.floor(h / 24); if (d < 30) return 'hace ' + d + ' d';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short' });
}
function _initials(x) { return up(s(x).replace(/@.*/, '')).slice(0, 2) || '?'; }

// ── Miembros del equipo (para @menciones / responsables) ──
function _members() { return (typeof _teamMembers !== 'undefined' && Array.isArray(_teamMembers)) ? _teamMembers : []; }
function _memberLabel(uid) { const m = _members().find(x => x.user_id === uid); return m ? (s(m.email) || uid) : uid; }

// ══════════════════════════════════════════
// NOTIFICACIONES (campana en el topbar)
// ══════════════════════════════════════════
function NOTIF_ICON_MAP() { return { assigned: 'person', due_soon: 'clock', overdue: 'warning', approval_request: 'bell', approved: 'check', comment: 'chat', mention: 'chat', system: 'info' }; }
function renderNotifBadge() {
  const dot = document.getElementById('notif-dot'); if (!dot) return;
  const n = (typeof unreadNotifCount === 'function') ? unreadNotifCount() : 0;
  if (n) { dot.textContent = n > 9 ? '9+' : n; dot.style.display = 'flex'; } else { dot.style.display = 'none'; }
}
function toggleNotifPanel(force) {
  const p = document.getElementById('notif-panel'); if (!p) return;
  const hidden = p.style.display === 'none' || p.style.display === ''; // '' = nunca abierto → tratar como cerrado
  const open = force != null ? force : hidden;
  if (open) {
    p.style.display = 'block'; // abrir PRIMERO: si el render falla, el panel igual se muestra (antes el orden inverso lo dejaba oculto)
    try { renderNotifPanel(); }
    catch (e) { console.error('notif render:', e); p.innerHTML = '<div class="notif-empty" style="padding:22px 15px">No se pudieron cargar las notificaciones.</div>'; }
    setTimeout(() => document.addEventListener('click', _notifOutside), 0);
  } else {
    p.style.display = 'none';
    document.removeEventListener('click', _notifOutside);
  }
}
function _notifOutside(e) { const w = e.target.closest('.notif-wrap'); if (!w) toggleNotifPanel(false); }
function renderNotifPanel() {
  const p = document.getElementById('notif-panel'); if (!p) return;
  const ICONS = NOTIF_ICON_MAP(); // mapa local (evita TDZ del const top-level)
  const list = (typeof myNotifications === 'function') ? myNotifications() : [];
  const unread = list.filter(n => !n.isRead).length;
  const rows = list.length ? list.slice(0, 40).map(n => `<div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="openNotif('${n.id}')">
      <div class="notif-ic">${icon(ICONS[n.type] || 'info', 15)}</div>
      <div style="flex:1;min-width:0"><div class="nt">${s(n.title)}</div>${n.body ? `<div class="nb">${s(n.body)}</div>` : ''}<div class="ntime">${_ago(n.createdAt)}</div></div>
    </div>`).join('') : `<div class="notif-empty">${icon('bell', 26)}<div style="margin-top:8px">Sin notificaciones</div></div>`;
  p.innerHTML = `<div class="notif-head"><span>Notificaciones</span>${unread ? `<button class="btn btn-ghost" style="margin-left:auto;padding:3px 8px;font-size:var(--text-2xs)" onclick="event.stopPropagation();markAllNotifsRead()">Marcar leídas</button>` : ''}</div>${rows}`;
  if (typeof hydrateIcons === 'function') hydrateIcons(p);
}
function openNotif(id) {
  if (typeof markNotifRead === 'function') markNotifRead(id);
  renderNotifBadge();
  const n = (typeof notifications !== 'undefined') ? notifications.find(x => x.id === id) : null;
  toggleNotifPanel(false);
  const link = n && n.link;
  if (link) {
    if (link.taskId && typeof openTaskContext === 'function') openTaskContext(link.taskId);
    else if (link.releaseId && typeof openLaunch === 'function') openLaunch(link.releaseId);
    else if (link.page && typeof showPage === 'function') showPage(link.page);
  }
}
function markAllNotifsRead() {
  (typeof myNotifications === 'function' ? myNotifications() : []).forEach(n => { n.isRead = true; });
  if (typeof saveNotifs === 'function') saveNotifs();
  renderNotifBadge(); renderNotifPanel();
}

// ══════════════════════════════════════════
// CONTACTOS / @menciones (nombre + correo)
// ══════════════════════════════════════════
// Mapa de nombres por equipo (correo→nombre), editable en "Mi equipo". Sin SQL nuevo.
function _nameMapKey() { return 'ao_member_names_' + ((typeof _teamId !== 'undefined' && _teamId) ? _teamId : 'local'); }
function _nameMap() { try { return JSON.parse(localStorage.getItem(_nameMapKey())) || {}; } catch (e) { return {}; } }
function setMemberName(email, name) { const m = _nameMap(); const k = s(email).toLowerCase(); if (s(name).trim()) m[k] = s(name).trim(); else delete m[k]; try { localStorage.setItem(_nameMapKey(), JSON.stringify(m)); } catch (e) {} }
function addContactName() {
  const ne = document.getElementById('contact-name'), ee = document.getElementById('contact-email');
  const name = ne ? ne.value.trim() : '', email = ee ? ee.value.trim() : '';
  if (!email || !/.+@.+\..+/.test(email)) { if (typeof uiAlert === 'function') uiAlert('Escribe un correo válido.'); return; }
  setMemberName(email, name || email);
  if (ne) ne.value = ''; if (ee) ee.value = '';
  if (typeof uiToast === 'function') uiToast('Contacto agregado para @menciones');
}
const DEMO_CONTACTS = [
  { id: 'josh@hookspa.com', name: 'Josh Josephs', email: 'josh@hookspa.com' },
  { id: 'info@geniosmusicales.com', name: 'Genios Musicales', email: 'info@geniosmusicales.com' },
  { id: 'ana@hookspa.com', name: 'Ana Torres', email: 'ana@hookspa.com' },
  { id: 'legal@hookspa.com', name: 'Carlos Ruiz (Legal)', email: 'legal@hookspa.com' },
];
// Contactos mencionables = miembros reales (con su nombre del mapa) ∪ nombres pre-registrados ∪ demo.
function mentionContacts() {
  const map = _nameMap(), byEmail = {};
  _members().forEach(m => { const e = s(m.email).toLowerCase(); if (!e) return; byEmail[e] = { id: m.user_id || s(m.email), name: map[e] || '', email: s(m.email) }; });
  Object.keys(map).forEach(e => { if (!byEmail[e]) byEmail[e] = { id: e, name: map[e], email: e }; });
  let out = Object.values(byEmail);
  if (!out.length) out = DEMO_CONTACTS.slice();
  return out;
}
function contactLabel(c) { return c.name || c.email; }
function contactById(id) { return mentionContacts().find(c => c.id === id || s(c.email).toLowerCase() === s(id).toLowerCase()) || null; }
// NOTA: se usa el `_esc` global (app.js) — NO redeclarar aquí. Tener `function _esc` acá colisionaba con
// el `const _esc` de app.js y abortaba la ejecución del cuerpo de este archivo (todos sus const quedaban en TDZ).

// ── Dropdown reusable de "Responsable" — mismas personas que @menciones (miembros del workspace ∪ contactos) ──
function assigneeOptionsHTML(selected) {
  const selv = s(selected);
  const labels = ((typeof mentionContacts === 'function') ? mentionContacts() : []).map(contactLabel).filter(Boolean);
  if (selv && !labels.some(l => l.toLowerCase() === selv.toLowerCase())) labels.unshift(selv); // conserva un valor viejo fuera de la lista
  const seen = {}, uniq = [];
  labels.forEach(l => { const k = l.toLowerCase(); if (!seen[k]) { seen[k] = 1; uniq.push(l); } });
  return `<option value="">— Sin asignar —</option>` + uniq.map(l => `<option value="${_esc(l)}" ${selv.toLowerCase() === l.toLowerCase() ? 'selected' : ''}>${_esc(l)}</option>`).join('');
}
function assigneeSelectHTML(selected, onchangeAttr, style) {
  return `<select class="input" style="${style || ''}" title="Responsable" ${onchangeAttr || ''}>${assigneeOptionsHTML(selected)}</select>`;
}

// ══════════════════════════════════════════
// COMENTARIOS (canales por área + @menciones inline)
// ══════════════════════════════════════════
let _cmtCanal = 'general';
function _renderMentions(body) {
  let html = _esc(body);
  // resalta @nombre / @correo de contactos conocidos (más largos primero), mostrando el nombre
  const cs = mentionContacts().slice().sort((a, b) => contactLabel(b).length - contactLabel(a).length);
  const done = new Set();
  cs.forEach(c => {
    [c.name, c.email].filter(Boolean).forEach(tok => {
      const key = tok.toLowerCase(); if (done.has('@' + key)) return; done.add('@' + key);
      const esc = _esc(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp('@' + esc + '(?![\\w@.\\-])', 'gi'), '<span class="mention">@' + _esc(contactLabel(c)) + '</span>');
    });
  });
  return html;
}
function commentsPanelHTML(scope) {
  const all = (typeof commentsOf === 'function') ? commentsOf(scope) : [];
  const list = all.filter(c => (c.canal || 'general') === _cmtCanal);
  const tabs = COMMENT_CANALES.map(([k, lbl]) => { const cnt = all.filter(c => (c.canal || 'general') === k).length; return `<div class="cmt-tab ${k === 'interno-privado' ? 'priv' : ''} ${_cmtCanal === k ? 'active' : ''}" onclick="setCmtCanal('${k}')">${lbl}${cnt ? ` · ${cnt}` : ''}</div>`; }).join('');
  const thread = list.length ? list.map(c => `<div class="cmt">
      <div class="cmt-av">${_initials(c.author)}</div>
      <div class="cmt-body"><div class="cmt-meta">${s(c.author)} · ${_ago(c.createdAt)}</div><div class="cmt-text">${_renderMentions(c.body)}</div></div>
    </div>`).join('') : `<div class="empty-hint">Sin comentarios en este canal.</div>`;
  const composer = canDo('gestionar_tareas') ? `<div class="cmt-compose">
      <textarea class="textarea" id="cmt-input" placeholder="Escribe un comentario… escribe @ para mencionar" style="min-height:60px" oninput="cmtInput()" onkeydown="cmtKeydown(event)" onblur="setTimeout(cmtCloseMention,150)"></textarea>
      <div class="mention-pop" id="mention-pop" style="display:none"></div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap"><span style="font-size:var(--text-2xs);color:var(--text-dim);font-family:var(--font-ui)">@ para mencionar (por nombre o correo)</span><button class="btn btn-primary" style="margin-left:auto" onclick="sendComment()">${icon('chat', 13)} Comentar${_cmtCanal === 'interno-privado' ? ' (privado)' : ''}</button></div>
    </div>` : '';
  return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('chat', 18)}</span><span class="ph-title">Comentarios</span><span class="ph-sub">canales por área + @menciones</span></div>
    <div class="cmt-tabs">${tabs}</div>${thread}${composer}</div>`;
}
function setCmtCanal(k) { _cmtCanal = k; if (currentLaunchId && typeof renderReleaseTab === 'function') renderReleaseTab('actividad'); }

// ── Autocompletado inline de @menciones ──
let _mtnItems = [], _mtnIdx = 0, _mtnStart = -1;
function _mtnQuery(ta) {
  const pos = ta.selectionStart;
  const pre = ta.value.slice(0, pos);
  const m = pre.match(/(?:^|\s)@([^\s@]*)$/);
  if (!m) return null;
  return { start: pos - m[1].length - 1, query: m[1] };
}
function cmtInput() {
  const ta = document.getElementById('cmt-input'); if (!ta) return;
  const q = _mtnQuery(ta);
  if (!q) { cmtCloseMention(); return; }
  const ql = q.query.toLowerCase();
  _mtnItems = mentionContacts().filter(c => !ql || s(c.name).toLowerCase().includes(ql) || s(c.email).toLowerCase().includes(ql)).slice(0, 8);
  _mtnStart = q.start; _mtnIdx = 0;
  _renderMentionPop(ta);
}
function _renderMentionPop(ta) {
  const pop = document.getElementById('mention-pop'); if (!pop) return;
  if (!_mtnItems.length) { cmtCloseMention(); return; }
  pop.innerHTML = _mtnItems.map((c, i) => `<div class="mention-opt ${i === _mtnIdx ? 'sel' : ''}" onmousedown="event.preventDefault();acceptMention(${i})">
      <div class="mav">${_initials(c.name || c.email)}</div>
      <div style="min-width:0"><div class="mn">${_esc(c.name || c.email)}</div>${c.name ? `<div class="me">${_esc(c.email)}</div>` : ''}</div>
    </div>`).join('');
  pop.style.left = '0px';
  pop.style.top = (ta.offsetTop + ta.offsetHeight + 4) + 'px';
  pop.style.display = 'block';
}
function cmtCloseMention() { const pop = document.getElementById('mention-pop'); if (pop) pop.style.display = 'none'; _mtnItems = []; _mtnStart = -1; }
function cmtKeydown(e) {
  const pop = document.getElementById('mention-pop');
  if (!pop || pop.style.display === 'none' || !_mtnItems.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); _mtnIdx = (_mtnIdx + 1) % _mtnItems.length; _renderMentionPop(document.getElementById('cmt-input')); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _mtnIdx = (_mtnIdx - 1 + _mtnItems.length) % _mtnItems.length; _renderMentionPop(document.getElementById('cmt-input')); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptMention(_mtnIdx); }
  else if (e.key === 'Escape') { e.preventDefault(); cmtCloseMention(); }
}
function acceptMention(i) {
  const ta = document.getElementById('cmt-input'); const c = _mtnItems[i]; if (!ta || !c || _mtnStart < 0) return;
  const pos = ta.selectionStart;
  const label = contactLabel(c);
  const before = ta.value.slice(0, _mtnStart);
  const after = ta.value.slice(pos);
  const insert = '@' + label + ' ';
  ta.value = before + insert + after;
  const caret = (before + insert).length;
  ta.focus(); ta.setSelectionRange(caret, caret);
  cmtCloseMention();
}
function _scopeOfCurrentRelease() { const l = launches.find(x => x.id === currentLaunchId); return l ? { artistId: l.artistId, releaseId: l.id, trackId: null, taskId: null } : null; }
function sendComment() {
  if (!requireCan('gestionar_tareas')) return;
  const ta = document.getElementById('cmt-input'); const body = ta ? ta.value.trim() : ''; if (!body) return;
  const scope = _scopeOfCurrentRelease(); if (!scope) return;
  // resolver @menciones: coincide por NOMBRE o por CORREO contra los contactos
  const lc = body.toLowerCase();
  const mentions = mentionContacts().filter(c =>
    (c.name && lc.includes('@' + s(c.name).toLowerCase())) || (c.email && lc.includes('@' + s(c.email).toLowerCase()))
  ).map(c => c.id);
  addComment(scope, _cmtCanal, body, [...new Set(mentions)]);
  if (typeof renderReleaseTab === 'function') renderReleaseTab('actividad');
  renderNotifBadge();
}

// ══════════════════════════════════════════
// FEED DE ACTIVIDAD
// ══════════════════════════════════════════
const ACT_ICON = { created: 'plus', status_changed: 'refresh', assigned: 'person', commented: 'chat', approved: 'check', rejected: 'close', approval_request: 'bell', deleted: 'trash', unblocked: 'check', template_applied: 'checklist', phase: 'flag', automation: 'zap', updated: 'pencil' };
function activityFeedHTML(scope) {
  const list = (typeof activityOf === 'function') ? activityOf(scope) : [];
  if (!list.length) return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('clock', 18)}</span><span class="ph-title">Actividad</span></div><div class="empty-hint">Sin actividad registrada todavía.</div></div>`;
  const rows = list.slice(0, 60).map(a => `<div class="act-row">
      <div class="act-ic">${icon(ACT_ICON[a.verb] || 'info', 14)}</div>
      <div style="flex:1;min-width:0"><div class="as">${s(a.summary)}</div><div class="am">${s(a.actor)} · ${_ago(a.createdAt)}</div></div>
    </div>`).join('');
  return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('clock', 18)}</span><span class="ph-title">Actividad</span><span class="ph-sub">${list.length} eventos</span></div>${rows}</div>`;
}

// Pestaña "Actividad" del release = comentarios + feed
function releaseActividadHTML(l) {
  const scope = { artistId: l.artistId, releaseId: l.id, trackId: null, taskId: null };
  return commentsPanelHTML(scope) + activityFeedHTML(scope);
}

// ══════════════════════════════════════════
// APROBACIONES (9 gates) — panel en el Resumen
// ══════════════════════════════════════════
const APR_ST_COLOR = { pendiente: 'var(--text-muted)', en_revision: 'var(--beat)', aprobado: '#4ade80', rechazado: 'var(--accent2)' };
function approvalsPanelHTML(l) {
  const aprs = (typeof approvalsOfRelease === 'function') ? approvalsOfRelease(l.id) : [];
  const latest = {}; aprs.forEach(a => { if (!latest[a.gate] || a.createdAt > latest[a.gate].createdAt) latest[a.gate] = a; });
  const canReq = canDo('gestionar_tareas'), canDec = canDo('aprobar_tareas');
  const rows = APPROVAL_GATES.map(([g, lbl]) => {
    const a = latest[g];
    const st = a ? a.estado : null;
    const stHTML = a ? `<span class="apr-st" style="background:${APR_ST_COLOR[st]}1f;color:${APR_ST_COLOR[st]}">${st.replace('_', ' ')}</span>` : `<span class="apr-st" style="background:var(--surface2);color:var(--text-dim)">sin solicitar</span>`;
    let actions = '';
    if (a && (st === 'pendiente' || st === 'en_revision') && canDec) actions = `<button class="btn btn-ghost" style="padding:3px 9px;font-size:var(--text-xs);color:#4ade80;border-color:rgba(74,222,128,.35)" onclick="decideApprovalUI('${a.id}','aprobado')">Aprobar</button><button class="btn btn-ghost" style="padding:3px 9px;font-size:var(--text-xs);color:var(--accent2)" onclick="decideApprovalUI('${a.id}','rechazado')">Rechazar</button>`;
    else if (!a && canReq) actions = `<button class="btn btn-ghost" style="padding:3px 9px;font-size:var(--text-xs)" onclick="requestApproval('${l.id}','${g}')">Solicitar</button>`;
    else if (a && (st === 'aprobado' || st === 'rechazado')) actions = `<span style="font-size:var(--text-2xs);color:var(--text-dim);font-family:var(--font-ui)">${a.decidedBy ? 'por ' + _memberLabel(a.decidedBy) : ''} ${_ago(a.decidedAt)}</span>${canReq ? `<button class="btn btn-ghost" style="padding:3px 8px;font-size:var(--text-2xs)" onclick="requestApproval('${l.id}','${g}')" title="Volver a solicitar">${icon('refresh', 11)}</button>` : ''}`;
    return `<div class="apr-row"><span class="apr-gate">${lbl}</span>${stHTML}<span style="margin-left:auto;display:flex;gap:6px;align-items:center">${actions}</span></div>`;
  }).join('');
  return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('check', 18)}</span><span class="ph-title">Aprobaciones</span><span class="ph-sub">propone → revisa → aprueba</span></div>${rows}</div>`;
}
function requestApproval(launchId, gate) {
  if (!requireCan('gestionar_tareas')) return;
  const l = launches.find(x => x.id === launchId); if (!l) return;
  const ap = createApproval({ artistId: l.artistId, releaseId: l.id, trackId: null }, gate);
  updateApprovalEstado(ap.id, 'en_revision');
  // notificar a quienes pueden aprobar (manager/owner) — en demo, al creador del release
  if (typeof renderReleaseTab === 'function') renderReleaseTab('resumen');
  renderNotifBadge();
  if (typeof uiToast === 'function') uiToast('Aprobación solicitada');
}
function updateApprovalEstado(id, estado) { const ap = approvals.find(x => x.id === id); if (ap) { ap.estado = estado; if (typeof saveApprovals === 'function') saveApprovals(); } }
async function decideApprovalUI(id, estado) {
  if (!requireCan('aprobar_tareas')) return;
  let note = '';
  if (estado === 'rechazado') { note = await uiPrompt('Motivo del rechazo (opcional):', { title: 'Rechazar aprobación' }) || ''; }
  decideApproval(id, estado, note);
  if (typeof renderReleaseTab === 'function') renderReleaseTab('resumen');
  renderNotifBadge();
  if (typeof uiToast === 'function') uiToast(estado === 'aprobado' ? 'Aprobado' : 'Rechazado');
}
