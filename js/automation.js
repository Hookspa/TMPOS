// ══════════════════════════════════════════
// OPERACIÓN VIVA — Sprint 8
// Templates de proyecto · dependencias/bloqueos · motor de automatizaciones (las 8).
// Opera sobre la tabla relacional `tasks` (collab.js).
// ══════════════════════════════════════════

// ── Utilidades de fecha ──
function _dateOffset(baseISO, days) {
  if (!baseISO) return '';
  const d = new Date(baseISO + 'T00:00:00'); if (isNaN(d)) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Templates de proyecto (4 tipos) — auto-generan tareas + esqueleto de calendario ──
// offset = días relativos a la fecha de drop (negativo = antes; 0 = día de salida; positivo = post).
const _T_BASE_TASKS = [
  { titulo: 'Aprobar arte de portada', departamento: 'creativo', priority: 'alta',    offset: -25 },
  { titulo: 'Recibir máster final (WAV)', departamento: 'audio',  priority: 'urgente', offset: -21 },
  { titulo: 'Firmar split sheet',        departamento: 'legal',    priority: 'urgente', offset: -18 },
  { titulo: 'Completar Label Copy',      departamento: 'legal',    priority: 'alta',    offset: -16 },
  { titulo: 'Definir presupuesto de campaña', departamento: 'admin', priority: 'media', offset: -20 },
  { titulo: 'Plan de contenido + calendario', departamento: 'marketing', priority: 'alta', offset: -18 },
  { titulo: 'Subir a distribución',      departamento: 'distrib',  priority: 'urgente', offset: -14, dependsOnDepto: 'legal' },
  { titulo: 'Pitch editorial a DSPs',    departamento: 'distrib',  priority: 'alta',    offset: -14 },
  { titulo: 'Activos de campaña listos', departamento: 'creativo', priority: 'media',   offset: -10 },
  { titulo: 'Programar día de lanzamiento', departamento: 'marketing', priority: 'alta', offset: -2 },
  { titulo: 'Reporte post-lanzamiento',  departamento: 'admin',    priority: 'media',   offset: 14 },
];
const _T_BASE_CAL = [
  { titulo: 'Teaser / anuncio',          cat: 'awareness',    offset: -10 },
  { titulo: 'Detrás de cámaras',         cat: 'bts',          offset: -7 },
  { titulo: 'Snippet del track',         cat: 'engagement',   offset: -3 },
  { titulo: 'Día de lanzamiento',        cat: 'storytelling', offset: 0 },
  { titulo: 'Reacción / agradecimiento', cat: 'engagement',   offset: 3 },
  { titulo: 'Visualizer / lyric',        cat: 'storytelling', offset: 7 },
];
const PROJECT_TEMPLATES = [
  { id: 'single', name: 'Single estándar', type: 'single', desc: 'Lanzamiento de un sencillo: ~11 tareas por área + 6 piezas de contenido.', tasks: _T_BASE_TASKS, calendar: _T_BASE_CAL },
  { id: 'ep', name: 'EP', type: 'ep', desc: 'Proyecto EP: tareas base + cohesión de tracklist y rollout escalonado.', tasks: _T_BASE_TASKS.concat([
      { titulo: 'Definir orden del tracklist', departamento: 'creativo', priority: 'alta', offset: -28 },
      { titulo: 'Plan de singles previos', departamento: 'marketing', priority: 'alta', offset: -35 },
    ]), calendar: _T_BASE_CAL.concat([{ titulo: 'Tracklist reveal', cat: 'awareness', offset: -14 }]) },
  { id: 'album', name: 'Álbum', type: 'album', desc: 'Proyecto álbum: rollout largo, prensa y eje narrativo.', tasks: _T_BASE_TASKS.concat([
      { titulo: 'Definir orden del tracklist', departamento: 'creativo', priority: 'alta', offset: -45 },
      { titulo: 'Plan de singles previos', departamento: 'marketing', priority: 'alta', offset: -60 },
      { titulo: 'Plan de prensa / PR', departamento: 'marketing', priority: 'media', offset: -30 },
      { titulo: 'Eje narrativo del álbum (ADN)', departamento: 'creativo', priority: 'alta', offset: -50 },
    ]), calendar: _T_BASE_CAL.concat([
      { titulo: 'Tracklist reveal', cat: 'awareness', offset: -21 },
      { titulo: 'Album trailer', cat: 'storytelling', offset: -14 },
    ]) },
  { id: 'express', name: 'Sencillo express', type: 'single', desc: 'Lanzamiento rápido: lo esencial (cover, máster, legal, distribución, día D).', tasks: [
      { titulo: 'Aprobar arte de portada', departamento: 'creativo', priority: 'alta', offset: -10 },
      { titulo: 'Recibir máster final (WAV)', departamento: 'audio', priority: 'urgente', offset: -9 },
      { titulo: 'Firmar split sheet', departamento: 'legal', priority: 'urgente', offset: -8 },
      { titulo: 'Subir a distribución', departamento: 'distrib', priority: 'urgente', offset: -7, dependsOnDepto: 'legal' },
      { titulo: 'Programar día de lanzamiento', departamento: 'marketing', priority: 'alta', offset: -1 },
    ], calendar: [
      { titulo: 'Snippet del track', cat: 'engagement', offset: -2 },
      { titulo: 'Día de lanzamiento', cat: 'storytelling', offset: 0 },
    ] },
];
function templateById(id) { return PROJECT_TEMPLATES.find(t => t.id === id); }

// Aplica un template a un release: crea tareas (con dueDate relativa) + piezas de calendario.
function applyProjectTemplate(launchId, templateId, opts) {
  opts = opts || {};
  const l = (typeof launches !== 'undefined') ? launches.find(x => x.id === launchId) : null;
  const tpl = templateById(templateId); if (!l || !tpl) return 0;
  let created = 0;
  // 1) tareas — con dependencias por departamento (distribución depende de legal)
  if (opts.tasks !== false) {
    const made = {}; // departamento -> [taskIds] para resolver deps
    tpl.tasks.forEach(tt => {
      const t = createTask({ artistId: l.artistId, releaseId: l.id, trackId: null }, {
        titulo: tt.titulo, departamento: tt.departamento, priority: tt.priority,
        dueDate: _dateOffset(l.date, tt.offset),
      });
      (made[tt.departamento] = made[tt.departamento] || []).push(t.id);
      created++;
    });
    // resolver dependencias declaradas (dependsOnDepto)
    tpl.tasks.forEach(tt => {
      if (!tt.dependsOnDepto) return;
      const deps = made[tt.dependsOnDepto] || [];
      if (!deps.length) return;
      const mine = (made[tt.departamento] || []);
      mine.forEach(id => { const t = taskById(id); if (t && t.titulo === tt.titulo) { updateTaskRow(id, { deps: deps.slice() }); if (deps.some(d => { const dt = taskById(d); return dt && dt.estado !== TASK_DONE; })) updateTaskRow(id, { estado: 'bloqueado' }); } });
    });
  }
  // 2) calendario (esqueleto de contenido)
  if (opts.calendar !== false && l.date) {
    l.cal = Array.isArray(l.cal) ? l.cal : [];
    tpl.calendar.forEach(cc => {
      l.cal.push({ id: 'cal-' + Date.now() + '-' + Math.floor(Math.random() * 9999), fecha: _dateOffset(l.date, cc.offset), title: cc.titulo, cat: cc.cat, production: { estado: 'pendiente' } });
    });
    if (typeof saveLaunches === 'function') saveLaunches();
  }
  l.templateApplied = templateId; if (typeof saveLaunches === 'function') saveLaunches();
  if (typeof logActivity === 'function') logActivity('template_applied', `Plantilla "${tpl.name}" aplicada: ${created} tareas`, { artistId: l.artistId, releaseId: l.id });
  return created;
}

// ── Modal genérico (overlay) reutilizable para pickers de Sprint 8 ──
function _autoModal(title, bodyHTML, footHTML) {
  closeAutoModal();
  const ov = document.createElement('div');
  ov.id = 'auto-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick = e => { if (e.target === ov) closeAutoModal(); };
  ov.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;max-width:560px;width:100%;max-height:86vh;overflow:auto;box-shadow:0 20px 60px var(--shadow)">
    <div style="display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border)"><span style="font-family:var(--font-ui);font-weight:var(--fw-title);font-size:var(--text-lg);letter-spacing:var(--track-caps-sm);flex:1">${title}</span><button class="boxdrop-close" onclick="closeAutoModal()" style="background:none;border:none;cursor:pointer;color:var(--text-muted)">${icon('close',16)}</button></div>
    <div style="padding:18px">${bodyHTML}</div>
    ${footHTML ? `<div style="padding:14px 18px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end">${footHTML}</div>` : ''}
  </div>`;
  document.body.appendChild(ov);
}
function closeAutoModal() { const el = document.getElementById('auto-modal'); if (el) el.remove(); }

// ── Picker de templates (desde Resumen del release) ──
function openTemplatePicker(launchId) {
  if (!requireCan('gestionar_tareas')) return;
  const l = launches.find(x => x.id === launchId); if (!l) return;
  const cards = PROJECT_TEMPLATES.map(t => `<label style="display:block;border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer">
      <div style="display:flex;align-items:center;gap:10px"><input type="radio" name="tpl" value="${t.id}" ${t.id === (l.type || 'single') ? 'checked' : ''}><strong style="font-size:var(--text-base)">${t.name}</strong><span style="margin-left:auto;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">${t.tasks.length} tareas · ${t.calendar.length} piezas</span></div>
      <div style="font-size:var(--text-sm);color:var(--text-muted);margin-top:5px;margin-left:24px">${t.desc}</div>
    </label>`).join('');
  const warn = l.templateApplied ? `<div class="empty-hint" style="margin-bottom:12px;border-color:var(--beat);color:var(--text-muted)">${icon('warning',13)} Ya aplicaste una plantilla a este release. Aplicar otra <b>agrega</b> tareas/piezas (no reemplaza).</div>` : '';
  const noDate = !l.date ? `<div class="empty-hint" style="margin-bottom:12px">Sin fecha de lanzamiento: las tareas se crean sin fecha límite (puedes editarlas luego).</div>` : '';
  _autoModal('Aplicar plantilla de proyecto', `${warn}${noDate}<div style="margin-bottom:6px;font-size:var(--text-sm);color:var(--text-muted)">Genera tareas por área (con fechas relativas al drop) + un esqueleto de calendario de contenido.</div>${cards}`,
    `<button class="btn btn-ghost" onclick="closeAutoModal()">Cancelar</button><button class="btn btn-primary" onclick="confirmApplyTemplate('${launchId}')">Aplicar plantilla</button>`);
}
function confirmApplyTemplate(launchId) {
  const sel = document.querySelector('#auto-modal input[name=tpl]:checked'); const id = sel && sel.value; if (!id) return;
  const n = applyProjectTemplate(launchId, id);
  closeAutoModal();
  if (typeof uiToast === 'function') uiToast(`Plantilla aplicada · ${n} tareas creadas`);
  if (typeof renderReleaseTab === 'function') renderReleaseTab('resumen');
  if (typeof updateTaskBadge === 'function') updateTaskBadge();
  runAutomations();
}

// ── Dependencias / bloqueos ──
function taskIsBlocked(t) {
  if (!t || !Array.isArray(t.deps) || !t.deps.length) return false;
  return t.deps.some(id => { const d = taskById(id); return d && d.estado !== TASK_DONE && d.estado !== 'aprobado'; });
}
function blockedReason(t) {
  if (!t || !Array.isArray(t.deps)) return '';
  const pend = t.deps.map(id => taskById(id)).filter(d => d && d.estado !== TASK_DONE && d.estado !== 'aprobado');
  return pend.length ? 'Bloqueada por: ' + pend.map(d => s(d.titulo)).join(', ') : '';
}
// Editor de dependencias (modal con checkboxes de tareas hermanas del mismo release)
function openDepsPicker(taskId) {
  if (!requireCan('gestionar_tareas')) return;
  const t = taskById(taskId); if (!t) return;
  const sibs = tasks.filter(x => x.id !== t.id && x.releaseId === t.releaseId);
  if (!sibs.length) { if (typeof uiAlert === 'function') uiAlert('No hay otras tareas en este release para depender de ellas.'); return; }
  const rows = sibs.map(x => `<label style="display:flex;align-items:center;gap:9px;padding:8px 4px;border-bottom:1px solid var(--hairline);cursor:pointer">
      <input type="checkbox" value="${x.id}" ${(t.deps || []).includes(x.id) ? 'checked' : ''}>
      <span style="flex:1;font-size:var(--text-base)">${s(x.titulo)}</span>
      <span style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">${x.estado}</span>
    </label>`).join('');
  _autoModal('Dependencias de: ' + s(t.titulo), `<div style="margin-bottom:8px;font-size:var(--text-sm);color:var(--text-muted)">Esta tarea queda <b>bloqueada</b> hasta que se completen las que marques. Se desbloquea sola cuando todas estén listas.</div>${rows}`,
    `<button class="btn btn-ghost" onclick="closeAutoModal()">Cancelar</button><button class="btn btn-primary" onclick="saveDepsPicker('${taskId}')">Guardar</button>`);
}
function saveDepsPicker(taskId) {
  const deps = [...document.querySelectorAll('#auto-modal input[type=checkbox]:checked')].map(c => c.value);
  const t = taskById(taskId); if (!t) return;
  const patch = { deps };
  // si quedó con deps pendientes, marcar bloqueado; si no, y estaba bloqueado por deps, liberar a pendiente
  const blocked = deps.some(id => { const d = taskById(id); return d && d.estado !== TASK_DONE && d.estado !== 'aprobado'; });
  if (blocked) patch.estado = 'bloqueado';
  else if (t.estado === 'bloqueado') patch.estado = 'pendiente';
  updateTaskRow(taskId, patch);
  closeAutoModal();
  if (typeof _taskRerender === 'function') { try { _taskRerender(t.trackId ? 'track' : 'release'); } catch (e) {} }
  if (typeof tvRenderBody === 'function' && document.getElementById('page-tareas') && document.getElementById('page-tareas').classList.contains('active')) tvRenderBody();
  if (typeof uiToast === 'function') uiToast('Dependencias actualizadas');
}

// ══════════════════════════════════════════
// MOTOR DE AUTOMATIZACIONES (las 8)
//  1. crear release → checklist+tareas   ........ applyProjectTemplate (wizard/manual)
//  2. asignar → notificación             ........ createTask/updateTaskRow (collab.js)
//  3. vence en 24h → recordatorio        ........ aquí (due_soon)
//  4. atrasada → avisar al manager       ........ aquí (overdue → createdBy)
//  5. legal completo → desbloquear distrib ...... aquí (+ auto-unblock por deps)
//  6. publicado → activar fase post      ........ aquí (released → notifica)
//  7. campaña completa → activar reporte ........ aquí (crea tarea de reporte)
//  8. calendario aprobado → tareas publicación .. decideApproval(gate=calendario) (hook abajo)
// ══════════════════════════════════════════
let _autoRunning = false;
function _notifOnce(id, recipient, type, title, body, link) {
  if (!recipient) return;
  if (notifications.some(n => n.id === id)) return;
  const n = normalizeNotif({ id, recipient, type, title, body, link: link || null });
  notifications.push(n);
}
function runAutomations() {
  if (_autoRunning) return; _autoRunning = true;
  try {
    let changed = false, notifChanged = false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dstr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const ls = (typeof launches !== 'undefined') ? launches : [];

    // Por tarea: recordatorios (3), atrasadas (4), auto-unblock (deps / 5)
    tasks.forEach(t => {
      const done = t.estado === TASK_DONE || t.estado === 'aprobado';
      if (!done && t.dueDate && typeof diasRestantes === 'function') {
        const dr = diasRestantes(t.dueDate);
        if (dr >= 0 && dr <= 1 && t.responsable) _notifOnce('NTF-due-' + t.id + '-' + dstr, t.responsable, 'due_soon', dr === 0 ? 'Vence hoy' : 'Vence mañana', t.titulo, { taskId: t.id, releaseId: t.releaseId }) || (notifChanged = true);
        if (dr < 0 && t.createdBy) _notifOnce('NTF-over-' + t.id + '-' + dstr, t.createdBy, 'overdue', 'Tarea atrasada', `${t.titulo} (${Math.abs(dr)}d)`, { taskId: t.id, releaseId: t.releaseId }) || (notifChanged = true);
      }
      // auto-unblock: bloqueada con deps y todas completas → pendiente
      if (t.estado === 'bloqueado' && Array.isArray(t.deps) && t.deps.length && !taskIsBlocked(t)) {
        t.estado = 'pendiente'; t.updatedAt = new Date().toISOString(); changed = true;
        if (typeof logActivity === 'function') logActivity('unblocked', 'Desbloqueada (deps listas): ' + t.titulo, { artistId: t.artistId, releaseId: t.releaseId, taskId: t.id });
        if (t.responsable) _notifOnce('NTF-unblock-' + t.id + '-' + dstr, t.responsable, 'system', 'Tarea desbloqueada', t.titulo, { taskId: t.id, releaseId: t.releaseId });
      }
    });

    // Por release: legal→distrib (5), publicado→post (6), campaña→reporte (7)
    ls.forEach(l => {
      const trks = (typeof tracksOfLaunch === 'function') ? tracksOfLaunch(l) : [];
      const legalOK = trks.length && trks.every(tk => { const lg = (tk.checklist && tk.checklist.legal) || {}; return lg.splitFirmado && lg.labelCopyCompleto; });
      // 5) legal completo → desbloquear tareas de distribución bloqueadas
      if (legalOK) {
        tasks.filter(t => t.releaseId === l.id && t.departamento === 'distrib' && t.estado === 'bloqueado').forEach(t => {
          t.estado = 'pendiente'; t.updatedAt = new Date().toISOString(); changed = true;
          if (typeof logActivity === 'function') logActivity('unblocked', 'Legal completo → distribución desbloqueada: ' + t.titulo, { artistId: l.artistId, releaseId: l.id, taskId: t.id });
        });
      }
      const dleft = (l.date && typeof diasRestantes === 'function') ? diasRestantes(l.date) : null;
      const released = l.status === 'complete' || (dleft != null && dleft < 0 && l.status !== 'cerrado');
      // 6) publicado → activar fase post (aviso una vez)
      if (released && !l._postNotified) { l._postNotified = true; changed = true;
        if (typeof logActivity === 'function') logActivity('phase', 'Fase post activada: ' + s(l.name), { artistId: l.artistId, releaseId: l.id });
      }
      // 7) campaña completa → activar reporte (crea tarea si no existe)
      if (released) {
        const cal = l.cal || [];
        const pendingContent = cal.filter(ci => (ci.production && ci.production.estado) !== 'publicado').length;
        const hasReporte = tasks.some(t => t.releaseId === l.id && /report/i.test(t.titulo));
        if ((!cal.length || pendingContent === 0) && !hasReporte && !l._reporteSpawned) {
          l._reporteSpawned = true; changed = true;
          createTask({ artistId: l.artistId, releaseId: l.id, trackId: null }, { titulo: 'Generar reporte de lanzamiento', departamento: 'admin', priority: 'alta', dueDate: _dateOffset(l.date, 7) });
        }
      }
    });

    if (changed) { saveTasksLocal(); if (typeof saveLaunchesLocal === 'function') saveLaunchesLocal(); }
    if (changed || notifChanged) { saveNotifsLocal(); if (typeof updateTaskBadge === 'function') updateTaskBadge(); if (typeof renderNotifBadge === 'function') renderNotifBadge(); }
    if (changed && typeof scheduleCloudSync === 'function') scheduleCloudSync();
  } finally { _autoRunning = false; }
}

// 8) calendario aprobado → crear tareas de publicación (hook sobre approvals)
function onCalendarApproved(launchId) {
  const l = (typeof launches !== 'undefined') ? launches.find(x => x.id === launchId) : null; if (!l) return 0;
  let n = 0;
  (l.cal || []).forEach(ci => {
    const tit = 'Publicar: ' + s(ci.title);
    if (tasks.some(t => t.releaseId === l.id && t.titulo === tit)) return;
    createTask({ artistId: l.artistId, releaseId: l.id, trackId: null }, { titulo: tit, departamento: 'marketing', priority: 'media', dueDate: ci.fecha || '' });
    n++;
  });
  if (n && typeof logActivity === 'function') logActivity('automation', `Calendario aprobado → ${n} tareas de publicación`, { artistId: l.artistId, releaseId: l.id });
  return n;
}
