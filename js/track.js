// ══════════════════════════════════════════
// FICHA DE TRACK (dentro del release — pestañas) — Sprint 1
// ══════════════════════════════════════════
let currentTrackId = null, _trackTab = 'audio';
function curTrack() { return tracks.find(x => x.id === currentTrackId); }
function openTrack(id, tab) {
  if (typeof navRecord === 'function') navRecord(); // graba la vista del release antes de entrar al track
  currentTrackId = id; _trackTab = (tab === 'labelcopy' || tab === 'audio') ? tab : 'audio'; // la canción solo tiene Audio · Label Copy
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
function setTrackField(path, val, cap) { if (cap && !requireCan(cap)) return; const t = curTrack(); if (!t) return; setPath(t, path, val); saveTracks(); if (/^(credits|labelCopy)/.test(path) && typeof reconcileLegalConflicts === 'function') reconcileLegalConflicts(t); }

function renderTrackDetail() {
  const t = curTrack(), l = launches.find(x => x.id === currentLaunchId);
  const host = document.getElementById('launch-detail'); if (!t || !host) return;
  const rd = trackReady(t), pct = rd.total ? Math.round(rd.done / rd.total * 100) : 0;
  const phase = trackPhase(t);
  const TABS = [['audio','Audio'],['labelcopy','Label Copy']];
  host.innerHTML = `
    <div style="margin-bottom:16px"><button type="button" class="link-muted" style="font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-muted);cursor:pointer;border:0;background:transparent;padding:0" onclick="backToRelease()">← ${s(l ? l.name : 'Lanzamiento')}</button></div>
    <div class="panel" style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div style="font-family:var(--font-display);font-size:var(--text-2xl);letter-spacing:var(--track-display)">${s(t.title) || '(sin título)'}</div>
        <div style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted);margin-top:4px">${t.version ? s(t.version) + ' · ' : ''}ISRC ${s(t.isrc) || '— por asignar'}</div>
        <div style="margin-top:10px"><span class="chip on" style="cursor:default;color:${phaseColor(phase)}">${phase}</span></div>
      </div>
      <div style="min-width:220px;flex:1">${readyBarHTML(pct, 'LISTO PARA LANZAR · TRACK')}<div style="font-size:var(--text-2xs);color:var(--text-dim);font-family:var(--font-ui);margin-top:6px">${rd.done}/${rd.total} ítems del checklist</div></div>
    </div>
    <div class="mtabs" id="track-tabbar" role="tablist" aria-label="Secciones de la canción" style="margin-bottom:16px;flex-wrap:wrap">${TABS.map(x => `<button type="button" role="tab" aria-selected="${x[0]===_trackTab}" class="mtab ${x[0] === _trackTab ? 'active' : ''}" data-ttab="${x[0]}" onclick="setTrackTab('${x[0]}')">${x[1]}</button>`).join('')}</div>
    <div id="track-tab-body"></div>`;
  renderTrackTab(_trackTab);
}
function setTrackTab(name) { _trackTab = name; document.querySelectorAll('#track-tabbar .mtab').forEach(b => { const on=b.dataset.ttab===name; b.classList.toggle('active',on); b.setAttribute('aria-selected',String(on)); }); renderTrackTab(name); }
function renderTrackTab(name) {
  const t = curTrack(); const host = document.getElementById('track-tab-body'); if (!t || !host) return;
  // La canción solo tiene Audio · Label Copy. Checklist/Legal/Tareas/Marketing se centralizaron
  // en el release (Trabajo · Legal · Campaña) y en la página global Tareas.
  if (name === 'labelcopy') host.innerHTML = trackLabelCopyHTML(t);
  else host.innerHTML = trackAudioHTML(t);
}

// ── Checklist (editable + templates propios) ──
const CHECKLIST_GROUP_ORDER = ['audio', 'legal', 'distrib', 'otros'];
// ── Contexto de track para checklist/legal renderizados FUERA de la ficha del track ──
// (el checklist vive en Trabajo del release y el legal en la pestaña Legal; ambos por-canción).
// Los handlers reciben un trackId explícito; _ctxTrack cae a ese contexto o al track activo.
let _checklistCtx = null;
function _ctxTrack(tid) { const id = tid || _checklistCtx || (typeof currentTrackId !== 'undefined' ? currentTrackId : null); return id ? (tracks.find(x => x.id === id) || null) : null; }
// Re-render tras editar: si estamos en una pestaña del release, re-render esa pestaña; si no, la ficha del track.
function _rerenderReleaseCtx() {
  if (typeof _releaseTab !== 'undefined' && typeof renderReleaseTab === 'function' && document.getElementById('release-tab-body')) renderReleaseTab(_releaseTab);
  else if (typeof renderTrackDetail === 'function') renderTrackDetail();
}
function trackChecklistHTML(t) {
  _checklistCtx = t.id;
  const def = trackChecklistDef(t), c = t.checklist || {};
  const editable = canDo('editar_crm');
  const custom = !!t.checklistDef;
  const tpls = getChecklistTemplates();
  // toolbar de templates
  const toolbar = `<div class="panel" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <span style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted)">Plantilla:</span>
    <select class="input" style="width:auto;padding:5px 8px;font-size:var(--text-sm)" onchange="if(this.value)applyChecklistTemplate(this.value,'${t.id}')">
      <option value="">${custom ? 'Personalizada' : 'Por defecto'}…</option>
      <option value="__default">↺ Restablecer al default</option>
      ${tpls.map(tp => `<option value="${tp.id}">${s(tp.name)}</option>`).join('')}
    </select>
    ${editable ? `<button class="btn btn-ghost" style="font-size:var(--text-sm);padding:5px 10px" onclick="saveChecklistAsTemplate('${t.id}')">${icon('save',13)} Guardar como plantilla…</button>` : ''}
    <button class="btn btn-ghost" style="font-size:var(--text-sm);padding:5px 10px" onclick="abrirTemplatesPanel('${t.id}')">${icon('checklist',13)} Gestionar</button>
    <span style="margin-left:auto;font-size:var(--text-2xs);color:var(--text-dim);font-family:var(--font-ui)">${custom ? 'checklist propio de este track' : 'usando el checklist por defecto'}</span>
  </div>`;
  const groups = CHECKLIST_GROUP_ORDER.filter(g => def[g] && def[g].length).map(g => `
    <div class="panel"><div class="panel-head"><span class="ph-title">${CHECKLIST_GROUP_LABEL[g] || g}</span>${editable ? `<button class="btn btn-ghost" style="margin-left:auto;font-size:var(--text-xs);padding:3px 9px" onclick="addChecklistItem('${g}','${t.id}')">+ ítem</button>` : ''}</div>
      <div style="display:flex;flex-direction:column">
        ${def[g].map(([k, label]) => { const on = !!(c[g] && c[g][k]); return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:var(--text-base);flex:1"><input type="checkbox" ${on ? 'checked' : ''} onchange="toggleTrackCheck('${g}','${k}','${t.id}')"> ${s(label)}</label>
          ${editable ? `<button class="goal-btn reject" title="Quitar ítem" onclick="removeChecklistItem('${g}','${k}','${t.id}')">${icon('close',12)}</button>` : ''}
        </div>`; }).join('')}
      </div></div>`).join('');
  const addGroup = editable ? `<button class="btn btn-ghost" style="font-size:var(--text-sm)" onclick="addChecklistItem('otros','${t.id}')">+ Otra tarea</button>` : '';
  return toolbar + groups + addGroup;
}
function toggleTrackCheck(g, k, tid) {
  if (!requireCan('editar_crm')) return;
  const t = _ctxTrack(tid); if (!t) return;
  t.checklist = t.checklist || {}; t.checklist[g] = t.checklist[g] || {};
  t.checklist[g][k] = !t.checklist[g][k];
  saveTracks(); _rerenderReleaseCtx(); // recalcula fase + barra
  if (typeof runAutomations === 'function') runAutomations(); // legal completo → desbloquear distribución
}
// Materializa la definición propia del track (para editar sin tocar la default)
function ensureTrackDef(t) { if (!t.checklistDef) t.checklistDef = cloneDef(trackChecklistDef(t)); t.checklistDef.otros = t.checklistDef.otros || []; return t.checklistDef; }
async function addChecklistItem(group, tid) {
  if (!requireCan('editar_crm')) return;
  const t = _ctxTrack(tid); if (!t) return;
  const label = (await uiPrompt('Nombre de la tarea/ítem del checklist:', { title: 'Nuevo ítem de checklist' }) || '').trim();
  if (!label) return;
  const def = ensureTrackDef(t); def[group] = def[group] || [];
  def[group].push([checklistSlug(label), label]);
  saveTracks(); _rerenderReleaseCtx();
}
function removeChecklistItem(group, key, tid) {
  if (!requireCan('editar_crm')) return;
  const t = _ctxTrack(tid); if (!t) return;
  const def = ensureTrackDef(t);
  if (def[group]) def[group] = def[group].filter(it => it[0] !== key);
  if (t.checklist && t.checklist[group]) delete t.checklist[group][key]; // limpiar estado
  saveTracks(); _rerenderReleaseCtx();
}
function applyChecklistTemplate(id, tid) {
  const t = _ctxTrack(tid); if (!t) return;
  if (!requireCan('editar_crm')) return;
  if (id === '__default') { t.checklistDef = null; saveTracks(); _rerenderReleaseCtx(); return; }
  const tp = getChecklistTemplates().find(x => x.id === id);
  if (tp) { t.checklistDef = cloneDef(tp.def); saveTracks(); _rerenderReleaseCtx(); uiToast('✓ Plantilla aplicada'); }
}
async function saveChecklistAsTemplate(tid) {
  if (!requireCan('editar_crm')) return;
  const t = _ctxTrack(tid); if (!t) return;
  const name = (await uiPrompt('Nombre de la plantilla (para reusarla en otros lanzamientos):', { title: 'Guardar plantilla' }) || '').trim();
  if (!name) return;
  const tpls = getChecklistTemplates();
  const existing = tpls.find(x => x.name.toLowerCase() === name.toLowerCase());
  const def = cloneDef(trackChecklistDef(t));
  if (existing) existing.def = def; else tpls.push({ id: 'tpl-' + Date.now(), name, def });
  setChecklistTemplates(tpls);
  _rerenderReleaseCtx(); uiToast('✓ Plantilla guardada · disponible para tu equipo');
}
// Checklists de lanzamiento (Trabajo del release): el checklist "Listo para lanzar" de cada canción.
function releaseChecklistsHTML(l) {
  const ts = (typeof tracksOfLaunch === 'function') ? tracksOfLaunch(l) : [];
  const releaseLevel = (typeof releaseChecklistPanelHTML === 'function') ? releaseChecklistPanelHTML(l) : '';
  if (!ts.length) return `${releaseLevel}${(typeof secInfo === 'function') ? secInfo('Checklists por canción', 'El checklist "Listo para lanzar" de cada canción alimenta la preparación de la canción y del lanzamiento.') : ''}<div class="empty-hint">Este lanzamiento no tiene canciones. Agrégalas en la pestaña <b>Música</b>.</div>`;
  const blocks = ts.map(t => {
    const rd = (typeof trackReady === 'function') ? trackReady(t) : { done: 0, total: 0 };
    const pct = rd.total ? Math.round(rd.done / rd.total * 100) : 0;
    return `<div style="margin:18px 0 6px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <div style="font-family:var(--font-ui);font-weight:var(--fw-title);font-size:var(--text-lg);letter-spacing:var(--track-caps-sm)">${s(t.title) || '(sin título)'}</div>
        <div style="flex:1;min-width:140px;max-width:280px">${(typeof readyBarHTML === 'function') ? readyBarHTML(pct, 'LISTO PARA LANZAR') : ''}</div>
        <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">${rd.done}/${rd.total}</div></div>
      ${trackChecklistHTML(t)}`;
  }).join('');
  return `${releaseLevel}${(typeof secInfo === 'function') ? secInfo('Checklists por canción', 'El checklist "Listo para lanzar" de cada canción alimenta la preparación de la canción y del lanzamiento.') : ''}${blocks}`;
}
// ── Panel de gestión de plantillas (aplicar · duplicar · renombrar · eliminar) ──
function abrirTemplatesPanel(tid) { if (tid) _checklistCtx = tid; renderTemplatesPanel(); document.getElementById('modal-templates').classList.add('open'); }
function cerrarTemplates(e) { if (!e || e.target === document.getElementById('modal-templates')) document.getElementById('modal-templates').classList.remove('open'); }
function _tplItemCount(def) { return Object.keys(def || {}).reduce((a, g) => a + ((def[g] || []).length), 0); }
function renderTemplatesPanel() {
  const tpls = getChecklistTemplates();
  const hasTrack = !!_ctxTrack(null);
  const rows = tpls.map(tp => `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div style="flex:1;min-width:140px"><div style="font-size:var(--text-base);font-weight:600">${s(tp.name)}</div><div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${_tplItemCount(tp.def)} ítems</div></div>
      ${hasTrack ? `<button class="btn btn-ghost" style="padding:4px 9px;font-size:var(--text-xs)" onclick="aplicarTemplateDesdePanel('${tp.id}')">Aplicar</button>` : ''}
      <button class="btn btn-ghost" style="padding:4px 9px;font-size:var(--text-xs)" onclick="dupTemplate('${tp.id}')">Duplicar</button>
      <button class="btn btn-ghost" style="padding:4px 9px;font-size:var(--text-xs)" onclick="renameTemplate('${tp.id}')">Renombrar</button>
      <button class="btn btn-ghost" style="padding:4px 9px;font-size:var(--text-xs);color:var(--accent2);border-color:rgba(255,77,77,.3)" onclick="deleteTemplate('${tp.id}')">Eliminar</button>
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
// Cada issue trae { level, text, key, type, area }: `key` = idempotencia del ruteo a Legal, `type` = título
// de la tarea legal, `area` = departamento por defecto (composición/publishing → 'ar'; royalty → 'legal').
function labelCopyIssues(t) {
  const out = []; if (!t) return out;
  const lc = t.labelCopy || {};
  const writers = (t.credits && t.credits.writers) || [];
  const wSum = lcSum(writers, 'split'), rSum = lcSum(lc.royaltySplit, 'split');
  const slug = x => s(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (writers.length && Math.round(wSum) !== 100) out.push({ level: 'red', key: 'comp-total', area: 'ar', type: 'Cuadrar split de composición (100%)', text: `Split de composición suma ${wSum % 1 ? wSum.toFixed(2) : wSum}% (debe ser 100%)` });
  writers.forEach(w => {
    if (!s(w.name).trim()) return;
    if (!s(w.split).trim()) out.push({ level: 'yellow', key: 'w-split-' + slug(w.name), area: 'ar', type: `Asignar % de split a ${s(w.name)}`, text: `${s(w.name)}: sin % de split` });
    if (!s(w.publisher).trim() && !s(w.pro).trim()) out.push({ level: 'yellow', key: 'w-pubpro-' + slug(w.name), area: 'ar', type: `Completar publisher/PRO de ${s(w.name)}`, text: `${s(w.name)}: sin publisher ni PRO` });
  });
  const roy = lc.royaltySplit || [];
  if (roy.length && Math.round(rSum) !== 100) out.push({ level: 'red', key: 'roy-total', area: 'legal', type: 'Cuadrar royalty split (100%)', text: `Royalty split suma ${rSum % 1 ? rSum.toFixed(2) : rSum}% (debe ser 100%)` });
  if (!writers.length) out.push({ level: 'yellow', key: 'no-writers', area: 'ar', type: 'Cargar writers en el Label Copy', text: 'Sin writers cargados en el Label Copy' });
  return out;
}
// Mapa de área → etiqueta legible + responsable por defecto (empareja un contacto del equipo cuyo nombre
// mencione el área; si no hay match, deja sin asignar y solo muestra el badge de área sugerida).
const LEGAL_AREA_LABEL = { ar: 'A&R', legal: 'Legal' };
function legalDefaultAssignee(area) {
  const pats = area === 'legal' ? /legal|abogad|lawyer|counsel/i : /a&r|a\s*and\s*r|\banr\b|a\/r/i;
  const cs = (typeof mentionContacts === 'function') ? mentionContacts() : [];
  const hit = cs.find(c => pats.test((typeof contactLabel === 'function') ? contactLabel(c) : (c.name || c.email || '')));
  return hit ? contactLabel(hit) : '';
}
// Badge de total: verde si =100, naranja si no
function lcTotalBadge(sum, label) {
  const ok = Math.round(sum * 100) / 100 === 100;
  const col = ok ? 'var(--ok)' : 'var(--accent)';
  return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0 4px;font-family:var(--font-ui);font-size:var(--text-xs)">
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
      ${f('Álbum / Lanzamiento', 'labelCopy.album', lc.album, l ? l.name : '')}
      ${f('Sello', 'labelCopy.label', lc.label)}
      ${f('Distribuidora', 'labelCopy.distributor', lc.distributor)}
      ${f('Género', 'labelCopy.genre', lc.genre)}
      ${f('Main artist(s)', 'labelCopy.track.mainArtists', lct.mainArtists, 'ELTY, BCA, JEYSON…')}
      ${f('Repertoire owner', 'labelCopy.track.repertoireOwner', lct.repertoireOwner, 'Genios Musicales LLC')}
      ${f('Featuring artists', 'labelCopy.track.featuring', lct.featuring)}
      ${f('Fecha de lanzamiento', 'labelCopy.track.releaseDate', lct.releaseDate || (l && l.date) || '')}
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
      ${LC_RECORDING_ROLES.map(role => `<div class="field" style="margin-bottom:10px"><label style="font-size:var(--text-2xs)">${role}</label><input class="input" list="lc-people-list" style="padding:5px 8px;font-size:var(--text-sm)" value="${esc((lc.recording || {})[role])}" onchange="lcRecordingSet('${esc(role)}',this.value)"></div>`).join('')}
    </div>
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('finance',18)}</span><span class="ph-title">3 · Royalty Split</span><span class="ph-sub">reparto de dinero por canción</span></div>
    ${lcListField(t, 'labelCopy.royaltySplit', [['name','Titular'],['split','%'],['lender','Lender'],['rol','Rol']], 'Royalty split', 'fila', LC_ROYALTY_ROLES)}
    ${lcTotalBadge(rSum, 'TOTAL ROYALTY')}
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('team',18)}</span><span class="ph-title">4 · Split de negocio</span><span class="ph-sub">partes madre (100%) − invitados (por igual)</span></div>
    ${lcBusinessField(t)}
  </div>

  <div class="panel"><div class="panel-head"><span class="ph-icon">${icon('contacts',18)}</span><span class="ph-title">Contactos del lanzamiento</span><span class="ph-sub">directorio · autocompleta al escribir</span></div>
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
      ${fields.map(([fk, fl]) => `<input class="input" style="flex:1;min-width:0;padding:5px 8px;font-size:var(--text-sm)" placeholder="${fl}" value="${s(item[fk])}" onchange="setTrackListItem('${path}',${i},'${fk}',this.value)">`).join('')}
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('${path}',${i})">${icon('close',12)}</button>
    </div>`).join('');
  return `<div class="field" style="margin-bottom:16px"><label>${label}</label>${rows || '<div style="font-size:var(--text-xs);color:var(--text-dim);font-family:var(--font-ui);margin-bottom:6px">— ninguno —</div>'}<button class="btn btn-ghost" style="font-size:var(--text-xs);padding:4px 10px" onclick="addTrackListItem('${path}')">+ ${addLabel || 'Agregar'}</button></div>`;
}
function setTrackListItem(path, i, fk, val) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); const arr = getPath(t, path) || []; if (arr[i]) { arr[i][fk] = val; saveTracks(); } }
function addTrackListItem(path) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); let arr = getPath(t, path); if (!Array.isArray(arr)) { setPath(t, path, []); arr = getPath(t, path); } arr.push({}); saveTracks(); renderTrackTab('labelcopy'); }
function removeTrackListItem(path, i) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); const arr = getPath(t, path) || []; arr.splice(i, 1); saveTracks(); renderTrackTab('labelcopy'); }

// ── People book (contactos reutilizables a nivel equipo · local + nube) ──
// Estado en memoria (mirror de localStorage `ao_labelcopy_people`); se sincroniza a Supabase (tabla labelcopy_people).
let lcPeopleList = [];
try { lcPeopleList = JSON.parse(localStorage.getItem('ao_labelcopy_people')); } catch (e) {}
if (!Array.isArray(lcPeopleList)) lcPeopleList = [];
function lcPeople() { return lcPeopleList; }
function lcPeopleId(name) { return 'lcp-' + s(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
function lcPeopleSaveLocal() { try { localStorage.setItem('ao_labelcopy_people', JSON.stringify(lcPeopleList)); } catch (e) {} }
function lcPeopleSave() { lcPeopleSaveLocal(); if (typeof scheduleCloudSync === 'function') scheduleCloudSync(); } // → sube a la nube (best-effort)
// Reemplaza la lista desde la nube por MERGE (union por nombre): nunca pierde contactos locales; la nube gana campos no vacíos.
function lcPeopleSetAll(cloudList) {
  const byName = {};
  lcPeopleList.forEach(p => { if (p && s(p.name).trim()) byName[s(p.name).toLowerCase()] = Object.assign({}, p); });
  (cloudList || []).forEach(p => { if (!p || !s(p.name).trim()) return; const k = s(p.name).toLowerCase(); byName[k] = Object.assign(byName[k] || {}, p); });
  lcPeopleList = Object.values(byName).map(p => { if (!p.id) p.id = lcPeopleId(p.name); return p; });
  lcPeopleSaveLocal();
}
// Upsert por nombre: acumula email/ipi/pro/rol de cada persona a medida que se captura.
function lcPeopleUpsert(person) {
  if (!person) return; const name = s(person.name).trim(); if (!name) return;
  let p = lcPeopleList.find(x => s(x.name).toLowerCase() === name.toLowerCase());
  let changed = false;
  if (!p) { p = { id: lcPeopleId(name), name }; lcPeopleList.push(p); changed = true; }
  if (!p.id) { p.id = lcPeopleId(name); changed = true; }
  ['email', 'ipi', 'pro', 'role', 'rol', 'publisher'].forEach(k => { if (person[k] && p[k] !== person[k]) { p[k] = person[k]; changed = true; } });
  if (changed) lcPeopleSave();
}
function lcPeopleDatalist() { return `<datalist id="lc-people-list">${lcPeople().map(p => `<option value="${esc(p.name)}">`).join('')}</datalist>`; }

// ── Editor de listas del Label Copy con autocompletado (name → autofill de campos vacíos) ──
// fields: [[key,placeholder]…]; selOpts (opcional): opciones para el campo 'rol'
function lcListField(t, path, fields, label, addLabel, selOpts) {
  const arr = getPath(t, path) || [];
  const cell = (item, i, fk, fl) => {
    if (fk === 'rol' && selOpts) return `<select class="input" style="flex:1;min-width:80px;padding:5px 8px;font-size:var(--text-sm)" onchange="lcListSet('${path}',${i},'rol',this.value)">${['', ...selOpts].map(o => `<option ${s(item.rol) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const isName = fk === 'name';
    return `<input class="input" ${isName ? 'list="lc-people-list"' : ''} style="flex:${isName ? 2 : 1};min-width:80px;padding:5px 8px;font-size:var(--text-sm)" placeholder="${fl}" value="${esc(item[fk])}" onchange="${isName ? `lcListName('${path}',${i},this.value)` : `lcListSet('${path}',${i},'${fk}',this.value)`}">`;
  };
  const rows = arr.map((item, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      ${fields.map(([fk, fl]) => cell(item, i, fk, fl)).join('')}
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('${path}',${i})">${icon('close',12)}</button>
    </div>`).join('');
  return `<div class="field" style="margin-bottom:12px"><label>${label}</label>${rows || '<div style="font-size:var(--text-xs);color:var(--text-dim);font-family:var(--font-ui);margin-bottom:6px">— ninguno —</div>'}<button class="btn btn-ghost" style="font-size:var(--text-xs);padding:4px 10px" onclick="addTrackListItem('${path}')">+ ${addLabel || 'Agregar'}</button></div>`;
}
function lcListSet(path, i, fk, val) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); const arr = getPath(t, path) || []; if (arr[i]) { arr[i][fk] = val; saveTracks(); lcPeopleUpsert(arr[i]); if (typeof reconcileLegalConflicts === 'function') reconcileLegalConflicts(t); if (fk === 'split') renderTrackTab('labelcopy'); /* refresca el total */ } }
function lcListName(path, i, val) {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const arr = getPath(t, path) || []; if (!arr[i]) return;
  arr[i].name = val;
  const p = lcPeople().find(x => s(x.name).toLowerCase() === s(val).trim().toLowerCase());
  if (p) ['email', 'ipi', 'pro', 'role', 'rol', 'publisher'].forEach(k => { if (p[k] && !arr[i][k]) arr[i][k] = p[k]; });
  saveTracks(); renderTrackTab('labelcopy');
}
function lcRecordingSet(role, val) { if (!requireCan('editar_labelcopy')) return; const t = curTrack(); if (!t) return; t.labelCopy = t.labelCopy || {}; t.labelCopy.recording = t.labelCopy.recording || {}; t.labelCopy.recording[role] = val; saveTracks(); lcPeopleUpsert({ name: val }); }

// ── Split de negocio: PARTES MADRE (suman 100) + INVITADOS (salen de la madre, se restan POR IGUAL X/N) ──
// X = total de puntos a invitados. N = nº de partes madre. Cada parte madre: final = madre − X/N.
function _lcNum(v) { return parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')) || 0; }
function _lcFmt(v) { const r = Math.round(v * 100) / 100; return r % 1 ? r.toFixed(2) : String(r); }
function _lcBizPer(t) { const inv = (t.labelCopy && t.labelCopy.businessInvited) || []; const X = inv.reduce((n, x) => n + _lcNum(x.puntos), 0); const N = ((t.labelCopy && t.labelCopy.businessSplit) || []).length; return N > 0 ? X / N : 0; }
function _lcBizRecomputeFinals(t) { const per = _lcBizPer(t); ((t.labelCopy && t.labelCopy.businessSplit) || []).forEach(m => { m.final = _lcFmt(_lcNum(m.madre) - per) + '%'; }); }
function lcBusinessField(t) {
  const lc = t.labelCopy || {};
  const madres = lc.businessSplit || [], invited = lc.businessInvited || [];
  const X = invited.reduce((n, x) => n + _lcNum(x.puntos), 0);   // total a invitados
  const N = madres.length;
  const per = N > 0 ? X / N : 0;                                  // se resta por igual de cada parte madre
  const l = launches.find(x => x.id === currentLaunchId);
  const hasDefault = l && Array.isArray(l.bizDefault) && l.bizDefault.length;
  const tM = madres.reduce((n, x) => n + _lcNum(x.madre), 0);
  const tFinal = madres.reduce((n, x) => n + (_lcNum(x.madre) - per), 0);
  const grand = tFinal + X;
  const numSt = 'font-family:var(--font-ui);font-variant-numeric:tabular-nums';
  const mHead = `<div style="display:flex;gap:6px;font-family:var(--font-ui);font-size:var(--text-2xs);color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">
      <span style="flex:2;min-width:80px">Socio (parte madre)</span><span style="flex:1;min-width:52px">Madre %</span><span style="flex:1;min-width:52px">− invit.</span><span style="flex:1;min-width:52px">% final</span><span style="width:24px"></span></div>`;
  const mRows = madres.map((item, i) => {
    const final = _lcNum(item.madre) - per;
    return `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <input class="input" list="lc-people-list" style="flex:2;min-width:80px;padding:5px 8px;font-size:var(--text-sm)" placeholder="Socio" value="${esc(item.partner)}" onchange="lcListSet('labelCopy.businessSplit',${i},'partner',this.value)">
      <input class="input" style="flex:1;min-width:52px;padding:5px 8px;font-size:var(--text-sm)" inputmode="decimal" placeholder="0" value="${esc(item.madre)}" onchange="lcMadreSet(${i},this.value)">
      <span style="flex:1;min-width:52px;${numSt};font-size:var(--text-xs);color:var(--text-dim)">${per ? '−' + _lcFmt(per) : '—'}</span>
      <span style="flex:1;min-width:52px;${numSt};font-size:var(--text-sm);font-weight:600;color:${final < 0 ? 'var(--accent2)' : 'var(--text)'}">${_lcFmt(final)}%</span>
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('labelCopy.businessSplit',${i})">${icon('close',12)}</button>
    </div>`;
  }).join('');
  const mWarn = madres.length && Math.round(tM) !== 100 ? `<span style="color:var(--accent);${numSt};font-size:var(--text-2xs)" title="Las partes madre deben sumar 100%">${icon('warning',10)} madre ${_lcFmt(tM)}%</span>` : '';
  const mTotals = madres.length ? `<div style="display:flex;gap:6px;${numSt};font-size:var(--text-xs);color:var(--text-muted);border-top:1px solid var(--border);padding-top:5px">
      <span style="flex:2;min-width:80px;font-weight:700">TOTAL ${mWarn}</span><span style="flex:1;min-width:52px">${_lcFmt(tM)}%</span><span style="flex:1;min-width:52px">${X ? '−' + _lcFmt(X) : '—'}</span><span style="flex:1;min-width:52px;font-weight:600">${_lcFmt(tFinal)}%</span><span style="width:24px"></span></div>` : '';
  const iHead = invited.length ? `<div style="display:flex;gap:6px;font-family:var(--font-ui);font-size:var(--text-2xs);color:var(--text-muted);margin:2px 0 4px;text-transform:uppercase;letter-spacing:.5px">
      <span style="flex:2;min-width:80px">Invitado</span><span style="flex:1;min-width:52px">Puntos %</span><span style="width:24px"></span></div>` : '';
  const iRows = invited.map((item, i) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <input class="input" list="lc-people-list" style="flex:2;min-width:80px;padding:5px 8px;font-size:var(--text-sm)" placeholder="Invitado" value="${esc(item.name)}" onchange="lcInvitedSet(${i},'name',this.value)">
      <input class="input" style="flex:1;min-width:52px;padding:5px 8px;font-size:var(--text-sm)" inputmode="decimal" placeholder="0" value="${esc(item.puntos)}" onchange="lcInvitedSet(${i},'puntos',this.value)">
      <button class="goal-btn reject" title="Quitar" onclick="removeTrackListItem('labelCopy.businessInvited',${i})">${icon('close',12)}</button>
    </div>`).join('');
  const summary = `<div style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted);margin:8px 0">
      ${X > 0 ? `<b>${_lcFmt(X)}</b> pts a invitados · se resta <b>${_lcFmt(per)}</b> a cada una de las <b>${N}</b> parte(s) madre.` : 'Sin invitados: cada parte madre conserva su % madre.'}
      ${madres.length ? (Math.round(grand) === 100 ? `<br><span style="color:var(--ok)">${icon('check',10)} total 100%</span>` : `<br><span style="color:var(--accent)">${icon('warning',10)} total (madre final + invitados) = ${_lcFmt(grand)}% — cuadra la madre a 100%.</span>`) : ''}
    </div>`;
  const defBtns = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
      <button class="btn btn-ghost" style="font-size:var(--text-xs);padding:4px 10px" onclick="addTrackListItem('labelCopy.businessSplit')">+ parte madre</button>
      <button class="btn btn-ghost" style="font-size:var(--text-xs);padding:4px 10px" onclick="addTrackListItem('labelCopy.businessInvited')">+ invitado</button>
      ${madres.length ? `<button class="btn btn-ghost" style="font-size:var(--text-xs);padding:4px 10px" onclick="lcBizSaveDefault()" title="Guardar estas partes madre como default del proyecto">${icon('save',12)} Guardar default del proyecto</button>` : ''}
      ${hasDefault ? `<button class="btn btn-ghost" style="font-size:var(--text-xs);padding:4px 10px" onclick="lcBizApplyDefault()" title="Precargar las partes madre del default del proyecto">${icon('refresh',12)} Aplicar default (${l.bizDefault.length})</button>` : ''}
    </div>`;
  return `<div class="field" style="margin-bottom:6px">
    ${madres.length ? mHead : '<div style="font-size:var(--text-xs);color:var(--text-dim);font-family:var(--font-ui);margin-bottom:6px">— sin partes madre —</div>'}${mRows}${mTotals}
    ${invited.length ? `<div style="margin-top:10px;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);text-transform:uppercase;letter-spacing:1px">Invitados (salen de la madre)</div>${iHead}${iRows}` : ''}
    ${summary}${defBtns}</div>`;
}
function lcMadreSet(i, val) {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const arr = (t.labelCopy && t.labelCopy.businessSplit) || []; if (!arr[i]) return;
  arr[i].madre = val; arr[i].final = _lcFmt(_lcNum(val) - _lcBizPer(t)) + '%';
  saveTracks(); renderTrackTab('labelcopy');
}
function lcInvitedSet(i, fk, val) {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const arr = (t.labelCopy && t.labelCopy.businessInvited) || []; if (!arr[i]) return;
  arr[i][fk] = val;
  if (fk === 'name' && typeof lcPeopleUpsert === 'function') lcPeopleUpsert({ name: val });
  _lcBizRecomputeFinals(t);   // X cambió → recalcular finals de todas las partes madre
  saveTracks(); renderTrackTab('labelcopy');
}
function lcBizSaveDefault() {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const l = launches.find(x => x.id === currentLaunchId); if (!t || !l) return;
  l.bizDefault = ((t.labelCopy && t.labelCopy.businessSplit) || []).map(m => ({ partner: m.partner || '', madre: m.madre || '' }));
  saveLaunches(); if (typeof uiToast === 'function') uiToast('✓ Default del proyecto guardado (' + l.bizDefault.length + ' partes)');
  renderTrackTab('labelcopy');
}
async function lcBizApplyDefault() {
  if (!requireCan('editar_labelcopy')) return;
  const t = curTrack(); const l = launches.find(x => x.id === currentLaunchId); if (!t || !l || !(l.bizDefault || []).length) return;
  if ((t.labelCopy.businessSplit || []).length && typeof uiConfirm === 'function' && !(await uiConfirm('¿Reemplazar las partes madre actuales con el default del proyecto?'))) return;
  t.labelCopy = t.labelCopy || {};
  t.labelCopy.businessSplit = l.bizDefault.map(m => ({ partner: m.partner || '', madre: m.madre || '', final: '' }));
  _lcBizRecomputeFinals(t);
  saveTracks(); renderTrackTab('labelcopy'); if (typeof uiToast === 'function') uiToast('✓ Default aplicado');
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
  kv('Fecha de lanzamiento', lct.releaseDate || (l && l.date)); kv('Explícita', lct.explicit);
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

  // 4 · Split de negocio: partes madre (100%) − invitados (por igual)
  if ((lc.businessSplit || []).length || (lc.businessInvited || []).length) {
    const _num = v => parseFloat(String(v || '').replace(/[^0-9.\-]/g, '')) || 0;
    const _fmt = v => { const r = Math.round(v * 100) / 100; return r % 1 ? r.toFixed(2) : String(r); };
    const invX = (lc.businessInvited || []).reduce((n, x) => n + _num(x.puntos), 0);
    const nMadre = (lc.businessSplit || []).length; const perInv = nMadre > 0 ? invX / nMadre : 0;
    sectionTitle('4 · SPLIT DE NEGOCIO'); doc.setFontSize(8);
    doc.setTextColor(120, 120, 120); doc.text('PARTE MADRE', M, y); doc.text('MADRE %', M + 220, y); doc.text('% FINAL', W - M - 60, y); y += 4;
    doc.line(M, y, W - M, y); y += 12; doc.setTextColor(20, 20, 20); doc.setFontSize(9);
    (lc.businessSplit || []).forEach(b => { need(14); doc.text(clean(b.partner), M, y); doc.text(clean(b.madre), M + 220, y); doc.text(_fmt(_num(b.madre) - perInv) + '%', W - M - 60, y); y += 14; });
    if ((lc.businessInvited || []).length) {
      need(18); doc.setTextColor(120, 120, 120); doc.setFontSize(8); doc.text('INVITADO (sale de la madre)', M, y); doc.text('PUNTOS %', W - M - 60, y); y += 4;
      doc.line(M, y, W - M, y); y += 12; doc.setTextColor(20, 20, 20); doc.setFontSize(9);
      (lc.businessInvited || []).forEach(iv => { need(14); doc.text(clean(iv.name), M, y); doc.text(clean(iv.puntos), W - M - 60, y); y += 14; });
      need(14); doc.setTextColor(255, 107, 53); doc.text(`TOTAL INVITADOS  ${_fmt(invX)} pts`, M, y); doc.setTextColor(20, 20, 20); y += 6;
    }
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
const LEGAL_STATE_COLOR = { pendiente:'var(--accent2)', enviado:'var(--beat)', firmado:'var(--risk)', aprobado:'var(--ok)' };
function trackLegalHTML(t) {
  if (typeof reconcileLegalConflicts === 'function') reconcileLegalConflicts(t); // auto-cierra/reabre docs ruteados
  const legal = t.legal || [];
  const setF = (i, f, cap) => `onchange="setLegalField(${i},'${f}',this.value,'${t.id}')"`;
  const areaBadge = d => d.area && LEGAL_AREA_LABEL[d.area] ? `<span style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1px 5px">${LEGAL_AREA_LABEL[d.area]}</span>` : '';
  const rows = legal.map((d, i) => `<div class="panel" style="margin-bottom:10px">
    ${d.source === 'labelcopy' ? `<div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--accent);margin-bottom:6px;display:flex;align-items:center;gap:5px">${icon('flag',11)} Conflicto ruteado desde Label Copy${areaBadge(d)}${d.autoResolved ? `<span style="color:var(--ok)">${icon('check',10)} auto-cerrada</span>` : ''}</div>` : ''}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
      <input class="input" style="flex:1;min-width:160px;font-size:var(--text-base);padding:6px 9px;font-weight:600" value="${s(d.type)}" placeholder="Tipo (split_sheet, producer_agreement…)" ${setF(i,'type')}>
      <select class="input" style="width:auto;padding:6px 8px;font-size:var(--text-xs);color:${LEGAL_STATE_COLOR[d.state]||'var(--text)'}" onchange="setLegalField(${i},'state',this.value,'${t.id}')">${['pendiente','enviado','firmado','aprobado'].map(x => `<option ${d.state === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <button class="goal-btn reject" title="Quitar" onclick="quitarLegal(${i},'${t.id}')">${icon('close',12)}</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${assigneeSelectHTML(d.responsable, setF(i,'responsable'), 'flex:1;min-width:120px;padding:5px 8px;font-size:var(--text-sm)')}
      <input class="input" style="flex:2;min-width:160px;padding:5px 8px;font-size:var(--text-sm)" value="${s(d.fileLink)}" placeholder="Link del documento (Drive/PDF)" ${setF(i,'fileLink')}>
    </div>
    <input class="input" style="margin-top:8px;padding:5px 8px;font-size:var(--text-sm)" value="${s(d.note)}" placeholder="Nota" ${setF(i,'note')}>
    ${d.fileLink ? `<a href="${safeUrl(d.fileLink)}" target="_blank" rel="noopener" style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--accent);display:inline-block;margin-top:6px">↗ abrir documento</a>` : ''}
    <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);margin-top:4px">act. ${d.updatedAt ? new Date(d.updatedAt).toLocaleDateString('es-MX') : '—'}</div>
  </div>`).join('');
  return `<div class="empty-hint" style="margin-bottom:12px">Documentos legales de esta canción (split sheets, producer agreements, autorizaciones de feature/sample) — con estado, responsable, link y nota.</div>
    ${rows || '<div class="empty-hint">Sin documentos.</div>'}
    <button class="btn btn-ghost" style="margin-top:10px" onclick="agregarLegal('${t.id}')">+ Documento legal</button>`;
}
function setLegalField(i, f, val, tid) {
  if (!requireCan('editar_legal')) return;
  const t = _ctxTrack(tid); if (!t || !t.legal[i]) return;
  t.legal[i][f] = val; t.legal[i].updatedAt = new Date().toISOString();
  if (f === 'state') t.legal[i].autoResolved = false; // un cambio manual de estado libera el doc del auto-manejo
  saveTracks(); if (f === 'state' || f === 'fileLink') _rerenderReleaseCtx();
}
async function agregarLegal(tid) {
  if (!requireCan('editar_legal')) return;
  const t = _ctxTrack(tid); if (!t) return;
  const type = await uiPrompt('Tipo (split_sheet / producer_agreement / feature_clearance / sample_clearance / other):', { title: 'Nuevo documento legal' });
  if (!type) return;
  t.legal = t.legal || []; t.legal.push({ id: 'lg-' + Date.now(), type: type.trim(), state: 'pendiente', responsable: '', fileLink: '', note: '', updatedAt: new Date().toISOString() });
  saveTracks(); _rerenderReleaseCtx();
}
function setLegalState(i, state, tid) { if (!requireCan('editar_legal')) return; const t = _ctxTrack(tid); if (t && t.legal[i]) { t.legal[i].state = state; t.legal[i].autoResolved = false; t.legal[i].updatedAt = new Date().toISOString(); saveTracks(); _rerenderReleaseCtx(); } }
function quitarLegal(i, tid) { if (!requireCan('editar_legal')) return; const t = _ctxTrack(tid); if (t && t.legal[i]) { t.legal.splice(i, 1); saveTracks(); _rerenderReleaseCtx(); } }

// ── Ruteo legal nivel 2: convierte un conflicto del Label Copy en una tarea legal accionable en t.legal ──
// Idempotente por conflictKey (no duplica). Por trackId → funciona desde la pestaña Legal del release (track no activo).
function legalHasConflict(t, key) { return !!(t && (t.legal || []).some(d => d.conflictKey === key)); }
function routeIssueToLegal(trackId, key) {
  if (!requireCan('editar_legal')) return;
  const t = (typeof tracks !== 'undefined') ? tracks.find(x => x.id === trackId) : null; if (!t) return;
  const iss = (typeof labelCopyIssues === 'function' ? labelCopyIssues(t) : []).find(x => x.key === key); if (!iss) return; // deriva type/note del key (sin pasarlos por el DOM)
  t.legal = t.legal || [];
  if (t.legal.some(d => d.conflictKey === key)) { if (typeof uiToast === 'function') uiToast('Ese conflicto ya está en Legal'); return; }
  const responsable = (typeof legalDefaultAssignee === 'function') ? legalDefaultAssignee(iss.area) : '';
  t.legal.push({ id: 'lg-' + Date.now() + '-' + Math.floor(Math.random() * 999), type: iss.type, state: 'pendiente', responsable, area: iss.area || '', fileLink: '', note: iss.text, source: 'labelcopy', conflictKey: key, updatedAt: new Date().toISOString() });
  saveTracks();
  if (typeof logActivity === 'function') { try { logActivity('created', `Tarea legal creada desde Label Copy: ${iss.type}`, { trackId: t.id, releaseId: (typeof currentLaunchId !== 'undefined' ? currentLaunchId : null) }); } catch (e) {} }
  // re-render la vista activa (pestaña Legal del release o del track)
  if (typeof _releaseTab !== 'undefined' && _releaseTab === 'legal' && typeof renderReleaseTab === 'function') renderReleaseTab('legal');
  if (typeof curTrack === 'function' && curTrack() && curTrack().id === t.id && typeof renderTrackTab === 'function' && _trackTab === 'legal') renderTrackTab('legal');
  if (typeof uiToast === 'function') uiToast('✓ Conflicto ruteado a Legal');
}
// Rutea todos los conflictos aún no ruteados de un track (bulk).
function routeAllIssuesToLegal(trackId) {
  const t = (typeof tracks !== 'undefined') ? tracks.find(x => x.id === trackId) : null; if (!t) return;
  const pend = (typeof labelCopyIssues === 'function' ? labelCopyIssues(t) : []).filter(iss => iss.key && !legalHasConflict(t, iss.key));
  if (!pend.length) return;
  if (!requireCan('editar_legal')) return;
  pend.forEach(iss => routeIssueToLegal(trackId, iss.key, iss.type, iss.text));
}
// ── Ruteo legal nivel 3: auto-cierre cuando el conflicto se resuelve (y reapertura si reaparece) ──
// Reconcilia los docs legales ruteados (source==='labelcopy') contra los conflictos vivos del Label Copy.
// Solo administra docs que NOSOTROS auto-cerramos (autoResolved); un toque manual del estado libera el doc
// (setLegalField/State limpian autoResolved). Idempotente; guarda + loguea solo si hubo cambio. Devuelve bool.
function reconcileLegalConflicts(t) {
  if (!t || !(t.legal && t.legal.length)) return false;
  const live = new Set((typeof labelCopyIssues === 'function' ? labelCopyIssues(t) : []).map(i => i.key).filter(Boolean));
  let changed = false;
  t.legal.forEach(d => {
    if (d.source !== 'labelcopy' || !d.conflictKey) return;
    const stillConflict = live.has(d.conflictKey);
    if (!stillConflict && d.state !== 'aprobado' && !d.autoResolved) {
      d.state = 'aprobado'; d.autoResolved = true; d.updatedAt = new Date().toISOString(); changed = true;
      if (typeof logActivity === 'function') { try { logActivity('status_changed', `Tarea legal auto-cerrada (conflicto del Label Copy resuelto): ${d.type}`, { trackId: t.id }, { estado: 'aprobado' }); } catch (e) {} }
    } else if (stillConflict && d.autoResolved) {
      d.state = 'pendiente'; d.autoResolved = false; d.updatedAt = new Date().toISOString(); changed = true;
      if (typeof logActivity === 'function') { try { logActivity('status_changed', `Tarea legal reabierta (el conflicto del Label Copy reapareció): ${d.type}`, { trackId: t.id }, { estado: 'pendiente' }); } catch (e) {} }
    }
  });
  if (changed && typeof saveTracks === 'function') saveTracks();
  return changed;
}

// ══════════════════════════════════════════
// PLAN DE MARKETING (PDF por LANZAMIENTO) — upload real a Supabase Storage + visor embebido
// Vive en la pestaña Campaña del release (un plan por lanzamiento). Bucket privado 'marketing-plans';
// se sirve por signed URL. Degrada limpio si el bucket no existe o no hay nube. Gated ver/editar_marketing.
// ══════════════════════════════════════════
const MKT_BUCKET = 'marketing-plans';
const MKT_MAX_BYTES = 25 * 1024 * 1024;
function _mktSize(n) { if (!n) return ''; const kb = n / 1024; return kb < 1024 ? Math.round(kb) + ' KB' : (kb / 1024).toFixed(1) + ' MB'; }
function _curLaunch() { return (typeof launches !== 'undefined') ? launches.find(x => x.id === currentLaunchId) : null; }
function releaseMarketingHTML(l) {
  const canView = (typeof canDo !== 'function') || canDo('ver_marketing') || canDo('editar_marketing');
  if (!canView) return `<div class="empty-hint">No tienes acceso al plan de marketing de este lanzamiento.</div>`;
  const canEdit = (typeof canDo === 'function') && canDo('editar_marketing');
  const mp = l.marketingPlan || {};
  const cloud = (typeof authed === 'function') && authed();
  const fileInput = canEdit ? `<input type="file" id="mkt-file" accept="application/pdf" style="display:none" onchange="uploadMarketingPlan(this)">` : '';
  const intro = `<div class="empty-hint" style="margin-bottom:12px">Sube el plan de marketing del lanzamiento en PDF y preséntalo desde Tempo. El archivo vive en tu nube (bucket privado del equipo).</div>`;
  if (!mp.path) {
    const zone = canEdit
      ? (cloud
        ? `<button class="btn btn-primary" onclick="document.getElementById('mkt-file').click()">${icon('file',14)} Subir PDF</button>
           <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);margin-top:8px">PDF · máx 25 MB</div>`
        : `<div class="empty-hint">Conéctate a la nube (inicia sesión con tu equipo) para subir el plan de marketing.</div>`)
      : `<div class="empty-hint">Aún no hay plan de marketing cargado.</div>`;
    return `${fileInput}<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('megaphone',18)}</span><span class="ph-title">Plan de Marketing</span><span class="ph-sub">PDF presentable</span></div>${intro}${zone}</div>`;
  }
  const meta = `<div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${s(mp.name)||'plan.pdf'}${mp.size?` · ${_mktSize(mp.size)}`:''}${mp.uploadedAt?` · subido ${new Date(mp.uploadedAt).toLocaleDateString('es-MX')}`:''}${mp.uploadedBy?` · ${s(mp.uploadedBy)}`:''}</div>`;
  const actions = `<div style="display:flex;gap:8px;margin-left:auto;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" onclick="openMarketingPlan()">${icon('link',12)} Abrir en pestaña</button>
    ${canEdit?`<button class="btn btn-ghost btn-sm" onclick="document.getElementById('mkt-file').click()">${icon('refresh',12)} Reemplazar</button>`:''}
    ${canEdit?`<button class="goal-btn reject" title="Quitar" onclick="removeMarketingPlan()">${icon('close',12)}</button>`:''}</div>`;
  const viewer = `<div style="margin-top:12px;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:var(--surface2)">
    <div id="mkt-viewer-status" style="padding:10px;font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-dim)">Cargando visor…</div>
    <iframe id="mkt-frame" title="Plan de marketing" style="display:none;width:100%;height:640px;border:0;background:#fff"></iframe></div>`;
  return `${fileInput}<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('megaphone',18)}</span><span class="ph-title">Plan de Marketing</span>${actions}</div>${meta}${viewer}</div>`;
}
async function mktLoadViewer() {
  const l = _curLaunch(); if (!l || !l.marketingPlan || !l.marketingPlan.path) return;
  const frame = document.getElementById('mkt-frame'); const st = document.getElementById('mkt-viewer-status'); if (!frame) return;
  try {
    const sb = (typeof getSb === 'function') ? await getSb() : null;
    if (!sb) { if (st) st.textContent = 'Conéctate a la nube para ver el PDF.'; return; }
    const { data, error } = await sb.storage.from(MKT_BUCKET).createSignedUrl(l.marketingPlan.path, 3600);
    if (error || !data || !data.signedUrl) { if (st) st.textContent = 'No se pudo cargar el PDF (revisa que el bucket "marketing-plans" exista en Supabase).'; return; }
    frame.src = data.signedUrl; frame.style.display = 'block'; if (st) st.style.display = 'none';
  } catch (e) { if (st) st.textContent = 'No se pudo cargar el PDF.'; }
}
async function openMarketingPlan() {
  const l = _curLaunch(); if (!l || !l.marketingPlan || !l.marketingPlan.path) return;
  const w = window.open('', '_blank'); // abrir sync (evita bloqueo de popups) y luego setear la URL firmada
  try {
    const sb = (typeof getSb === 'function') ? await getSb() : null; if (!sb) { if (w) w.close(); return; }
    const { data, error } = await sb.storage.from(MKT_BUCKET).createSignedUrl(l.marketingPlan.path, 3600);
    if (error || !data) { if (w) w.close(); if (typeof uiAlert === 'function') uiAlert('No se pudo abrir el PDF.'); return; }
    if (w) w.location = data.signedUrl;
  } catch (e) { if (w) w.close(); }
}
async function uploadMarketingPlan(input) {
  if (!requireCan('editar_marketing')) return;
  const file = input && input.files && input.files[0]; if (!file) return;
  input.value = ''; // permite re-subir el mismo archivo luego
  const l = _curLaunch(); if (!l) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { uiAlert('El plan de marketing debe ser un PDF.'); return; }
  if (file.size > MKT_MAX_BYTES) { uiAlert('El PDF supera el máximo de 25 MB.'); return; }
  const sb = (typeof getSb === 'function') ? await getSb() : null;
  if (!sb || !(typeof authed === 'function' && authed())) { uiAlert('Conéctate a la nube (inicia sesión con tu equipo) para subir el plan.'); return; }
  if (typeof uiToast === 'function') uiToast('Subiendo plan…');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
  const teamId = (typeof _teamId !== 'undefined' && _teamId) ? _teamId : 'local';
  const path = `${teamId}/${l.id}/${Date.now()}-${safe}`;
  try {
    const { error } = await sb.storage.from(MKT_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true });
    if (error) {
      if (/bucket|not found|does not exist/i.test(error.message || '')) uiAlert('Falta crear el bucket "marketing-plans" en Supabase (Storage). Corre supabase/sql/marketing_plans_storage.sql o créalo en el panel.');
      else uiAlert('No se pudo subir: ' + (error.message || 'error'));
      return;
    }
    const old = l.marketingPlan && l.marketingPlan.path;
    l.marketingPlan = { path, name: file.name, size: file.size, uploadedAt: new Date().toISOString(), uploadedBy: (typeof _user !== 'undefined' && _user && _user.email) || '' };
    saveLaunches();
    if (old && old !== path) { try { await sb.storage.from(MKT_BUCKET).remove([old]); } catch (e) {} } // limpia el anterior
    if (typeof renderReleaseTab === 'function') renderReleaseTab('campana');
    if (typeof uiToast === 'function') uiToast('✓ Plan de marketing subido');
    if (typeof logActivity === 'function') { try { logActivity('created', `Plan de marketing subido: ${s(l.name) || 'lanzamiento'}`, { releaseId: l.id, artistId: l.artistId }); } catch (e) {} }
  } catch (e) { uiAlert('No se pudo subir el plan: ' + (e.message || e)); }
}
async function removeMarketingPlan() {
  if (!requireCan('editar_marketing')) return;
  const l = _curLaunch(); if (!l || !l.marketingPlan || !l.marketingPlan.path) return;
  if (typeof uiConfirm === 'function' && !(await uiConfirm('¿Quitar el plan de marketing de este lanzamiento?'))) return;
  const path = l.marketingPlan.path;
  l.marketingPlan = {}; saveLaunches(); if (typeof renderReleaseTab === 'function') renderReleaseTab('campana');
  try { const sb = (typeof getSb === 'function') ? await getSb() : null; if (sb) await sb.storage.from(MKT_BUCKET).remove([path]); } catch (e) {}
  if (typeof uiToast === 'function') uiToast('✓ Plan de marketing quitado');
}
