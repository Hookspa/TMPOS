// ══════════════════════════════════════════
// FICHA DE TRACK (dentro del release — pestañas) — Sprint 1
// ══════════════════════════════════════════
let currentTrackId = null, _trackTab = 'checklist';
function curTrack() { return tracks.find(x => x.id === currentTrackId); }
function openTrack(id, tab) {
  if (typeof navRecord === 'function') navRecord(); // graba la vista del release antes de entrar al track
  currentTrackId = id; _trackTab = tab || 'checklist'; // tab opcional: saltar directo a labelcopy/legal/audio…
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

// ── Label Copy (documento madre — formato FRIKIX completo, 5 secciones + PDF) ──
// Roles fijos de "Recording Credits" en el orden del template real (research/label-copy/FRIKIX-label-copy-template.csv)
const LC_RECORDING_ROLES = ['Producer','Programming','Executive Producer','Vocal Production','Background Vocals','Recording Engineer(s)','Recorded at','Contracted Performer(s)','Mixing Engineer','Mix Assistant','Mixed at','Immersive Mixing Engineer','Mastering Engineer','Mastered at','Immersive Mastering Engineer','A&R Direction','A&R Manager','Artwork Design','Artwork Photography','Director','Production House','Editor'];
// Roles del Royalty Split (ARTISTA / LABEL / MIXER / VIDEOGRAFO …)
const LC_ROYALTY_ROLES = ['ARTISTA','LABEL','MIXER','VIDEOGRAFO','PRODUCTOR','OTRO'];

// Suma numérica de un campo (%split) tolerando "25", "25%", "25 %"
function lcSum(arr, key) { return (arr || []).reduce((n, x) => n + (parseFloat(String((x && x[key]) || '').replace(/[^0-9.\-]/g, '')) || 0), 0); }

// Ruteo legal: conflictos de titularidad derivados del Label Copy de un track (input del estado "Conflicto").
// level 'red' = bloqueante (split ≠ 100%), 'yellow' = revisar (dato faltante). Lo consume la pestaña Legal + releaseAlerts.
function labelCopyIssues(t) {
  const out = []; if (!t) return out;
  const lc = t.labelCopy || {};
  const writers = (t.credits && t.credits.writers) || [];
  const wSum = lcSum(writers, 'split'), rSum = lcSum(lc.royaltySplit, 'split');
  if (writers.length && Math.round(wSum) !== 100) out.push({ level: 'red', text: `Split de composición suma ${wSum % 1 ? wSum.toFixed(2) : wSum}% (debe ser 100%)` });
  writers.forEach(w => {
    if (!s(w.name).trim()) return;
    if (!s(w.split).trim()) out.push({ level: 'yellow', text: `${s(w.name)}: sin % de split` });
    if (!s(w.publisher).trim() && !s(w.pro).trim()) out.push({ level: 'yellow', text: `${s(w.name)}: sin publisher ni PRO` });
  });
  const roy = lc.royaltySplit || [];
  if (roy.length && Math.round(rSum) !== 100) out.push({ level: 'red', text: `Royalty split suma ${rSum % 1 ? rSum.toFixed(2) : rSum}% (debe ser 100%)` });
  if (!writers.length) out.push({ level: 'yellow', text: 'Sin writers cargados en el Label Copy' });
  return out;
}
// Badge de total: verde si =100, naranja si no
function lcTotalBadge(sum, label) {
  const ok = Math.round(sum * 100) / 100 === 100;
  const col = ok ? 'var(--ok)' : 'var(--accent)';
  return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0 4px;font-family:var(--font-mono);font-size:11px">
    <span style="color:var(--text-muted)">${label || 'TOTAL'}</span>
    <span style="color:${col};font-weight:700">${sum % 1 ? sum.toFixed(2) : sum}%</span>
    ${ok ? `<span style="color:var(--ok)">${icon('check',11)}</span>` : `<span style="color:var(--accent)" title="Debe sumar 100%">${icon('warning',11)} ${sum > 100 ? 'excede' : 'falta ' + (100 - sum) + '%'}</span>`}</div>`;
}

function trackLabelCopyHTML(t) {
  const lc = t.labelCopy || {}, lct = lc.track || {}, fil = lc.filing || {};
  const l = launches.find(x => x.id === currentLaunchId);
  const f = (label, path, val, ph) => `<div class="field" style="margin-bottom:12px"><label>${label}</label><input class="input" value="${esc(val)}" placeholder="${ph || ''}" onchange="setTrackField('${path}',this.value,'editar_labelcopy')"></div>`;
  const sel = (label, path, val, opts) => `<div class="field" style="margin-bottom:12px"><label>${label}</label><select class="input" onchange="setTrackField('${path}',this.value,'editar_labelcopy')">${['', ...opts].map(o => `<option ${s(val) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
  const wSum = lcSum(t.credits.writers, 'split'), rSum = lcSum(lc.royaltySplit, 'split');

  return `${lcPeopleDatalist()}
  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('file',18)}</span><span class="ph-title">Label Copy</span><span class="ph-sub">documento madre · formato disquera</span>
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="labelCopyPDF()">${icon('download',13)} Generar Label Copy (PDF)</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px">
      ${f('Álbum / Release', 'labelCopy.album', lc.album, l ? l.name : '')}
      ${f('Sello', 'labelCopy.label', lc.label)}
      ${f('Distribuidora', 'labelCopy.distributor', lc.distributor)}
      ${f('Género', 'labelCopy.genre', lc.genre)}
      ${f('Main artist(s)', 'labelCopy.track.mainArtists', lct.mainArtists, 'ELTY, BCA, JEYSON…')}
      ${f('Repertoire owner', 'labelCopy.track.repertoireOwner', lct.repertoireOwner, 'Genios Musicales LLC')}
      ${f('Featuring artists', 'labelCopy.track.featuring', lct.featuring)}
      ${f('Release date', 'labelCopy.track.releaseDate', lct.releaseDate || (l && l.date) || '')}
      ${sel('Explicit', 'labelCopy.track.explicit', lct.explicit, ['No', 'Sí'])}
      ${sel('Clean version disponible', 'labelCopy.track.cleanVersion', lct.cleanVersion, ['No', 'Sí'])}
      ${f('Dueño del máster', 'master.owner', (t.master || {}).owner)}
      ${f('% máster', 'master.ownerSplit', (t.master || {}).ownerSplit)}
    </div>
    <div class="field"><label>Notas</label><textarea class="textarea" onchange="setTrackField('labelCopy.notes',this.value,'editar_labelcopy')">${esc(lc.notes)}</textarea></div>
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('file',18)}</span><span class="ph-title">1 · Publishing / Composición</span><span class="ph-sub">writers · % · publisher/IPI · PRO</span></div>
    ${lcListField(t, 'credits.writers', [['name','Writer'],['split','%'],['publisher','Publisher'],['ipi','IPI'],['pro','PRO']], 'Writers (composición)', 'writer')}
    ${lcTotalBadge(wSum, 'TOTAL SPLIT COMPOSICIÓN')}
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('mic',18)}</span><span class="ph-title">2 · Recording Credits</span><span class="ph-sub">rol → nombre</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 16px">
      ${LC_RECORDING_ROLES.map(role => `<div class="field" style="margin-bottom:10px"><label style="font-size:10px">${role}</label><input class="input" list="lc-people-list" style="padding:5px 8px;font-size:12px" value="${esc((lc.recording || {})[role])}" onchange="lcRecordingSet('${esc(role)}',this.value)"></div>`).join('')}
    </div>
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('finance',18)}</span><span class="ph-title">3 · Royalty Split</span><span class="ph-sub">reparto de dinero por canción</span></div>
    ${lcListField(t, 'labelCopy.royaltySplit', [['name','Titular'],['split','%'],['lender','Lender'],['rol','Rol']], 'Royalty split', 'fila', LC_ROYALTY_ROLES)}
    ${lcTotalBadge(rSum, 'TOTAL ROYALTY')}
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('team',18)}</span><span class="ph-title">4 · Split de negocio (% invitados)</span><span class="ph-sub">socios × madre/aporte/final</span></div>
    ${lcBusinessField(t)}
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('contacts',18)}</span><span class="ph-title">Contactos del release</span><span class="ph-sub">people book · autocompleta al escribir</span></div>
    ${lcListField(t, 'labelCopy.contacts', [['name','Nombre'],['role','Rol'],['email','Email']], 'Contactos', 'contacto')}
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('file',18)}</span><span class="ph-title">5 · Metadata de filing + códigos</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px">
      ${f('Audio ISRC', 'isrc', t.isrc)}
      ${f('Video ISRC', 'labelCopy.filing.videoIsrc', fil.videoIsrc)}
      ${f('P&C Line', 'labelCopy.filing.pcLine', fil.pcLine, '℗ & © 2026 …')}
      ${f('Info provista por (nombre)', 'labelCopy.filing.providedName', fil.providedName)}
      ${f('Título / cargo', 'labelCopy.filing.providedTitle', fil.providedTitle)}
      ${sel('Original (O) / Revisión (R)', 'labelCopy.filing.revision', fil.revision, ['Original', 'Revisión'])}
      ${f('Fecha del filing', 'labelCopy.filing.date', fil.date || todayISO())}
      ${f('Nombre de quien llena', 'labelCopy.filing.filedBy', fil.filedBy)}
    </div>
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

// ── People book (contactos reutilizables a nivel equipo) ──
function lcPeople() { try { const a = JSON.parse(localStorage.getItem('ao_labelcopy_people')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function lcPeopleSave(list) { try { localStorage.setItem('ao_labelcopy_people', JSON.stringify(list)); } catch (e) {} }
// Upsert por nombre: acumula email/ipi/pro/rol de cada persona a medida que se captura
function lcPeopleUpsert(person) {
  if (!person) return; const name = s(person.name).trim(); if (!name) return;
  const list = lcPeople(); let p = list.find(x => s(x.name).toLowerCase() === name.toLowerCase());
  if (!p) { p = { name }; list.push(p); }
  ['email', 'ipi', 'pro', 'role', 'rol', 'publisher'].forEach(k => { if (person[k]) p[k] = person[k]; });
  lcPeopleSave(list);
}
function lcPeopleDatalist() { return `<datalist id="lc-people-list">${lcPeople().map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>`; }

// ── Editor de listas del Label Copy con autocompletado (name → autofill de campos vacíos) ──
// fields: [[key,placeholder]…]; selOpts (opcional): opciones para el campo 'rol'
function lcListField(t, path, fields, label, addLabel, selOpts) {
  const arr = getPath(t, path) || [];
  const cell = (item, i, fk, fl) => {
    if (fk === 'rol' && selOpts) return `<select class="input" style="flex:1;min-width:80px;padding:5px 8px;font-size:12px" onchange="lcListSet('${path}',${i},'rol',this.value)">${['', ...selOpts].map(o => `<option ${s(item.rol) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const isName = fk === 'name';
    return `<input class="input" ${isName ? 'list="lc-people-list"' : ''} style="flex:${isName ? 2 : 1};min-width:80px;padding:5px 8px;font-size:12px" placeholder="${fl}" value="${esc(item[fk])}" onchange="${isName ? `lcListName('${path}',${i},this.value)` : `lcListSet('${path}',${i},'${fk}',this.value)`}">`;
  };
  const rows = arr.map((item, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      ${fields.map(([fk, fl]) => cell(item, i, fk, fl)).join('')}
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('${path}',${i})">${icon('close',12)}</button>
    </div>`).join('');
  return `<div class="field" style="margin-bottom:12px"><label>${label}</label>${rows || '<div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-bottom:6px">— ninguno —</div>'}<button class="btn btn-ghost" style="font-size:11px;padding:4px 10px" onclick="addTrackListItem('${path}')">+ ${addLabel || 'Agregar'}</button></div>`;
}
function lcListSet(path, i, fk, val) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); const arr = getPath(t, path) || []; if (arr[i]) { arr[i][fk] = val; saveTracks(); lcPeopleUpsert(arr[i]); if (fk === 'split') renderTrackTab('labelcopy'); /* refresca el total */ } }
function lcListName(path, i, val) {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const arr = getPath(t, path) || []; if (!arr[i]) return;
  arr[i].name = val;
  const p = lcPeople().find(x => s(x.name).toLowerCase() === s(val).trim().toLowerCase());
  if (p) ['email', 'ipi', 'pro', 'role', 'rol', 'publisher'].forEach(k => { if (p[k] && !arr[i][k]) arr[i][k] = p[k]; });
  saveTracks(); renderTrackTab('labelcopy');
}
function lcRecordingSet(role, val) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); if (!t) return; t.labelCopy = t.labelCopy || {}; t.labelCopy.recording = t.labelCopy.recording || {}; t.labelCopy.recording[role] = val; saveTracks(); lcPeopleUpsert({ name: val }); }

// ── Split de negocio (% invitados): socios × madre/aporte/final con totales por columna ──
function lcBusinessField(t) {
  const arr = (t.labelCopy && t.labelCopy.businessSplit) || [];
  const path = 'labelCopy.businessSplit';
  const num = v => parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
  const tM = arr.reduce((n, x) => n + num(x.madre), 0), tA = arr.reduce((n, x) => n + num(x.aporte), 0), tF = arr.reduce((n, x) => n + num(x.final), 0);
  const head = `<div style="display:flex;gap:6px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:4px">
      <span style="flex:2;min-width:80px">SOCIO</span><span style="flex:1;min-width:60px">NEGOCIO MADRE %</span><span style="flex:1;min-width:60px">APORTE INVITADO %</span><span style="flex:1;min-width:60px">% FINAL</span><span style="width:24px"></span></div>`;
  const rows = arr.map((item, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <input class="input" style="flex:2;min-width:80px;padding:5px 8px;font-size:12px" placeholder="Socio" value="${esc(item.partner)}" onchange="lcListSet('${path}',${i},'partner',this.value)">
      <input class="input" style="flex:1;min-width:60px;padding:5px 8px;font-size:12px" placeholder="Madre %" value="${esc(item.madre)}" onchange="lcBizSet(${i},'madre',this.value)">
      <input class="input" style="flex:1;min-width:60px;padding:5px 8px;font-size:12px" placeholder="Aporte %" value="${esc(item.aporte)}" onchange="lcBizSet(${i},'aporte',this.value)">
      <input class="input" style="flex:1;min-width:60px;padding:5px 8px;font-size:12px" placeholder="Final %" value="${esc(item.final)}" onchange="lcListSet('${path}',${i},'final',this.value)">
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('${path}',${i})">${icon('close',12)}</button>
    </div>`).join('');
  const totals = arr.length ? `<div style="display:flex;gap:6px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:5px">
      <span style="flex:2;min-width:80px;font-weight:700">TOTAL</span><span style="flex:1;min-width:60px">${tM}%</span><span style="flex:1;min-width:60px">${tA}%</span><span style="flex:1;min-width:60px">${tF}%</span><span style="width:24px"></span></div>` : '';
  return `<div class="field" style="margin-bottom:6px">${arr.length ? head : ''}${rows || '<div style="font-size:11px;color:var(--text-dim);font-family:var(--font-mono);margin-bottom:6px">— ninguno —</div>'}${totals}<button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;margin-top:6px" onclick="addTrackListItem('${path}')">+ socio</button></div>`;
}
// Auto-calcula el % final = madre − aporte al editar madre/aporte (el usuario puede sobreescribirlo)
function lcBizSet(i, fk, val) {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const arr = (t.labelCopy && t.labelCopy.businessSplit) || []; if (!arr[i]) return;
  arr[i][fk] = val;
  const num = v => parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
  arr[i].final = (num(arr[i].madre) - num(arr[i].aporte)) + '%';
  saveTracks(); renderTrackTab('labelcopy');
}

// ── Generar Label Copy → PDF (replica el layout del template FRIKIX) ──
async function labelCopyPDF() {
  const t = curTrack(); if (!t) return;
  try { await ensureJsPDF(); } catch (e) { uiAlert('No se pudo cargar el generador de PDF (¿sin internet?).'); return; }
  const { jsPDF } = window.jspdf;
  const lc = t.labelCopy || {}, lct = lc.track || {}, fil = lc.filing || {};
  const l = launches.find(x => x.id === currentLaunchId);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40; let y = 0;
  const clean = v => stripEmoji ? stripEmoji(s(v)) : s(v);
  const need = h => { if (y + h > H - 40) { doc.addPage(); y = 40; } };
  const sectionTitle = txt => { need(30); y += 10; doc.setFillColor(20, 20, 20); doc.rect(M, y, W - M * 2, 20, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.text(clean(txt), M + 8, y + 14); y += 30; };
  const kv = (k, v) => { need(16); doc.setFontSize(9); doc.setTextColor(120, 120, 120); doc.text(clean(k), M, y); doc.setTextColor(20, 20, 20); doc.text(clean(v) || '—', M + 150, y); y += 15; };

  // Cabecera
  doc.setFillColor(10, 10, 10); doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(255, 107, 48); doc.setFontSize(20); doc.text('LABEL COPY', M, 38);
  doc.setTextColor(255, 255, 255); doc.setFontSize(12); doc.text(clean(t.title) || '(sin título)', M, 58);
  doc.setTextColor(160, 160, 160); doc.setFontSize(9);
  doc.text(`${clean(lc.album || (l && l.name))}  ·  ${clean(lct.mainArtists || (t.credits || {}).mainArtist)}  ·  ${clean(lc.label)}`, M, 72);
  y = 100;
  doc.setTextColor(20, 20, 20);
  kv('Repertoire owner', lct.repertoireOwner); kv('Featuring', lct.featuring);
  kv('Release date', lct.releaseDate || (l && l.date)); kv('Explicit', lct.explicit);
  kv('Clean version', lct.cleanVersion); kv('Género', lc.genre);
  kv('Dueño del máster', `${clean((t.master || {}).owner)}${(t.master || {}).ownerSplit ? ' (' + clean((t.master || {}).ownerSplit) + '%)' : ''}`);

  // 1 · Publishing
  sectionTitle('1 · PUBLISHING / COMPOSICIÓN'); doc.setFontSize(8);
  doc.setTextColor(120, 120, 120); doc.text('WRITER', M, y); doc.text('%', M + 200, y); doc.text('PUBLISHER / IPI', M + 240, y); doc.text('PRO', W - M - 40, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(M, y, W - M, y); y += 12;
  doc.setTextColor(20, 20, 20); doc.setFontSize(9);
  (t.credits.writers || []).forEach(w => { need(14); doc.text(clean(w.name), M, y); doc.text(clean(w.split), M + 200, y); doc.text(`${clean(w.publisher)}${w.ipi ? ' / ' + clean(w.ipi) : ''}`, M + 240, y, { maxWidth: W - M - 240 - 50 }); doc.text(clean(w.pro), W - M - 40, y); y += 14; });
  need(14); doc.setFontSize(9); doc.setTextColor(255, 107, 48); doc.text(`TOTAL  ${lcSum(t.credits.writers, 'split')}%`, M, y); doc.setTextColor(20, 20, 20); y += 6;

  // 2 · Recording credits (2 columnas)
  sectionTitle('2 · RECORDING CREDITS'); doc.setFontSize(9);
  const rec = lc.recording || {}, colX = [M, W / 2 + 10], startY = y; let col = 0, cy = [startY, startY];
  LC_RECORDING_ROLES.forEach((role, idx) => {
    col = idx % 2; if (cy[col] + 14 > H - 40) { doc.addPage(); cy = [40, 40]; }
    doc.setTextColor(120, 120, 120); doc.setFontSize(8); doc.text(clean(role), colX[col], cy[col]);
    doc.setTextColor(20, 20, 20); doc.setFontSize(9); doc.text(clean(rec[role]) || '—', colX[col] + 130, cy[col]);
    cy[col] += 15;
  });
  y = Math.max(cy[0], cy[1]) + 6;

  // 3 · Royalty split
  sectionTitle('3 · ROYALTY SPLIT'); doc.setFontSize(8);
  doc.setTextColor(120, 120, 120); doc.text('TITULAR', M, y); doc.text('%', M + 200, y); doc.text('LENDER', M + 240, y); doc.text('ROL', W - M - 70, y); y += 4;
  doc.line(M, y, W - M, y); y += 12; doc.setTextColor(20, 20, 20); doc.setFontSize(9);
  (lc.royaltySplit || []).forEach(r => { need(14); doc.text(clean(r.name), M, y); doc.text(clean(r.split), M + 200, y); doc.text(clean(r.lender) || '—', M + 240, y); doc.text(clean(r.rol), W - M - 70, y); y += 14; });
  need(14); doc.setTextColor(255, 107, 48); doc.text(`TOTAL  ${lcSum(lc.royaltySplit, 'split')}%`, M, y); doc.setTextColor(20, 20, 20); y += 6;

  // 4 · % invitados
  if ((lc.businessSplit || []).length) {
    sectionTitle('4 · SPLIT DE NEGOCIO (% INVITADOS)'); doc.setFontSize(8);
    doc.setTextColor(120, 120, 120); doc.text('SOCIO', M, y); doc.text('NEGOCIO MADRE', M + 180, y); doc.text('APORTE', M + 300, y); doc.text('% FINAL', W - M - 60, y); y += 4;
    doc.line(M, y, W - M, y); y += 12; doc.setTextColor(20, 20, 20); doc.setFontSize(9);
    lc.businessSplit.forEach(b => { need(14); doc.text(clean(b.partner), M, y); doc.text(clean(b.madre), M + 180, y); doc.text(clean(b.aporte), M + 300, y); doc.text(clean(b.final), W - M - 60, y); y += 14; });
  }

  // 5 · Filing
  sectionTitle('5 · FILING'); doc.setTextColor(20, 20, 20);
  kv('Audio ISRC', t.isrc); kv('Video ISRC', fil.videoIsrc); kv('P&C Line', fil.pcLine);
  kv('Info provista por', `${clean(fil.providedName)}${fil.providedTitle ? ' · ' + clean(fil.providedTitle) : ''}`);
  kv('Tipo', fil.revision); kv('Fecha', fil.date); kv('Llenado por', fil.filedBy);

  // Pie
  doc.setFontSize(7); doc.setTextColor(150, 150, 150);
  doc.text(`Tempo OS · Label Copy generado ${todayISO()}`, M, H - 24);
  doc.save(`LabelCopy-${clean(t.title)}-${todayISO()}.pdf`.replace(/\s+/g, '_'));
}

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
