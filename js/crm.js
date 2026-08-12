// ══════════════════════════════════════════
// CRM — checklist, "Listo para lanzar" y macro-fase (PLAN_CRM §2.5)
// ══════════════════════════════════════════

// Checklist por TRACK — definición POR DEFECTO (editable por track; templates por equipo)
const DEFAULT_TRACK_CHECKLIST = {
  audio:   [['refSubida','Ref subida'],['mezclaRecibida','Mezcla recibida'],['masterRecibido','Máster recibido'],['masterWAV','Máster WAV'],['calidadOK','Calidad OK'],['versionClean','Versión clean'],['versionExplicit','Versión explícita']],
  legal:   [['splitCreado','Split sheet creado'],['splitFirmado','Split firmado'],['producerCreado','Producer agreement creado'],['producerFirmado','Producer firmado'],['featureAuth','Feature autorizado'],['sampleAuth','Sample autorizado'],['labelCopyCompleto','Label Copy completo']],
  distrib: [['metadataCompleta','Metadata completa'],['isrcGenerado','ISRC generado']],
};
// Checklist a nivel RELEASE
const RELEASE_CHECKLIST = {
  intake:  [['masterWav','Máster final (WAV)'],['arteAlta','Arte alta-res (≥3000px)'],['letraEntregada','Letra entregada'],['creditosLegales','Créditos / nombres legales'],['splitsDefinidos','% de splits definidos'],['linksPlataformas','Links de plataformas (Spotify/Apple)']],
  visual:  [['coverCreado','Cover creado'],['coverAprobado','Cover aprobado'],['coverFormatoOK','Cover formato OK'],['assetsSubidos','Assets subidos']],
  distrib: [['distribuidoraSeleccionada','Distribuidora seleccionada'],['upcGenerado','UPC generado'],['fechaConfirmada','Fecha confirmada'],['subidoADistribucion','Subido a distribución'],['pitchEditorial','Pitch editorial']],
  mkt:     [['adnCampanaCompleto','ADN de campaña completo'],['planContenido','Plan de contenido'],['calendarioCreado','Calendario creado'],['presupuestoDefinido','Presupuesto definido'],['planMediosDefinido','Plan de medios definido']],
};
const CHECKLIST_GROUP_LABEL = { intake:'Intake (del artista)', audio:'Audio', legal:'Legal', distrib:'Distribución', visual:'Visual', mkt:'Marketing', otros:'Otros' };

function _countChecklist(obj, def) {
  let done = 0, total = 0;
  Object.keys(def).forEach(g => (def[g] || []).forEach(([k]) => { total++; if (obj && obj[g] && obj[g][k]) done++; }));
  return { done, total };
}
// Definición efectiva del checklist de un track (propia si la editó/aplicó template; si no, la default)
function trackChecklistDef(t) {
  return (t && t.checklistDef && typeof t.checklistDef === 'object') ? t.checklistDef : DEFAULT_TRACK_CHECKLIST;
}
function trackReady(t) { return _countChecklist((t && t.checklist) || {}, trackChecklistDef(t)); }

// ── Templates de checklist (flujos propios reutilizables, por equipo) ──
function checklistTemplatesKey() { return 'ao_checklist_templates_' + (typeof _teamId !== 'undefined' && _teamId ? _teamId : 'local'); }
function getChecklistTemplates() { try { return JSON.parse(localStorage.getItem(checklistTemplatesKey())) || []; } catch (e) { return []; } }
function setChecklistTemplates(arr) { try { localStorage.setItem(checklistTemplatesKey(), JSON.stringify(arr)); } catch (e) {} }
function cloneDef(def) { const o = {}; Object.keys(def || {}).forEach(g => o[g] = (def[g] || []).map(it => [it[0], it[1]])); return o; }
function checklistSlug(label) { return (s(label).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'item') + '_' + Math.random().toString(36).slice(2, 6); }
// "Listo para lanzar %" del release = checklists de TODOS sus tracks + checklist del release
function releaseReady(l) {
  let done = 0, total = 0;
  (typeof tracksOfLaunch === 'function' ? tracksOfLaunch(l) : []).forEach(t => { const c = trackReady(t); done += c.done; total += c.total; });
  const rc = _countChecklist((l && l.releaseChecklist) || {}, RELEASE_CHECKLIST); done += rc.done; total += rc.total;
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
}

// Macro-fase (fase más avanzada alcanzada según el checklist; override manual gana)
const PHASES = ['Idea', 'Producción', 'Legal', 'Distribución', 'Lanzado', 'Post'];
function trackPhase(t) {
  if (t && t.status && t.status.override) return t.status.override;
  const c = (t && t.checklist) || {}, a = c.audio || {}, lg = c.legal || {}, dd = c.distrib || {};
  let phase = 'Idea';
  if (Object.keys(a).some(k => a[k])) phase = 'Producción';
  if (a.masterRecibido) phase = 'Legal';
  if (lg.labelCopyCompleto && dd.metadataCompleta && dd.isrcGenerado) phase = 'Distribución';
  return phase;
}
function releasePhase(l) {
  if (!l) return 'Idea';
  if (l.status === 'complete') return 'Post';
  const ts = (typeof tracksOfLaunch === 'function' ? tracksOfLaunch(l) : []);
  let phase = 'Idea';
  if (ts.length) { const idx = Math.min.apply(null, ts.map(t => PHASES.indexOf(trackPhase(t)))); phase = PHASES[Math.max(0, idx)]; } // cuello de botella
  const rd = (l.releaseChecklist && l.releaseChecklist.distrib) || {};
  if (rd.subidoADistribucion) phase = 'Distribución';
  if (l.status === 'active' && l.date && new Date(l.date + 'T00:00:00') <= new Date()) phase = 'Lanzado';
  return phase;
}
function readyColor(pct) { return pct >= 80 ? 'var(--ok)' : pct >= 40 ? 'var(--beat)' : 'var(--accent2)'; }
function phaseColor(phase) {
  return { 'Idea':'var(--text-dim)','Producción':'var(--beat)','Legal':'#e8924f','Distribución':'var(--accent)','Lanzado':'var(--ok)','Post':'var(--done)' }[phase] || 'var(--text-dim)';
}
// Barra "Listo para lanzar" reutilizable
function readyBarHTML(pct, label) {
  const col = readyColor(pct);
  return `<div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
      <span style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted);letter-spacing:var(--track-caps)">${label || 'LISTO PARA LANZAR'}</span>
      <span style="font-family:var(--font-ui);font-weight:var(--fw-num);font-variant-numeric:tabular-nums;font-size:var(--text-lg);color:${col}">${pct}%</span>
    </div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${col}"></div></div>
  </div>`;
}

// ══════════════════════════════════════════
// TAREAS (release + track) — motor compartido (Sprint 3)
// ══════════════════════════════════════════
// Sprint 6: las tareas viven en la TABLA relacional `tasks` (js/collab.js), no embebidas.
function _taskScope(kind){
  const l = launches.find(x=>x.id===currentLaunchId);
  if(kind==='track'){ const t=(typeof curTrack==='function')?curTrack():null; if(!t) return null; return { artistId:t.artistId, releaseId:(l?l.id:null), trackId:t.id }; }
  if(!l) return null; return { artistId:l.artistId, releaseId:l.id, trackId:null };
}
function _taskList(kind){
  if(kind==='track'){ const t=(typeof curTrack==='function')?curTrack():null; return t?tasksOfTrack(t.id):[]; }
  // Release: incluye las tareas de nivel release Y las de sus canciones (centralización — la canción ya no tiene pestaña Tareas).
  return (typeof tasks!=='undefined') ? tasks.filter(t=>t.releaseId===currentLaunchId) : [];
}
function _taskRerender(kind){ if(typeof renderReleaseTab==='function' && document.getElementById('release-tab-body')) renderReleaseTab('tareas'); else if(typeof renderTareas==='function') renderTareas(); } // tareas (release+canción) viven en Trabajo del release
function tareasPanelHTML(kind){
  const arr=_taskList(kind); const editable=canDo('gestionar_tareas');
  const rows=arr.map(tk=>{ const done=tk.estado===TASK_DONE; const overdue=tk.dueDate && !done && new Date(tk.dueDate+'T00:00:00')<new Date(new Date().toDateString());
    const blocked=(typeof taskIsBlocked==='function')&&taskIsBlocked(tk);
    const depsCount=(tk.deps||[]).length;
    return `<div class="panel" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
      ${blocked?`<span title="${(typeof blockedReason==='function')?blockedReason(tk):'Bloqueada'}" style="color:var(--accent2);display:flex">${icon('lock',13)}</span>`:''}
      <input class="input" style="flex:1;min-width:140px;font-size:var(--text-base);padding:6px 9px;${done?'text-decoration:line-through;color:var(--text-muted)':''}" value="${s(tk.titulo)}" placeholder="Tarea" onchange="setTaskField('${kind}','${tk.id}','titulo',this.value)">
      ${assigneeSelectHTML(tk.responsable, `onchange="setTaskField('${kind}','${tk.id}','responsable',this.value)"`, 'width:auto;min-width:130px;padding:6px 9px;font-size:var(--text-sm)')}
      <select class="input" style="width:auto;padding:6px 8px;font-size:var(--text-xs)" title="Prioridad" onchange="setTaskField('${kind}','${tk.id}','priority',this.value)">${TASK_PRIORITIES.map(x=>`<option value="${x[0]}" ${tk.priority===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>
      <input class="input" type="date" style="width:auto;padding:6px 9px;font-size:var(--text-sm);${overdue?'border-color:var(--accent2);color:var(--accent2)':''}" value="${s(tk.dueDate)}" onchange="setTaskField('${kind}','${tk.id}','dueDate',this.value)">
      <select class="input" style="width:auto;padding:6px 8px;font-size:var(--text-xs)" onchange="setTaskField('${kind}','${tk.id}','estado',this.value)">${TASK_ESTADOS.map(x=>`<option value="${x[0]}" ${tk.estado===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select>
      ${editable?`<button class="goal-btn" title="Dependencias${depsCount?' ('+depsCount+')':''}" style="${depsCount?'color:var(--accent)':''}" onclick="openDepsPicker('${tk.id}')">${icon('link',12)}</button>`:''}
      ${editable?`<button class="goal-btn reject" title="Quitar" onclick="removeTask('${kind}','${tk.id}')">${icon('close',12)}</button>`:''}
    </div>`;}).join('');
  return `${(typeof secInfo==='function')?secInfo('Tareas ' + (kind==='track'?'de la canción':'del lanzamiento'), 'Responsable, prioridad, fecha y estado. También aparecen en la lista global "Mis tareas".'):''}${rows||'<div class="empty-hint">Sin tareas.</div>'}${editable?`<button class="btn btn-ghost" style="margin-top:6px" onclick="addTask('${kind}')">+ Tarea</button>`:''}`;
}
async function addTask(kind){ if(!requireCan('gestionar_tareas')) return; const scope=_taskScope(kind); if(!scope) return; const tit=(await uiPrompt('Tarea:',{title:'Nueva tarea'})||'').trim(); if(!tit) return; createTask(scope,{titulo:tit}); _taskRerender(kind); }
function setTaskField(kind,id,f,val){ if(!requireCan('gestionar_tareas')) return; const patch={}; patch[f]=val; updateTaskRow(id,patch); if(f==='estado'||f==='dueDate'||f==='priority') _taskRerender(kind); }
function removeTask(kind,id){ if(!requireCan('gestionar_tareas')) return; deleteTaskRow(id); _taskRerender(kind); }

// ══════════════════════════════════════════
// ALERTAS del release (Sprint 3) — señales accionables
// ══════════════════════════════════════════
function releaseAlerts(l){
  const out=[]; if(!l) return out;
  const dleft = l.date ? (typeof diasRestantes==='function'?diasRestantes(l.date):null) : null; // días al drop
  const near = dleft!=null && dleft>=0 && dleft<=14;
  const released = (l.status==='complete') || (dleft!=null && dleft<0);
  const ts = (typeof tracksOfLaunch==='function')?tracksOfLaunch(l):[];
  const rc = l.releaseChecklist||{};
  if(!(rc.visual&&rc.visual.coverCreado)) out.push({level:near?'red':'yellow', text:'Falta la portada del lanzamiento'+(near?` (estreno en ${dleft}d)`:''), action:{label:'Archivos →', fn:`setReleaseTab('archivos')`}});
  ts.forEach(t=>{ const lg=(t.checklist&&t.checklist.legal)||{}; const a=(t.checklist&&t.checklist.audio)||{};
    if(!lg.splitFirmado) out.push({level:near?'red':'yellow', text:`Split sin firmar: ${s(t.title)||'canción'}`, action:{label:'Checklist →', fn:`setReleaseTab('checklists')`}});
    if(near && !a.masterRecibido) out.push({level:'red', text:`Falta máster: ${s(t.title)||'canción'} (estreno en ${dleft}d)`, action:{label:'Audio →', fn:`openTrack('${t.id}','audio')`}});
    // Ruteo legal: conflicto de titularidad del Label Copy (split ≠ 100%) → salta a la pestaña Legal del release
    const iss=(typeof labelCopyIssues==='function')?labelCopyIssues(t):[];
    if(iss.some(i=>i.level==='red')) out.push({level:near?'red':'yellow', text:`Titularidad con conflicto: ${s(t.title)||'canción'}`, action:{label:'Legal →', fn:`setReleaseTab('legal')`}});
  });
  const _rtasks = (typeof tasks!=='undefined') ? tasks.filter(t=>t.releaseId===l.id) : [];
  const overdue = _rtasks.filter(tk=>tk.dueDate && tk.estado!==TASK_DONE && (typeof diasRestantes==='function') && diasRestantes(tk.dueDate)<0).length;
  if(overdue) out.push({level:'red', text:`${overdue} tarea(s) vencida(s)`, action:{label:'Tareas →', fn:`setReleaseTab('trabajo')`}});
  if(released) out.push({level:'yellow', text:'Ya salió este lanzamiento — genera el reporte', action:{label:`${icon('report',12)} Reporte`, fn:`abrirReporteLanzamiento('${l.id}')`}});
  return out;
}
function alertsHTML(l){
  const a = releaseAlerts(l);
  if(!a.length) return '';
  return `<div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">${a.map(x=>`<div style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);padding:7px 10px;border-radius:8px;background:${x.level==='red'?'rgba(255,77,77,.08)':'rgba(255,170,0,.08)'}"><span class="dot ${x.level==='red'?'dot--red':'dot--yellow'}"></span><span style="flex:1">${x.text}</span>${x.action?`<button class="btn btn-ghost btn-sm" onclick="${x.action.fn}">${x.action.label}</button>`:''}</div>`).join('')}</div>`;
}

// ══════════════════════════════════════════
// ESPACIADO + CARGA DE ROSTER (Tier 2 #5) — guardarraíles de calendario
// ══════════════════════════════════════════
// Clave de semana ISO (lunes-domingo) para agrupar releases del roster.
function _isoWeekKey(dateStr){
  const d=new Date(s(dateStr)+'T00:00:00'); if(isNaN(d)) return '';
  const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=dt.getUTCDay()||7; dt.setUTCDate(dt.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const wk=Math.ceil((((dt-yearStart)/86400000)+1)/7);
  return dt.getUTCFullYear()+'-W'+String(wk).padStart(2,'0');
}
// Otros releases del roster (todo el workspace) en la misma semana del drop.
function rosterReleasesInWeek(dateStr, excludeId){
  const key=_isoWeekKey(dateStr); if(!key) return [];
  const all=(typeof launches!=='undefined')?launches:[];
  return all.filter(l=>l.id!==excludeId && l.date && _isoWeekKey(l.date)===key);
}
// Avisos de lead-time (≥6 sem) y de carga de roster (máx 2–3/semana).
function releaseSpacingWarnings(l){
  const out=[]; if(!l||!l.date) return out;
  const dleft=(typeof diasRestantes==='function')?diasRestantes(l.date):null;
  const released=(l.status==='complete')||(dleft!=null&&dleft<0);
  if(!released && dleft!=null && dleft>=0 && dleft<42){
    out.push({level: dleft<21?'red':'yellow', text:`Antelación corta: ${dleft}d al estreno (ideal ≥42). Menos de 6 semanas arriesga la ventana de pitch editorial.`});
  }
  const wk=rosterReleasesInWeek(l.date, l.id);
  if(wk.length>=2){
    const names=wk.map(x=>s(x.name)).filter(Boolean).slice(0,3).join(', ');
    out.push({level: wk.length>=3?'red':'yellow', text:`Semana cargada en el calendario: ${wk.length+1} lanzamientos${names?` (${names}${wk.length>3?'…':''})`:''}. Recomendado: máx. 2–3 por semana.`});
  }
  return out;
}
function spacingHTML(l){
  const a=releaseSpacingWarnings(l);
  if(!a.length) return '';
  return `<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${a.map(x=>`<div style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);padding:7px 10px;border-radius:8px;background:${x.level==='red'?'rgba(255,77,77,.08)':'rgba(255,170,0,.08)'}"><span style="display:inline-flex;color:${x.level==='red'?'var(--accent2)':'var(--beat)'}">${icon('calendar',13)}</span><span style="flex:1">${x.text}</span></div>`).join('')}</div>`;
}

// ══════════════════════════════════════════
// "QUÉ FALTA PARA LANZAR" enriquecido (Tier 2 #7)
// ══════════════════════════════════════════
// Lista accionable de pendientes: checklist (release + tracks) + tareas abiertas.
function releaseWhatsMissing(l){
  const out=[]; if(!l) return out;
  const rc=l.releaseChecklist||{};
  Object.keys(RELEASE_CHECKLIST).forEach(g=>{ RELEASE_CHECKLIST[g].forEach(([k,label])=>{ if(!(rc[g]&&rc[g][k])) out.push({type:g, label, area:CHECKLIST_GROUP_LABEL[g]||g}); }); });
  const ts=(typeof tracksOfLaunch==='function')?tracksOfLaunch(l):[];
  ts.forEach(t=>{ const def=trackChecklistDef(t); const c=t.checklist||{};
    Object.keys(def).forEach(g=>{ (def[g]||[]).forEach(([k,label])=>{ if(!(c[g]&&c[g][k])) out.push({type:g, label:`${label} — ${s(t.title)||'track'}`, area:CHECKLIST_GROUP_LABEL[g]||g}); }); }); });
  const _t=(typeof tasks!=='undefined')?tasks.filter(x=>x.releaseId===l.id && x.estado!==TASK_DONE):[];
  _t.forEach(tk=>{ const overdue=tk.dueDate&&(typeof diasRestantes==='function')&&diasRestantes(tk.dueDate)<0; out.push({type:'task', label:s(tk.titulo)||'Tarea', area:'Tareas', blocking: !!overdue || tk.estado==='bloqueado'}); });
  return out;
}
function whatsMissingHTML(l){
  const items=releaseWhatsMissing(l);
  if(!items.length) return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('checklist',18)}</span><span class="ph-title">Qué falta para lanzar</span></div><div class="empty-hint" style="color:var(--ok);border-color:color-mix(in srgb,var(--ok) 30%,transparent)">${icon('check',13)} Todo listo para lanzar</div></div>`;
  const byArea={}; items.forEach(it=>{ (byArea[it.area]=byArea[it.area]||[]).push(it); });
  const blocking=items.filter(it=>it.blocking).length;
  const rows=Object.keys(byArea).map(area=>`<div style="margin-bottom:10px"><div class="brief-label" style="margin-bottom:4px">${esc(area)} <span style="color:var(--text-dim)">· ${byArea[area].length}</span></div>${byArea[area].slice(0,8).map(it=>`<div style="display:flex;align-items:center;gap:8px;font-size:var(--text-sm);padding:5px 0;border-bottom:1px solid var(--border)"><span class="dot ${it.blocking?'dot--red':'dot--yellow'}"></span><span style="flex:1">${esc(it.label)}</span></div>`).join('')}${byArea[area].length>8?`<div style="font-size:var(--text-2xs);color:var(--text-dim);font-family:var(--font-ui);margin-top:4px">+${byArea[area].length-8} más</div>`:''}</div>`).join('');
  return `<div class="panel"><div class="panel-head"><span class="ph-icon">${icon('checklist',18)}</span><span class="ph-title">Qué falta para lanzar</span><span class="ph-sub">${items.length} pendientes${blocking?` · ${blocking} bloqueantes`:''}</span></div>${rows}</div>`;
}
