// ══════════════════════════════════════════
// FICHA DE TRACK (dentro del release — pestañas) — Sprint 1
// ══════════════════════════════════════════
let currentTrackId = null, _trackTab = 'checklist';
function curTrack() { return tracks.find(x => x.id === currentTrackId); }
function openTrack(id) {
  if (typeof navRecord === 'function') navRecord(); // graba la vista del release antes de entrar al track
  currentTrackId = id; _trackTab = 'checklist';
  if (typeof _viewingTrack !== 'undefined') _viewingTrack = true;
  renderTrackDetail();
  const c = document.querySelector('.content'); if (c) c.scrollTop = 0;
  if (typeof updateBackBtn === 'function') updateBackBtn();
}
function backToRelease() {
  currentTrackId = null;
  if (typeof _viewingTrack !== 'undefined') _viewingTrack = false;
  renderLaunchDetail();
  if (typeof updateBackBtn === 'function') updateBackBtn();
}
function setTrackField(path, val, cap) { if (cap && !requireCan(cap)) return; const t = curTrack(); if (!t) return; setPath(t, path, val); saveTracks(); }

function renderTrackDetail() {
  const t = curTrack(), l = launches.find(x => x.id === currentLaunchId);
  const host = document.getElementById('launch-detail'); if (!t || !host) return;
  const rd = trackReady(t), pct = rd.total ? Math.round(rd.done / rd.total * 100) : 0;
  const phase = trackPhase(t);
  const TABS = [['checklist','Checklist'],['audio','Audio'],['labelcopy','Label Copy'],['legal','Legal'],['tareas','Tareas']];
  host.innerHTML = `
    <div style="margin-bottom:16px"><span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);cursor:pointer" onclick="backToRelease()">← ${s(l ? l.name : 'Release')}</span></div>
    <div class="panel" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-family:var(--font-display);font-size:30px;letter-spacing:1px">${s(t.title) || '(sin título)'}</div>
        <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:4px">${t.version ? s(t.version) + ' · ' : ''}ISRC ${s(t.isrc) || '— por asignar'}</div>
        <div style="margin-top:10px"><span class="chip on" style="cursor:default;color:${phaseColor(phase)}">${phase}</span></div>
      </div>
      <div style="min-width:220px;flex:1">${readyBarHTML(pct, 'LISTO PARA LANZAR · TRACK')}<div style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono);margin-top:6px">${rd.done}/${rd.total} ítems del checklist</div></div>
    </div>
    <div class="mtabs" id="track-tabbar" style="margin-bottom:16px;flex-wrap:wrap">${TABS.map(x => `<div class="mtab ${x[0] === _trackTab ? 'active' : ''}" data-ttab="${x[0]}" onclick="setTrackTab('${x[0]}')">${x[1]}</div>`).join('')}</div>
    <div id="track-tab-body"></div>`;
  renderTrackTab(_trackTab);
}
function setTrackTab(name) { _trackTab = name; document.querySelectorAll('#track-tabbar .mtab').forEach(b => b.classList.toggle('active', b.dataset.ttab === name)); renderTrackTab(name); }
function renderTrackTab(name) {
  const t = curTrack(); const host = document.getElementById('track-tab-body'); if (!t || !host) return;
  if (name === 'checklist') host.innerHTML = trackChecklistHTML(t);
  else if (name === 'audio') host.innerHTML = trackAudioHTML(t);
  else if (name === 'labelcopy') host.innerHTML = trackLabelCopyHTML(t);
  else if (name === 'legal') host.innerHTML = trackLegalHTML(t);
  else if (name === 'tareas') host.innerHTML = trackTareasHTML(t);
}

// ── Checklist (editable + templates propios) ──
const CHECKLIST_GROUP_ORDER = ['audio', 'legal', 'distrib', 'otros'];
function trackChecklistHTML(t) {
  const def = trackChecklistDef(t), c = t.checklist || {};
  const editable = canDo('editar_crm');
  const custom = !!t.checklistDef;
  const tpls = getChecklistTemplates();
  // toolbar de templates
  const toolbar = `<div class="panel" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted)">Plantilla:</span>
    <select class="input" style="width:auto;padding:5px 8px;font-size:12px" onchange="if(this.value)applyChecklistTemplate(this.value)">
      <option value="">${custom ? 'Personalizada' : 'Por defecto'}…</option>
      <option value="__default">↺ Restablecer al default</option>
      ${tpls.map(tp => `<option value="${tp.id}">${s(tp.name)}</option>`).join('')}
    </select>
    ${editable ? `<button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="saveChecklistAsTemplate()">${icon('save',13)} Guardar como plantilla…</button>` : ''}
    <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px" onclick="abrirTemplatesPanel()">${icon('checklist',13)} Gestionar</button>
    <span style="margin-left:auto;font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">${custom ? 'checklist propio de este track' : 'usando el checklist por defecto'}</span>
  </div>`;
  const groups = CHECKLIST_GROUP_ORDER.filter(g => def[g] && def[g].length).map(g => `
    <div class="panel"><div class="panel-head"><span class="ph-title">${CHECKLIST_GROUP_LABEL[g] || g}</span>${editable ? `<button class="btn btn-ghost" style="margin-left:auto;font-size:11px;padding:3px 9px" onclick="addChecklistItem('${g}')">+ ítem</button>` : ''}</div>
      <div style="display:flex;flex-direction:column">
        ${def[g].map(([k, label]) => { const on = !!(c[g] && c[g][k]); return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;flex:1"><input type="checkbox" ${on ? 'checked' : ''} onchange="toggleTrackCheck('${g}','${k}')"> ${s(label)}</label>
          ${editable ? `<button class="goal-btn reject" title="Quitar ítem" onclick="removeChecklistItem('${g}','${k}')">${icon('close',12)}</button>` : ''}
        </div>`; }).join('')}
      </div></div>`).join('');
  const addGroup = editable ? `<button class="btn btn-ghost" style="font-size:12px" onclick="addChecklistItem('otros')">+ Otra tarea</button>` : '';
  return toolbar + groups + addGroup;
}
function toggleTrackCheck(g, k) {
  if (!requireCan('editar_crm')) return;
  const t = curTrack(); if (!t) return;
  t.checklist = t.checklist || {}; t.checklist[g] = t.checklist[g] || {};
  t.checklist[g][k] = !t.checklist[g][k];
  saveTracks(); renderTrackDetail(); // recalcula fase + barra
  if (typeof runAutomations === 'function') runAutomations(); // legal completo → desbloquear distribución
}
// Materializa la definición propia del track (para editar sin tocar la default)
function ensureTrackDef(t) { if (!t.checklistDef) t.checklistDef = cloneDef(trackChecklistDef(t)); t.checklistDef.otros = t.checklistDef.otros || []; return t.checklistDef; }
async function addChecklistItem(group) {
  if (!requireCan('editar_crm')) return;
  const t = curTrack(); if (!t) return;
  const label = (await uiPrompt('Nombre de la tarea/ítem del checklist:', { title: 'Nuevo ítem de checklist' }) || '').trim();
  if (!label) return;
  const def = ensureTrackDef(t); def[group] = def[group] || [];
  def[group].push([checklistSlug(label), label]);
  saveTracks(); renderTrackTab('checklist');
}
function removeChecklistItem(group, key) {
  if (!requireCan('editar_crm')) return;
  const t = curTrack(); if (!t) return;
  const def = ensureTrackDef(t);
  if (def[group]) def[group] = def[group].filter(it => it[0] !== key);
  if (t.checklist && t.checklist[group]) delete t.checklist[group][key]; // limpiar estado
  saveTracks(); renderTrackDetail();
}
function applyChecklistTemplate(id) {
  const t = curTrack(); if (!t) return;
  if (!requireCan('editar_crm')) return;
  if (id === '__default') { t.checklistDef = null; saveTracks(); renderTrackDetail(); return; }
  const tp = getChecklistTemplates().find(x => x.id === id);
  if (tp) { t.checklistDef = cloneDef(tp.def); saveTracks(); renderTrackDetail(); uiToast('✓ Plantilla aplicada'); }
}
async function saveChecklistAsTemplate() {
  if (!requireCan('editar_crm')) return;
  const t = curTrack(); if (!t) return;
  const name = (await uiPrompt('Nombre de la plantilla (para reusarla en otros lanzamientos):', { title: 'Guardar plantilla' }) || '').trim();
  if (!name) return;
  const tpls = getChecklistTemplates();
  const existing = tpls.find(x => x.name.toLowerCase() === name.toLowerCase());
  const def = cloneDef(trackChecklistDef(t));
  if (existing) existing.def = def; else tpls.push({ id: 'tpl-' + Date.now(), name, def });
  setChecklistTemplates(tpls);
  renderTrackTab('checklist'); uiToast('✓ Plantilla guardada · disponible para tu equipo');
}
// ── Panel de gestión de plantillas (aplicar · duplicar · renombrar · eliminar) ──
function abrirTemplatesPanel() { renderTemplatesPanel(); document.getElementById('modal-templates').classList.add('open'); }
function cerrarTemplates(e) { if (!e || e.target === document.getElementById('modal-templates')) document.getElementById('modal-templates').classList.remove('open'); }
function _tplItemCount(def) { return Object.keys(def || {}).reduce((a, g) => a + ((def[g] || []).length), 0); }
function renderTemplatesPanel() {
  const tpls = getChecklistTemplates();
  const hasTrack = !!curTrack();
  const rows = tpls.map(tp => `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="flex:1;min-width:140px"><div style="font-size:13px;font-weight:600">${s(tp.name)}</div><div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${_tplItemCount(tp.def)} ítems</div></div>
      ${hasTrack ? `<button class="btn btn-ghost" style="padding:4px 9px;font-size:11px" onclick="aplicarTemplateDesdePanel('${tp.id}')">Aplicar</button>` : ''}
      <button class="btn btn-ghost" style="padding:4px 9px;font-size:11px" onclick="dupTemplate('${tp.id}')">Duplicar</button>
      <button class="btn btn-ghost" style="padding:4px 9px;font-size:11px" onclick="renameTemplate('${tp.id}')">Renombrar</button>
      <button class="btn btn-ghost" style="padding:4px 9px;font-size:11px;color:var(--accent2);border-color:rgba(255,77,77,.3)" onclick="deleteTemplate('${tp.id}')">Eliminar</button>
    </div>`).join('');
  document.getElementById('templates-body').innerHTML = `
    <div class="empty-hint" style="margin-bottom:14px">Flujos de checklist reutilizables de tu equipo. Crea uno nuevo desde el checklist de un track con <b style="color:var(--text-muted)">"Guardar como plantilla"</b>.</div>
    ${rows || '<div class="empty-hint">Aún no hay plantillas guardadas.</div>'}`;
}
function aplicarTemplateDesdePanel(id) { applyChecklistTemplate(id); cerrarTemplates(); }
async function dupTemplate(id) {
  if (!requireCan('editar_crm')) return;
  const tpls = getChecklistTemplates(); const tp = tpls.find(x => x.id === id); if (!tp) return;
  const name = (await uiPrompt('Nombre de la copia:', { title: 'Duplicar plantilla', def: tp.name + ' (copia)' }) || '').trim(); if (!name) return;
  tpls.push({ id: 'tpl-' + Date.now(), name, def: cloneDef(tp.def) }); setChecklistTemplates(tpls); renderTemplatesPanel(); uiToast('✓ Plantilla duplicada');
}
async function renameTemplate(id) {
  if (!requireCan('editar_crm')) return;
  const tpls = getChecklistTemplates(); const tp = tpls.find(x => x.id === id); if (!tp) return;
  const name = (await uiPrompt('Nuevo nombre:', { title: 'Renombrar plantilla', def: tp.name }) || '').trim(); if (!name) return;
  tp.name = name; setChecklistTemplates(tpls); renderTemplatesPanel();
}
async function deleteTemplate(id) {
  if (!requireCan('editar_crm')) return;
  if (!await uiConfirm('¿Eliminar esta plantilla? No afecta los checklists ya aplicados.', { danger: true, okText: 'Eliminar' })) return;
  setChecklistTemplates(getChecklistTemplates().filter(x => x.id !== id)); renderTemplatesPanel(); uiToast('✓ Plantilla eliminada');
}

// ── Audio ──
function trackAudioHTML(t) {
  const f = (label, path, val, ph) => `<div class="field" style="margin-bottom:12px"><label>${label}</label><input class="input" value="${s(val)}" placeholder="${ph || ''}" onchange="setTrackField('${path}',this.value,'editar_audio')"></div>`;
  return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('headphones',18)}</span><span class="ph-title">Audio & metadata</span></div>
    ${f('Título', 'title', t.title)}
    ${f('Versión', 'version', t.version, 'Remix, Acoustic, Sped Up…')}
    ${f('ISRC', 'isrc', t.isrc, 'MX-XXX-YY-NNNNN')}
    ${f('Link de referencia', 'links.reference', (t.links || {}).reference, 'Drive / Dropbox / WeTransfer')}
    ${f('Link de mezcla', 'links.mix', (t.links || {}).mix)}
    ${f('Link de máster', 'links.master', (t.links || {}).master)}
    ${f('Idioma', 'meta.language', (t.meta || {}).language)}
    ${f('Explícito (sí/no)', 'meta.explicit', (t.meta || {}).explicit)}
  </div>`;
}

// ── Label Copy (documento madre) ──
function trackLabelCopyHTML(t) {
  const lc = t.labelCopy || {};
  const f = (label, path, val) => `<div class="field" style="margin-bottom:12px"><label>${label}</label><input class="input" value="${s(val)}" onchange="setTrackField('${path}',this.value,'editar_labelcopy')"></div>`;
  return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('file',18)}</span><span class="ph-title">Label Copy</span><span class="ph-sub">documento madre</span></div>
    ${f('Artista principal', 'credits.mainArtist', (t.credits || {}).mainArtist)}
    ${f('Sello', 'labelCopy.label', lc.label)}
    ${f('Distribuidora', 'labelCopy.distributor', lc.distributor)}
    ${f('Género', 'labelCopy.genre', lc.genre)}
    ${f('Dueño del máster', 'master.owner', (t.master || {}).owner)}
    ${f('% máster', 'master.ownerSplit', (t.master || {}).ownerSplit)}
    ${f('Editorial (publisher)', 'publishing.publisher', (t.publishing || {}).publisher)}
    ${f('Sociedad de gestión (PRO)', 'publishing.pro', (t.publishing || {}).pro)}
    <div class="field"><label>Notas</label><textarea class="textarea" onchange="setTrackField('labelCopy.notes',this.value,'editar_labelcopy')">${s(lc.notes)}</textarea></div>
  </div>
  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('mic',18)}</span><span class="ph-title">Créditos</span></div>
    ${trackListField(t, 'credits.featured',  [['name','Artista feat.'],['role','Rol']],     'Artistas invitados (feat.)', 'feat')}
    ${trackListField(t, 'credits.producers', [['name','Productor'],['contact','Contacto']],  'Productores',                'productor')}
    ${trackListField(t, 'credits.composers', [['name','Compositor'],['split','% comp.']],    'Compositores (split %)',     'compositor')}
    ${trackListField(t, 'credits.writers',   [['name','Letrista'],['split','% letra']],      'Letristas (split %)',        'letrista')}
  </div>
  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('contacts',18)}</span><span class="ph-title">Contactos</span></div>
    ${trackListField(t, 'labelCopy.contacts', [['name','Nombre'],['role','Rol'],['email','Email']], 'Contactos del release', 'contacto')}
  </div>`;
}
// Editor genérico de listas de objetos en el track (créditos/contactos)
function trackListField(t, path, fields, label, addLabel) {
  const arr = getPath(t, path) || [];
  const rows = arr.map((item, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      ${fields.map(([fk, fl]) => `<input class="input" style="flex:1;min-width:0;padding:5px 8px;font-size:12px" placeholder="${fl}" value="${s(item[fk])}" onchange="setTrackListItem('${path}',${i},'${fk}',this.value)">`).join('')}
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('${path}',${i})">${icon('close',12)}</button>
    </div>`).join('');
  return `<div class="field" style="margin-bottom:16px"><label>${label}</label>${rows || '<div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-bottom:6px">— ninguno —</div>'}<button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="addTrackListItem('${path}')">+ ${addLabel || 'Agregar'}</button></div>`;
}
function setTrackListItem(path, i, fk, val) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); const arr = getPath(t, path) || []; if (arr[i]) { arr[i][fk] = val; saveTracks(); } }
function addTrackListItem(path) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); let arr = getPath(t, path); if (!Array.isArray(arr)) { setPath(t, path, []); arr = getPath(t, path); } arr.push({}); saveTracks(); renderTrackTab('labelcopy'); }
function removeTrackListItem(path, i) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); const arr = getPath(t, path) || []; arr.splice(i, 1); saveTracks(); renderTrackTab('labelcopy'); }

// ── Legal (por canción) ──
const LEGAL_STATE_COLOR = { pendiente:'var(--accent2)', enviado:'var(--beat)', firmado:'var(--accent)', aprobado:'#4ade80' };
function trackLegalHTML(t) {
  const legal = t.legal || [];
  const setF = (i, f, cap) => `onchange="setLegalField(${i},'${f}',this.value)"`;
  const rows = legal.map((d, i) => `<div class="panel" style="margin-bottom:10px">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <input class="input" style="flex:1;min-width:160px;font-size:13px;padding:6px 9px;font-weight:600" value="${s(d.type)}" placeholder="Tipo (split_sheet, producer_agreement…)" ${setF(i,'type')}>
      <select class="input" style="width:auto;padding:6px 8px;font-size:11px;color:${LEGAL_STATE_COLOR[d.state]||'var(--text)'}" onchange="setLegalField(${i},'state',this.value)">${['pendiente','enviado','firmado','aprobado'].map(x => `<option ${d.state === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="goal-btn reject" title="Quitar" onclick="quitarLegal(${i})">${icon('close',12)}</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${assigneeSelectHTML(d.responsable, setF(i,'responsable'), 'flex:1;min-width:120px;padding:5px 8px;font-size:12px')}
      <input class="input" style="flex:2;min-width:160px;padding:5px 8px;font-size:12px" value="${s(d.fileLink)}" placeholder="Link del documento (Drive/PDF)" ${setF(i,'fileLink')}>
    </div>
    <input class="input" style="margin-top:8px;padding:5px 8px;font-size:12px" value="${s(d.note)}" placeholder="Nota" ${setF(i,'note')}>
    ${d.fileLink ? `<a href="${safeUrl(d.fileLink)}" target="_blank" rel="noopener" style="font-size:11px;font-family:var(--font-mono);color:var(--accent);display:inline-block;margin-top:6px">↗ abrir documento</a>` : ''}
    <div style="font-size:9px;font-family:var(--font-mono);color:var(--text-dim);margin-top:4px">act. ${d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('es-MX') : '—'}</div>
  </div>`).join('');
  return `<div class="empty-hint" style="margin-bottom:12px">Documentos legales de esta canción (split sheets, producer agreements, autorizaciones de feature/sample) — con estado, responsable, link y nota.</div>
    ${rows || '<div class="empty-hint">Sin documentos.</div>'}
    <button class="btn btn-ghost" style="margin-top:10px" onclick="agregarLegal()">+ Documento legal</button>`;
}
function setLegalField(i, f, val) {
  if (!requireCan('editar_legal')) return;
  const t = curTrack(); if (!t || !t.legal[i]) return;
  t.legal[i][f] = val; t.legal[i].updatedAt = new Date().toISOString();
  saveTracks(); if (f === 'state' || f === 'fileLink') renderTrackTab('legal');
}
async function agregarLegal() {
  if (!requireCan('editar_legal')) return;
  const t = curTrack(); if (!t) return;
  const type = await uiPrompt('Tipo (split_sheet / producer_agreement / feature_clearance / sample_clearance / other):', { title: 'Nuevo documento legal' });
  if (!type) return;
  t.legal = t.legal || []; t.legal.push({ id: 'lg-' + Date.now(), type: type.trim(), state: 'pendiente', responsable: '', fileLink: '', note: '', updatedAt: new Date().toISOString() });
  saveTracks(); renderTrackTab('legal');
}
function setLegalState(i, state) { if (!requireCan('editar_legal')) return; const t = curTrack(); if (t && t.legal[i]) { t.legal[i].state = state; t.legal[i].updatedAt = new Date().toISOString(); saveTracks(); renderTrackTab('legal'); } }
function quitarLegal(i) { if (!requireCan('editar_legal')) return; const t = curTrack(); if (t && t.legal[i]) { t.legal.splice(i, 1); saveTracks(); renderTrackTab('legal'); } }

// ── Tareas (del track) ──
function trackTareasHTML(t) { return tareasPanelHTML('track'); } // motor compartido (crm.js)
