
// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
const s  = v => (v == null ? '' : String(v));
const up = v => s(v).toUpperCase();
const trim = v => s(v).replace(/^["'﻿\r\s]+|["'\r\s]+$/g, '');
const esc = v => s(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const safeUrl = v => /^https?:\/\//i.test(s(v)) ? s(v) : (s(v).startsWith('data:image/') ? s(v) : '#');

// ══════════════════════════════════════════
// ESTADO GLOBAL
// ══════════════════════════════════════════
let referencias   = [];
// La selección de ideas es POR LANZAMIENTO (launch.ideas), no global.
function refKey(r) { return r && s(r.id).trim() ? ('id:' + s(r.id).trim()) : ('t:' + s(r.title).trim().toLowerCase()); }
function ideaSelected(r) { const a = activeLaunch(); return !!(a && a.ideas && a.ideas.some(x => x.key === refKey(r))); }
let bancoCargado  = false;
let activeForFilter = 'all';
let activeCatFilter = 'all';
let paginaActual  = 1;
let porPagina     = 25;
let bancoSearch   = '';        // búsqueda por texto (título/hook/tags)
let bancoMine     = false;     // filtro "Mis referencias" (solo personalizadas)
let bancoRandom   = false;     // orden aleatorio on/off
let _shuffleKey   = 0;         // semilla del orden aleatorio (cambia al re-randomizar)
let bancoSort     = 'default'; // 'default' | 'recientes' | 'usadas'
// ── Contador de uso de referencias (para "Más usadas") ──
function _refUsageMap() { try { return JSON.parse(localStorage.getItem('ao_ref_usage')) || {}; } catch (e) { return {}; } }
function refUsage(r) { return _refUsageMap()[refKey(r)] || 0; }
function bumpRefUsage(r) { try { const m = _refUsageMap(); m[refKey(r)] = (m[refKey(r)] || 0) + 1; localStorage.setItem('ao_ref_usage', JSON.stringify(m)); } catch (e) {} }
// Timestamp aproximado de una referencia (custom/comunidad llevan 'custom-<ts>' en el id; CSV → 0).
function refTime(r) { const m = s(r && r.id).match(/(\d{12,})/); return m ? parseInt(m[1], 10) : 0; }

// ══════════════════════════════════════════
// TRADUCCIÓN AL ESPAÑOL (banco de referencias) — toggle + caché + Google (gratis, CORS ok)
// ══════════════════════════════════════════
let bancoTranslate = (function(){ try { return localStorage.getItem('ao_bank_lang') === 'es'; } catch(e){ return false; } })();
// Diccionario de tags (set conocido) → instantáneo, sin red.
const CAT_ES = {
  'performance':'Performance','vibes':'Vibes / ambiente','transition hook':'Gancho de transición','relatable':'Identificable',
  'storytelling':'Narrativa','educational':'Educativo','comedy/sketch':'Comedia / sketch','about me':'Sobre mí','reaction':'Reacción',
  'motivational / emotional':'Motivacional / emocional','behind the scenes':'Detrás de cámaras','behind the scene':'Detrás de cámaras',
  'engagement':'Interacción','song promotion':'Promoción de la canción','show your skills / challenge':'Muestra tu talento / reto',
  'talking to camera':'Hablando a cámara','trending sounds':'Sonidos en tendencia','tutorials/recommendations':'Tutoriales / recomendaciones',
  'funny videos for inspiration':'Videos graciosos para inspirar','custom':'Personalizada','awareness':'Reconocimiento','pov':'POV',
  'trend':'Tendencia','bts':'Detrás de cámaras','humor':'Humor',
};
const FOR_ES = { 'musician/band':'Músico / banda','vocalist/rapper':'Vocalista / rapero','producer':'Productor','dj':'DJ' };
function trTag(tag, kind) {
  // Limpieza de emoji AL RENDER (DESIGN.md v2 T5): "✨ Vibes" → "Vibes". Los datos (CSV) no se
  // tocan; sólo el display. Strip primero también arregla el lookup de traducción (clave sin emoji).
  const raw = (typeof stripEmoji === 'function') ? stripEmoji(tag) : s(tag);
  if (!bancoTranslate) return raw;
  const k = raw.toLowerCase();
  return (kind === 'for' ? (FOR_ES[k] || raw) : (CAT_ES[k] || raw));
}
// Caché de traducciones de texto libre (título/hook/descripción).
function _trCache() { try { return JSON.parse(localStorage.getItem('ao_tr_cache')) || {}; } catch(e){ return {}; } }
let _trMem = _trCache();
function _trSave() { try { localStorage.setItem('ao_tr_cache', JSON.stringify(_trMem)); } catch(e){} }
// Devuelve el texto traducido si está en caché; si no, el original (y se traducirá async).
function trText(text) {
  if (!bancoTranslate) return text;
  const t = s(text).trim(); if (!t) return text;
  return _trMem[t] || text;
}
// Traduce en lote los textos faltantes (Google gtx, concurrencia limitada). Devuelve cuántos nuevos cacheó.
let _trInflight = {};
async function translateBatch(texts) {
  if (!bancoTranslate) return 0;
  const todo = [...new Set(texts.map(x => s(x).trim()).filter(t => t && !_trMem[t] && !_trInflight[t]))];
  if (!todo.length) return 0;
  todo.forEach(t => { _trInflight[t] = true; });
  let added = 0, i = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      try {
        const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=' + encodeURIComponent(t));
        if (r.ok) { const d = await r.json(); const out = (d[0] || []).map(seg => seg[0]).join(''); if (out) { _trMem[t] = out; added++; } }
      } catch (e) {}
      delete _trInflight[t];
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker));
  if (added) _trSave();
  return added;
}
function toggleBancoTranslate() {
  bancoTranslate = !bancoTranslate;
  try { localStorage.setItem('ao_bank_lang', bancoTranslate ? 'es' : 'en'); } catch(e){}
  if (typeof renderFiltros === 'function') renderFiltros();
  renderBanco();
}

const CAT_PALETTE = ['#FF6B30','#FFAA00','#d98a4f','#7ea584','#6b8ca6','#b3431a','#c9a24f','#9a7b8f'];
const catColorMap = {};
let paletteIdx = 0;
function catColor(c) {
  const key = s(c).toLowerCase();
  if (!key) return '#666';
  if (!catColorMap[key]) { catColorMap[key] = CAT_PALETTE[paletteIdx % CAT_PALETTE.length]; paletteIdx++; }
  return catColorMap[key];
}

// Categoría de contenido → nombre de ícono (cubre cats del banco CSV + del DEMO).
const CAT_ICON = {
  // DEMO / internas
  bts:'headphones', awareness:'identity', engagement:'mic', storytelling:'book',
  trend:'trend', humor:'smile', educativo:'graduation', pov:'eye', 'conversión':'ideas',
  behind:'video', viral:'flame', reel:'phone', short:'zap',
  // CSV (normalizadas sin emoji por stripEmoji)
  'behind the scenes':'video', 'funny videos for inspiration':'smile',
  'show your skills / challenge':'trophy', 'song promotion':'music',
  'talking to camera':'mic', 'trending sounds':'trend',
  'tutorials/recommendations':'graduation', 'vibes':'ai', 'educational':'graduation',
  'relatable':'person', 'about me':'person', 'transition hook':'trend',
  'performance':'sound', 'comedy/sketch':'smile', 'reaction':'eye',
  'motivational / emotional':'heart',
};
function catIcon(cats) {
  const first = stripEmoji(cats[0]).toLowerCase();
  return CAT_ICON[first] || 'pin';
}

// ══════════════════════════════════════════
// PARSER CSV
// ══════════════════════════════════════════
function parsearCSV(csv) {
  function toTags(raw) {
    return trim(raw).split(',').map(t => trim(t).toLowerCase()).filter(t => t.length > 0);
  }
  // Tokenizador CSV completo: respeta comillas, comas y saltos de línea dentro de campos.
  function tokenize(text) {
    const rows = []; let row = []; let cur = ''; let inQ = false;
    text = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i+1] === '"') { cur += '"'; i++; }   // comilla escapada ""
          else inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += c;
      }
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  const rows = tokenize(csv).filter(r => r.some(v => trim(v).length > 0));
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => trim(h).toLowerCase());
  return rows.slice(1).map((vals, idx) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = trim(vals[i] || ''); });
    const forTags = toTags(obj['for'] || obj['para'] || '').map(stripEmoji).filter(Boolean);
    const catTags = toTags(obj['cat'] || obj['categoria'] || '').map(stripEmoji).filter(Boolean);
    return {
      _idx: idx,
      id: obj.id || '',
      title: obj.title || obj.titulo || '',
      hook: obj.hook || '',
      for: forTags,
      cat: catTags,
      link: obj.link || obj.url || '',
      thumb: obj.thumb || obj.miniatura || obj.imagen || obj.image || '',
      comentarios: obj.comentarios || obj.notas || '',
      icon: catIcon(catTags),
    };
  }).filter(r => r.title.trim().length > 0);
}

const DEMO = [
  {_idx:0,id:1,title:"BTS en estudio — Natanael Cano",hook:"Lo que nadie vio...",for:["lanzamiento","single"],cat:["bts","storytelling"],link:"",comentarios:"Muy auténtico",icon:"headphones"},
  {_idx:1,id:2,title:"Hook emocional en espejo",hook:"¿Tú también lo sentiste?",for:["lanzamiento","álbum"],cat:["awareness","pov"],link:"",comentarios:"Primera semana",icon:"identity"},
  {_idx:2,id:3,title:"Trend: antes/después del quiebre",hook:"Antes vs después",for:["single","ep"],cat:["trend","engagement"],link:"",comentarios:"Alta viralidad",icon:"trend"},
  {_idx:3,id:4,title:"Mini documental 60 seg",hook:"Un año en 60 segundos",for:["álbum","lanzamiento"],cat:["storytelling"],link:"",comentarios:"Ancla YouTube",icon:"video"},
  {_idx:4,id:5,title:"Texto en pantalla con mensajes",hook:"Esto es lo que aprendí...",for:["single","lanzamiento"],cat:["engagement","educativo"],link:"",comentarios:"Alta compartición IG",icon:"file"},
  {_idx:5,id:6,title:"Reacción del productor",hook:"La cara cuando escuchó el take...",for:["lanzamiento"],cat:["bts","humor"],link:"",comentarios:"Humaniza el proceso",icon:"headphones"},
  {_idx:6,id:7,title:"Duet con fans",hook:"Cántalo conmigo",for:["single","ep","álbum"],cat:["engagement"],link:"",comentarios:"Genera UGC",icon:"mic"},
  {_idx:7,id:8,title:"POV: eres el artista en estudio",hook:"POV: son las 3am",for:["single","lanzamiento"],cat:["pov","humor"],link:"",comentarios:"Trending TikTok",icon:"eye"},
];
function setReferencias(arr) { referencias = arr || []; referencias.forEach((r, i) => { r._idx = i; }); }
setReferencias(DEMO);
// ── Posts propios "desde cero" (mismo modelo que una referencia, persistidos en localStorage) ──
function loadCustomRefs() { try { return JSON.parse(localStorage.getItem('ao_custom_refs')) || []; } catch (e) { return []; } }
function saveCustomRefs(arr) { try { localStorage.setItem('ao_custom_refs', JSON.stringify(arr)); } catch (e) {} }
// El primer tag SIEMPRE es 'custom' (organización: las personalizadas quedan agrupadas y filtrables).
function ensureCustomCat(r) {
  let cats = (r.cat || []).map(c => trim(c).toLowerCase()).filter(Boolean).filter(c => c !== 'custom');
  // dedup conservando orden
  cats = cats.filter((c, i) => cats.indexOf(c) === i);
  r.cat = ['custom', ...cats];
  return r.cat;
}
// Mezcla los posts propios en el banco (se llama al cargar, después del CSV) y reindexa.
function mergeCustomRefs() {
  loadCustomRefs().forEach(c => {
    if (!referencias.some(r => refKey(r) === refKey(c))) {
      const ref = Object.assign({ custom: true, owned: true, shared: false }, c);
      ensureCustomCat(ref);
      referencias.push(ref);
    }
  });
  referencias.forEach((r, i) => { r._idx = i; });
}
// Carga un banco externo (CSV en el repo) en runtime y lo mezcla (dedup por link/clave).
// Mantiene app.html liviano: los bancos grandes viven en archivos .csv servidos por Pages.
async function loadExternalBank(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) return 0;
    const txt = await r.text(); if (!txt.trim()) return 0;
    const parsed = (typeof parsearCSV === 'function') ? parsearCSV(txt) : []; if (!parsed.length) return 0;
    const haveLinks = new Set(referencias.map(x => s(x.link).trim()).filter(Boolean));
    const haveKeys = new Set(referencias.map(refKey));
    let added = 0;
    parsed.forEach(p => {
      const lk = s(p.link).trim();
      if (lk && haveLinks.has(lk)) return;
      if (haveKeys.has(refKey(p))) return;
      referencias.push(p); if (lk) haveLinks.add(lk); haveKeys.add(refKey(p)); added++;
    });
    if (added) {
      referencias.forEach((x, i) => { x._idx = i; });
      if (bancoCargado && ((document.querySelector('.page.active') || {}).id === 'page-banco')) renderBanco();
    }
    return added;
  } catch (e) { return 0; }
}
function persistCustomEdit(r) {
  if (!r || !r.custom || r.owned === false) return; // las de la comunidad (de otros) no se persisten local
  ensureCustomCat(r);
  const arr = loadCustomRefs();
  const snap = { id: r.id, title: r.title, hook: r.hook, cat: r.cat, for: r.for, link: r.link, thumb: r.thumb, comentarios: r.comentarios, icon: r.icon, custom: true, shared: !!r.shared };
  const i = arr.findIndex(x => x.id === r.id);
  if (i >= 0) arr[i] = snap; else arr.push(snap);
  saveCustomRefs(arr);
  if (r.shared) communityCloudPush(r);   // si está compartida, re-sube el snapshot a la comunidad
}
// Crea un post desde cero (post propio) con la misma tarjeta/opciones que una referencia y abre su boxdrop editable.
// PRIVADO por defecto (shared:false); la casilla del boxdrop lo comparte con la comunidad.
function crearPostDesdeCero() {
  const c = { id: 'custom-' + Date.now(), title: 'Nuevo post', hook: '', cat: ['custom'], for: [], link: '', thumb: '', comentarios: '', icon: 'pin', custom: true, owned: true, shared: false };
  const arr = loadCustomRefs(); arr.push(c); saveCustomRefs(arr);
  c._idx = referencias.length; referencias.push(c);
  if (typeof openRefBoxdrop === 'function') openRefBoxdrop(c._idx);
}
function eliminarPostCustom(idx) {
  const r = referencias[idx]; if (!r || !r.custom || r.owned === false) return;
  saveCustomRefs(loadCustomRefs().filter(x => x.id !== r.id));
  if (r.shared) communityCloudRemove(r.id);   // si estaba compartida, quítala de la comunidad
  referencias.splice(idx, 1); referencias.forEach((x, i) => { x._idx = i; });
  document.getElementById('boxdrop').classList.remove('open');
  if (bancoCargado && ((document.querySelector('.page.active') || {}).id === 'page-banco')) renderBanco();
  uiToast('✓ Post eliminado');
}
// ── Tags como chips (agregar/quitar); 'custom' es fijo y no se puede quitar ──
function refAddTag(idx, value) {
  const r = referencias[idx]; if (!r || !r.custom || r.owned === false) return;
  const t = trim(value).toLowerCase();
  if (!t || t === 'custom') { openRefBoxdrop(idx); return; }
  r.cat = (r.cat || []); if (!r.cat.includes(t)) r.cat.push(t);
  r.icon = catIcon(r.cat);
  persistCustomEdit(r); openRefBoxdrop(idx);
}
function refRemoveTag(idx, tag) {
  const r = referencias[idx]; if (!r || !r.custom || r.owned === false) return;
  if (trim(tag).toLowerCase() === 'custom') return; // protegido
  r.cat = (r.cat || []).filter(c => c !== tag);
  ensureCustomCat(r); r.icon = catIcon(r.cat);
  persistCustomEdit(r); openRefBoxdrop(idx);
}
// ── Compartir / privar una referencia personalizada ──
function refSetShared(idx, on) {
  const r = referencias[idx]; if (!r || !r.custom || r.owned === false) return;
  r.shared = !!on; persistCustomEdit(r);
  if (on) { communityCloudPush(r); uiToast('✓ Compartida con la comunidad'); }
  else    { communityCloudRemove(r.id); uiToast('✓ Vuelta a privada'); }
  openRefBoxdrop(idx);
}

// ══════════════════════════════════════════
// COMUNIDAD — referencias compartidas (tabla Supabase community_refs)
// Privadas por defecto; al compartir se suben; cualquier usuario autenticado las ve (pool comunidad).
// ══════════════════════════════════════════
function _communityAuthor() {
  try { return (typeof _user !== 'undefined' && _user && (_user.email || _user.id)) || ''; } catch (e) { return ''; }
}
async function communityCloudPush(r) {
  if (!r || typeof getSb !== 'function' || typeof authed !== 'function' || !authed()) return;
  try {
    const sb = await getSb(); if (!sb) return;
    const data = { id: r.id, title: r.title, hook: r.hook, cat: r.cat, for: r.for, link: r.link, thumb: r.thumb, comentarios: r.comentarios, icon: r.icon };
    await sb.from('community_refs').upsert([{ id: r.id, owner: _user && _user.id, team_id: (typeof _teamId !== 'undefined' ? _teamId : null), author: _communityAuthor(), data, updated_at: new Date().toISOString() }]);
  } catch (e) { /* tabla aún no creada → no-op */ }
}
async function communityCloudRemove(id) {
  if (!id || typeof getSb !== 'function' || typeof authed !== 'function' || !authed()) return;
  try { const sb = await getSb(); if (sb) await sb.from('community_refs').delete().eq('id', id); } catch (e) {}
}
// Carga el pool de comunidad y mezcla en el banco (sin duplicar lo que ya tengo local). Best-effort.
async function communityCloudLoad() {
  if (typeof getSb !== 'function' || typeof authed !== 'function' || !authed()) return;
  try {
    const sb = await getSb(); if (!sb) return;
    const res = await sb.from('community_refs').select('id, owner, author, data');
    if (res.error || !res.data) return;
    const myId = (typeof _user !== 'undefined' && _user) ? _user.id : null;
    res.data.forEach(row => {
      const d = row.data || {};
      if (row.owner === myId) return;                       // las mías ya están locales
      if (referencias.some(r => s(r.id) === s(row.id))) return; // dedup por id
      const ref = Object.assign({}, d, { id: row.id, custom: true, community: true, owned: false, shared: true, author: row.author || '' });
      ensureCustomCat(ref);
      referencias.push(ref);
    });
    referencias.forEach((r, i) => { r._idx = i; });
    if (bancoCargado && ((document.querySelector('.page.active') || {}).id === 'page-banco')) renderBanco();
  } catch (e) {}
}
// ── Moderación ligera del pool de comunidad ──
// Reportar (cualquier usuario) → fila en community_flags. Ocultar (super-admin) → status='hidden'.
async function reportCommunityRef(idx) {
  const r = referencias[idx]; if (!r || !r.community) return;
  if (typeof authed !== 'function' || !authed()) { uiToast('Inicia sesión para reportar'); return; }
  const reason = await uiPrompt('¿Por qué la reportas? (opcional)', { title: 'Reportar referencia' });
  if (reason === null || reason === undefined) return; // cancelado
  try {
    const sb = await getSb(); if (!sb) return;
    await sb.from('community_flags').insert([{ ref_id: r.id, reporter: _user && _user.id, reason: s(reason) }]);
    uiToast('✓ Reporte enviado');
  } catch (e) { uiToast(friendlyError(e, 'enviar el reporte')); }
}
async function hideCommunityRef(idx) {
  const r = referencias[idx]; if (!r || !r.community) return;
  if (!(typeof isAdmin === 'function' && isAdmin())) return;
  if (!await uiConfirm('¿Ocultar esta referencia de la comunidad para todos?')) return;
  try {
    const sb = await getSb(); if (!sb) return;
    const res = await sb.from('community_refs').update({ status: 'hidden' }).eq('id', r.id);
    if (res.error) throw new Error(res.error.message);
    referencias.splice(idx, 1); referencias.forEach((x, i) => { x._idx = i; });
    document.getElementById('boxdrop').classList.remove('open');
    if (bancoCargado && ((document.querySelector('.page.active') || {}).id === 'page-banco')) renderBanco();
    uiToast('✓ Oculta de la comunidad');
  } catch (e) { uiToast('No se pudo ocultar'); }
}
// ── Panel de moderación (super-admin): lista reportes (community_flags) + ocultar/restaurar ──
function abrirModeracion() {
  if (!(typeof isAdmin === 'function' && isAdmin())) return;
  document.getElementById('modal-moderacion').classList.add('open');
  renderModeracion();
}
function cerrarModeracion(e) {
  if (!e || e.target === document.getElementById('modal-moderacion')) document.getElementById('modal-moderacion').classList.remove('open');
}
async function renderModeracion() {
  const host = document.getElementById('moderacion-body'); if (!host) return;
  host.innerHTML = '<div class="empty-hint">Cargando…</div>';
  try {
    const sb = await getSb(); if (!sb) { host.innerHTML = '<div class="empty-hint">Sin conexión a la nube.</div>'; return; }
    const [fr, rr] = await Promise.all([
      sb.from('community_flags').select('ref_id, reporter, reason, created_at'),
      sb.from('community_refs').select('id, data, status, author'),
    ]);
    if (fr.error) throw new Error(fr.error.message);
    const flags = fr.data || [];
    const refsById = {}; (rr.data || []).forEach(r => { refsById[r.id] = r; });
    // agrupa reportes por referencia
    const byRef = {};
    flags.forEach(f => { (byRef[f.ref_id] = byRef[f.ref_id] || []).push(f); });
    const ids = Object.keys(byRef).sort((a, b) => byRef[b].length - byRef[a].length);
    if (!ids.length) { host.innerHTML = '<div class="empty-hint">Sin reportes. El pool de la comunidad está limpio.</div>'; return; }
    host.innerHTML = ids.map(id => {
      const ref = refsById[id] || {}; const d = ref.data || {};
      const reps = byRef[id]; const hidden = ref.status === 'hidden';
      const reasons = reps.filter(r => s(r.reason).trim()).map(r => `"${s(r.reason)}"`).join(' · ');
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${s(d.title) || '(sin título)'} ${hidden ? `<span style="font-size:9px;font-family:var(--font-mono);color:var(--accent2);border:1px solid var(--accent2);border-radius:3px;padding:1px 5px;margin-left:4px">OCULTA</span>` : ''}</div>
            <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-dim)">${reps.length} reporte(s)${ref.author ? ' · por ' + s(ref.author) : ''}</div>
          </div>
          ${hidden
            ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 11px" onclick="moderationSetStatus('${id}','active')">Restaurar</button>`
            : `<button class="btn btn-ghost" style="font-size:11px;padding:5px 11px;color:var(--accent2);border-color:rgba(255,77,77,0.3)" onclick="moderationSetStatus('${id}','hidden')">${icon('eyeOff',12)} Ocultar</button>`}
        </div>
        ${reasons ? `<div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">${reasons}</div>` : ''}
      </div>`;
    }).join('');
    if (typeof hydrateIcons === 'function') hydrateIcons(host);
  } catch (e) { host.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">Error: ${s(e.message)} (¿corriste community_refs.sql?)</div>`; }
}
async function moderationSetStatus(id, status) {
  try {
    const sb = await getSb(); if (!sb) return;
    const res = await sb.from('community_refs').update({ status }).eq('id', id);
    if (res.error) throw new Error(res.error.message);
    uiToast(status === 'hidden' ? '✓ Oculta' : '✓ Restaurada');
    renderModeracion();
  } catch (e) { uiToast('No se pudo actualizar'); }
}

// ══════════════════════════════════════════
// IMPORTAR REFERENCIA DESDE UN LINK (oEmbed auto-rellena título + miniatura)
// ══════════════════════════════════════════
async function resolveOEmbed(url) {
  try {
    let ep = null;
    if (/tiktok\.com/.test(url)) ep = 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(url);
    else if (/(youtube\.com|youtu\.be)/.test(url)) ep = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url);
    else if (/vimeo\.com/.test(url)) ep = 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(url);
    if (!ep) return null;
    const r = await fetch(ep); if (!r.ok) return null;
    const d = await r.json();
    return { title: d.title || '', thumbnail: d.thumbnail_url || '', author: d.author_name || '' };
  } catch (e) { return null; }
}
async function importarRefDesdeLink() {
  const url = (await uiPrompt('Pega el link (TikTok, YouTube, Vimeo, IG…):', { title: 'Importar referencia' }) || '').trim();
  if (!url) return;
  const platformIcon = /(youtube|youtu\.be|tiktok|vimeo)/.test(url) ? 'video' : 'link';
  const c = { id: 'custom-' + Date.now(), title: 'Importado', hook: '', cat: ['custom'], for: [], link: url, thumb: '', comentarios: '', icon: platformIcon, custom: true, owned: true, shared: false };
  const arr = loadCustomRefs(); arr.push(c); saveCustomRefs(arr);
  c._idx = referencias.length; referencias.push(c);
  uiToast('Importando…');
  const meta = await resolveOEmbed(url);
  if (meta) { if (meta.title) c.title = meta.title; if (meta.thumbnail) c.thumb = meta.thumbnail; persistCustomEdit(c); }
  if (typeof openRefBoxdrop === 'function') openRefBoxdrop(c._idx);
  uiToast(meta ? '✓ Referencia importada' : '✓ Creada (sin metadata; complétala a mano)');
}

// ══════════════════════════════════════════
// NAVEGACIÓN
// ══════════════════════════════════════════
function toggleSidebar(force) {
  const open = (force === undefined) ? !document.body.classList.contains('sidebar-open') : force;
  document.body.classList.toggle('sidebar-open', open);
}
// ── HISTORIAL DE NAVEGACIÓN (flecha "atrás" global) ──
let _navStack = [];            // pila de vistas anteriores
let _navSuppress = false;      // true mientras restauramos (no grabar)
let _viewingTrack = false;     // ¿la ficha de release muestra un track?
function navCurrentView() {
  const active = document.querySelector('.page.active');
  const page = active ? active.id.replace('page-', '') : 'dashboard';
  return {
    page,
    launchId: (typeof currentLaunchId !== 'undefined') ? currentLaunchId : null,
    trackId: (_viewingTrack && typeof currentTrackId !== 'undefined') ? currentTrackId : null,
    releaseTab: (typeof _releaseTab !== 'undefined') ? _releaseTab : 'resumen',
  };
}
function navRecord() {
  if (_navSuppress) return;
  const v = navCurrentView();
  const top = _navStack[_navStack.length - 1];
  if (top && top.page === v.page && top.launchId === v.launchId && top.trackId === v.trackId) return; // dedupe consecutivo
  _navStack.push(v);
  if (_navStack.length > 50) _navStack.shift();
}
function updateBackBtn() {
  const b = document.getElementById('nav-back-btn'); if (!b) return;
  b.style.display = _navStack.length ? 'flex' : 'none';
}
function navBack() {
  const snap = _navStack.pop();
  if (!snap) { updateBackBtn(); return; }
  _navSuppress = true;
  try {
    if (snap.page === 'launch' && snap.launchId && launches.find(x => x.id === snap.launchId)) {
      currentLaunchId = snap.launchId;
      _releaseTab = snap.releaseTab || 'resumen';
      if (snap.trackId && typeof tracks !== 'undefined' && tracks.find(t => t.id === snap.trackId)) {
        showPage('launch', true); currentTrackId = snap.trackId; _viewingTrack = true;
        if (typeof renderTrackDetail === 'function') renderTrackDetail();
      } else {
        currentTrackId = null; _viewingTrack = false;
        showPage('launch', true);
        if (typeof renderLaunchDetail === 'function') renderLaunchDetail();
      }
    } else {
      currentTrackId = null; _viewingTrack = false;
      showPage(snap.page, true);
    }
  } catch (e) {}
  _navSuppress = false;
  updateBackBtn();
}
function showPage(id, skipRecord) {
  if (!skipRecord) navRecord();         // graba la vista que dejamos (antes de cambiar)
  document.body.classList.remove('sidebar-open'); // cierra el menú en móvil al navegar
  if (typeof cerrarMoreSheet === 'function') cerrarMoreSheet(); // cierra la hoja "Más" si estaba abierta
  if (typeof releaseRestorePages === 'function') releaseRestorePages(); // devuelve páginas embebidas a .content antes de navegar
  if (id !== 'compas' && typeof compasRestore === 'function') compasRestore(); // devuelve #page-dashboard si estaba embebido en Compás
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  // Barra de pestañas inferior (móvil): dashboard/lanzamientos/tareas tienen su propia
  // pestaña; todo lo demás (incluida la ficha de un release) cae bajo "Más".
  const TAB_FOR_PAGE = { compas: 'dashboard', dashboard: 'dashboard', lanzamientos: 'lanzamientos', launch: 'lanzamientos', tareas: 'tareas' };
  const activeTab = TAB_FOR_PAGE[id] || 'mas';
  document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.tabPage === activeTab));
  const titles = {dashboard:'Dashboard',compas:'Dashboard',lanzamientos:'Lanzamientos',tareas:'Tareas',campanias:'Campañas activas',label:'Dashboard del Label',perfil:'Perfil del Artista',adn:'ADN Artístico',banco:'Banco de Referencias',ideas:'Generador de Ideas',calendario:'Calendario',objetivos:'Objetivos SMART',metricas:'Métricas',aprendizajes:'Aprendizajes',ia:'IA Estratégica'};
  let _ttl = titles[id] || id;
  if (id === 'launch') { const _l = (typeof launches !== 'undefined') ? launches.find(x => x.id === currentLaunchId) : null; if (_l) _ttl = _l.name; }
  document.getElementById('page-title-text').textContent = up(_ttl);
  // Móvil perdió el indicador permanente de "artista activo" que vivía en el sidebar;
  // se repite acá (solo visible <860px, ver CSS) en las páginas que sí están acotadas
  // a un artista — en Tareas/Campañas/Label/Banco no aplica, son vistas cruzadas.
  const ARTIST_SCOPED_PAGES = { dashboard: 1, lanzamientos: 1, launch: 1, perfil: 1, adn: 1 };
  const _artistEl = document.getElementById('topbar-title-artist');
  if (_artistEl) {
    const _a = (ARTIST_SCOPED_PAGES[id] && typeof activeArtist === 'function') ? activeArtist() : null;
    _artistEl.textContent = _a ? '· ' + _a.name : '';
  }
  document.getElementById('btn-sheet-config').style.display = id === 'banco' ? '' : 'none';
  // "+ Nuevo Lanzamiento" only makes sense where creating a release is the relevant action.
  // Elsewhere (Tareas, Perfil, release detail w/ its own header actions, etc.) it's a dead CTA.
  const _ctaBtn = document.getElementById('btn-global-cta');
  if (_ctaBtn) _ctaBtn.style.display = (id === 'compas' || id === 'dashboard' || id === 'lanzamientos') ? '' : 'none';
  document.querySelector(`.nav-item[data-page="${id}"]`)?.classList.add('active');
  if (id === 'banco')      { bancoCargado ? (renderFiltros(), renderBanco()) : iniciarBanco(); }
  if (id === 'calendario') renderCalendar();
  if (id === 'objetivos')  renderObjetivos();
  if (id === 'metricas')   renderMetricas();
  if (id === 'perfil' || id === 'adn') renderArtistForms();
  if (id === 'ideas')      renderIdeas();
  if (id === 'aprendizajes') renderAprendizajes();
  if (id === 'ia')           renderIA();
  if (id === 'lanzamientos') renderLaunches();
  if (id === 'compas')       renderCompas();
  if (id === 'tareas')       renderTareas();
  if (id === 'campanias')    renderCampanias();
  if (id === 'dashboard')    renderDashboard();
  if (id === 'label')        renderLabel();
  document.querySelector('.content').scrollTop = 0;
  if (id !== 'launch') _viewingTrack = false; // navegar fuera del release ya no es vista de track
  updateBackBtn();
}

// ══════════════════════════════════════════
// BANCO — filtros dinámicos
// ══════════════════════════════════════════
function getUniqueTags(key) {
  const all = new Set();
  referencias.forEach(r => (r[key] || []).forEach(v => { if (v) all.add(v); }));
  return [...all].sort();
}
function iniciarBanco() {
  activeForFilter = 'all'; activeCatFilter = 'all'; paginaActual = 1;
  renderFiltros(); renderBanco();
}
function renderFiltros() {
  const forTags = getUniqueTags('for');
  const catTags = getUniqueTags('cat');
  function makeBtns(tags, containerId, activeFn, activeVal, kind) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn' + (activeVal === 'all' ? ' active' : '');
    allBtn.textContent = 'Todo';
    allBtn.addEventListener('click', function() { activeFn(this, 'all'); });
    container.appendChild(allBtn);
    tags.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeVal === t ? ' active' : '');
      btn.textContent = trTag(t, kind);   // muestra traducido si el toggle está ON; el filtro sigue por el valor real
      btn.addEventListener('click', function() { activeFn(this, t); });
      container.appendChild(btn);
    });
  }
  makeBtns(forTags, 'filtros-for', setForFilter, activeForFilter, 'for');
  makeBtns(catTags, 'filtros-cat', setCatFilter, activeCatFilter, 'cat');
}
function setForFilter(btn, val) {
  activeForFilter = val; paginaActual = 1;
  document.querySelectorAll('#filtros-for .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderBanco();
}
function setCatFilter(btn, val) {
  activeCatFilter = val; paginaActual = 1;
  document.querySelectorAll('#filtros-cat .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderBanco();
}
function catBadgeHTML(cats, small) {
  return (cats || []).filter(Boolean).map(c => {
    const col = catColor(c);
    const sz = small ? '9px' : '10px';
    return `<span style="display:inline-block;padding:2px 6px;border-radius:2px;font-size:${sz};font-family:var(--font-mono);margin:1px;background:${col}22;color:${col};border:1px solid ${col}44">${up(trTag(c,'cat'))}</span>`;
  }).join('');
}
function forBadgeHTML(fors, small) {
  const sz = small ? '9px' : '10px';
  return (fors || []).filter(Boolean).map(f =>
    `<span style="display:inline-block;padding:2px 6px;border-radius:2px;font-size:${sz};font-family:var(--font-mono);margin:1px;background:rgba(255,255,255,0.04);color:var(--text-dim);border:1px solid var(--border)">${s(trTag(f,'for'))}</span>`
  ).join('');
}
function renderBancoContext() {
  const host = document.getElementById('ctx-banco'); if (!host) return;
  const a = activeLaunch();
  const n = a ? a.ideas.length : 0;
  host.innerHTML = launchContextHTML()
    + `<div style="margin:-10px 0 18px;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:0.5px;display:flex;align-items:center;gap:5px"><span style="color:var(--accent)">${icon('starFill',12)}</span><strong style="color:var(--accent)">${n}</strong> idea${n===1?'':'s'} seleccionada${n===1?'':'s'} para ${a ? s(a.name) : 'este lanzamiento'} · la estrella agrega o quita</div>`;
}
function renderBanco() {
  renderBancoContext();
  renderBancoToolbar();
  const grid = document.getElementById('refs-grid');
  let filtered = referencias;
  if (bancoMine) filtered = filtered.filter(r => r.custom);
  if (activeForFilter !== 'all') filtered = filtered.filter(r => (r.for||[]).includes(activeForFilter));
  if (activeCatFilter !== 'all') filtered = filtered.filter(r => (r.cat||[]).includes(activeCatFilter));
  if (bancoSearch) {
    const q = bancoSearch.toLowerCase();
    filtered = filtered.filter(r => (
      s(r.title).toLowerCase().includes(q) ||
      s(r.hook).toLowerCase().includes(q) ||
      s(r.comentarios).toLowerCase().includes(q) ||
      (r.cat||[]).some(c => s(c).toLowerCase().includes(q)) ||
      (r.for||[]).some(f => s(f).toLowerCase().includes(q))
    ));
  }
  if (bancoSort === 'recientes') filtered = filtered.slice().sort((a, b) => refTime(b) - refTime(a));
  else if (bancoSort === 'usadas') filtered = filtered.slice().sort((a, b) => refUsage(b) - refUsage(a));
  if (bancoRandom) filtered = shuffleSeeded(filtered.slice(), _shuffleKey);
  if (!filtered.length) {
    grid.style.gridTemplateColumns = '1fr';
    grid.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-muted)"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px">SIN REFERENCIAS CON ESTOS FILTROS</div></div>`;
    return;
  }
  grid.style.gridTemplateColumns = '';
  const totalPags = Math.max(1, Math.ceil(filtered.length / porPagina));
  paginaActual = Math.max(1, Math.min(paginaActual, totalPags));
  const shown = Math.min(paginaActual * porPagina, filtered.length); // "Cargar más": acumulativo (no por páginas)
  const slice  = filtered.slice(0, shown);
  const cards = slice.map(r => {
    const sel = ideaSelected(r);
    return `
    <div class="ref-page-card fade-in" onclick="openRefBoxdrop(${r._idx})">
      <div class="ref-page-thumb">
        ${(() => { const th = refThumbImmediate(r); const iid = 'rthumb-' + r._idx;
          return th
          ? `<img id="${iid}" class="ref-thumb-img" src="${s(th)}" alt="${esc(r.title)}" loading="lazy" onerror="this.style.display='none';this.parentNode.querySelector('.ref-thumb-fallback').style.display='flex'"><span class="ref-thumb-fallback" style="display:none">${icon(s(r.icon)||'pin',30)}</span>`
          : `<img id="${iid}" class="ref-thumb-img" alt="${esc(r.title)}" loading="lazy" style="display:none" onerror="this.style.display='none';this.parentNode.querySelector('.ref-thumb-fallback').style.display='flex'"><span class="ref-thumb-fallback" style="display:flex">${icon(s(r.icon)||'pin',30)}</span>`; })()}
        <button onclick="event.stopPropagation();toggleIdea(${r._idx},this)" title="Seleccionar idea para el lanzamiento activo"
          style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.45);border-radius:50%;padding:3px;border:none;cursor:pointer;display:flex;color:${sel?'var(--accent)':'#fff'};opacity:${sel?1:0.85};transition:all 0.2s;z-index:2">${icon(sel?'starFill':'star',15)}</button>
        ${r.custom ? customBadgeHTML(r) : ''}
        ${r.link ? `<a href="${safeUrl(r.link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="position:absolute;bottom:6px;right:6px;font-size:9px;font-family:var(--font-mono);background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:2px;color:var(--accent);text-decoration:none;border:1px solid rgba(255,107,48,0.2);z-index:2">↗ VER</a>` : ''}
      </div>
      <div class="ref-page-info">
        <div class="ref-page-title">${s(trText(r.title))}</div>
        ${r.hook ? `<div style="font-size:10px;color:var(--text-dim);font-style:italic;margin-bottom:5px;line-height:1.4">"${s(trText(r.hook))}"</div>` : ''}
        <div style="margin-bottom:3px;display:flex;flex-wrap:wrap">${catBadgeHTML(r.cat, true) || '<span style="font-size:9px;color:var(--text-dim)">sin cat</span>'}</div>
        <div style="display:flex;flex-wrap:wrap">${forBadgeHTML(r.for, true)}</div>
      </div>
    </div>`;
  }).join('');
  // Tarjeta "+ Crear post desde cero" siempre al inicio (con "Cargar más" el inicio siempre está visible).
  const addCard = `<div class="ref-page-card fade-in" onclick="crearPostDesdeCero()" style="cursor:pointer;display:flex;align-items:center;justify-content:center;border-style:dashed">
        <div style="text-align:center;color:var(--text-muted);padding:20px">${icon('plus',26)}<div style="font-size:11px;font-family:var(--font-mono);margin-top:8px;letter-spacing:1px">CREAR POST<br>DESDE CERO</div></div>
      </div>`;
  const restantes = filtered.length - shown;
  const paginacion = `
    <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:16px 4px 0;border-top:1px solid var(--border);margin-top:8px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Cargar de a</span>
        ${[10,25,50].map(n => `<button onclick="cambiarPorPagina(${n})" style="padding:4px 9px;border-radius:3px;font-family:var(--font-mono);font-size:10px;cursor:pointer;border:1px solid ${porPagina===n?'var(--accent)':'var(--border)'};background:${porPagina===n?'rgba(255,107,48,0.1)':'transparent'};color:${porPagina===n?'var(--accent)':'var(--text-muted)'}">${n}</button>`).join('')}
      </div>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${shown} de ${filtered.length}</span>
      <div style="display:flex;align-items:center;gap:6px">
        ${restantes > 0
          ? `<button class="btn btn-ghost" style="padding:5px 14px;font-size:11px" onclick="cargarMasBanco()">Cargar más (+${Math.min(porPagina, restantes)})</button>
             <button class="btn btn-ghost" style="padding:5px 12px;font-size:11px;color:var(--text-dim)" onclick="verTodasBanco()">Ver todas</button>`
          : `<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">${icon('check',11)} todas cargadas</span>`}
      </div>
    </div>`;
  grid.innerHTML = addCard + cards + paginacion;
  // Resuelve async la miniatura real de los TikTok visibles que aún no están en caché (oEmbed + CORS).
  slice.forEach(r => {
    const link = s(r.link).trim();
    if (!r.thumb && /tiktok\.com/.test(link) && !_thumbCache()[link]) resolveTikTokThumb(link, 'rthumb-' + r._idx);
  });
  // Traducción al español de lo visible (título/hook) → cuando llega, re-render una vez.
  if (bancoTranslate) {
    const txts = []; slice.forEach(r => { if (r.title) txts.push(r.title); if (r.hook) txts.push(r.hook); });
    translateBatch(txts).then(n => { if (n > 0 && bancoTranslate && ((document.querySelector('.page.active') || {}).id === 'page-banco')) renderBanco(); });
  }
}
function cargarMasBanco() { paginaActual++; renderBanco(); }
function verTodasBanco() { paginaActual = 999999; renderBanco(); }
function cambiarPorPagina(n) { porPagina = n; paginaActual = 1; renderBanco(); }

// ── Badge de privacidad en las tarjetas personalizadas ──
function customBadgeHTML(r) {
  const community = r.community || r.owned === false;
  const shared = !!r.shared;
  const label = community ? (s(r.author) ? 'COMUNIDAD' : 'COMUNIDAD') : (shared ? 'COMPARTIDA' : 'PRIVADA');
  const col = community ? '#a78bfa' : (shared ? '#4ade80' : 'var(--text-dim)');
  const ico = community ? 'star' : (shared ? 'eye' : 'lock');
  return `<span title="${community ? ('De la comunidad' + (s(r.author)?(' · '+s(r.author)):'')) : (shared ? 'Compartida con la comunidad' : 'Privada (solo tú)')}"
    style="position:absolute;top:6px;left:6px;display:inline-flex;align-items:center;gap:3px;font-size:8px;font-family:var(--font-mono);letter-spacing:0.5px;background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:2px;color:${col};border:1px solid ${col}55;z-index:2">${icon(ico,10)} ${label}</span>`;
}

// ── Toolbar del banco: búsqueda + "Mis referencias" + orden + aleatorio + importar desde link ──
function renderBancoToolbar() {
  const host = document.getElementById('banco-toolbar'); if (!host) return;
  const mineN = referencias.filter(r => r.custom).length;
  const sortOpts = [['default','Por defecto'],['recientes','Recientes'],['usadas','Más usadas']];
  host.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="flex:1;min-width:170px;position:relative;display:flex;align-items:center">
        <span style="position:absolute;left:10px;color:var(--text-dim);display:flex;pointer-events:none">${icon('search',14)}</span>
        <input id="banco-search" class="input" type="text" value="${s(bancoSearch)}" placeholder="Buscar por título, hook o tag…"
          oninput="bancoSetSearch(this.value)" style="width:100%;padding-left:32px;font-size:12px">
        ${bancoSearch ? `<button onclick="bancoSetSearch('')" title="Limpiar" style="position:absolute;right:8px;background:none;border:none;color:var(--text-dim);cursor:pointer;display:flex">${icon('close',12)}</button>` : ''}
      </div>
      <select class="input" title="Ordenar" onchange="setBancoSort(this.value)" style="font-size:11px;padding:7px 10px;width:auto">
        ${sortOpts.map(o => `<option value="${o[0]}" ${bancoSort===o[0]?'selected':''}>Orden: ${o[1]}</option>`).join('')}
      </select>
      <button onclick="toggleBancoMine()" title="Ver solo tus referencias personalizadas"
        style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:4px;font-family:var(--font-body);font-size:12px;cursor:pointer;border:1px solid ${bancoMine?"var(--muted)":"var(--border)"};background:${bancoMine?"var(--surface2)":"transparent"};color:${bancoMine?"var(--text)":"var(--text-muted)"}">${icon(bancoMine?'starFill':'star',13)} Mis referencias${mineN?` · ${mineN}`:''}</button>
      <button onclick="toggleBancoRandom()" title="Orden aleatorio (on/off)"
        style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:4px;font-family:var(--font-body);font-size:12px;cursor:pointer;border:1px solid ${bancoRandom?"var(--muted)":"var(--border)"};background:${bancoRandom?"var(--surface2)":"transparent"};color:${bancoRandom?"var(--text)":"var(--text-muted)"}">${icon('shuffle',13)} Aleatorio ${bancoRandom?'ON':'OFF'}</button>
      ${bancoRandom ? `<button onclick="reshuffleBanco()" title="Volver a mezclar" style="display:inline-flex;align-items:center;gap:5px;padding:7px 11px;border-radius:4px;font-family:var(--font-body);font-size:12px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">${icon('refresh',13)} Mezclar</button>` : ''}
      <button onclick="toggleBancoTranslate()" title="Traducir las referencias al español (Google)"
        style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:4px;font-family:var(--font-body);font-size:12px;cursor:pointer;border:1px solid ${bancoTranslate?"var(--muted)":"var(--border)"};background:${bancoTranslate?"var(--surface2)":"transparent"};color:${bancoTranslate?"var(--text)":"var(--text-muted)"}">${icon('globe',13)} ${bancoTranslate?'Español ON':'Traducir'}</button>
      <button onclick="importarRefDesdeLink()" title="Crear una referencia propia desde un link (TikTok/YT/Vimeo auto-rellenan título y miniatura)"
        style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:var(--radius-sm);font-size:12px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">${icon('link',13)} Importar desde link</button>
      ${(typeof isAdmin === 'function' && isAdmin()) ? `<button onclick="abrirModeracion()" title="Moderar el pool de la comunidad (reportes)"
        style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:4px;font-family:var(--font-body);font-size:12px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">${icon('flag',13)} Moderación</button>` : ''}
    </div>`;
  ensureTagDatalist();
  if (typeof hydrateIcons === 'function') hydrateIcons(host);
}
// Datalist global con todos los tags existentes → autocompletar al escribir un tag (boxdrop + import).
function ensureTagDatalist() {
  let dl = document.getElementById('tag-suggestions');
  if (!dl) { dl = document.createElement('datalist'); dl.id = 'tag-suggestions'; document.body.appendChild(dl); }
  dl.innerHTML = getUniqueTags('cat').map(t => `<option value="${s(t)}"></option>`).join('');
}
function bancoSetSearch(v) { bancoSearch = v || ''; paginaActual = 1; renderBanco(); const el = document.getElementById('banco-search'); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch(e){} } }
function setBancoSort(v) { bancoSort = v || 'default'; if (bancoSort !== 'default') bancoRandom = false; paginaActual = 1; renderBanco(); }
function toggleBancoMine() { bancoMine = !bancoMine; paginaActual = 1; renderBanco(); }
function toggleBancoRandom() { bancoRandom = !bancoRandom; if (bancoRandom) { _shuffleKey = Date.now(); bancoSort = 'default'; } paginaActual = 1; renderBanco(); }
function reshuffleBanco() { _shuffleKey = Date.now(); paginaActual = 1; renderBanco(); }
// Shuffle determinista por semilla (Fisher-Yates + mulberry32) → estable entre re-renders/paginación hasta re-mezclar.
function shuffleSeeded(arr, seed) {
  let t = seed >>> 0;
  const rand = () => { t += 0x6D2B79F5; let x = t; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
  return arr;
}

// ══════════════════════════════════════════
// FAVORITOS
// ══════════════════════════════════════════
function toggleIdea(idx, btn) {
  const a = activeLaunch();
  if (!a) { uiAlert('No hay un lanzamiento activo para seleccionar ideas.'); return false; }
  const r = referencias[idx]; if (!r) return false;
  const key = refKey(r);
  const i = a.ideas.findIndex(x => x.key === key);
  let selected;
  if (i >= 0) { a.ideas.splice(i, 1); selected = false; }
  else {
    a.ideas.push({ key, title:r.title, hook:r.hook, cat:r.cat, for:r.for, link:r.link, comentarios:r.comentarios, icon:r.icon });
    selected = true;
    bumpRefUsage(r);   // contador para "Más usadas"
  }
  saveLaunches();
  if (btn) { btn.innerHTML = icon(selected ? 'starFill' : 'star', 15); btn.style.color = selected ? 'var(--accent)' : 'var(--text-dim)'; btn.style.opacity = selected ? '1' : '0.5'; }
  renderBancoContext();
  return selected;
}

// ══════════════════════════════════════════
// THUMBNAIL desde link (servicios públicos)
// ══════════════════════════════════════════
function refThumb(link) {
  const url = s(link).trim();
  if (!url) return null;
  // YouTube (watch / shorts / youtu.be / embed) — derivable y estable.
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg`;
  // Vimeo
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://vumbnail.com/${vm[1]}.jpg`;
  // TikTok: miniatura real vía oEmbed (se resuelve async; aquí devolvemos la cacheada si existe).
  if (/tiktok\.com/.test(url)) return _thumbCache()[url] || null;
  // IG / X / web: no hay captura automática fiable → ícono (usa la columna `thumb` para una imagen propia).
  return null;
}
// ── Miniaturas resueltas por oEmbed (TikTok) con caché en localStorage ──
// El oEmbed oficial de TikTok devuelve la miniatura real (1080x1920) y permite CORS.
function _thumbCache() { try { return JSON.parse(localStorage.getItem('ao_thumb_cache')) || {}; } catch (e) { return {}; } }
function _thumbCacheSet(link, thumb) { try { const c = _thumbCache(); c[link] = thumb; localStorage.setItem('ao_thumb_cache', JSON.stringify(c)); } catch (e) {} }
// Miniatura disponible YA (sin red): manual (columna thumb) > lo que dé refThumb (YouTube/Vimeo/caché TikTok).
function refThumbImmediate(r) {
  if (r.thumb) return s(r.thumb);
  return refThumb(r.link);
}
// ── Cola con concurrencia limitada para los oEmbed de TikTok (evita rate-limit → "muchos no cargan") ──
let _thumbInflight = {}, _thumbQueue = [], _thumbActive = 0;
const _THUMB_MAX = 3;
function _thumbPump() {
  while (_thumbActive < _THUMB_MAX && _thumbQueue.length) {
    const { link, imgId } = _thumbQueue.shift();
    _thumbActive++;
    fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(link))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.thumbnail_url) {
          _thumbCacheSet(link, d.thumbnail_url);
          const im = document.getElementById(imgId);
          if (im) { im.onerror = null; im.src = d.thumbnail_url; im.style.display = 'block';
            const fb = im.parentNode && im.parentNode.querySelector('.ref-thumb-fallback, .brief-thumb-fallback'); if (fb) fb.style.display = 'none'; }
        }
      })
      .catch(() => {})
      .finally(() => { delete _thumbInflight[link]; _thumbActive--; _thumbPump(); });
  }
}
// Encola la resolución async de la miniatura de un TikTok (oEmbed) → actualiza su <img> al resolver.
function resolveTikTokThumb(link, imgId) {
  if (!link || _thumbInflight[link]) return;
  _thumbInflight[link] = true;
  _thumbQueue.push({ link, imgId });
  _thumbPump();
}

// ══════════════════════════════════════════
// BOXDROP REFERENCIA
// ══════════════════════════════════════════
function openRefBoxdrop(idx) {
  const r = referencias[idx];
  if (!r) return;
  const custom = !!r.custom;
  const community = custom && r.owned === false;   // referencia de OTRO usuario (de la comunidad) → solo lectura
  const editable = custom && !community;            // referencia propia → editable
  const cats = (r.cat||[]).filter(Boolean);
  const fors = (r.for||[]).filter(Boolean);
  const a = activeLaunch();
  const sel = ideaSelected(r);
  const tx = (v) => (bancoTranslate && !editable) ? trText(v) : v;   // traduce solo lo no editable (refs del banco/comunidad)
  document.getElementById('bd-title').textContent = up(tx(r.title));
  document.getElementById('bd-date').textContent  = community ? ('DE LA COMUNIDAD' + (s(r.author)?(' · '+up(r.author)):'')) : (cats.map(c=>up(trTag(c,'cat'))).join(' · ') || (custom ? 'POST PROPIO' : '—'));
  // Campos del brief: editables cuando es un post propio (mismo screen que una referencia).
  bdField('bd-idea', s(tx(r.title)), editable, v => { r.title = v || 'Nuevo post'; document.getElementById('bd-title').textContent = up(r.title); persistCustomEdit(r); }, 'Título del post');
  bdField('bd-hook', s(tx(r.hook)), editable, v => { r.hook = v; persistCustomEdit(r); }, 'Hook / gancho', !editable && !r.hook ? 'Sin hook definido' : '');
  bdField('bd-desc', s(tx(r.comentarios)), editable, v => { r.comentarios = v; persistCustomEdit(r); }, 'Descripción / cómo grabarlo', !editable && !r.comentarios ? 'Sin comentarios' : '');

  // Tags & Keywords = cat + for. Editable (chips agregar/quitar) si es post propio; 'custom' fijo.
  if (editable) {
    const chips = cats.map(c => {
      const locked = (c === 'custom');
      const col = catColor(c);
      return `<span class="brief-tag" style="display:inline-flex;align-items:center;gap:4px;background:${col}22;color:${col};border:1px solid ${col}55">${s(c)}${locked ? `<span title="Tag fijo" style="opacity:.6;display:inline-flex">${icon('lock',9)}</span>` : `<button onclick="refRemoveTag(${idx},'${s(c).replace(/'/g,"\\'")}')" title="Quitar tag" style="background:none;border:none;color:inherit;cursor:pointer;display:inline-flex;padding:0">${icon('close',9)}</button>`}</span>`;
    }).join('');
    const forChips = fors.map(f => `<span class="brief-tag">${s(f)}</span>`).join('');
    ensureTagDatalist();
    document.getElementById('bd-tags').innerHTML = chips + forChips +
      `<input class="input" list="tag-suggestions" style="font-size:11px;width:130px;padding:3px 8px" placeholder="+ tag…" onkeydown="if(event.key==='Enter'){event.preventDefault();refAddTag(${idx},this.value);}" onblur="if(this.value.trim())refAddTag(${idx},this.value)">`;
  } else {
    const tagHTML = [
      ...cats.map(c => `<span class="brief-tag accent">${s(trTag(c,'cat'))}</span>`),
      ...fors.map(f => `<span class="brief-tag">${s(trTag(f,'for'))}</span>`)
    ].join('');
    document.getElementById('bd-tags').innerHTML = tagHTML || '<span style="font-size:11px;color:var(--text-dim)">Sin tags</span>';
  }

  // Badge de categoría en header
  const badge = document.getElementById('bd-cat-badge');
  badge.removeAttribute('class');
  const fc = cats[0] || '';
  const fcol = catColor(fc);
  badge.style.cssText = `background:${fcol}22;color:${fcol};border:1px solid ${fcol}44;padding:3px 10px;border-radius:2px;font-size:9px;font-family:var(--font-mono)`;
  badge.textContent   = up(fc) || 'REF';

  // Miniatura (lado derecho del brief) — el LINK y la MINIATURA son independientes.
  const thumb = refThumbImmediate(r);
  const link  = s(r.link).trim();
  const briefIco = `<span style="color:var(--text-muted)">${icon(s(r.icon)||'pin',34)}</span>`;
  const card  = document.getElementById('bd-thumb-card');
  const linkFooter = editable
    ? `<div style="padding:8px;border-top:1px solid var(--border)"><input class="input" style="font-size:11px;width:100%" value="${s(link)}" placeholder="Link (TikTok/YT/IG…) → miniatura" onblur="refSetLink(${idx}, this.value)">${link ? `<a href="${safeUrl(link)}" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);font-family:var(--font-mono);text-decoration:none;display:block;margin-top:4px">${icon('link',11)} Abrir</a>` : ''}</div>`
    : (link
      ? `<div style="padding:10px;border-top:1px solid var(--border)"><a href="${safeUrl(link)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);font-family:var(--font-mono);text-decoration:none;word-break:break-all">${icon('link',12)} Abrir original</a></div>`
      : `<div style="padding:10px;border-top:1px solid var(--border);font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center">SIN LINK ASOCIADO</div>`);
  card.innerHTML = `
    <img id="bd-thumb-img" class="brief-thumb-img" src="${s(thumb)||''}" alt="${esc(r.title)}" loading="lazy" style="${thumb?'':'display:none'}"
      onerror="this.style.display='none';this.parentNode.querySelector('.brief-thumb-fallback').style.display='flex'">
    <div class="brief-thumb-fallback" style="display:${thumb?'none':'flex'}">${briefIco}</div>
    ${linkFooter}`;
  // Si es TikTok sin caché, resuelve la miniatura async y la coloca al vuelo.
  if (!thumb && /tiktok\.com/.test(link)) resolveTikTokThumb(link, 'bd-thumb-img');

  const selLabel = a ? `Seleccionar para ${s(a.name)}` : 'Seleccionar idea';
  document.getElementById('bd-actions').innerHTML = `
    <button id="bd-sel-btn" onclick="toggleIdea(${idx}, null); openRefBoxdrop(${idx})"
      style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid ${sel?'rgba(255,107,48,0.3)':'var(--border)'};background:transparent;color:${sel?'var(--accent)':'var(--text-muted)'};transition:all 0.15s">${icon(sel?'starFill':'star',13)} ${sel?'Seleccionada':selLabel}</button>
    <button onclick="generarContenidoBanco(${idx})"
      style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid rgba(255,107,48,0.35);background:transparent;color:var(--accent);transition:all 0.15s">${icon('ai',13)} Generar contenido</button>
    <button onclick="abrirModalCal(${idx})"
      style="padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid rgba(255,107,48,0.3);background:rgba(255,107,48,0.06);color:var(--accent);transition:all 0.15s">+ Agregar al Calendario</button>
    ${editable ? `<label title="Si la activas, otros usuarios la verán en la comunidad. Si no, queda privada (solo tú)." style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid ${r.shared?'rgba(74,222,128,0.4)':'var(--border)'};background:${r.shared?'rgba(74,222,128,0.08)':'transparent'};color:${r.shared?'#4ade80':'var(--text-muted)'}"><input type="checkbox" ${r.shared?'checked':''} onchange="refSetShared(${idx}, this.checked)" style="accent-color:#4ade80;cursor:pointer">${icon(r.shared?'eye':'lock',12)} Compartir con la comunidad</label>` : ''}
    ${community ? `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);border:1px solid rgba(167,139,250,0.4);background:rgba(167,139,250,0.08);color:#a78bfa">${icon('star',12)} De la comunidad${s(r.author)?(' · '+s(r.author)):''}</span>
    <button onclick="reportCommunityRef(${idx})" title="Reportar a moderación" style="padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--text-muted)">${icon('flag',12)} Reportar</button>
    ${(typeof isAdmin==='function'&&isAdmin()) ? `<button onclick="hideCommunityRef(${idx})" title="Ocultar de la comunidad (super-admin)" style="padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid rgba(255,77,77,0.3);background:transparent;color:var(--accent2)">${icon('eyeOff',12)} Ocultar</button>` : ''}` : ''}
    ${editable ? `<button onclick="eliminarPostCustom(${idx})" style="padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid rgba(255,77,77,0.3);background:transparent;color:var(--accent2);transition:all 0.15s">${icon('trash',12)} Eliminar post</button>` : ''}`;
  const cres = document.getElementById('bd-content-result'); if (cres) cres.innerHTML = '';
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.boxdrop-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-brief').classList.add('active');
  document.querySelectorAll('.boxdrop-tab')[0].classList.add('active');
  document.getElementById('boxdrop').classList.add('open');
  // Traducción al español del brief (refs del banco/comunidad) → al llegar, re-abre con el texto traducido.
  if (bancoTranslate && !editable) {
    translateBatch([r.title, r.hook, r.comentarios]).then(n => {
      if (n > 0 && document.getElementById('boxdrop').classList.contains('open') && referencias[idx] === r) openRefBoxdrop(idx);
    });
  }
}
// Campo del brief: editable (contentEditable) cuando es un post propio; guarda al perder foco.
function bdField(id, val, editable, onSave, label, fallback) {
  const el = document.getElementById(id); if (!el) return;
  el.textContent = val || (editable ? '' : (fallback || ''));
  el.contentEditable = editable ? 'true' : 'false';
  el.setAttribute('data-ph', editable ? (label || '') : '');
  el.classList.toggle('bd-editable', !!editable);
  el.onblur = editable ? function () { onSave(el.textContent.trim()); } : null;
}
function refSetCats(idx, value) {
  const r = referencias[idx]; if (!r) return;
  r.cat = s(value).split(',').map(t => trim(t).toLowerCase()).filter(Boolean);
  if (r.custom) ensureCustomCat(r);   // 'custom' siempre primero
  r.icon = catIcon(r.cat);
  persistCustomEdit(r); openRefBoxdrop(idx);
}
function refSetLink(idx, value) {
  const r = referencias[idx]; if (!r) return;
  if (s(r.link) === s(value).trim()) return;
  r.link = s(value).trim(); persistCustomEdit(r); openRefBoxdrop(idx);
}

// ══════════════════════════════════════════
// AGREGAR AL CALENDARIO (del lanzamiento activo)
// ══════════════════════════════════════════
let calModalIdx = null;            // compat
let _mcSource = null;              // { kind:'ref'|'gen', idx }
// Setup común del modal: selector de campaña + pauta + fecha limpia.
function _mcPopulate(title) {
  document.getElementById('mc-title').textContent = s(title);
  document.getElementById('mc-fecha').value = '';
  document.getElementById('mc-status').textContent = '';
  document.getElementById('mc-status').style.color = 'var(--accent2)';
  const camps = calCampaigns();
  const csel = document.getElementById('mc-camp');
  if (csel) csel.innerHTML = camps.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.isEvergreen ? ' · always-on' : ''}</option>`).join('') || '<option value="">— sin campaña —</option>';
  const psel = document.getElementById('mc-pauta'); if (psel) psel.value = 'organico';
  document.getElementById('modal-cal').classList.add('open');
}
function abrirModalCal(idx) {            // desde una referencia / post propio
  calModalIdx = idx; _mcSource = { kind: 'ref', idx };
  _mcPopulate((referencias[idx] || {}).title || '');
}
function abrirModalCalGen(i, which) {     // desde una idea generada con IA (a.generated o a.generatedPrev)
  const a = activeLaunch(); if (!a) return;
  const arr = which === 'prev' ? (a.generatedPrev || []) : (a.generated || []);
  const it = arr[i]; if (!it) return;
  _mcSource = { kind: which === 'prev' ? 'genprev' : 'gen', idx: i };
  _mcPopulate(it.title || 'Idea');
}
function cerrarModalCal(e) {
  if (!e || e.target === document.getElementById('modal-cal'))
    document.getElementById('modal-cal').classList.remove('open');
}
function confirmarCal() {
  const fecha = document.getElementById('mc-fecha').value;
  if (!fecha) { document.getElementById('mc-status').style.color = 'var(--accent2)'; document.getElementById('mc-status').textContent = 'Selecciona una fecha'; return; }
  const campId = (document.getElementById('mc-camp') || {}).value || '';
  const target = launches.find(l => l.id === campId) || activeLaunch();
  if (!target) { document.getElementById('mc-status').textContent = 'Crea una campaña o lanzamiento'; return; }
  const pauta = (document.getElementById('mc-pauta') || {}).value || 'organico';
  const src = _mcSource || { kind: 'ref', idx: calModalIdx };
  let item;
  if (src.kind === 'gen' || src.kind === 'genprev') {
    const _a = activeLaunch() || {};
    const arr = src.kind === 'genprev' ? (_a.generatedPrev || []) : (_a.generated || []);
    const g = arr[src.idx]; if (!g) return; // las ideas IA viven en el release activo

    item = { id: 'ci-' + Date.now(), title: s(g.title), cat: s(g.cat) || 'awareness', fecha, pauta, refLink: s(g.refLink || ''),
      production: { objetivo: s(g.objetivo || ''), hook: s(g.hook || ''), descripcion: s(g.descripcion || ''), plataforma: s(g.format || ''), estado: 'pendiente', responsable: '', guion: [], shots: [], assets: [] } };
  } else {
    const r = referencias[src.idx]; if (!r) return;
    bumpRefUsage(r);   // contador para "Más usadas"
    const cats = (r.cat || []).filter(Boolean);
    // Arrastra TODA la info de la referencia del banco (cats, for, link, miniatura, ícono + hook/descripción al brief).
    item = { id: 'ci-' + Date.now(), title: s(r.title), cat: cats[0] || 'awareness', cats: cats,
      for: (r.for || []).filter(Boolean), fecha, pauta, refIdx: src.idx, refLink: s(r.link),
      thumb: s(r.thumb || ''), icon: s(r.icon || ''),
      production: { objetivo: '', hook: s(r.hook || ''), descripcion: s(r.comentarios || ''),
        plataforma: '', estado: 'pendiente', responsable: '', guion: [], shots: [], assets: [] } };
  }
  target.cal = target.cal || [];
  target.cal.push(item);
  saveLaunches();
  document.getElementById('mc-status').style.color = '#4ade80';
  document.getElementById('mc-status').textContent = `✓ Agregado a ${s(target.name)}`;
  if (typeof renderCalendar === 'function' && (document.querySelector('.page.active') || {}).id === 'page-calendario') renderCalendar();
  setTimeout(() => { document.getElementById('modal-cal').classList.remove('open'); }, 800);
}

// Crea un post directo en el calendario (NO se guarda en el banco de referencias) al hacer click en un día.
// Cae en la campaña activa (o la primera visible) y abre el Centro de Producción para editar título/info.
function crearPostEnDia(dk) {
  if (typeof canDo === 'function' && !canDo('edit_launch')) { if (typeof uiToast === 'function') uiToast('Sin permiso para editar'); return; }
  const camps = (typeof calCampaigns === 'function') ? calCampaigns() : [];
  const target = activeLaunch() || (camps[0] && camps[0].launch);
  if (!target) { if (typeof uiToast === 'function') uiToast('Crea una campaña o lanzamiento primero'); return; }
  const item = { id: 'ci-' + Date.now(), title: 'Nuevo post', cat: 'awareness', fecha: dk, pauta: 'organico',
    production: { objetivo: '', hook: '', descripcion: '', plataforma: '', estado: 'pendiente', responsable: '', guion: [], shots: [], assets: [] } };
  target.cal = target.cal || []; target.cal.push(item);
  saveLaunches();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof openProduction === 'function') openProduction(target.id, item.id);
}
// Elimina una pieza del calendario (de su campaña). Confirma antes de borrar.
async function deleteCalItem(campId, itemId, ev) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (typeof canDo === 'function' && !canDo('edit_launch')) { if (typeof uiToast === 'function') uiToast('Sin permiso para editar'); return; }
  const l = launches.find(x => x.id === campId); if (!l) return;
  const ci = (l.cal || []).find(c => c.id === itemId);
  const title = ci ? s(ci.title) : 'este contenido';
  if (typeof uiConfirm === 'function' && !(await uiConfirm(`¿Eliminar "${title}" del calendario?`))) return;
  l.cal = (l.cal || []).filter(c => c.id !== itemId);
  saveLaunches();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof uiToast === 'function') uiToast('✓ Eliminado del calendario');
}
// ── Drag & drop en la vista de calendario: arrastrar una pieza a otro día la reprograma ──
let _calDrag = null;
function calDragStart(e, campId, itemId) {
  _calDrag = { campId, itemId };
  if (e.dataTransfer) { e.dataTransfer.setData('text/plain', campId + '|' + itemId); e.dataTransfer.effectAllowed = 'move'; }
}
function calDragEnd() { _calDrag = null; document.querySelectorAll('.cal-day.cal-drop').forEach(d => d.classList.remove('cal-drop')); }
function calDropOnDay(e, dk) {
  if (e && e.preventDefault) e.preventDefault();
  let p = _calDrag;
  if ((!p || !p.itemId) && e && e.dataTransfer) { const t = (e.dataTransfer.getData('text/plain') || '').split('|'); if (t.length === 2) p = { campId: t[0], itemId: t[1] }; }
  _calDrag = null;
  if (!p) return;
  if (typeof canDo === 'function' && !canDo('edit_launch')) return;
  const l = launches.find(x => x.id === p.campId); if (!l) return;
  const ci = (l.cal || []).find(c => c.id === p.itemId); if (!ci) return;
  if (ci.fecha === dk) return;  // mismo día → nada
  ci.fecha = dk;
  saveLaunches();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof uiToast === 'function') uiToast('✓ Movido a ' + dk);
}

// ══════════════════════════════════════════
// CALENDARIO (scoped al lanzamiento activo)
// ══════════════════════════════════════════
const DAYS = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
const MESES_CAL = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
let weekOffset = 0;
let monthOffset = 0;
let calView = 'calendar';   // 'calendar' | 'kanban'
let calRange = '1m';        // '1w' | '2w' | '1m' — default: vista de 1 mes (mes en curso)

function launchBaseMonday() {
  const a = activeLaunch();
  const base = (a && a.date) ? new Date(a.date + 'T00:00:00') : new Date(2026, 5, 2);
  const dow = (base.getDay() + 6) % 7; // lunes = 0
  base.setDate(base.getDate() - dow);
  return base;
}
function weekStart() {
  const d = launchBaseMonday();
  d.setDate(d.getDate() + weekOffset * 7);
  return d;
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// ══════════════════════════════════════════
// SELECTOR DE FECHA (mini-calendario emergente que marca los días ya ocupados)
// Uso: <input readonly onclick="openDayPicker(this)"> → al elegir, escribe el ISO y dispara 'change'.
// ══════════════════════════════════════════
let _dpInput = null, _dpMonth = null;
// Días del artista activo que ya tienen contenido programado (todas sus campañas de release; evergreen se suma en Push 2).
function dpOccupied() {
  const map = {};
  // Todas las campañas del artista activo: releases + evergreen.
  const ls = launches.filter(l => l.artistId === currentArtistId);
  ls.forEach(l => (l.cal || []).forEach(ci => { if (ci.fecha) map[ci.fecha] = (map[ci.fecha] || 0) + 1; }));
  return map;
}
function ensureDayPicker() {
  let el = document.getElementById('daypicker');
  if (!el) { el = document.createElement('div'); el.id = 'daypicker'; el.className = 'daypicker'; el.style.display = 'none'; document.body.appendChild(el); }
  return el;
}
function openDayPicker(input) {
  _dpInput = input;
  const v = (input.value && /^\d{4}-\d{2}-\d{2}$/.test(input.value)) ? new Date(input.value + 'T00:00:00') : new Date();
  _dpMonth = new Date(v.getFullYear(), v.getMonth(), 1);
  const el = ensureDayPicker();
  dpRender();
  const r = input.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 268)) + 'px';
  el.style.top = (r.bottom + 6 + (window.innerHeight - r.bottom < 320 ? -(340) : 0)) + 'px';
  el.style.zIndex = '5000';
  el.style.display = 'block';
  setTimeout(() => document.addEventListener('mousedown', _dpOutside), 0);
}
function _dpOutside(e) { const el = document.getElementById('daypicker'); if (el && !el.contains(e.target) && e.target !== _dpInput) closeDayPicker(); }
function closeDayPicker() { const el = document.getElementById('daypicker'); if (el) el.style.display = 'none'; document.removeEventListener('mousedown', _dpOutside); }
function dpNav(delta) { _dpMonth = new Date(_dpMonth.getFullYear(), _dpMonth.getMonth() + delta, 1); dpRender(); }
function dpToday() { const t = new Date(); dpPick(dateKey(t)); }
function dpPick(iso) { if (_dpInput) { _dpInput.value = iso; _dpInput.dispatchEvent(new Event('change', { bubbles: true })); } closeDayPicker(); }
function dpRender() {
  const el = document.getElementById('daypicker'); if (!el) return;
  const occ = dpOccupied();
  const y = _dpMonth.getFullYear(), m = _dpMonth.getMonth();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
  const daysIn = new Date(y, m + 1, 0).getDate();
  const today = dateKey(new Date());
  const sel = _dpInput ? _dpInput.value : '';
  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<span class="dp-cell empty"></span>`;
  for (let d = 1; d <= daysIn; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const n = occ[iso] || 0;
    const cls = ['dp-cell', iso === today ? 'today' : '', iso === sel ? 'sel' : '', n ? 'busy' : ''].filter(Boolean).join(' ');
    cells += `<button type="button" class="${cls}" onclick="dpPick('${iso}')" ${n ? `title="${n} pieza(s) ya programada(s) este día"` : ''}>${d}${n ? `<span class="dp-dot"></span>` : ''}</button>`;
  }
  el.innerHTML = `
    <div class="dp-head">
      <button type="button" class="dp-nav" onclick="dpNav(-1)">‹</button>
      <span class="dp-title">${MESES_CAL[m]} ${y}</span>
      <button type="button" class="dp-nav" onclick="dpNav(1)">›</button>
    </div>
    <div class="dp-dows">${DAYS.map(d => `<span>${d.slice(0,2)}</span>`).join('')}</div>
    <div class="dp-grid">${cells}</div>
    <div class="dp-foot"><span class="dp-legend"><span class="dp-dot"></span> ya hay contenido</span><button type="button" class="dp-today" onclick="dpToday()">Hoy</button></div>`;
}
function calMonthGrid() {
  // Ancla en el MES EN CURSO (no en la fecha del lanzamiento); las flechas mueven con monthOffset.
  const base = new Date();
  base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(1 - startDow);
  const days = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
  return { days, month, label: `${MESES_CAL[month]} ${year}` };
}

// Vista / rango
function setCalView(v) { calView = v; renderCalendar(); }
function setCalRange(r) { calRange = r; weekOffset = 0; monthOffset = 0; renderCalendar(); }
function changeWeek(dir) {
  if (calView === 'kanban') return;
  if (calRange === '1m') monthOffset += dir;
  else weekOffset += dir * (calRange === '2w' ? 2 : 1);
  renderCalendar();
}

// Entrada maestra
function renderCalendar() {
  const ctx = document.getElementById('ctx-cal'); if (ctx) ctx.innerHTML = launchContextHTML();
  document.querySelectorAll('#page-calendario .view-toggle button').forEach(b => b.classList.toggle('active', b.dataset.view === calView));
  document.querySelectorAll('#cal-range-sel button').forEach(b => b.classList.toggle('active', b.dataset.range === calRange));
  const rsel = document.getElementById('cal-range-sel'); if (rsel) rsel.style.display = calView === 'calendar' ? '' : 'none';
  const wnav = document.getElementById('cal-weeknav'); if (wnav) wnav.style.display = calView === 'calendar' ? '' : 'none';
  document.getElementById('cal-calendar-view').style.display = calView === 'calendar' ? '' : 'none';
  document.getElementById('cal-board').style.display = calView === 'kanban' ? '' : 'none';
  if (calView === 'calendar') renderCalGrid(); else renderKanban();
}

function renderCalGrid() {
  const a = activeLaunch();
  const campLabel = document.getElementById('cal-campaign-label');
  if (campLabel) campLabel.textContent = a ? (up(a.name) + ' · CAMPAÑA') : 'CAMPAÑA';
  const grid = document.getElementById('cal-grid');
  const sideRefs = document.getElementById('side-refs');

  let days = [], label = '', month = null;
  if (calRange === '1m') { const g = calMonthGrid(); days = g.days; label = g.label; month = g.month; }
  else {
    const n = calRange === '2w' ? 14 : 7; const monday = weekStart();
    for (let i = 0; i < n; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); days.push(d); }
    const last = days[days.length - 1];
    label = (monday.getMonth() === last.getMonth())
      ? `${MESES_CAL[monday.getMonth()]} ${monday.getDate()}–${last.getDate()}, ${last.getFullYear()}`
      : `${MESES_CAL[monday.getMonth()]} ${monday.getDate()} – ${MESES_CAL[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  }
  document.getElementById('week-label').textContent = label;

  grid.innerHTML = DAYS.map(d => `<div class="cal-day-header">${d}</div>`).join('');
  const today = new Date(); today.setHours(0,0,0,0);
  const dropKey = (a && a.date) ? a.date : null;
  const items = calVisibleItems(); // piezas de TODAS las campañas visibles (release + evergreen)
  const canEditCal = (typeof canDo !== 'function') || canDo('edit_launch');

  days.forEach(day => {
    const dk = dateKey(day);
    const isToday = day.getTime() === today.getTime();
    const isDrop = dk === dropKey;
    const outMonth = (month !== null && day.getMonth() !== month);
    const dayItems = items.filter(ci => ci.fecha === dk);
    const itemsHTML = dayItems.map(ci => {
      const col = ci._campColor || catColor(ci.cat);
      const est = (ci.production && ci.production.estado) || 'pendiente';
      const estIcon = ESTADO_ICON[est] || '';
      const paid = (ci.pauta === 'pautado') ? `<span title="Pautado" style="font-weight:700">$ </span>` : '';
      const delX = canEditCal ? `<button onclick="event.stopPropagation();deleteCalItem('${ci._campId}','${ci.id}',event)" title="Eliminar del calendario" style="flex-shrink:0;background:none;border:none;color:${col};opacity:.55;cursor:pointer;padding:0;display:flex;align-items:center;line-height:1">${icon('close',9)}</button>` : '';
      const drag = canEditCal ? `draggable="true" ondragstart="calDragStart(event,'${ci._campId}','${ci.id}')" ondragend="calDragEnd(event)"` : '';
      return `<div ${drag} style="display:flex;align-items:flex-start;gap:3px;border-radius:3px;padding:3px 5px 3px 4px;font-size:9px;font-weight:500;margin-bottom:3px;line-height:1.3;background:${col}18;color:${col};border-left:2px solid ${col};cursor:${canEditCal?'grab':'default'}" title="${esc(ci._campName||'')} · ${esc(ci.title)} · ${est}${ci.pauta==='pautado'?' · pautado':''}${canEditCal?' · arrastra para mover de día':''}">${delX}<span onclick="event.stopPropagation();openProduction('${ci._campId}','${ci.id}')" style="cursor:pointer;flex:1;min-width:0">${paid}${estIcon ? estIcon + ' ' : ''}${esc(ci.title)}</span></div>`;
    }).join('');
    const dropBadge = isDrop ? `<div style="font-size:8px;font-family:var(--font-mono);color:var(--accent);letter-spacing:1px;margin-bottom:3px;display:flex;align-items:center;gap:4px">${icon('goals',10)} DROP</div>` : '';
    const div = document.createElement('div');
    div.className = 'cal-day' + (isToday ? ' today' : '') + (outMonth ? '' : ' addable');
    if (calRange === '1m') div.style.minHeight = '78px';
    if (isDrop) div.style.borderColor = 'rgba(255,107,48,0.5)';
    if (outMonth) div.style.opacity = '0.38';
    div.innerHTML = `<div class="cal-day-num">${day.getDate()}</div>${dropBadge}${itemsHTML}`;
    // Click en el día (zona vacía) = crear post directo en el calendario, sin tocar el banco.
    if (!outMonth) { div.title = '+ Crear post este día'; div.onclick = () => crearPostEnDia(dk); }
    // Drop: arrastrar una pieza a este día la reprograma a esta fecha.
    if (canEditCal) {
      div.ondragover = (e) => { e.preventDefault(); div.classList.add('cal-drop'); };
      div.ondragleave = () => div.classList.remove('cal-drop');
      div.ondrop = (e) => { div.classList.remove('cal-drop'); calDropOnDay(e, dk); };
    }
    grid.appendChild(div);
  });

  renderCampaignsBar();
  if (sideRefs) sideRefs.innerHTML = referencias.slice(0, 6).map((r) => {
    const cats = (r.cat||[]).filter(Boolean); const col = catColor(cats[0]);
    return `<div class="ref-item" onclick="openRefBoxdrop(${r._idx})">
      <div style="width:26px;height:26px;border-radius:4px;background:${col}22;color:${col};display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon(s(r.icon)||'pin',15)}</div>
      <div class="ref-info"><div class="ref-title">${esc(r.title)}</div><div class="ref-meta">${cats.map(up).join(' · ') || '—'}</div></div>
    </div>`;
  }).join('');
}

// Barra de campañas (leyenda + toggles de visibilidad + crear/eliminar evergreen).
function renderCampaignsBar() {
  const el = document.getElementById('cal-leyenda'); if (!el) return;
  const camps = calCampaigns();
  const canEditC = (typeof canDo !== 'function') || canDo('edit_launch');
  const rows = camps.map(c => {
    const hidden = !!_calHidden[c.id];
    const del = c.isEvergreen && canEditC ? `<button class="goal-btn reject" style="padding:2px 5px" title="Eliminar campaña" onclick="event.stopPropagation();borrarCampania('${c.id}')">${icon('close',10)}</button>` : '';
    const tag = c.isEvergreen ? 'always-on' : 'release';
    return `<div style="display:flex;align-items:center;gap:8px;opacity:${hidden?0.4:1};cursor:pointer" onclick="toggleCampaign('${c.id}')" title="${hidden?'Mostrar':'Ocultar'} en el calendario">
      <span style="width:11px;height:11px;border-radius:3px;background:${c.color};display:inline-block;flex-shrink:0;${hidden?'opacity:.5':''}"></span>
      <span style="flex:1;min-width:0;font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s(c.name)} <span style="font-size:8px;font-family:var(--font-mono);color:var(--text-dim)">${tag}</span></span>
      <span style="color:var(--text-dim);display:flex">${icon(hidden?'eye':'eye',11)}</span>
      ${del}
    </div>`;
  }).join('');
  el.innerHTML = (rows || '<div style="font-size:10px;color:var(--text-dim)">Sin campañas.</div>') +
    (canEditC ? `<button class="btn btn-ghost" style="margin-top:8px;font-size:11px;padding:5px 9px;width:100%" onclick="crearCampania()">+ Campaña always-on</button>` : '');
  if (typeof hydrateIcons === 'function') hydrateIcons(el);
}

// ── Tablero Kanban (3 etapas) ──
const STAGE_DEF = [
  { key:'pre',  title:'Preproducción',  setTo:'pendiente', estados:['pendiente','aprobado'],
    desc:'Se define la pieza: idea, brief, guión, aprobación y plan de grabación (shot list). Aún no se ha grabado nada.' },
  { key:'prod', title:'Producción',     setTo:'grabando',  estados:['grabando'],
    desc:'Se ejecuta la grabación / captura del material siguiendo el shot list. Manos a la cámara.' },
  { key:'post', title:'Postproducción', setTo:'editando',  estados:['editando','programado','publicado'],
    desc:'Edición, montaje, aprobación final, programación y publicación de la pieza.' },
];
function stageOf(estado) {
  const st = STAGE_DEF.find(s2 => s2.estados.includes(estado));
  return st ? st.key : 'pre';
}
function launchProgress(l) {
  const items = (l && l.cal) || [];
  const total = items.length;
  const published = items.filter(c => (c.production && c.production.estado) === 'publicado').length;
  const byStage = { pre: 0, prod: 0, post: 0 };
  items.forEach(c => { byStage[stageOf((c.production && c.production.estado) || 'pendiente')]++; });
  return { total, published, pct: total ? Math.round(published / total * 100) : 0, byStage };
}
function donutSVG(segments, size, thickness, centerLabel, centerSub) {
  size = size || 130; thickness = thickness || 16;
  const r = (size - thickness) / 2, cx = size/2, cy = size/2, C = 2 * Math.PI * r;
  const total = segments.reduce((a, sg) => a + sg.value, 0) || 1;
  let offset = 0;
  const arcs = segments.filter(sg => sg.value > 0).map(sg => {
    const len = sg.value / total * C;
    const el = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${sg.color}" stroke-width="${thickness}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"></circle>`;
    offset += len; return el;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="${thickness}"></circle>
    ${arcs}
    ${centerLabel ? `<text x="${cx}" y="${cy - (centerSub?6:0)}" text-anchor="middle" dominant-baseline="central" fill="var(--text)" font-family="Bebas Neue" font-size="${size*0.28}">${centerLabel}</text>` : ''}
    ${centerSub ? `<text x="${cx}" y="${cy + size*0.13}" text-anchor="middle" dominant-baseline="central" fill="var(--text-muted)" font-family="Space Mono" font-size="${size*0.08}">${centerSub}</text>` : ''}
  </svg>`;
}
function kanbanCardHTML(launchId, ci) {
  const col = catColor(ci.cat);
  const est = (ci.production && ci.production.estado) || 'pendiente';
  const fecha = ci.fecha ? `${MESES_CAL[new Date(ci.fecha+'T00:00:00').getMonth()]} ${new Date(ci.fecha+'T00:00:00').getDate()}` : '—';
  const canEditCal = (typeof canDo !== 'function') || canDo('edit_launch');
  const delX = canEditCal ? `<button class="kc-del" onclick="event.stopPropagation();deleteCalItem('${launchId}','${ci.id}',event)" title="Eliminar del calendario">${icon('close',12)}</button>` : '';
  return `<div class="kanban-card" draggable="true" ondragstart="kanbanDrag(event,'${ci.id}')" onclick="openProduction('${launchId}','${ci.id}')" style="position:relative">
    ${delX}
    <div class="kc-title" style="padding-right:16px;display:flex;align-items:center;gap:7px"><span style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></span>${esc(ci.title)}</div>
    <div class="kc-meta">${fecha} · ${ESTADO_ICON[est] || ''} ${est}</div>
  </div>`;
}
function renderKanban() {
  const board = document.getElementById('cal-board');
  const items = calVisibleItems(); // todas las campañas visibles
  if (!calCampaigns().length) { board.innerHTML = '<div class="empty-hint">Selecciona un lanzamiento o crea una campaña.</div>'; return; }
  board.innerHTML = `<div class="kanban">${STAGE_DEF.map(st => {
    const cards = items.filter(ci => stageOf((ci.production && ci.production.estado) || 'pendiente') === st.key);
    return `<div class="kanban-col" data-stage="${st.key}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="kanbanDrop(event,'${st.key}')">
      <div class="kanban-head">
        <span>${st.title}</span>
        <span class="kanban-count">${cards.length}</span>
        <span class="kanban-info">ⓘ<span class="kanban-tip">${st.desc}</span></span>
      </div>
      <div class="kanban-cards">${cards.map(ci => kanbanCardHTML(ci._campId, ci)).join('') || '<div class="kanban-empty">Arrastra piezas aquí</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}
function kanbanDrag(e, id) { e.dataTransfer.setData('text/plain', id); }
// Encuentra la pieza por id en cualquiera de las campañas (release o evergreen).
function findCalItem(id) {
  for (const c of calCampaigns()) { const ci = (c.launch.cal || []).find(x => x.id === id); if (ci) return { launch: c.launch, ci }; }
  return null;
}
function kanbanDrop(e, stageKey) {
  e.preventDefault();
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  const id = e.dataTransfer.getData('text/plain');
  const found = findCalItem(id); if (!found) return;
  const ci = found.ci;
  const st = STAGE_DEF.find(x => x.key === stageKey); if (!st) return;
  ensureProduction(ci);
  if (stageOf(ci.production.estado) !== stageKey) ci.production.estado = st.setTo;
  saveLaunches(); renderKanban();
}

// ══════════════════════════════════════════
// EXPORTAR CALENDARIO (para enviar al artista) — HTML interactivo + PDF
// ══════════════════════════════════════════
const _esc = esc;
const _ESTADO_LBL = { pendiente:'Pendiente', aprobado:'Aprobado', grabando:'Grabando', editando:'Editando', programado:'Programado', publicado:'Publicado' };
// Junta las piezas visibles del calendario con todo su detalle de producción.
function calExportPieces() {
  const items = (typeof calVisibleItems === 'function') ? calVisibleItems() : [];
  return items.filter(ci => ci.fecha).map(ci => {
    const p = ci.production || {};
    return {
      id: ci.id, title: s(ci.title) || 'Pieza', fecha: ci.fecha, campaign: s(ci._campName || ''),
      cat: s(ci.cat || ''), plataforma: s(p.plataforma || ''), estado: _ESTADO_LBL[p.estado] || 'Pendiente',
      pauta: ci.pauta === 'pautado' ? 'Pautado (paid)' : 'Orgánico',
      objetivo: s(p.objetivo || ''), hook: s(p.hook || ''), descripcion: s(p.descripcion || ''),
      guion: Array.isArray(p.guion) ? p.guion : [], shots: Array.isArray(p.shots) ? p.shots : [], assets: Array.isArray(p.assets) ? p.assets : [],
      content: (p.content && typeof p.content === 'object') ? p.content : null,
      refLink: s(ci.refLink || ci.link || ''), thumb: s(ci.thumb || (typeof refThumbImmediate === 'function' ? (refThumbImmediate(ci) || '') : '')),
    };
  }).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}
// Detalle completo de una pieza (se usa en el modal interactivo y en la vista de impresión).
function _pieceDetailHTML(p) {
  const row = (lbl, val) => val ? `<div class="x-row"><span class="x-k">${lbl}</span><span class="x-v">${_esc(val)}</span></div>` : '';
  const guion = (p.guion || []).filter(b => s(b.text).trim() || s(b.time).trim()).map(b =>
    `<div class="x-block"><div class="x-time">${_esc(b.time) || '—'}</div><div>${_esc(b.text)}</div>${s(b.note).trim() ? `<div class="x-note">${_esc(b.note)}</div>` : ''}</div>`).join('');
  const shots = (p.shots || []).filter(sh => s(sh.name).trim() || s(sh.detail).trim()).map((sh, i) =>
    `<div class="x-shot"><span class="x-num">${String(i+1).padStart(2,'0')}</span><div><strong>${_esc(sh.name) || 'Plano'}</strong>${s(sh.detail).trim() ? `<div class="x-note">${_esc(sh.detail)}</div>` : ''}</div></div>`).join('');
  const assets = (p.assets || []).filter(a => s(a.link).trim()).map(a =>
    `<a class="x-asset" href="${_esc(a.link)}" target="_blank" rel="noopener">↗ ${_esc(a.label) || 'Archivo'}</a>`).join('');
  const c = p.content;
  const cBlock = (lbl, v) => s(v).trim() ? `<div class="x-row"><span class="x-k">${lbl}</span><span class="x-v">${_esc(v)}</span></div>` : '';
  const content = c ? `${cBlock('Hook', c.hook)}${cBlock('Caption IG', c.caption_ig)}${cBlock('Caption TikTok', c.caption_tiktok)}${cBlock('Story', c.story)}${s(c.script).trim() ? `<div class="x-block"><div class="x-time">GUIÓN</div><div>${_esc(c.script)}</div></div>` : ''}${(c.hashtags||[]).length ? `<div class="x-tags">${(c.hashtags||[]).map(h => `<span class="x-tag">${_esc(s(h).startsWith('#')?h:'#'+h)}</span>`).join('')}</div>` : ''}` : '';
  return `
    <div class="x-head">
      ${p.thumb ? `<img class="x-thumb" src="${_esc(p.thumb)}" alt="" loading="lazy">` : ''}
      <div>
        <div class="x-title">${_esc(p.title)}</div>
        <div class="x-meta">${[p.fecha, p.plataforma, p.estado, p.pauta, p.cat].filter(Boolean).map(_esc).join(' · ')}</div>
        ${p.campaign ? `<div class="x-camp">${_esc(p.campaign)}</div>` : ''}
      </div>
    </div>
    ${row('Objetivo', p.objetivo)}${row('Hook', p.hook)}${row('Descripción / brief', p.descripcion)}
    ${guion ? `<div class="x-sec">Guión</div>${guion}` : ''}
    ${shots ? `<div class="x-sec">Shot list</div>${shots}` : ''}
    ${content ? `<div class="x-sec">Contenido sugerido</div>${content}` : ''}
    ${assets ? `<div class="x-sec">Archivos</div><div class="x-assets">${assets}</div>` : ''}
    ${p.refLink ? `<div class="x-sec">Referencia</div><a class="x-asset" href="${_esc(p.refLink)}" target="_blank" rel="noopener">↗ Ver video de referencia</a>` : ''}`;
}
// Grilla de calendario por mes (solo meses con piezas).
function _calGridHTML(pieces) {
  const byDate = {}; pieces.forEach(p => { (byDate[p.fecha] = byDate[p.fecha] || []).push(p); });
  const months = [...new Set(pieces.map(p => p.fecha.slice(0, 7)))].sort();
  return months.map(ym => {
    const [y, m] = ym.split('-').map(Number); const year = y, month = m - 1;
    const first = new Date(year, month, 1); const startDow = (first.getDay() + 6) % 7;
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(year, month, 1 - startDow + i);
      const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const out = d.getMonth() !== month;
      const list = byDate[dk] || [];
      cells += `<div class="x-cell${out ? ' x-out' : ''}"><div class="x-daynum">${d.getDate()}</div>${list.map(p => `<button class="x-chip" onclick="op('${p.id}')">${_esc(p.title)}</button>`).join('')}</div>`;
    }
    return `<div class="x-monthlbl">${MESES_CAL[month]} ${year}</div>
      <div class="x-grid">${['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'].map(d => `<div class="x-dow">${d}</div>`).join('')}${cells}</div>`;
  }).join('');
}
function buildCalDoc(printMode) {
  const a = (typeof activeLaunch === 'function') ? activeLaunch() : null;
  const art = (typeof activeArtist === 'function') ? activeArtist() : null;
  const pieces = calExportPieces();
  const title = (art ? s(art.name) + ' — ' : '') + (a ? s(a.name) : 'Plan de contenido');
  const drop = (a && a.date) ? a.date : '';
  const detailBlocks = pieces.map(p => `<div class="x-detail" id="p-${p.id}">${_pieceDetailHTML(p)}</div>`).join('');
  const flat = pieces.map(p => `<div class="x-card">${_pieceDetailHTML(p)}</div>`).join('');
  const CSS = `
    :root{--ac:#FF6B30;--bg:#0c0e0c;--surf:#14171420;--card:#16191680;--bd:#2a2e2a;--tx:#f3f0f3;--mut:#9aa39a;--dim:#6b726b}
    *{box-sizing:border-box} body{margin:0;background:#0c0e0c;color:var(--tx);font-family:'DM Sans',system-ui,sans-serif;line-height:1.5}
    a{color:var(--ac)} .wrap{max-width:1040px;margin:0 auto;padding:24px 18px 60px}
    .top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border-bottom:1px solid var(--bd);padding-bottom:16px;margin-bottom:22px}
    .brand{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px;color:var(--ac)}
    .h1{font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:1px;margin:0}
    .sub{font-family:'Space Mono',monospace;font-size:11px;color:var(--mut);letter-spacing:1px}
    .btn{margin-left:auto;background:var(--ac);color:#1a0e08;border:none;border-radius:6px;padding:9px 16px;font-family:'Space Mono',monospace;font-size:12px;cursor:pointer;font-weight:700}
    .x-monthlbl{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;margin:24px 0 8px;color:var(--ac)}
    .x-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
    .x-dow{font-family:'Space Mono',monospace;font-size:9px;color:var(--dim);text-align:center;letter-spacing:1px;padding-bottom:4px}
    .x-cell{background:var(--surf);border:1px solid var(--bd);border-radius:6px;min-height:84px;padding:6px}
    .x-out{opacity:.35} .x-daynum{font-family:'Space Mono',monospace;font-size:10px;color:var(--mut);margin-bottom:5px}
    .x-chip{display:block;width:100%;text-align:left;background:rgba(255,107,48,.12);color:var(--ac);border:none;border-left:2px solid var(--ac);border-radius:3px;padding:4px 6px;font-size:10px;margin-bottom:4px;cursor:pointer;font-family:inherit;line-height:1.3}
    .x-chip:hover{background:rgba(255,107,48,.22)}
    .x-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99;align-items:flex-start;justify-content:center;padding:30px 14px;overflow:auto}
    .x-modal{background:#131613;border:1px solid var(--bd);border-radius:12px;max-width:680px;width:100%;padding:22px}
    .x-close{float:right;background:none;border:none;color:var(--mut);font-size:22px;cursor:pointer;line-height:1}
    .x-detail,.x-card{} .x-card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:18px;margin-bottom:14px;break-inside:avoid}
    .x-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}
    .x-thumb{width:74px;height:120px;object-fit:cover;border-radius:6px;flex-shrink:0;background:#222}
    .x-title{font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:.5px;line-height:1.1}
    .x-meta{font-family:'Space Mono',monospace;font-size:11px;color:var(--mut);margin-top:5px}
    .x-camp{font-family:'Space Mono',monospace;font-size:10px;color:var(--dim);margin-top:3px}
    .x-row{margin:10px 0} .x-k{display:block;font-family:'Space Mono',monospace;font-size:9px;letter-spacing:1px;color:var(--dim);text-transform:uppercase;margin-bottom:3px}
    .x-v{white-space:pre-wrap}
    .x-sec{font-family:'Space Mono',monospace;font-size:10px;letter-spacing:1px;color:var(--ac);text-transform:uppercase;margin:16px 0 8px;border-top:1px solid var(--bd);padding-top:12px}
    .x-block{background:var(--surf);border-radius:6px;padding:10px;margin-bottom:7px}
    .x-time{font-family:'Space Mono',monospace;font-size:10px;color:var(--ac);margin-bottom:4px}
    .x-note{font-size:12px;color:var(--mut);margin-top:4px}
    .x-shot{display:flex;gap:10px;margin-bottom:8px} .x-num{font-family:'Space Mono',monospace;color:var(--ac);font-size:12px}
    .x-assets{display:flex;flex-direction:column;gap:6px} .x-asset{font-family:'Space Mono',monospace;font-size:12px;text-decoration:none}
    .x-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px} .x-tag{background:rgba(255,107,48,.12);color:var(--ac);border-radius:3px;padding:2px 7px;font-family:'Space Mono',monospace;font-size:11px}
    .x-hide{display:none}
    @media print{ body{background:#fff;color:#111} .btn,.x-ov{display:none!important} .x-cal{display:none} .x-print{display:block!important}
      .x-card{border:1px solid #ccc;background:#fff;page-break-inside:avoid} .x-thumb{background:#eee} .x-title,.x-monthlbl,.x-brand,.brand{color:#c2410c}
      .x-sec{color:#c2410c} .x-time{color:#c2410c} .x-num{color:#c2410c} .x-chip{color:#c2410c} a{color:#c2410c} .x-v,.x-block{color:#111} .x-block{background:#f4f4f4}
    }`;
  const body = `
    <div class="wrap">
      <div class="top">
        <span class="brand">TEMPO OS</span>
        <div><h1 class="h1">${_esc(title)}</h1><div class="sub">PLAN DE CONTENIDO${drop ? ' · DROP ' + _esc(drop) : ''} · ${pieces.length} pieza(s)</div></div>
        <button class="btn" onclick="window.print()">Guardar como PDF</button>
      </div>
      <div class="x-cal">${pieces.length ? _calGridHTML(pieces) : '<div class="sub">No hay contenido programado en este calendario.</div>'}
        <div class="sub" style="margin-top:18px;color:var(--dim)">Toca cualquier pieza para ver el guión, las tomas y el brief completo.</div>
      </div>
      <div class="x-print" style="display:none">${flat}</div>
    </div>
    <div class="x-ov" id="ov" onclick="if(event.target===this)oc()"><div class="x-modal"><button class="x-close" onclick="oc()">×</button><div id="ov-body"></div></div></div>
    <div class="x-hide">${detailBlocks}</div>
    <script>
      function op(id){var d=document.getElementById('p-'+id);if(!d)return;document.getElementById('ov-body').innerHTML=d.innerHTML;document.getElementById('ov').style.display='flex';}
      function oc(){document.getElementById('ov').style.display='none';}
      document.addEventListener('keydown',function(e){if(e.key==='Escape')oc();});
      ${printMode ? 'window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});' : ''}
    <\/script>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${_esc(title)} · Plan de contenido</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>${CSS}</style></head><body>${body}</body></html>`;
}
function _calDocFilename(ext) {
  const a = (typeof activeLaunch === 'function') ? activeLaunch() : null;
  const base = (a ? s(a.name) : 'calendario').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  return `plan-contenido_${base || 'calendario'}_${new Date().toISOString().slice(0,10)}.${ext}`;
}
function exportCalHTML() {
  if (!calExportPieces().length) { if (typeof uiAlert === 'function') uiAlert('No hay contenido en el calendario para exportar.'); return; }
  const blob = new Blob([buildCalDoc(false)], { type: 'text/html;charset=utf-8' });
  const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = _calDocFilename('html'); aEl.click();
  setTimeout(() => URL.revokeObjectURL(aEl.href), 4000);
  if (typeof uiToast === 'function') uiToast('✓ HTML interactivo exportado');
}
function exportCalPDF() {
  if (!calExportPieces().length) { if (typeof uiAlert === 'function') uiAlert('No hay contenido en el calendario para exportar.'); return; }
  const w = window.open('', '_blank');
  if (!w) { if (typeof uiAlert === 'function') uiAlert('Permite las ventanas emergentes para exportar el PDF (o usa Exportar HTML y guarda como PDF desde ahí).'); return; }
  w.document.open(); w.document.write(buildCalDoc(true)); w.document.close();
  if (typeof uiToast === 'function') uiToast('✓ Abriendo el diálogo de impresión → Guardar como PDF');
}
// Crea un LINK de solo-lectura alojado en la plataforma (ver.html?s=token) con un snapshot del plan.
// Seguro: token aleatorio + tabla `shares` con RLS (anon no lee directo; solo vía RPC get_share por token).
async function crearShareLink() {
  if (!(typeof authed === 'function' && authed())) { if (typeof uiAlert === 'function') uiAlert('Inicia sesión (modo equipo) para crear un link compartible.'); return; }
  if (typeof requireCan === 'function' && !requireCan('edit_launch')) return;
  if (!calExportPieces().length) { if (typeof uiAlert === 'function') uiAlert('No hay contenido en el calendario para compartir.'); return; }
  const a = (typeof activeLaunch === 'function') ? activeLaunch() : null;
  const art = (typeof activeArtist === 'function') ? activeArtist() : null;
  const title = (art ? s(art.name) + ' — ' : '') + (a ? s(a.name) : 'Plan de contenido');
  const html = buildCalDoc(false);
  let token;
  try { token = 'sh_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8); }
  catch (e) { token = 'sh_' + Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  if (typeof uiToast === 'function') uiToast('Creando link…');
  try {
    const sb = await getSb(); if (!sb) throw new Error('Sin conexión a la nube');
    const { error } = await sb.from('shares').insert({ token, team_id: _teamId, release_id: a ? a.id : null, title, html, created_by: _user && _user.id });
    if (error) throw new Error(error.message);
    const url = location.origin + location.pathname.replace(/[^/]*$/, 'ver.html') + '?s=' + token;
    let copied = false; try { await navigator.clipboard.writeText(url); copied = true; } catch (e) {}
    if (typeof uiAlert === 'function') uiAlert(`✓ Link de solo-lectura creado${copied ? ' y copiado al portapapeles' : ''}:\n\n${url}\n\nCualquiera con el link puede ver el plan (sin necesidad de cuenta). Es un snapshot: si cambias el calendario, crea un link nuevo. Para revocarlo, ábrelo desde "Mis links" en el calendario.`);
  } catch (e) {
    if (typeof uiAlert === 'function') uiAlert(friendlyError(e, 'crear el link'));
  }
}
// ── Panel "Mis links": listar / copiar / expiración / revocar ──
function _shareUrl(token) { return location.origin + location.pathname.replace(/[^/]*$/, 'ver.html') + '?s=' + token; }
function abrirShares() {
  if (!(typeof authed === 'function' && authed())) { if (typeof uiAlert === 'function') uiAlert('Inicia sesión (modo equipo) para ver tus links.'); return; }
  document.getElementById('modal-shares').classList.add('open');
  renderShares();
}
function cerrarShares(e) {
  if (!e || e.target === document.getElementById('modal-shares')) document.getElementById('modal-shares').classList.remove('open');
}
async function renderShares() {
  const host = document.getElementById('shares-body'); if (!host) return;
  host.innerHTML = '<div class="empty-hint">Cargando…</div>';
  try {
    const sb = await getSb(); if (!sb) { host.innerHTML = '<div class="empty-hint">Sin conexión a la nube.</div>'; return; }
    const q = sb.from('shares').select('token,title,release_id,created_at,expires_at,revoked').order('created_at', { ascending: false });
    if (typeof _teamId !== 'undefined' && _teamId) q.eq('team_id', _teamId);
    const res = await q;
    if (res.error) throw new Error(res.error.message);
    const rows = res.data || [];
    if (!rows.length) { host.innerHTML = '<div class="empty-hint">Aún no has creado links. Usa "Crear link" en el calendario.</div>'; return; }
    const now = Date.now();
    host.innerHTML = rows.map(r => {
      const exp = r.expires_at ? Date.parse(r.expires_at) : null;
      const expired = exp && exp < now;
      const estado = r.revoked ? ['REVOCADO', 'var(--accent2)'] : expired ? ['EXPIRADO', 'var(--text-dim)'] : ['ACTIVO', '#4ade80'];
      const fecha = new Date(r.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
      const expLbl = r.expires_at ? `expira ${new Date(r.expires_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}` : 'sin expiración';
      const active = !r.revoked && !expired;
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${esc(r.title) || '(sin título)'} <span style="font-size:9px;font-family:var(--font-mono);color:${estado[1]};border:1px solid ${estado[1]};border-radius:3px;padding:1px 5px;margin-left:4px">${estado[0]}</span></div>
            <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-dim)">creado ${fecha} · ${expLbl}</div>
          </div>
          <button class="btn btn-ghost" style="font-size:11px;padding:5px 11px" onclick="shareCopy('${r.token}')">${icon('link',12)} Copiar</button>
          ${active ? `<button class="btn btn-ghost" style="font-size:11px;padding:5px 11px;color:var(--accent2);border-color:rgba(255,77,77,0.3)" onclick="shareRevoke('${r.token}')">Revocar</button>` : ''}
        </div>
        ${active ? `<div style="display:flex;align-items:center;gap:6px;margin-top:10px;flex-wrap:wrap">
          <span style="font-size:9px;font-family:var(--font-mono);color:var(--text-dim);letter-spacing:1px">EXPIRACIÓN</span>
          ${[['7d','7 días'],['30d','30 días'],['90d','90 días'],['never','Nunca']].map(o => `<button class="btn btn-ghost" style="font-size:10px;padding:3px 9px" onclick="shareSetExpiry('${r.token}','${o[0]}')">${o[1]}</button>`).join('')}
        </div>` : ''}
      </div>`;
    }).join('');
    if (typeof hydrateIcons === 'function') hydrateIcons(host);
  } catch (e) { host.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${s(friendlyError(e, 'cargar tus links'))}</div>`; }
}
async function shareCopy(token) {
  const url = _shareUrl(token);
  try { await navigator.clipboard.writeText(url); if (typeof uiToast === 'function') uiToast('✓ Link copiado'); }
  catch (e) { if (typeof uiAlert === 'function') uiAlert('Copia el link:\n\n' + url); }
}
async function shareRevoke(token) {
  if (typeof uiConfirm === 'function' && !(await uiConfirm('¿Revocar este link? Dejará de funcionar para quien lo tenga.'))) return;
  try {
    const sb = await getSb(); const res = await sb.from('shares').update({ revoked: true }).eq('token', token);
    if (res.error) throw new Error(res.error.message);
    if (typeof uiToast === 'function') uiToast('✓ Link revocado'); renderShares();
  } catch (e) { if (typeof uiAlert === 'function') uiAlert(friendlyError(e, 'revocar el link')); }
}
async function shareSetExpiry(token, opt) {
  let expires_at = null;
  if (opt !== 'never') { const days = parseInt(opt, 10) || 30; expires_at = new Date(Date.now() + days * 864e5).toISOString(); }
  try {
    const sb = await getSb(); const res = await sb.from('shares').update({ expires_at }).eq('token', token);
    if (res.error) throw new Error(res.error.message);
    if (typeof uiToast === 'function') uiToast(opt === 'never' ? '✓ Sin expiración' : '✓ Expiración actualizada'); renderShares();
  } catch (e) { if (typeof uiAlert === 'function') uiAlert(friendlyError(e, 'actualizar la expiración')); }
}

// ══════════════════════════════════════════
// CENTRO DE PRODUCCIÓN (Módulo 9) — por pieza del calendario
// ══════════════════════════════════════════
const ESTADO_ICON = { pendiente:'', aprobado:icon('thumb',13), grabando:icon('video',13), editando:icon('scissors',13), programado:icon('calendar',13), publicado:icon('check',13) };
let prodCtx = { launchId: null, itemId: null };
let prodActiveTab = 'brief';

function prodItem() {
  const l = launches.find(x => x.id === prodCtx.launchId);
  if (!l) return null;
  return (l.cal || []).find(c => c.id === prodCtx.itemId) || null;
}
function ensureProduction(ci) {
  const p = ci.production = ci.production || {};
  p.estado = p.estado || 'pendiente';
  p.responsable = p.responsable || '';
  p.objetivo = p.objetivo || '';
  p.hook = p.hook || '';
  p.descripcion = p.descripcion || '';
  p.plataforma = p.plataforma || '';
  p.guion = Array.isArray(p.guion) ? p.guion : [];
  p.shots = Array.isArray(p.shots) ? p.shots : [];
  p.assets = Array.isArray(p.assets) ? p.assets : [];
  p.content = (p.content && typeof p.content === 'object') ? p.content : null;
  return p;
}
function openProduction(launchId, itemId) {
  prodCtx = { launchId, itemId };
  const ci = prodItem(); if (!ci) return;
  ensureProduction(ci);
  prodActiveTab = 'brief';
  document.getElementById('prod-title').value = s(ci.title);
  document.getElementById('prod-estado').value = ci.production.estado;
  const badge = document.getElementById('prod-cat');
  const col = catColor(ci.cat);
  badge.style.cssText = `margin:0;font-size:9px;padding:3px 9px;border-radius:2px;font-family:var(--font-mono);background:${col}22;color:${col};border:1px solid ${col}44`;
  badge.textContent = up(ci.cat || 'pieza');
  document.querySelectorAll('#prod-modal .boxdrop-tab').forEach(t => t.classList.toggle('active', t.dataset.ptab === 'brief'));
  renderProd();
  document.getElementById('prod-modal').classList.add('open');
}
function closeProd(e) { if (e.target === document.getElementById('prod-modal')) closeProdDirect(); }
function closeProdDirect() {
  document.getElementById('prod-modal').classList.remove('open');
  if (((document.querySelector('.page.active') || {}).id) === 'page-calendario') renderCalendar();
}
function prodTab(name, el) {
  prodActiveTab = name;
  document.querySelectorAll('#prod-modal .boxdrop-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderProd();
}
function prodSet(field, val) {
  const ci = prodItem(); if (!ci) return;
  if (field === 'title') ci.title = val;
  else ensureProduction(ci)[field] = val;
  saveLaunches();
  if (((document.querySelector('.page.active') || {}).id) === 'page-calendario') renderCalendar();
}
function prodSetFecha(val) {
  const ci = prodItem(); if (!ci) return;
  ci.fecha = val; saveLaunches();
  if (((document.querySelector('.page.active') || {}).id) === 'page-calendario') renderCalendar();
}
function prodSetPauta(val) {
  const ci = prodItem(); if (!ci) return;
  ci.pauta = val; saveLaunches();
  if (((document.querySelector('.page.active') || {}).id) === 'page-calendario') renderCalendar();
}
// Mueve la pieza actual a otra campaña (otro launch del mismo artista).
function moveCalItem(targetId) {
  const ci = prodItem(); if (!ci) return;
  const srcL = launches.find(x => x.id === prodCtx.launchId);
  const tgtL = launches.find(x => x.id === targetId);
  if (!srcL || !tgtL || srcL.id === tgtL.id) return;
  srcL.cal = (srcL.cal || []).filter(c => c.id !== ci.id);
  tgtL.cal = tgtL.cal || []; tgtL.cal.push(ci);
  prodCtx.launchId = tgtL.id; // sigue editando la misma pieza, ahora en la campaña destino
  saveLaunches();
  if (((document.querySelector('.page.active') || {}).id) === 'page-calendario') renderCalendar();
  if (typeof uiToast === 'function') uiToast('✓ Movido a ' + s(tgtL.name));
}
function renderProd() {
  const ci = prodItem(); const body = document.getElementById('prod-body'); if (!ci || !body) return;
  const p = ensureProduction(ci);
  if (prodActiveTab === 'brief') body.innerHTML = prodBriefHTML(ci, p);
  else if (prodActiveTab === 'guion') body.innerHTML = prodGuionHTML(p);
  else if (prodActiveTab === 'shots') body.innerHTML = prodShotsHTML(p);
  else if (prodActiveTab === 'content') body.innerHTML = prodContentHTML(ci, p);
  else body.innerHTML = prodAssetsHTML(ci, p);
}
function prodBriefHTML(ci, p) {
  const respSel = (typeof assigneeSelectHTML === 'function')
    ? assigneeSelectHTML(p.responsable, `onchange="prodSet('responsable',this.value)"`)
    : `<select class="input" onchange="prodSet('responsable',this.value)"><option value="">— Sin asignar —</option></select>`;
  // Selector de campaña: mueve la pieza entre campañas del artista (release ↔ evergreen).
  const srcL = launches.find(x => x.id === prodCtx.launchId);
  const artId = srcL && srcL.artistId;
  const campOpts = launches.filter(l => l.artistId === artId)
    .map(l => `<option value="${esc(l.id)}" ${l.id === prodCtx.launchId ? 'selected' : ''}>${esc(l.name)}${l.type === 'evergreen' ? ' · always-on' : ''}</option>`).join('');
  return `
    <div class="field" style="margin-bottom:16px"><label>Campaña <span style="color:var(--text-dim);font-size:10px">(mover entre campañas)</span></label><select class="input" onchange="moveCalItem(this.value)">${campOpts}</select></div>
    <div class="field-grid" style="margin-bottom:16px">
      <div class="field"><label>Objetivo</label><input class="input" value="${s(p.objetivo)}" onchange="prodSet('objetivo',this.value)" placeholder="¿Qué busca esta pieza?"></div>
      <div class="field"><label>Plataforma / formato</label><input class="input" value="${s(p.plataforma)}" onchange="prodSet('plataforma',this.value)" placeholder="TikTok · 9:16 · 15s"></div>
      <div class="field"><label>Responsable</label>${respSel}</div>
      <div class="field"><label>Fecha</label><input type="text" class="input" readonly placeholder="Elegir fecha…" value="${s(ci.fecha)}" onclick="openDayPicker(this)" onchange="prodSetFecha(this.value)" style="cursor:pointer"></div>
      <div class="field"><label>Pauta</label><select class="input" onchange="prodSetPauta(this.value)"><option value="organico" ${ci.pauta!=='pautado'?'selected':''}>Orgánico</option><option value="pautado" ${ci.pauta==='pautado'?'selected':''}>Pautado (paid)</option></select></div>
    </div>
    <div class="field" style="margin-bottom:16px"><label>Hook</label><input class="input" value="${s(p.hook)}" onchange="prodSet('hook',this.value)" placeholder="El gancho de los primeros segundos"></div>
    <div class="field"><label>Descripción / Brief</label><textarea class="textarea" onchange="prodSet('descripcion',this.value)" placeholder="Qué se graba, cómo, tono…">${s(p.descripcion)}</textarea></div>
    ${ci.refLink ? `<div style="margin-top:14px"><a href="${safeUrl(ci.refLink)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);font-family:var(--font-mono);text-decoration:none">↗ Referencia de inspiración</a></div>` : ''}`;
}
function prodGuionHTML(p) {
  const blocks = p.guion.map((b, i) => `
    <div class="script-block">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input class="input" style="font-family:var(--font-mono);font-size:11px;color:var(--accent)" value="${s(b.time)}" onchange="prodGuionSet(${i},'time',this.value)" placeholder="00:00 – 00:03 · HOOK">
        <button class="goal-btn reject" onclick="prodGuionDel(${i})" title="Quitar">${icon('close',12)}</button>
      </div>
      <textarea class="textarea" onchange="prodGuionSet(${i},'text',this.value)" placeholder="Qué pasa / qué se dice">${s(b.text)}</textarea>
      <input class="input" style="margin-top:8px;font-size:11px" value="${s(b.note)}" onchange="prodGuionSet(${i},'note',this.value)" placeholder="Nota (audio, tono, texto en pantalla…)">
    </div>`).join('');
  return `${blocks || '<div class="empty-hint">Sin guión. Agrega bloques por tiempo (hook, desarrollo, clímax, CTA).</div>'}<button class="btn btn-ghost" style="margin-top:6px" onclick="prodGuionAdd()">+ Bloque</button>`;
}
function prodGuionAdd() { ensureProduction(prodItem()).guion.push({ time:'', text:'', note:'' }); saveLaunches(); renderProd(); }
function prodGuionDel(i) { ensureProduction(prodItem()).guion.splice(i, 1); saveLaunches(); renderProd(); }
function prodGuionSet(i, k, v) { ensureProduction(prodItem()).guion[i][k] = v; saveLaunches(); }
function prodShotsHTML(p) {
  const shots = p.shots.map((sh, i) => `
    <div class="shot-item">
      <div class="shot-num">${String(i+1).padStart(2,'0')}</div>
      <div class="shot-content">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <input class="input" value="${s(sh.name)}" onchange="prodShotSet(${i},'name',this.value)" placeholder="Nombre del plano">
          <button class="goal-btn reject" onclick="prodShotDel(${i})" title="Quitar">${icon('close',12)}</button>
        </div>
        <textarea class="textarea" style="min-height:50px" onchange="prodShotSet(${i},'detail',this.value)" placeholder="Encuadre, iluminación, duración…">${s(sh.detail)}</textarea>
      </div>
    </div>`).join('');
  return `${shots || '<div class="empty-hint">Sin shot list. Agrega los planos a grabar.</div>'}<button class="btn btn-ghost" style="margin-top:10px" onclick="prodShotAdd()">+ Plano</button>`;
}
function prodShotAdd() { ensureProduction(prodItem()).shots.push({ name:'', detail:'' }); saveLaunches(); renderProd(); }
function prodShotDel(i) { ensureProduction(prodItem()).shots.splice(i, 1); saveLaunches(); renderProd(); }
function prodShotSet(i, k, v) { ensureProduction(prodItem()).shots[i][k] = v; saveLaunches(); }
function prodAssetsHTML(ci, p) {
  const assets = p.assets.map((as, i) => `
    <div class="metric-entry-row" style="grid-template-columns:1fr 1.5fr 32px">
      <input class="input" value="${s(as.label)}" onchange="prodAssetSet(${i},'label',this.value)" placeholder="Etiqueta (Foto portada, B-roll…)">
      <input class="input" value="${s(as.link)}" onchange="prodAssetSet(${i},'link',this.value)" placeholder="Link (Drive, Dropbox, archivo…)">
      <button class="goal-btn reject" onclick="prodAssetDel(${i})" title="Quitar">${icon('close',12)}</button>
    </div>`).join('');
  return `<div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;line-height:1.5">Enlaces a fotos, videos y archivos de la pieza (Drive, Dropbox, etc.).</div>
    ${assets || '<div class="empty-hint">Sin assets todavía.</div>'}
    <button class="btn btn-ghost" style="margin-top:6px" onclick="prodAssetAdd()">+ Asset</button>`;
}
function prodAssetAdd() { ensureProduction(prodItem()).assets.push({ label:'', link:'' }); saveLaunches(); renderProd(); }
function prodAssetDel(i) { ensureProduction(prodItem()).assets.splice(i, 1); saveLaunches(); renderProd(); }
function prodAssetSet(i, k, v) { ensureProduction(prodItem()).assets[i][k] = v; saveLaunches(); }

// ── FASE 1: Generador de contenido real con IA ──
function buildContentPrompt(ci) {
  const l = launches.find(x => x.id === prodCtx.launchId) || activeLaunch() || {};
  const art = (artists.find(a => a.id === l.artistId)) || activeArtist() || {};
  const adn = art.adn || {}; const d = l.dna || {}; const p = ci.production || {};
  return contentPromptText({
    name: art.name, genre: art.genre, country: art.country,
    tone: (adn.personality || {}).tone, audience: (adn.audience || {}).ideal,
    launch: l.name, about: d.about, emotion: d.emotion, message: d.message, keywords: d.keywords,
    title: ci.title, cat: ci.cat, hook: p.hook || ci.hook, brief: p.descripcion || ci.comentarios,
    songBlock: (typeof songContextBlock === 'function') ? songContextBlock(l) : '',
  });
}
function buildContentPromptFromRef(r, l, art) {
  const adn = (art && art.adn) || {}; const d = (l && l.dna) || {};
  return contentPromptText({
    name: art && art.name, genre: art && art.genre, country: art && art.country,
    tone: (adn.personality || {}).tone, audience: (adn.audience || {}).ideal,
    launch: l && l.name, about: d.about, emotion: d.emotion, message: d.message, keywords: d.keywords,
    title: r.title, cat: (r.cat || [])[0], hook: r.hook, brief: r.comentarios,
    songBlock: (typeof songContextBlock === 'function') ? songContextBlock(l) : '',
  });
}
function contentPromptText(x) {
  return `Eres copywriter y creador de contenido musical para redes (TikTok/Reels/Shorts). Genera el contenido para UNA pieza, alineado al ADN del artista y a la campaña.

ARTISTA: ${s(x.name)} · Género: ${s(x.genre)} · País: ${s(x.country)}
Tono de comunicación: ${s(x.tone)} · Audiencia ideal: ${s(x.audience)}
CAMPAÑA (${s(x.launch)}): Concepto: ${s(x.about)} · Emoción: ${s(x.emotion)} · Mensaje: ${s(x.message)} · Keywords: ${s(x.keywords)}
PIEZA: ${s(x.title)} · Categoría: ${s(x.cat)} · Hook de referencia: ${s(x.hook)} · Brief: ${s(x.brief)}${x.songBlock || ''}

Devuelve SOLO un objeto JSON válido (sin texto extra), en español, con esta forma exacta:
{
 "hook": "gancho hablado para los primeros 3 segundos, 1 frase potente",
 "script": "guión de 30-60s con estructura HOOK / DESARROLLO / CTA, con marcas de tiempo y saltos de línea (\\n)",
 "caption_ig": "caption para Instagram (hasta ~120 palabras, con saltos de línea y 1-2 emojis)",
 "caption_tiktok": "caption para TikTok, corto y directo (1-2 líneas)",
 "story": "texto para una story con CTA claro (1-2 líneas)",
 "hashtags": ["10 a 15 hashtags relevantes por género y país, sin espacios, sin repetir"]
}`;
}
function prodContentHTML(ci, p) {
  const c = p.content;
  const promptStr = buildContentPrompt(ci);
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">
      <button class="btn btn-ghost" style="border-color:rgba(255,107,48,0.35);color:var(--accent)" onclick="generarContenidoIA()">${icon('ai',13)} ${c ? 'Regenerar' : 'Generar'} contenido</button>
      ${c && c.at ? `<span style="font-size:10px;font-family:var(--font-mono);color:var(--text-dim)">generado ${new Date(c.at).toLocaleString()}</span>` : ''}
    </div>
    ${aiHintHTML(promptStr, 1000)}
    <div id="prod-content-result" style="margin-top:14px">${c ? contentResultHTML(c) : '<div class="empty-hint">Aún no hay contenido. Genera caption, script y hashtags a partir del ADN del artista + el Campaign DNA + esta pieza.</div>'}</div>
    ${p.contentPrev ? `<div class="section-header" style="margin-top:22px"><div class="section-title" style="color:var(--text-dim)">GENERACIÓN ANTERIOR${p.contentPrev.at ? ` · ${new Date(p.contentPrev.at).toLocaleDateString()}` : ''}</div></div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;font-family:var(--font-mono)">${icon('clock',12)} Se conserva para que la complementes. Solo se reemplaza al regenerar.</div>
      ${contentResultPrevHTML(p.contentPrev)}` : ''}`;
}
// Render read-only de la generación de contenido ANTERIOR (estado global propio para no chocar con el actual).
let viewContentPrev = null;
function copyContentPrev(key, btn) {
  if (!viewContentPrev) return;
  const v = key === 'hashtags' ? (viewContentPrev.hashtags || []).map(h => s(h).startsWith('#') ? s(h) : '#' + s(h)).join(' ') : s(viewContentPrev[key]);
  aiCopy(v, btn);
}
function contentResultPrevHTML(c) {
  viewContentPrev = c;
  const blk = (label, key, pre) => {
    const v = s(c[key]); if (!v) return '';
    return aiFieldHTML(label, v, `copyContentPrev('${key}',this)`, { sm: pre });
  };
  const tags = (c.hashtags || []);
  return `<div class="ai-field-prev" style="opacity:.95">
    ${blk('Hook (primeros 3s)', 'hook')}
    ${blk('Caption · Instagram', 'caption_ig')}
    ${blk('Caption · TikTok', 'caption_tiktok')}
    ${blk('Story', 'story')}
    ${blk('Guión 30–60s', 'script', true)}
    ${tags.length ? `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="brief-label" style="margin:0">Hashtags (${tags.length})</div><button class="btn btn-ghost btn-sm" onclick="copyContentPrev('hashtags',this)">Copiar todos</button></div><div class="brief-tags">${tags.map(h => `<span class="brief-tag accent">${s(h).startsWith('#') ? s(h) : '#' + s(h)}</span>`).join('')}</div></div>` : ''}
  </div>`;
}
async function generarContenidoIA() {
  const ci = prodItem(); if (!ci) return;
  if (!aiReady()) { abrirAISettings(); return; }
  const res = document.getElementById('prod-content-result');
  res.innerHTML = `<div class="empty-hint">${icon('ai',13)} Generando contenido…</div>`;
  try {
    const { text } = await callClaude(buildContentPrompt(ci), 1600);
    const obj = parseJSONObj(text);
    if (!obj) throw new Error('La IA no devolvió contenido en formato válido.');
    obj.at = Date.now();
    const prod = ensureProduction(ci);
    // Conserva el contenido anterior para complementar (no se borra; se reemplaza solo al regenerar).
    if (prod.content) prod.contentPrev = prod.content;
    prod.content = obj;
    saveLaunches();
    renderProd();
  } catch (e) {
    res.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(friendlyError(e))} — revisa ${icon('settings',12)} API.</div>`;
  }
}

// Render compartido (producción y banco)
let viewContent = null;
function contentResultHTML(c) {
  viewContent = c;
  const tags = (c.hashtags || []);
  return `<div class="content-result">
    <div class="ctabs">
      <span class="ctab active" data-ctab="caption" onclick="contentTab('caption',this)">Caption</span>
      <span class="ctab" data-ctab="script" onclick="contentTab('script',this)">Script</span>
      <span class="ctab" data-ctab="hashtags" onclick="contentTab('hashtags',this)">Hashtags</span>
    </div>
    <div data-cpane="caption">
      ${contentBlock('Hook (primeros 3s)', 'hook')}
      ${contentBlock('Caption · Instagram', 'caption_ig')}
      ${contentBlock('Caption · TikTok', 'caption_tiktok')}
      ${contentBlock('Story', 'story')}
    </div>
    <div data-cpane="script" style="display:none">
      ${contentBlock('Guión 30–60s', 'script', true)}
    </div>
    <div data-cpane="hashtags" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="brief-label" style="margin:0">Hashtags (${tags.length})</div><button class="btn btn-ghost btn-sm" onclick="copyContent('hashtags',this)">Copiar todos</button></div>
      <div class="brief-tags">${tags.map(h => `<span class="brief-tag accent">${s(h).startsWith('#') ? s(h) : '#' + s(h)}</span>`).join('') || '—'}</div>
    </div>
  </div>`;
}
// Bloque de resultado de IA unificado: cabecera (etiqueta + copiar) + caja de valor.
// Único componente de salida para TODOS los generadores (HANDOFF #7 nivel 2).
function aiFieldHTML(label, value, copyFn, opts) {
  opts = opts || {};
  const v = (value == null || value === '') ? '—' : value;
  const copyBtn = copyFn ? `<button class="btn btn-ghost btn-sm" onclick="${copyFn}">${opts.copyLabel || 'Copiar'}</button>` : '';
  return `<div class="ai-field-block">
    <div class="ai-field-head"><div class="brief-label" style="margin:0">${label}</div>${copyBtn}</div>
    <div class="ai-field${opts.sm ? ' sm' : ''}">${v}</div>
  </div>`;
}
function contentBlock(label, key, pre) {
  const v = s(viewContent ? viewContent[key] : '');
  return aiFieldHTML(label, v, `copyContent('${key}',this)`, { sm: pre });
}
function contentTab(name, el) {
  const wrap = el.closest('.content-result'); if (!wrap) return;
  wrap.querySelectorAll('[data-cpane]').forEach(p => p.style.display = p.dataset.cpane === name ? '' : 'none');
  wrap.querySelectorAll('.ctab').forEach(t => t.classList.toggle('active', t.dataset.ctab === name));
}
// Feedback de copia unificado para TODOS los generadores de IA: portapapeles + botón que
// confirma ("✓ Copiado") + toast. Una sola fuente para que copiar se sienta igual en todos
// lados (antes unos togglaban el botón, otros un toast, otros nada). HANDOFF #7.
function aiCopy(text, btn) {
  const v = (text == null) ? '' : String(text);
  if (navigator.clipboard) navigator.clipboard.writeText(v);
  if (btn) { const o = btn.dataset._lbl || btn.textContent; btn.dataset._lbl = o; btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = o; }, 1200); }
  if (typeof uiToast === 'function') uiToast('✓ Copiado');
}
function copyContent(key, btn) {
  if (!viewContent) return;
  const v = key === 'hashtags' ? (viewContent.hashtags || []).map(h => s(h).startsWith('#') ? s(h) : '#' + s(h)).join(' ') : s(viewContent[key]);
  aiCopy(v, btn);
}
// Banco: generación transitoria desde una referencia
async function generarContenidoBanco(idx) {
  if (!aiReady()) { abrirAISettings(); return; }
  const r = referencias[idx]; if (!r) return;
  const a = activeLaunch(); const art = activeArtist() || {};
  const res = document.getElementById('bd-content-result');
  res.innerHTML = `<div class="empty-hint">${icon('ai',13)} Generando contenido…</div>`;
  try {
    const { text } = await callClaude(buildContentPromptFromRef(r, a, art), 1600);
    const obj = parseJSONObj(text);
    if (!obj) throw new Error('La IA no devolvió contenido válido.');
    res.innerHTML = contentResultHTML(obj);
  } catch (e) {
    res.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(friendlyError(e))} — revisa ${icon('settings',12)} API.</div>`;
  }
}

// ══════════════════════════════════════════
// FASE 2: POW — Plan de la Semana
// ══════════════════════════════════════════
let powRecommendation = null;
function weekBounds(offset) {
  const d = new Date(); d.setHours(0,0,0,0);
  const dow = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow + offset * 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return { mon, sun };
}
function inWeek(iso, wb) { const t = new Date(iso + 'T00:00:00'); return t >= wb.mon && t <= wb.sun; }
function powData() {
  const a = activeLaunch(); const art = activeArtist() || {};
  const last = weekBounds(-1), now = weekBounds(0);
  const items = (a && a.cal) || [];
  const lastWeekItems = items.filter(c => inWeek(c.fecha, last));
  const lastPublished = lastWeekItems.filter(c => (c.production && c.production.estado) === 'publicado');
  const thisWeekItems = items.filter(c => inWeek(c.fecha, now));
  const pending = thisWeekItems.filter(c => (c.production && c.production.estado) !== 'publicado').sort((x,y) => x.fecha < y.fecha ? -1 : 1);
  const metrics = latestEntries(a ? a.metricEntries : []).slice(0, 3);
  return { a, art, last, now, lastWeekItems, lastPublished, thisWeekItems, pending, metrics };
}
function powDM(iso) { const x = new Date(iso + 'T00:00:00'); return `${x.getDate()}/${x.getMonth()+1}`; }
function powDMd(d) { return `${d.getDate()}/${d.getMonth()+1}`; }
function powRecPrompt(d) {
  const m = d.metrics.map(x => `${x.metric} ${fmtNum(x.value)}`).join(', ') || 'sin métricas';
  return `Eres director de estrategia musical. En 2-3 frases, recomienda qué priorizar ESTA semana para la campaña y por qué.

ARTISTA: ${s(d.art.name)} · CAMPAÑA: ${s(d.a && d.a.name)}
Semana pasada: ${d.lastPublished.length}/${d.lastWeekItems.length} piezas publicadas.
Pendientes esta semana: ${d.pending.map(c => c.title).join('; ') || 'ninguna'}.
Métricas: ${m}.

Devuelve SOLO el texto de la recomendación (sin JSON), empezando por la acción a priorizar.`;
}
function openPOW() { powRecommendation = null; renderPOW(); document.getElementById('pow-modal').classList.add('open'); }
function closePOW(e) { if (e.target === document.getElementById('pow-modal')) closePOWDirect(); }
function closePOWDirect() { document.getElementById('pow-modal').classList.remove('open'); }
function renderPOW() {
  const d = powData(); const body = document.getElementById('pow-body');
  if (!d.a) { body.innerHTML = '<div class="empty-hint" style="margin:0">Selecciona un lanzamiento con calendario para generar el POW.</div>'; return; }
  const hit = d.lastWeekItems.length ? Math.round(d.lastPublished.length / d.lastWeekItems.length * 100) : 0;
  body.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px;margin-bottom:18px">${up(d.art.name)} · ${up(d.a.name)} · SEMANA DEL ${powDMd(d.now.mon)} AL ${powDMd(d.now.sun)}</div>

    <div class="pow-section">
      <h4>${icon('check',14)} Semana pasada · hit rate ${hit}%</h4>
      <div style="font-size:13px;margin-bottom:8px">${d.lastPublished.length} de ${d.lastWeekItems.length} piezas publicadas.</div>
      <div class="progress-track"><div class="progress-fill" style="width:${hit}%"></div></div>
    </div>

    <div class="pow-section">
      <h4>${icon('calendar',14)} Esta semana · ${d.pending.length} pendiente${d.pending.length===1?'':'s'}</h4>
      ${d.pending.length ? d.pending.map(c => `<div class="pow-row"><span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);width:48px">${powDM(c.fecha)}</span><span style="flex:1">${ESTADO_ICON[(c.production&&c.production.estado)||'pendiente']||''} ${s(c.title)}</span><span style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${(c.production&&c.production.estado)||'pendiente'}</span></div>`).join('') : '<div style="font-size:12px;color:var(--text-dim)">Sin piezas pendientes esta semana.</div>'}
    </div>

    <div class="pow-section">
      <h4>${icon('chart',14)} Métricas top — ${s(d.a.name)}</h4>
      ${d.metrics.length ? `<div class="dashboard-grid" style="grid-template-columns:repeat(3,1fr);gap:10px">${d.metrics.map(m => `<div class="stat-card" style="padding:14px"><div class="stat-label">${s(m.metric)}</div><div class="stat-value" style="font-size:24px">${fmtNum(m.value)}</div></div>`).join('')}</div>` : '<div style="font-size:12px;color:var(--text-dim)">Sin métricas cargadas (impórtalas en Métricas).</div>'}
    </div>

    <div class="pow-section" style="margin-bottom:0">
      <h4>${icon('ideas',14)} Recomendación IA</h4>
      <div id="pow-rec">${powRecommendation
        ? `<div class="ai-field">${s(powRecommendation)}</div>`
        : `<button class="btn btn-ghost" style="border-color:rgba(255,107,48,0.35);color:var(--accent)" onclick="generarPOWRecomendacion()">${icon('ai',13)} Generar recomendación</button>${aiHintHTML(powRecPrompt(d), 300)}`}</div>
    </div>`;
}
async function generarPOWRecomendacion() {
  if (!aiReady()) { abrirAISettings(); return; }
  const d = powData(); const rec = document.getElementById('pow-rec');
  rec.innerHTML = `<div class="empty-hint">${icon('ai',13)} Generando recomendación…</div>`;
  try {
    const { text } = await callClaude(powRecPrompt(d), 400);
    powRecommendation = s(text).trim();
    renderPOW();
  } catch (e) { rec.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(friendlyError(e))} — revisa ${icon('settings',12)} API.</div>`; }
}
function powText() {
  const d = powData(); if (!d.a) return '';
  const hit = d.lastWeekItems.length ? Math.round(d.lastPublished.length / d.lastWeekItems.length * 100) : 0;
  let t = `📋 PLAN DE LA SEMANA — ${d.art.name} / ${d.a.name}\n(semana del ${powDMd(d.now.mon)} al ${powDMd(d.now.sun)})\n\n`;
  t += `✅ Semana pasada: ${d.lastPublished.length}/${d.lastWeekItems.length} publicadas (${hit}% hit rate)\n\n`;
  t += `📅 Esta semana — ${d.pending.length} pendientes:\n`;
  t += d.pending.length ? d.pending.map(c => `• ${c.title} — ${powDM(c.fecha)} (${(c.production && c.production.estado) || 'pendiente'})`).join('\n') : '• Sin pendientes';
  if (d.metrics.length) t += `\n\n📊 Métricas top:\n` + d.metrics.map(m => `• ${m.metric}: ${fmtNum(m.value)}`).join('\n');
  if (powRecommendation) t += `\n\n💡 ${powRecommendation}`;
  return t;
}
function copyPOW(btn) {
  aiCopy(powText(), btn);
}
function ensureJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve();
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    sc.onload = () => resolve(); sc.onerror = () => reject(new Error('No se pudo cargar jsPDF (¿sin internet?)'));
    document.head.appendChild(sc);
  });
}
async function powPDF() {
  const d = powData(); if (!d.a) { uiAlert('Selecciona un lanzamiento.'); return; }
  try { await ensureJsPDF(); } catch (e) { uiAlert('No se pudo cargar el generador de PDF (¿sin internet?). Usa "Copiar (WhatsApp)" como alternativa.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(); let y = 120;
  const pline = (txt, size, rgb, gap) => {
    doc.setFontSize(size); doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const lines = doc.splitTextToSize(txt, W - 80); doc.text(lines, 40, y); y += lines.length * (size * 1.25) + gap;
  };
  doc.setFillColor(10,10,10); doc.rect(0, 0, W, 92, 'F');
  doc.setTextColor(255,107,48); doc.setFontSize(22); doc.text('Tempo OS', 40, 42);
  doc.setTextColor(255,255,255); doc.setFontSize(13); doc.text('Plan de la Semana', 40, 64);
  doc.setTextColor(160,160,160); doc.setFontSize(10); doc.text(`${d.art.name}  ·  ${d.a.name}  ·  ${powDMd(d.now.mon)}-${powDMd(d.now.sun)}`, 40, 82);
  const hit = d.lastWeekItems.length ? Math.round(d.lastPublished.length / d.lastWeekItems.length * 100) : 0;
  pline('Semana pasada', 14, [0,0,0], 4);
  pline(`${d.lastPublished.length} de ${d.lastWeekItems.length} piezas publicadas - hit rate ${hit}%`, 11, [80,80,80], 16);
  pline('Esta semana - pendientes', 14, [0,0,0], 6);
  if (d.pending.length) d.pending.forEach(c => pline(`-  ${c.title}  (${powDM(c.fecha)} - ${(c.production && c.production.estado) || 'pendiente'})`, 11, [80,80,80], 3));
  else pline('Sin pendientes.', 11, [80,80,80], 3);
  y += 10;
  pline('Metricas top', 14, [0,0,0], 6);
  if (d.metrics.length) d.metrics.forEach(m => pline(`-  ${m.metric}: ${fmtNum(m.value)}`, 11, [80,80,80], 3));
  else pline('Sin metricas.', 11, [80,80,80], 3);
  if (powRecommendation) { y += 10; pline('Recomendacion IA', 14, [0,0,0], 6); pline(powRecommendation, 11, [80,80,80], 4); }
  doc.save(`POW-${s(d.art.name)}-${todayISO()}.pdf`.replace(/\s+/g, '_'));
}

// ══════════════════════════════════════════
// OBJETIVOS SMART (scoped al lanzamiento activo)
// ══════════════════════════════════════════
function renderObjetivos() {
  const a = activeLaunch();
  document.getElementById('ctx-objetivos').innerHTML = launchContextHTML();
  document.getElementById('objetivos-title').textContent = a ? `${up(a.name)} · METAS` : 'METAS';
  const hint = document.getElementById('obj-aihint');
  if (hint) hint.innerHTML = a ? aiHintHTML(buildGoalsPrompt(a), 600) : '';
  const host = document.getElementById('objetivos-list');
  const art = activeArtist();
  if (!a) { host.innerHTML = ''; return; }
  if (!a.goals.length) {
    // Generar-una-vez: si hay info suficiente, IA lista y aún no se intentó → genera y guarda
    if (hasGoalInfo(a, art) && aiReady() && canDo('use_generador_ia') && !a.goalsAITried) {
      a.goalsAITried = true; saveLaunches();
      host.innerHTML = `<div class="empty-hint">${icon('ai',13)} Generando sugerencias de metas con IA (según ADN, campaña e histórico)…</div>`;
      sugerirObjetivosIA(true);
      return;
    }
    if (!hasGoalInfo(a, art)) {
      host.innerHTML = `<div class="empty-hint">No hay suficiente información para sugerir metas todavía.<br>
        <span style="color:var(--text-muted)">Agrégalas con <b>“+ Meta manual”</b>, o completa el <b>ADN</b> del artista y los datos del lanzamiento (fecha, campaña). Tener métricas de lanzamientos anteriores también ayuda a que la IA proponga metas.</span></div>`;
    } else {
      host.innerHTML = `<div class="empty-hint">Aún no hay metas para “${esc(a.name)}”. Usa <b>“Sugerir con IA”</b> o <b>“+ Meta manual”</b>.</div>`;
    }
    return;
  }
  host.innerHTML = a.goals.map((g, i) => {
    const cls = g.status === 'accepted' ? ' accepted' : (g.status === 'rejected' ? ' rejected' : '');
    const accOn = g.status === 'accepted' ? ' on-accept' : '';
    const rejOn = g.status === 'rejected' ? ' on-reject' : '';
    const dl = g.deadline ? ` · ${icon('calendar',11)} ${g.deadline}` : '';
    const pr = goalProgress(a, g);
    let progHTML = '';
    if (pr.actual != null) {
      const pct = pr.pct, barW = pct == null ? 0 : Math.min(100, pct);
      const col = pct == null ? 'var(--text-dim)' : (pct >= 100 ? '#4ade80' : pct >= 60 ? 'var(--accent)' : 'var(--beat)');
      progHTML = `<div style="margin-top:6px;max-width:240px">
        <div style="height:5px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="height:100%;width:${barW}%;background:${col};transition:width .3s"></div></div>
        <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted);margin-top:3px">logrado ${fmtNum(pr.actual)}${pct != null ? ` · <span style="color:${col}">${pct}%</span>` : ' (objetivo relativo)'}</div></div>`;
    }
    return `<div class="goal-row${cls}">
      <div class="goal-platform" style="background:${g.bg || 'var(--surface2)'};display:flex;align-items:center;justify-content:center;color:var(--text)">${icon(ICONS[s(g.icon)]?s(g.icon):'goals',18)}</div>
      <div><div class="goal-metric">${s(g.metric)}</div><div class="goal-sub">${s(g.sub)}${dl}</div>${progHTML}</div>
      <div class="goal-target"><input class="goal-target-input" value="${s(g.target)}" title="Edita el objetivo manualmente" onclick="event.stopPropagation()" onchange="goalSetTarget(${i},this.value)"><small>OBJETIVO</small></div>
      <div class="goal-ai">${s(g.ai || (g.source === 'manual' ? 'manual' : ''))}</div>
      <div class="goal-actions">
        <div class="goal-btn accept${accOn}" title="Aceptar" onclick="goalSetStatus(${i},'accepted')">${icon('check',13)}</div>
        <div class="goal-btn reject${rejOn}" title="Quitar" onclick="goalSetStatus(${i},'rejected')">${icon('close',13)}</div>
      </div>
    </div>`;
  }).join('');
}
function goalSetStatus(i, status) {
  const a = activeLaunch();
  if (!a || !a.goals[i]) return;
  a.goals[i].status = (a.goals[i].status === status) ? 'proposed' : status;
  saveLaunches(); renderObjetivos();
}
// Editar manualmente el objetivo (las metas sugeridas por IA suelen estar altas → se ajustan al contexto del proyecto).
function goalSetTarget(i, val) {
  if (typeof requireCan === 'function' && !requireCan('use_generador_ia')) return;
  const a = activeLaunch();
  if (!a || !a.goals[i]) return;
  a.goals[i].target = s(val).trim();
  if (a.goals[i].ai && a.goals[i].source !== 'manual') a.goals[i].ai = 'IA · editado'; // marca que se ajustó a mano
  saveLaunches(); renderObjetivos(); // re-render para recalcular el % de progreso vs el nuevo objetivo
}
// ── Catálogo de plataformas/métricas POR ARTISTA (reutilizable) ──
const DEFAULT_METRIC_CATALOG = [
  { name: 'Spotify',   metrics: ['Streams', 'Oyentes mensuales', 'Seguidores', 'Saves'] },
  { name: 'YouTube',   metrics: ['Suscriptores', 'Reproducciones', 'Likes'] },
  { name: 'TikTok',    metrics: ['Seguidores', 'Likes', 'Reproducciones', 'Saves'] },
  { name: 'Instagram', metrics: ['Seguidores', 'Likes', 'Alcance', 'Saves', 'Reproducciones'] },
];
function artistCatalog(art) {
  if (!art) return DEFAULT_METRIC_CATALOG.map(p => ({ name: p.name, metrics: p.metrics.slice() }));
  if (!art.metricCatalog || !Array.isArray(art.metricCatalog.platforms) || !art.metricCatalog.platforms.length) {
    art.metricCatalog = { platforms: DEFAULT_METRIC_CATALOG.map(p => ({ name: p.name, metrics: p.metrics.slice() })) };
  }
  return art.metricCatalog.platforms;
}
// Fecha límite sugerida = cierre del lanzamiento (drop + días de post)
function launchEndDate(l) {
  if (!l || !l.date) return '';
  const d = new Date(l.date + 'T00:00:00'); d.setDate(d.getDate() + (l.postDays != null ? l.postDays : 21));
  return d.toISOString().slice(0, 10);
}
// ¿Hay suficiente info para sugerir metas con IA?
function hasGoalInfo(a, art) {
  const adn = (art && art.adn) || {};
  const adnFilled = !!((adn.sound && adn.sound.genres) || (adn.audience && adn.audience.ideal) || (adn.universe && adn.universe.themes) || (adn.personality && adn.personality.tone));
  const d = (a && a.dna) || {};
  const dnaFilled = !!(d.about || d.message || d.emotion);
  let hist = false;
  try { hist = (artistLaunches() || []).some(l => latestEntries(l.metricEntries).length); } catch (e) {}
  return adnFilled || dnaFilled || hist;
}
// ── Objetivos ↔ Métricas: el resultado real sale del módulo de Métricas ──
function parseTarget(str) {
  if (str == null) return null;
  const t = String(str).trim().replace(/^[+~≈]/, '').replace(/,/g, '').toLowerCase();
  const m = t.match(/^([\d.]+)\s*([km]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]); if (isNaN(n)) return null;
  if (m[2] === 'k') n *= 1e3; else if (m[2] === 'm') n *= 1e6;
  return n;
}
function isRelativeTarget(str) { return /^[+]/.test(String(str || '').trim()); }
// Empareja la meta con la métrica importada (CSV/screenshot/manual) del lanzamiento
function goalProgress(l, g) {
  if (!l || !g || !g.metric) return { actual: null, pct: null };
  const entries = latestEntries(l.metricEntries || []);
  const gm = g.metric.toLowerCase(), gp = (g.platform || '').toLowerCase();
  const matchMetric = x => { const xm = (x.metric || '').toLowerCase(); return xm === gm || xm.includes(gm) || gm.includes(xm); };
  // Si la meta tiene plataforma, solo casa métricas de ESA plataforma (evita cruces, p.ej. Seguidores TikTok vs Instagram)
  let e;
  if (gp) e = entries.find(x => (x.platform || '').toLowerCase() === gp && matchMetric(x));
  else e = entries.find(x => (x.metric || '').toLowerCase() === gm) || entries.find(matchMetric);
  if (!e) return { actual: null, pct: null };
  const actual = Number(e.value);
  const tgt = parseTarget(g.target);
  const pct = (tgt && !isRelativeTarget(g.target)) ? Math.max(0, Math.round(actual / tgt * 100)) : null;
  return { actual, pct };
}
// Resumen objetivo-vs-logrado para alimentar IA Estratégica y Aprendizajes
function goalsVsActuals(art) {
  const lines = [];
  (artistLaunches() || []).forEach(l => {
    (l.goals || []).filter(g => g.status !== 'rejected').forEach(g => {
      const pr = goalProgress(l, g);
      const got = pr.actual != null ? fmtNum(pr.actual) : 'sin dato';
      const pc = pr.pct != null ? ` (${pr.pct}%${pr.pct >= 100 ? ' '+icon('check',11)+' cumplida' : ''})` : '';
      lines.push(`- [${l.name}] ${g.platform || ''} ${g.metric}: objetivo ${g.target} · logrado ${got}${pc}`);
    });
  });
  return lines.join('\n') || '(sin metas registradas)';
}

// ── Generar reporte de lanzamiento (abre report.html con contexto precargado) ──
function abrirReporteLanzamiento(id) {
  const l = launches.find(x => x.id === id) || activeLaunch(); if (!l) return;
  if (!requireCan('use_generador_ia')) return; // staff o el artista de su propio lanzamiento
  const art = artists.find(a => a.id === l.artistId) || activeArtist() || {};
  const metrics = [];
  (l.goals || []).filter(g => g.status !== 'rejected').forEach(g => {
    const pr = goalProgress(l, g);
    metrics.push({ platform: g.platform || '', metric: g.metric, value: pr.actual != null ? fmtNum(pr.actual) : null, target: g.target, pct: pr.pct });
  });
  latestEntries(l.metricEntries || []).forEach(e => {
    if (!metrics.some(m => (m.metric || '').toLowerCase() === (e.metric || '').toLowerCase()))
      metrics.push({ platform: e.platform || '', metric: e.metric, value: fmtNum(e.value) });
  });
  const ctx = { label: _teamName || '', artist: art.name || '', project: l.name || '', teamId: _teamId || null, artistId: art.id || l.artistId || null, launchId: l.id, releaseId: l.id, metrics };
  try { localStorage.setItem('ao_report_ctx', JSON.stringify(ctx)); } catch (e) {}
  // Cache-buster con la versión del build → evita que un navegador (ej. el celular) sirva un report.html viejo
  // con un modelo de IA deprecado. La versión se lee del span del logo y sube sola en cada release.
  const ver = ((document.querySelector('.sidebar .logo span') || {}).textContent || '').match(/v[\d.]+/);
  const w = window.open('report.html?' + (ver ? ver[0] : Date.now()), '_blank');
  if (!w) uiAlert('Permite las ventanas emergentes para abrir el reporte, o abre report.html manualmente.');
}

// ══════════════════════════════════════════
// DASHBOARD DEL LABEL (rendimiento por artista, para staff)
// ══════════════════════════════════════════
function artistPerformance(art) {
  const ls = launches.filter(l => l.artistId === art.id && l.type !== 'evergreen');
  const withGoals = ls.filter(l => (l.goals || []).some(g => g.status !== 'rejected'));
  const latest = withGoals.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
    || ls.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
  const pcts = []; let totalGoals = 0, met = 0;
  if (latest) {
    (latest.goals || []).filter(g => g.status !== 'rejected').forEach(g => {
      totalGoals++;
      const pr = goalProgress(latest, g);
      if (pr.pct != null) { const p = Math.min(100, pr.pct); pcts.push(p); if (p >= 100) met++; }
    });
  }
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const end = latest ? launchEndDate(latest) : '';
  const dleft = end ? diasRestantes(end) : null;
  let sig = 'gray', label = 'Sin métricas', rank = 2; // rank: 0=rojo(prioridad), 1=amarillo, 2=neutro, 3=verde
  if (avg != null) {
    if (avg >= 100) { sig = 'green'; label = 'Meta cumplida'; rank = 3; }
    else if (avg >= 60) { sig = 'yellow'; label = 'Cerca'; rank = 1; }
    else { sig = 'red'; label = 'Necesita atención'; rank = 0; }
    if (avg < 100 && dleft != null && dleft < 0) { sig = 'red'; label = 'Atrasado'; rank = 0; }
  }
  return { latest, avg, totalGoals, met, end, dleft, sig, label, rank, measured: pcts.length };
}
function updateLabelNav() {
  const el = document.getElementById('nav-label'); if (!el) return;
  // Visible para staff cuando hay 2+ artistas; oculto para el artista restringido.
  el.style.display = (artists.length >= 2 && !_restrictedArtist) ? '' : 'none';
}
function renderLabel() {
  // Fuente única: la "Salud del roster" vive en js/dashboard.js (rosterHealthHTML), compartida con Compás.
  const host = document.getElementById('label-body');
  if (host) { host.innerHTML = (typeof rosterHealthHTML === 'function') ? rosterHealthHTML() : ''; if (typeof hydrateIcons === 'function') hydrateIcons(host); }
}

// ── Meta manual GUIADA (plataforma → métrica → objetivo → fecha) ──
let _metaSel = { platform: null, metric: null };
function agregarMetaManual() {
  const a = activeLaunch();
  if (!a) { uiAlert('Primero crea o selecciona un lanzamiento para agregarle metas.'); return; }
  if (!requireCan('edit_launch')) return;
  const cats = artistCatalog(activeArtist());
  _metaSel = { platform: (cats[0] || {}).name || null, metric: null };
  renderMetaModal();
  document.getElementById('modal-goal').classList.add('open');
}
function cerrarMetaModal(e) { if (!e || e.target === document.getElementById('modal-goal')) document.getElementById('modal-goal').classList.remove('open'); }
function renderMetaModal() {
  const art = activeArtist(), a = activeLaunch();
  const cats = artistCatalog(art);
  const cur = cats.find(p => p.name === _metaSel.platform) || cats[0] || { metrics: [] };
  const platOpts = cats.map(p => `<option ${p.name === _metaSel.platform ? 'selected' : ''}>${s(p.name)}</option>`).join('') + '<option value="__add">+ otra plataforma…</option>';
  const metricOpts = (cur.metrics || []).map(m => `<option ${m === _metaSel.metric ? 'selected' : ''}>${s(m)}</option>`).join('') + '<option value="__add">+ otra métrica…</option>';
  document.getElementById('goal-body').innerHTML = `
    <div class="field" style="margin-bottom:12px"><label>Plataforma</label>
      <select class="input" id="meta-plat" onchange="metaPlatChange(this.value)">${platOpts}</select></div>
    <div class="field" style="margin-bottom:12px"><label>Métrica</label>
      <select class="input" id="meta-metric" onchange="metaMetricChange(this.value)">${metricOpts}</select></div>
    <div class="field" style="margin-bottom:12px"><label>Objetivo</label>
      <input class="input" id="meta-target" placeholder="ej. 100K, +5K, 2M" value="${s(_metaSel.target || '')}"></div>
    <div class="field"><label>Fecha límite <span style="color:var(--text-dim);font-weight:400;font-size:10px">· sugerida: cierre del lanzamiento (editable)</span></label>
      <input class="input" id="meta-deadline" type="date" value="${launchEndDate(a)}"></div>
    <button class="btn btn-primary" style="width:100%;margin-top:16px" onclick="guardarMetaManual()">Agregar meta</button>`;
}
async function metaPlatChange(v) {
  _metaSel.target = (document.getElementById('meta-target') || {}).value || '';
  if (v === '__add') {
    const name = (await uiPrompt('Nombre de la plataforma:', { title: 'Nueva plataforma' }) || '').trim();
    if (name) { const cats = artistCatalog(activeArtist()); if (!cats.find(p => p.name.toLowerCase() === name.toLowerCase())) { cats.push({ name, metrics: [] }); saveArtists(); } _metaSel.platform = name; }
    _metaSel.metric = null; renderMetaModal(); return;
  }
  _metaSel.platform = v; _metaSel.metric = null; renderMetaModal();
}
async function metaMetricChange(v) {
  _metaSel.target = (document.getElementById('meta-target') || {}).value || '';
  if (v === '__add') {
    const m = (await uiPrompt('Nombre de la métrica:', { title: 'Nueva métrica' }) || '').trim();
    if (m) { const p = artistCatalog(activeArtist()).find(x => x.name === _metaSel.platform); if (p && !p.metrics.find(x => x.toLowerCase() === m.toLowerCase())) { p.metrics.push(m); saveArtists(); } _metaSel.metric = m; }
    renderMetaModal(); return;
  }
  _metaSel.metric = v;
}
function guardarMetaManual() {
  const a = activeLaunch(); if (!a) return;
  const plat = document.getElementById('meta-plat').value;
  const metric = document.getElementById('meta-metric').value;
  if (plat === '__add' || metric === '__add') { uiAlert('Elige una plataforma y una métrica.'); return; }
  const target = (document.getElementById('meta-target').value || '').trim();
  if (!target) { uiAlert('Escribe el objetivo (el número a alcanzar).'); return; }
  const deadline = document.getElementById('meta-deadline').value || '';
  const ic = platIcon(plat);
  a.goals.push({ icon: ic[0], bg: ic[1], platform: plat, metric, sub: plat, target, deadline, ai: '', status: 'accepted', source: 'manual' });
  saveLaunches(); renderObjetivos();
  document.getElementById('modal-goal').classList.remove('open');
  uiToast('✓ Meta agregada');
}
const PLAT_ICON = { spotify:['headphones','rgba(74,222,128,0.12)'], tiktok:['phone','rgba(255,0,80,0.12)'], instagram:['camera','rgba(225,48,108,0.12)'], youtube:['play','rgba(255,0,0,0.12)'], apple:['apple','rgba(255,255,255,0.08)'] };
function platIcon(p) {
  const key = Object.keys(PLAT_ICON).find(k => s(p).toLowerCase().includes(k));
  return PLAT_ICON[key] || ['goals','rgba(255,107,48,0.12)'];
}
function buildGoalsPrompt(a) {
  const art = activeArtist() || {}; const adn = art.adn || {}; const d = a.dna || {};
  const hist = (artistLaunches() || []).filter(l => latestEntries(l.metricEntries).length)
    .map(l => `- ${l.name}: ${latestEntries(l.metricEntries).map(e => `${e.metric} ${fmtNum(e.value)}`).join(', ')}`).join('\n') || '(sin histórico de métricas)';
  // Auditoría del release anterior → brief: qué replicar / qué evitar, desde los aprendizajes del artista.
  const learn = (art.learnings || []).slice(0, 8).map(x => `- (${x.type === 'good' ? 'funcionó' : x.type === 'bad' ? 'no funcionó' : 'neutral'}) ${s(x.q)}`).join('\n') || '(sin aprendizajes registrados)';
  return `Eres analista de marketing musical. Propón objetivos SMART (metas medibles) para la campaña de una canción. Aprovecha los APRENDIZAJES de lanzamientos anteriores: sé más ambicioso donde algo funcionó y más prudente donde no.

ARTISTA: ${s(art.name)} · Géneros: ${s((adn.sound||{}).genres)} · Audiencia: ${s((adn.audience||{}).ideal)}
CAMPAÑA (${s(a.name)}): ${s(d.about)} · Mensaje: ${s(d.message)}
Plataforma principal: ${s((a.content||{}).platform)} · Pre/Post: ${a.preDays}/${a.postDays} días${(typeof songContextBlock==='function') ? songContextBlock(a) : ''}
HISTÓRICO DE LANZAMIENTOS DEL ARTISTA:
${hist}
APRENDIZAJES (qué replicar / qué evitar):
${learn}

Devuelve SOLO un array JSON (4-6 objetos), sin texto extra:
{"platform":"Spotify|TikTok|Instagram|YouTube","metric":"nombre de la métrica","sub":"ventana de tiempo","target":"valor objetivo (ej. 150K, +5K, 2M)"}`;
}
async function sugerirObjetivosIA(auto) {
  const a = activeLaunch(); if (!a) return;
  a.goalsAITried = true;
  if (!aiReady()) { if (!auto) abrirAISettings(); else renderObjetivos(); return; }
  if (!auto && !requireCan('use_generador_ia')) return;
  const host = document.getElementById('objetivos-list');
  host.insertAdjacentHTML('afterbegin', `<div id="obj-loading" class="empty-hint" style="margin-bottom:10px">${icon('ai',13)} Proponiendo objetivos con IA…</div>`);
  try {
    const { text } = await callClaude(buildGoalsPrompt(a), 800, 'objetivos');
    const arr = parseJSONArray(text);
    if (!arr.length) throw new Error('La IA no devolvió objetivos válidos.');
    // Regenerar: quitar metas IA previas, conservar las manuales
    a.goals = (a.goals || []).filter(g => g.source === 'manual');
    const end = launchEndDate(a);
    arr.forEach(g => {
      const ic = platIcon(g.platform);
      a.goals.push({ icon: ic[0], bg: ic[1], platform: s(g.platform), metric: s(g.metric) || 'Meta', sub: s(g.sub) || s(g.platform) || 'IA', target: s(g.target) || '—', deadline: end, ai: 'IA', status: 'proposed' });
    });
    saveLaunches(); renderObjetivos();
  } catch (e) {
    const l = document.getElementById('obj-loading');
    if (l) l.innerHTML = `${icon('warning',13)} ${s(friendlyError(e))} — revisa ${icon('settings',12)} API.`;
  }
}

// ══════════════════════════════════════════
// APRENDIZAJES (per-artista) + IA
// ══════════════════════════════════════════
function renderAprendizajes() {
  const art = activeArtist();
  const t = document.getElementById('aprend-title'); if (t) t.textContent = art ? `${up(art.name)} · BIBLIOTECA` : 'BIBLIOTECA';
  const hint = document.getElementById('aprend-aihint'); if (hint) hint.innerHTML = art ? aiHintHTML(buildLearningsPrompt(art), 700) : '';
  const host = document.getElementById('aprend-list'); if (!host) return;
  if (!art) { host.innerHTML = ''; return; }
  const L = art.learnings || [];
  if (!L.length) { host.innerHTML = `<div class="empty-hint">Aún no hay aprendizajes para ${esc(art.name)}. Usa “Analizar con IA” (revisa tus lanzamientos y métricas) o registra uno manualmente.</div>`; return; }
  host.innerHTML = L.map((it, i) => {
    const sigCol = it.type === 'good' ? '#4ade80' : (it.type === 'bad' ? 'var(--accent2)' : '');
    const sigLabel = it.type === 'good' ? 'Funcionó' : (it.type === 'bad' ? 'No funcionó' : '');
    const sig = sigCol ? `<span class="learn-sig-dot" style="background:${sigCol}"></span><span style="color:${sigCol}">${sigLabel}</span> · ` : '';
    return `<div class="learn-card">
      <button class="goal-btn reject" style="float:right" onclick="quitarAprendizaje(${i})" title="Quitar">${icon('close',12)}</button>
      <div class="learn-tag" style="display:flex;align-items:center;gap:6px">${sig}${s(it.tag || art.name)}</div>
      <div class="learn-q">${esc(it.q)}</div>
      <div class="learn-a">${esc(it.a)}</div>
      ${it.meta ? `<div class="learn-meta">${s(it.meta)}</div>` : ''}
    </div>`;
  }).join('');
}
async function agregarAprendizaje() {
  const art = activeArtist(); if (!art) return;
  const q = await uiPrompt('¿Qué aprendiste? (título):', {title:'Nuevo aprendizaje'}); if (!q) return;
  const a = await uiPrompt('Detalle:') || '';
  const tt = (await uiPrompt('¿Funcionó? bueno / malo / neutro:', {def:'bueno'}) || '').toLowerCase();
  const type = tt.startsWith('b') ? 'good' : (tt.startsWith('m') ? 'bad' : 'neutral');
  art.learnings.unshift({ tag: art.name, type, q, a, meta: '' });
  saveArtists(); renderAprendizajes();
}
function quitarAprendizaje(i) { const art = activeArtist(); if (!art || !art.learnings[i]) return; art.learnings.splice(i, 1); saveArtists(); renderAprendizajes(); }
function buildLearningsPrompt(art) {
  const ls = artistLaunches().map(l => {
    const m = latestEntries(l.metricEntries).map(e => `${e.metric} ${fmtNum(e.value)}`).join(', ');
    return `- ${l.name} [${l.status}] piezas:${(l.cal || []).length}${m ? ' · métricas: ' + m : ''}`;
  }).join('\n') || '(sin lanzamientos con datos)';
  return `Eres analista de marketing musical. A partir de los lanzamientos y métricas del artista, extrae aprendizajes accionables (qué funcionó, qué no, qué formatos/plataformas rindieron mejor).

ARTISTA: ${s(art.name)}
LANZAMIENTOS:
${ls}
OBJETIVOS SMART (meta establecida vs. logrado real, según métricas):
${goalsVsActuals(art)}

Basa los aprendizajes en dónde se cumplió o no la meta (qué se hizo cuando se superó el objetivo, qué faltó cuando no). Devuelve SOLO un array JSON (3-6 objetos), sin texto extra:
{"type":"good|bad|neutral","tag":"contexto corto","q":"aprendizaje en una frase","a":"explicación 1-2 frases","meta":"dato/metric corto"}`;
}
async function generarAprendizajesIA() {
  const art = activeArtist(); if (!art) return;
  if (!aiReady()) { abrirAISettings(); return; }
  const host = document.getElementById('aprend-list');
  host.insertAdjacentHTML('afterbegin', `<div id="aprend-loading" class="empty-hint" style="margin-bottom:10px">${icon('ai',13)} Analizando lanzamientos…</div>`);
  try {
    const { text } = await callClaude(buildLearningsPrompt(art), 900);
    const arr = parseJSONArray(text);
    if (!arr.length) throw new Error('La IA no devolvió aprendizajes válidos.');
    arr.forEach(x => art.learnings.unshift({ tag: s(x.tag) || art.name, type: (x.type || 'neutral'), q: s(x.q), a: s(x.a), meta: s(x.meta) }));
    saveArtists(); renderAprendizajes();
  } catch (e) { const l = document.getElementById('aprend-loading'); if (l) l.innerHTML = `${icon('warning',13)} ${s(friendlyError(e))} — revisa ${icon('settings',12)} API.`; }
}

// ══════════════════════════════════════════
// IA ESTRATÉGICA (per-artista)
// ══════════════════════════════════════════
function strategyCardsHTML(st) {
  const items = st.items || [];
  return `${st.generatedAt ? `<div style="font-size:10px;font-family:var(--font-mono);color:var(--text-dim);margin-bottom:12px">Generado ${new Date(st.generatedAt).toLocaleString()}</div>` : ''}
    <div class="dashboard-grid" style="grid-template-columns:repeat(2,1fr)">${items.map(it => `
      <div class="panel" style="margin:0">
        <div class="brief-label">${s(it.title)}</div>
        <div style="font-family:var(--font-display);font-size:26px;letter-spacing:1px;margin:6px 0;color:var(--accent)">${s(it.value)}</div>
        <div style="font-size:12px;color:var(--text-muted);line-height:1.5">${s(it.detail)}</div>
      </div>`).join('')}</div>`;
}
function buildStrategyPrompt(art) {
  const adn = art.adn || {};
  const ls = artistLaunches().map(l => {
    const m = latestEntries(l.metricEntries).map(e => `${e.metric} ${fmtNum(e.value)}`).join(', ');
    return `- ${l.name}: plataforma ${(l.content || {}).platform || ''}, ${(l.cal || []).length} piezas${m ? ' · ' + m : ''}`;
  }).join('\n') || '(sin datos)';
  const learn = (art.learnings || []).map(x => `- (${x.type}) ${x.q}`).join('\n') || '(sin aprendizajes)';
  return `Eres director de estrategia musical. Con base en los datos del artista, da recomendaciones accionables: mejor día/hora para publicar, formato más efectivo, duración ideal de campaña, cantidad ideal de contenido por semana y tipo de contenido más exitoso.

ARTISTA: ${s(art.name)} · Géneros: ${s((adn.sound || {}).genres)} · Audiencia: ${s((adn.audience || {}).ideal)} · Tono: ${s((adn.personality || {}).tone)}${(typeof songContextBlock==='function' && typeof activeLaunch==='function' && activeLaunch()) ? '\nCANCIÓN EN FOCO:' + songContextBlock(activeLaunch()) : ''}
LANZAMIENTOS:
${ls}
OBJETIVOS SMART (meta vs. logrado real):
${goalsVsActuals(art)}
APRENDIZAJES:
${learn}

Devuelve SOLO un objeto JSON, sin texto extra:
{"items":[{"title":"Mejor día para publicar","value":"valor corto","detail":"por qué, 1-2 frases"}]} con 5-6 items.`;
}
function renderIA() {
  const art = activeArtist();
  const host = document.getElementById('ia-body'); if (!host) return;
  if (!art) { host.innerHTML = ''; return; }
  const st = art.strategy;
  const promptStr = buildStrategyPrompt(art);
  host.innerHTML = `
    <div class="panel">
      <div class="panel-head"><span class="ph-icon">${icon('ai',18)}</span><span class="ph-title">Recomendaciones para ${esc(art.name)}</span>
        <button class="btn btn-ghost" style="margin-left:auto;border-color:rgba(255,107,48,0.35);color:var(--accent)" onclick="generarEstrategiaIA()">${icon('ai',13)} Generar recomendaciones</button>
      </div>
      ${aiHintHTML(promptStr, 900)}
    </div>
    <div id="ia-results">${(st && st.items && st.items.length) ? strategyCardsHTML(st) : `<div class="empty-hint">Aún no hay recomendaciones para ${esc(art.name)}. Genera con IA usando ADN, lanzamientos, métricas y aprendizajes. (Mientras más datos, mejores recomendaciones.)</div>`}</div>`;
}
async function generarEstrategiaIA() {
  const art = activeArtist(); if (!art) return;
  if (!requireCan('use_ia_estrategica')) return;
  const lim = checkPlanLimit('ia_estrategica');
  if (!lim.ok) { uiAlert(lim.msg); return; }
  if (!aiReady()) { abrirAISettings(); return; }
  const res = document.getElementById('ia-results');
  if (lim.note) res.innerHTML = `<div class="empty-hint" style="border-color:var(--beat)">${icon('info',13)} ${lim.note}</div>`;
  res.innerHTML = `<div class="empty-hint">${icon('ai',13)} Analizando estrategia…</div>`;
  try {
    const { text } = await callClaude(buildStrategyPrompt(art), 1200);
    const obj = parseJSONObj(text);
    const items = obj && Array.isArray(obj.items) ? obj.items : [];
    if (!items.length) throw new Error('La IA no devolvió recomendaciones válidas.');
    art.strategy = { generatedAt: Date.now(), items };
    saveArtists(); renderIA();
  } catch (e) { res.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(friendlyError(e))} — revisa ${icon('settings',12)} API.</div>`; }
}

// ══════════════════════════════════════════
// MÉTRICAS (scoped al lanzamiento activo)
// ══════════════════════════════════════════
const PLAT_META = {
  spotify:   { name:'Spotify',     icon:icon('headphones',14), color:'#1db954' },
  tiktok:    { name:'TikTok',      icon:icon('phone',14),      color:'#ff0050' },
  instagram: { name:'Instagram',   icon:icon('camera',14),     color:'#e1306c' },
  youtube:   { name:'YouTube',     icon:icon('play',14),       color:'#ff0000' },
  apple:     { name:'Apple Music', icon:icon('apple',14),      color:'#fc3c44' },
  other:     { name:'Otra',        icon:icon('chart',14),      color:'#888' },
};
function todayISO() { return new Date().toISOString().slice(0,10); }
function normalizeDateStr(v) { const d = new Date(v); return isNaN(d) ? todayISO() : d.toISOString().slice(0,10); }
function csvTokenize(text) {
  const rows = []; let row = []; let cur = ''; let inQ = false;
  text = String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(cur); cur=''; } else if (c === '\n') { row.push(cur); rows.push(row); row=[]; cur=''; } else cur += c; }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function latestEntries(entries) {
  const map = {};
  (entries || []).forEach(e => { const k = e.platform + '|' + e.metric; if (!map[k] || (e.date||'') >= (map[k].date||'')) map[k] = e; });
  return Object.values(map);
}
function sparklineSVG(values, w, h, color) {
  w = w || 110; h = h || 30; color = color || 'var(--accent)';
  if (!values || values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values), range = (max - min) || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i*step).toFixed(1)},${(h - ((v-min)/range)*(h-6) - 3).toFixed(1)}`).join(' ');
  const lx = (values.length-1)*step, ly = h - ((values[values.length-1]-min)/range)*(h-6) - 3;
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible;margin-top:8px">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"></polyline>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.6" fill="${color}"></circle>
  </svg>`;
}
function metricCardHTML(e, allEntries) {
  const pm = PLAT_META[e.platform] || PLAT_META.other;
  let spark = '';
  if (allEntries) {
    const series = allEntries.filter(x => x.platform === e.platform && x.metric === e.metric)
      .sort((a, b) => a.date < b.date ? -1 : 1).map(x => x.value);
    if (series.length >= 2) spark = sparklineSVG(series, 120, 30, pm.color);
  }
  const first = (allEntries || []).filter(x => x.platform === e.platform && x.metric === e.metric).sort((a,b)=>a.date<b.date?-1:1)[0];
  const delta = (first && first.value && e.value !== first.value) ? Math.round((e.value - first.value) / first.value * 100) : null;
  return `<div class="stat-card">
    <div class="stat-label">${s(e.metric)}</div>
    <div class="stat-value">${fmtNum(e.value)}</div>
    <div class="stat-trend" style="color:${pm.color}">${pm.icon} ${pm.name}${delta!=null?` · <span style="color:${delta>=0?'#4ade80':'var(--accent2)'}">${delta>=0?'↑':'↓'} ${Math.abs(delta)}%</span>`:''}</div>
    <div class="stat-sub">${s(e.date)}${e.source && e.source!=='seed' ? ' · ' + s(e.source) : ''}</div>
    ${spark}
  </div>`;
}
function metricsTimeSeriesHTML(entries) {
  const groups = {};
  (entries || []).forEach(e => { const k = e.platform + '|' + e.metric; (groups[k] = groups[k] || []).push(e); });
  let best = null;
  Object.values(groups).forEach(g => { if (g.length >= 2 && (!best || g.length > best.length)) best = g; });
  if (!best) return '';
  best = best.slice().sort((a,b) => a.date < b.date ? -1 : 1);
  const pm = PLAT_META[best[0].platform] || PLAT_META.other;
  const max = Math.max(...best.map(e => e.value), 1);
  const bars = best.map((e,i) => {
    const h = Math.round(e.value / max * 100); const last = i === best.length - 1;
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;justify-content:flex-end;height:100%">
      <div style="font-family:var(--font-mono);font-size:8px;color:var(--text-muted)">${fmtNum(e.value)}</div>
      <div style="background:linear-gradient(180deg,var(--accent),var(--accent-dark));width:100%;height:${h}%;border-radius:4px 4px 0 0;opacity:${last?1:0.55};box-shadow:${last?'0 0 14px var(--glow)':'none'}"></div>
      <div style="font-family:var(--font-mono);font-size:8px;color:${last?'var(--accent)':'var(--text-dim)'}">${s(e.date).slice(5)}</div>
    </div>`;
  }).join('');
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:24px;margin-top:14px">
    <div class="section-title" style="margin-bottom:16px">EVOLUCIÓN — ${up(best[0].metric)} · ${pm.name}</div>
    <div style="display:flex;align-items:flex-end;gap:10px;height:130px">${bars}</div>
  </div>`;
}
function screenshotsStripHTML() {
  const art = activeArtist(); const a = activeLaunch();
  const shots = [].concat((art ? art.screenshots : []).map(x => Object.assign({scope:'Artista'}, x)),
                         (a ? a.screenshots : []).map(x => Object.assign({scope:a.name}, x)));
  if (!shots.length) return '';
  return `<div class="section-header" style="margin-top:24px"><div class="section-title">CAPTURAS DE RESPALDO</div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${shots.map(sc => `<a href="${safeUrl(sc.dataUrl)}" target="_blank" title="${esc(sc.label)} · ${esc(sc.scope)} · ${esc(sc.date)}"><img src="${safeUrl(sc.dataUrl)}" class="screenshot-thumb" loading="lazy"></a>`).join('')}</div>`;
}

// ── Sub-pestañas ──
function metricasTab(name) {
  ['resumen','importar','instrucciones'].forEach(n => { const p = document.getElementById('mtab-'+n); if (p) p.style.display = n===name ? '' : 'none'; });
  document.querySelectorAll('.mtab').forEach(t => t.classList.toggle('active', t.dataset.mtab === name));
}

function renderMetricas() {
  const ctx = document.getElementById('ctx-metricas'); if (ctx) ctx.innerHTML = launchContextHTML();
  const art = activeArtist();
  document.getElementById('mtab-resumen').innerHTML = art ? metricsResumenHTML() : '<div class="empty-hint">Crea un artista para ver métricas.</div>';
  document.getElementById('mtab-importar').innerHTML = art ? metricsImportarHTML() : '';
  document.getElementById('mtab-instrucciones').innerHTML = metricsInstruccionesHTML();
  renderShotFields();
}

function metricsResumenHTML() {
  const art = activeArtist(); const a = activeLaunch();
  const artLatest = latestEntries(art.metricEntries);
  const lnLatest = latestEntries(a ? a.metricEntries : []);
  return `
    <div class="section-header"><div class="section-title">MÉTRICAS DEL ARTISTA · ${up(art.name)}</div></div>
    ${artLatest.length ? `<div class="dashboard-grid">${artLatest.map(e => metricCardHTML(e, art.metricEntries)).join('')}</div>` : `<div class="empty-hint">Sin métricas del artista. Cárgalas en la pestaña “Importar / Cargar”.</div>`}
    <div class="section-header" style="margin-top:26px"><div class="section-title">MÉTRICAS DEL LANZAMIENTO · ${a ? up(a.name) : '—'}</div></div>
    ${lnLatest.length ? `<div class="dashboard-grid">${lnLatest.map(e => metricCardHTML(e, a.metricEntries)).join('')}</div>${metricsTimeSeriesHTML(a.metricEntries)}` : `<div class="empty-hint">Sin métricas para este lanzamiento.</div>`}
    ${screenshotsStripHTML()}
    ${metricEntriesAdminHTML()}`;
}

// ── Historial y edición de entradas de métricas (editar valor/fecha/nombre · borrar) ──
function _metricArr(scope) {
  if (scope === 'launch') { const a = activeLaunch(); return a ? (a.metricEntries = a.metricEntries || []) : null; }
  const art = activeArtist(); return art ? (art.metricEntries = art.metricEntries || []) : null;
}
function _metricSave(scope) { if (scope === 'launch') saveLaunches(); else saveArtists(); }
function editMetricEntry(scope, id, field, val) {
  if (!requireCan('editar_data')) return;
  const arr = _metricArr(scope); if (!arr) return;
  const e = arr.find(x => x.id === id); if (!e) return;
  if (field === 'value') { const n = (typeof parseMetricNum === 'function') ? parseMetricNum(val) : parseFloat(val); e.value = isNaN(n) ? 0 : n; }
  else e[field] = val;
  e.source = (e.source === 'seed') ? 'editado' : (e.source || 'manual');
  _metricSave(scope); renderMetricas();
  if (typeof uiToast === 'function') uiToast('Métrica actualizada');
}
async function deleteMetricEntry(scope, id) {
  if (!requireCan('editar_data')) return;
  const arr = _metricArr(scope); if (!arr) return;
  const e = arr.find(x => x.id === id);
  if (!await uiConfirm(`¿Borrar esta entrada${e ? ` (${s(e.metric)} = ${fmtNum(e.value)} · ${s(e.date)})` : ''}? No se puede deshacer.`, { danger: true, okText: 'Borrar' })) return;
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) { arr.splice(i, 1); _metricSave(scope); renderMetricas(); if (typeof uiToast === 'function') uiToast('Entrada borrada'); }
}
function metricEntriesAdminHTML() {
  const art = activeArtist(); const a = activeLaunch();
  const editable = canDo('editar_data');
  const inp = 'background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;padding:5px 8px';
  const section = (scope, title, arr) => {
    if (!arr || !arr.length) return '';
    const rows = arr.slice().sort((x, y) => (y.date || '') < (x.date || '') ? 1 : -1).reverse().map(e => {
      const pm = PLAT_META[e.platform] || PLAT_META.other;
      return `<div style="display:flex;gap:7px;align-items:center;margin-bottom:7px;flex-wrap:wrap">
        <span title="${pm.name}" style="display:flex;color:${pm.color};flex-shrink:0">${pm.icon}</span>
        <input class="input" style="${inp};flex:1;min-width:120px" value="${s(e.metric)}" ${editable ? '' : 'disabled'} onchange="editMetricEntry('${scope}','${e.id}','metric',this.value)">
        <input class="input" type="number" step="any" style="${inp};width:120px" value="${e.value}" ${editable ? '' : 'disabled'} onchange="editMetricEntry('${scope}','${e.id}','value',this.value)">
        <input class="input" type="date" style="${inp};width:auto" value="${s(e.date)}" ${editable ? '' : 'disabled'} onchange="editMetricEntry('${scope}','${e.id}','date',this.value)">
        <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-dim);min-width:46px">${s(e.source || '')}</span>
        ${editable ? `<button class="goal-btn reject" title="Borrar entrada" onclick="deleteMetricEntry('${scope}','${e.id}')">${icon('trash', 12)}</button>` : ''}
      </div>`;
    }).join('');
    return `<div style="margin:14px 0 8px;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:var(--text-muted)">${title} · ${arr.length} entrada${arr.length === 1 ? '' : 's'}</div>${rows}`;
  };
  const body = section('artist', 'ARTISTA · ' + up(art.name), art.metricEntries) + (a ? section('launch', 'LANZAMIENTO · ' + up(a.name), a.metricEntries) : '');
  if (!body) return '';
  return `<div class="panel" style="margin-top:26px"><div class="panel-head"><span class="ph-icon">${icon('pencil', 18)}</span><span class="ph-title">Historial y edición de entradas</span><span class="ph-sub">corrige un valor o borra una entrada</span></div>
    <div class="empty-hint" style="margin-bottom:6px">Cada carga (CSV · captura · manual) es una entrada con su fecha. Edita el <b>nombre</b>, <b>valor</b> o <b>fecha</b>, o <b>bórrala</b>. La tarjeta de arriba muestra el valor más reciente por métrica.</div>${body}</div>`;
}

function levelSelectHTML(id) {
  const a = activeLaunch();
  return `<select class="input" id="${id}"><option value="artist">Artista (${s(activeArtist().name)})</option>${a ? `<option value="launch">Lanzamiento (${s(a.name)})</option>` : ''}</select>`;
}
function platSelectHTML(id) {
  return `<select class="input" id="${id}">${Object.keys(PLAT_META).map(k => `<option value="${k}">${PLAT_META[k].name}</option>`).join('')}</select>`;
}

function metricsImportarHTML() {
  return `
  <div class="field-grid" style="align-items:start">
    <div class="panel" style="margin:0">
      <div class="panel-head"><span class="ph-icon">${icon('file',18)}</span><span class="ph-title">Importar CSV de plataforma</span></div>
      <div class="field-grid" style="margin-bottom:12px">
        <div class="field"><label>Nivel</label>${levelSelectHTML('csv-level')}</div>
        <div class="field"><label>Plataforma</label>${platSelectHTML('csv-plat')}</div>
      </div>
      <label for="mcsv-file" class="btn btn-ghost" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:10px">${icon('upload',14)} Subir archivo .csv</label>
      <input type="file" id="mcsv-file" accept=".csv,text/csv" style="display:none" onchange="csvFileToText(event)">
      <textarea class="textarea" id="mcsv-text" placeholder="…o pega aquí el contenido del CSV" style="min-height:90px;font-family:var(--font-mono);font-size:11px"></textarea>
      <button class="btn btn-primary" style="margin-top:10px" onclick="analizarMetricasCSV()">Analizar CSV</button>
      <div id="mcsv-preview"></div>
      <div style="font-size:10px;color:var(--text-dim);margin-top:10px;font-family:var(--font-mono);line-height:1.6">Tomamos la <b style="color:var(--text-muted)">última fila</b> (la más reciente) y detectamos las columnas numéricas. ¿No sabes exportar? → pestaña “Instrucciones CSV”.</div>
    </div>

    <div class="panel" style="margin:0">
      <div class="panel-head"><span class="ph-icon">${icon('image',18)}</span><span class="ph-title">Cargar por captura (sin IA)</span></div>
      <div class="field-grid" style="margin-bottom:12px">
        <div class="field"><label>Nivel</label>${levelSelectHTML('shot-level')}</div>
        <div class="field"><label>Plataforma</label>${platSelectHTML('shot-plat')}</div>
      </div>
      <label for="shot-file" class="btn btn-ghost" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:10px">${icon('camera',14)} Subir screenshot</label>
      <input type="file" id="shot-file" accept="image/*" style="display:none" onchange="handleMetricScreenshot(event)">
      <div id="shot-preview" style="margin-bottom:10px"></div>
      <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);letter-spacing:1px;margin-bottom:8px">ESCRIBE LOS NÚMEROS QUE VES</div>
      <div id="shot-fields"></div>
      <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" onclick="addShotField()">+ Otra métrica</button>
      <div class="field" style="margin-top:12px;max-width:200px"><label>Fecha del dato</label><input type="date" class="input" id="shot-date" value="${todayISO()}"></div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="guardarScreenshotMetricas()">Guardar</button>
    </div>
  </div>`;
}

function metricsInstruccionesHTML() {
  const blocks = [
    { p:'spotify', title:'Spotify for Artists', steps:['Entra a <b>artists.spotify.com</b> e inicia sesión.','Ve a <b>Audience</b> o <b>Music → tu canción</b>.','Arriba a la derecha, abre el rango de fechas y elige el período.','Busca el botón <b>•••</b> / <b>Download</b> para exportar a CSV.','Sube el CSV aquí o pégalo. (Oyentes mensuales y seguidores = nivel Artista; streams de una canción = nivel Lanzamiento.)'] },
    { p:'tiktok', title:'TikTok Analytics', steps:['En la app: <b>Perfil → ☰ → Herramientas para creadores → Analytics</b>. O en <b>tiktok.com</b> escritorio.','En escritorio, pestaña <b>Overview</b> / <b>Content</b>.','Usa <b>Download data</b> para exportar CSV del período.','Sube/pega el CSV. (Seguidores = Artista; views de un video = Lanzamiento.)'] },
    { p:'instagram', title:'Instagram (Meta)', steps:['Instagram no exporta CSV fácil. Mejor usa <b>Meta Business Suite</b> (business.facebook.com).','Ve a <b>Insights</b> y exporta, o usa la opción de captura (screenshot).','Si no hay CSV, usa el panel “Cargar por captura” y teclea alcance/seguidores.'] },
    { p:'youtube', title:'YouTube Studio', steps:['Entra a <b>studio.youtube.com</b>.','Ve a <b>Analytics</b> y elige el período.','Botón <b>Export current view → Comma-separated values (.csv)</b>.','Sube/pega el CSV. (Suscriptores = Artista; views de un video = Lanzamiento.)'] },
  ];
  return blocks.map(b => {
    const pm = PLAT_META[b.p];
    return `<div class="panel">
      <div class="panel-head"><span class="ph-icon">${pm.icon}</span><span class="ph-title">${b.title}</span><span class="plat-pill" style="margin-left:auto;background:${pm.color}22;color:${pm.color}">CSV</span></div>
      ${b.steps.map((st,i) => `<div class="instr-step"><b>${i+1}.</b><span>${st}</span></div>`).join('')}
    </div>`;
  }).join('') + `<div class="empty-hint">¿Tu plataforma no deja exportar CSV o eres menos técnico? Usa “Cargar por captura”: subes un screenshot y solo escribes los números. Sin complicaciones.</div>`;
}

// ── Lógica de carga ──
function metricTarget(level) { return level === 'launch' ? activeLaunch() : activeArtist(); }
function saveMetricTarget(level) { if (level === 'launch') saveLaunches(); else saveArtists(); }
function addMetricEntries(level, platform, entries) {
  const t = metricTarget(level); if (!t) return;
  entries.forEach(e => t.metricEntries.push(Object.assign({ id: 'me-' + Date.now() + '-' + Math.floor(Math.random()*9999), platform, source: e.source || 'manual' }, e)));
  saveMetricTarget(level);
}

let csvMetricRows = [];
function csvFileToText(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => { document.getElementById('mcsv-text').value = ev.target.result; analizarMetricasCSV(); };
  r.readAsText(f, 'UTF-8'); e.target.value = '';
}
function analizarMetricasCSV() {
  const txt = document.getElementById('mcsv-text').value;
  const rows = csvTokenize(txt).filter(r => r.some(c => trim(c).length));
  const prev = document.getElementById('mcsv-preview');
  if (rows.length < 2) { prev.innerHTML = '<div class="empty-hint" style="border-color:var(--accent2)">CSV vacío o inválido.</div>'; return; }
  const headers = rows[0].map(h => trim(h));
  const dateIdx = headers.findIndex(h => /date|fecha|d[ií]a|day|week|semana|mes|month/i.test(h));
  const last = rows[rows.length - 1];
  const date = dateIdx >= 0 ? normalizeDateStr(last[dateIdx]) : todayISO();
  csvMetricRows = [];
  headers.forEach((h, i) => {
    if (i === dateIdx) return;
    const raw = trim(last[i]);
    if (raw && /\d/.test(raw)) { const num = parseMetricNum(raw); if (num > 0) csvMetricRows.push({ metric: h || ('Columna ' + (i+1)), value: num, date }); }
  });
  renderCSVPreview();
}
function renderCSVPreview() {
  const prev = document.getElementById('mcsv-preview'); if (!prev) return;
  if (!csvMetricRows.length) { prev.innerHTML = '<div class="empty-hint">No se detectaron columnas numéricas en la última fila.</div>'; return; }
  prev.innerHTML = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin:12px 0 8px">DETECTADO — edita o quita lo que no aplique:</div>`
    + csvMetricRows.map((e,i) => `<div class="metric-entry-row">
        <input class="input" value="${s(e.metric)}" onchange="csvMetricRows[${i}].metric=this.value">
        <input class="input" value="${e.value}" onchange="csvMetricRows[${i}].value=parseMetricNum(this.value)">
        <button class="goal-btn reject" onclick="csvMetricRows.splice(${i},1);renderCSVPreview()">${icon('close',12)}</button>
      </div>`).join('')
    + `<button class="btn btn-primary" style="margin-top:8px" onclick="guardarCSVMetricas()">Guardar ${csvMetricRows.length} métrica(s)</button>`;
}
function guardarCSVMetricas() {
  if (!csvMetricRows.length) return;
  const level = document.getElementById('csv-level').value;
  const platform = document.getElementById('csv-plat').value;
  addMetricEntries(level, platform, csvMetricRows.map(e => Object.assign({ source:'csv' }, e)));
  csvMetricRows = [];
  uiToast('✓ Métricas importadas.');
  renderMetricas(); metricasTab('resumen');
}

let shotFields = [{ metric:'', value:'' }];
let pendingShot = null;
function handleMetricScreenshot(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 700; let w = img.width, h = img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const cw = Math.round(w * scale), ch = Math.round(h * scale);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      pendingShot = c.toDataURL('image/jpeg', 0.6);
      const pv = document.getElementById('shot-preview');
      if (pv) pv.innerHTML = `<img src="${pendingShot}" style="max-width:200px;border-radius:6px;border:1px solid var(--border)">`;
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(f); e.target.value = '';
}
function addShotField() { shotFields.push({ metric:'', value:'' }); renderShotFields(); }
function renderShotFields() {
  const host = document.getElementById('shot-fields'); if (!host) return;
  host.innerHTML = shotFields.map((f,i) => `<div class="metric-entry-row">
    <input class="input" placeholder="Métrica (ej. Oyentes mensuales)" value="${s(f.metric)}" onchange="shotFields[${i}].metric=this.value">
    <input class="input" placeholder="Valor (ej. 42K)" value="${s(f.value)}" onchange="shotFields[${i}].value=this.value">
    <button class="goal-btn reject" onclick="shotFields.splice(${i},1);renderShotFields()">${icon('close',12)}</button>
  </div>`).join('');
}
function guardarScreenshotMetricas() {
  const level = document.getElementById('shot-level').value;
  const platform = document.getElementById('shot-plat').value;
  const date = document.getElementById('shot-date').value || todayISO();
  const entries = shotFields.filter(f => s(f.metric).trim() && s(f.value).trim())
    .map(f => ({ metric: f.metric.trim(), value: parseMetricNum(f.value), date, source: 'screenshot' }));
  if (!entries.length) { uiAlert('Agrega al menos una métrica con su valor.'); return; }
  const t = metricTarget(level); if (!t) return;
  let shotId = null;
  if (pendingShot) { shotId = 'sc-' + Date.now(); t.screenshots.push({ id: shotId, dataUrl: pendingShot, platform, date, label: (PLAT_META[platform]||PLAT_META.other).name }); }
  entries.forEach(e => { e.screenshotId = shotId; });
  addMetricEntries(level, platform, entries);
  shotFields = [{ metric:'', value:'' }]; pendingShot = null;
  uiToast('✓ Datos guardados.');
  renderMetricas(); metricasTab('resumen');
}

// ══════════════════════════════════════════
// BOXDROP GENERAL
// ══════════════════════════════════════════
function closeBoxdrop(e) { if (e.target === document.getElementById('boxdrop')) closeBoxdropDirect(); }
function closeBoxdropDirect() { document.getElementById('boxdrop').classList.remove('open'); }
function switchTab(name, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.boxdrop-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  el.classList.add('active');
}

// ══════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════
function abrirImportCSV() { document.getElementById('modal-csv').classList.add('open'); }
function cerrarImportCSV(e) {
  if (!e || e.target === document.getElementById('modal-csv'))
    document.getElementById('modal-csv').classList.remove('open');
}
function handleCSVFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const parsed = parsearCSV(ev.target.result);
      if (!parsed.length) throw new Error('sin datos');
      const append = !!(document.getElementById('csv-append') || {}).checked;
      let added = parsed.length;
      if (append) {
        const key = r => (s(r.link).trim().toLowerCase() || s(r.title).trim().toLowerCase());
        const have = new Set(referencias.map(key));
        const nuevos = parsed.filter(r => { const k = key(r); if (have.has(k)) return false; have.add(k); return true; });
        added = nuevos.length;
        setReferencias(referencias.concat(nuevos));
      } else {
        setReferencias(parsed);
      }
      bancoCargado = true;
      document.getElementById('csv-status').style.color = '#4ade80';
      document.getElementById('csv-status').textContent = append
        ? `✓ ${added} nuevas (${referencias.length} en total)`
        : `✓ ${parsed.length} referencias cargadas`;
      setTimeout(() => {
        document.getElementById('modal-csv').classList.remove('open');
        showPage('banco');
        iniciarBanco();
      }, 900);
    } catch(err) {
      document.getElementById('csv-status').style.color = 'var(--accent2)';
      document.getElementById('csv-status').textContent = '✕ Error al leer el CSV. Verifica el formato.';
    }
  };
  reader.readAsText(file, 'UTF-8');
}
function usarDemoData() {
  setReferencias(DEMO); bancoCargado = false;
  document.getElementById('modal-csv').classList.remove('open');
  showPage('banco'); iniciarBanco();
}
// render CSV column chips
document.getElementById('csv-cols').innerHTML =
  ['title','hook','for','cat','link','thumb','comentarios'].map(c => {
    const opt = ['link','thumb','comentarios','hook'].indexOf(c) >= 0;
    return `<div style="background:var(--surface2);padding:5px 10px;border-radius:3px;font-family:var(--font-mono);font-size:10px;color:${opt?'var(--text-dim)':'var(--text)'};border:1px solid var(--border)">${c}${opt?' ·opc':''}</div>`;
  }).join('');

// ══════════════════════════════════════════
// MODELO DE DATOS — LANZAMIENTOS (localStorage)
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// MODELO DE DATOS — ARTISTAS (localStorage)
// ══════════════════════════════════════════
function emptyADN() {
  return {
    identity:{history:'',mission:'',vision:'',values:''},
    personality:{archetypes:[],tone:'',expression:''},
    universe:{themes:'',conflicts:'',messages:''},
    aesthetics:{colors:'',photoStyle:''},
    sound:{genres:'',influences:'',references:''},
    audience:{current:'',ideal:'',buyer:''},
  };
}
function makeArtist(name, extra) {
  return Object.assign({
    id: 'A-' + Date.now() + '-' + Math.floor(Math.random()*999),
    name: name || 'Nuevo Artista', legalName:'', genre:'', country:'',
    socials:{ig:'',tiktok:'',youtube:'',x:''},
    dsps:{spotify:'',apple:'',ytmusic:'',other:''},
    team:[], adn: emptyADN(), bio:{oneLine:'',short:'',long:''}, keywords:'',
  }, extra || {});
}
function normalizeArtist(a) {
  a.socials = a.socials || {ig:'',tiktok:'',youtube:'',x:''};
  a.dsps = a.dsps || {spotify:'',apple:'',ytmusic:'',other:''};
  a.team = Array.isArray(a.team) ? a.team : [];
  a.adn = a.adn || emptyADN();
  const e = emptyADN();
  for (const k in e) a.adn[k] = Object.assign({}, e[k], a.adn[k]);
  if (!Array.isArray(a.adn.personality.archetypes)) a.adn.personality.archetypes = [];
  a.learnings = Array.isArray(a.learnings) ? a.learnings : [];
  a.strategy = (a.strategy && typeof a.strategy === 'object') ? a.strategy : null;
  a.metricEntries = Array.isArray(a.metricEntries) ? a.metricEntries : [];
  a.screenshots = Array.isArray(a.screenshots) ? a.screenshots : [];
  a.bio = (a.bio && typeof a.bio === 'object') ? a.bio : {oneLine:'',short:'',long:''};
  if (typeof a.keywords !== 'string') a.keywords = '';
  return a;
}
const SEED_ARTISTS = [
  normalizeArtist(makeArtist('Kintsugi', {
    id:'A-kintsugi', genre:'Pop alternativo', country:'México',
    adn: Object.assign(emptyADN(), {
      identity:{history:'Proyecto nacido de una ruptura, que convierte el dolor en arte.', mission:'Acompañar a quien sana.', vision:'Ser referente de pop honesto en LatAm.', values:'Autenticidad, vulnerabilidad, resiliencia'},
      personality:{archetypes:['El Héroe','El Sabio'], tone:'Íntimo y cercano', expression:'Habla en primera persona, sin filtros.'},
    }),
    learnings:[
      {tag:'Groserías · ¿Qué funcionó?', type:'good', q:'El BTS de estudio fue el formato con mejor retención', a:'Los videos de proceso crudo superaron 3x a los pulidos. La autenticidad generó más comentarios y guardados.', meta:'FORMATO: BTS · TikTok · +210% engagement'},
      {tag:'Groserías · ¿Qué no funcionó?', type:'bad', q:'Los teasers muy producidos no convirtieron', a:'El contenido demasiado "comercial" tuvo bajo alcance orgánico. La audiencia respondió mejor a lo espontáneo.', meta:'FORMATO: Teaser · Reels · -40% alcance'},
      {tag:'Groserías · ¿Mejor plataforma?', type:'neutral', q:'TikTok rindió mejor para descubrimiento', a:'Instagram funcionó para comunidad existente; TikTok trajo nuevos oyentes. Distribuir esfuerzo según objetivo.', meta:'DESCUBRIMIENTO: TikTok · COMUNIDAD: Instagram'},
    ],
    metricEntries:[
      {id:'am1', platform:'spotify',   metric:'Oyentes mensuales', value:42000, date:'2026-06-01', source:'seed'},
      {id:'am2', platform:'spotify',   metric:'Seguidores',        value:15000, date:'2026-06-01', source:'seed'},
      {id:'am3', platform:'tiktok',    metric:'Seguidores',        value:38000, date:'2026-06-01', source:'seed'},
      {id:'am4', platform:'instagram', metric:'Seguidores',        value:21000, date:'2026-06-01', source:'seed'},
    ],
  })),
];
function saveArtistsLocal() { localStorage.setItem('ao_artists', JSON.stringify(artists)); }
function saveArtists() { saveArtistsLocal(); scheduleCloudSync(); }

let artists = [];
try { artists = JSON.parse(localStorage.getItem('ao_artists')); } catch(e){}
if (!Array.isArray(artists) || !artists.length) { artists = SEED_ARTISTS.slice(); saveArtistsLocal(); }
else { artists = artists.map(normalizeArtist); }

let currentArtistId = localStorage.getItem('ao_active_artist') || (artists[0] && artists[0].id);
if (!artists.find(a => a.id === currentArtistId)) currentArtistId = artists[0] && artists[0].id;
function saveActiveArtist() { localStorage.setItem('ao_active_artist', currentArtistId); }
function activeArtist() { return artists.find(a => a.id === currentArtistId) || artists[0] || null; }

const SEED_LAUNCHES = [
  { id:'L-kintsugi', name:'Kintsugi', date:'2026-05-15', cover:'c1', status:'active', preDays:21, postDays:21,
    dna:{ about:'Sanar las heridas reconstruyéndose con oro, como el arte japonés del kintsugi', emotion:'Esperanza tras la ruptura', problem:'El miedo a mostrarse roto', conversation:'¿Tus cicatrices te hacen más valioso?', message:'Lo roto también brilla', keywords:'oro roto, sanar, kintsugi, resiliencia' },
    content:{perweek:'5 piezas / semana', platform:'TikTok', mix:['awareness','storytelling','bts']},
    budget:{ total:'12000', meta:'4000', tiktok:'5000', dsp:'2000', prod:'1000' },
    cal:[
      {fecha:'2026-05-12', title:'BTS Estudio', cat:'bts', production:{estado:'publicado'}},
      {fecha:'2026-05-13', title:'Historia del oro roto', cat:'storytelling', production:{estado:'editando'}},
      {fecha:'2026-05-14', title:'Concepto en espejo', cat:'awareness', production:{estado:'grabando'}},
      {fecha:'2026-05-16', title:'Antes/Después', cat:'trend', production:{estado:'publicado'}},
      {fecha:'2026-05-17', title:'Mensajes en pantalla', cat:'engagement', production:{estado:'programado'}},
      {fecha:'2026-05-19', title:'60 seg Mini Doc', cat:'storytelling', production:{estado:'grabando'}},
      {fecha:'2026-05-21', title:'Reacción productor', cat:'bts', production:{estado:'aprobado'}},
      {fecha:'2026-05-26', title:'Teaser visual', cat:'awareness', production:{estado:'publicado'}},
      {fecha:'2026-05-28', title:'Clip lyric', cat:'storytelling', production:{estado:'publicado'}},
      {fecha:'2026-05-30', title:'Behind the lyrics', cat:'bts', production:{estado:'programado'}},
      {fecha:'2026-06-04', title:'Q&A en vivo con fans', cat:'engagement', production:{estado:'pendiente'}},
      {fecha:'2026-06-06', title:'Trend: antes/después del quiebre', cat:'trend', production:{estado:'pendiente'}},
      {fecha:'2026-06-09', title:'Mini documental del proceso', cat:'storytelling', production:{estado:'pendiente'}},
    ],
    goals:[
      {icon:'headphones', bg:'rgba(74,222,128,0.12)',  metric:'Spotify Streams',       sub:'Primeros 30 días',   target:'150K', ai:'IA: basado en Groserías', status:'proposed'},
      {icon:'phone', bg:'rgba(255,0,80,0.12)',   metric:'TikTok Views',          sub:'Campaña completa',   target:'2M',   ai:'IA: +34% vs prev.',       status:'proposed'},
      {icon:'camera', bg:'rgba(225,48,108,0.12)', metric:'Instagram Seguidores',  sub:'Crecimiento neto',   target:'+5K',  ai:'IA: conservador',         status:'proposed'},
      {icon:'play',  bg:'rgba(255,0,0,0.12)',    metric:'YouTube Suscriptores',  sub:'Campaña completa',   target:'+2K',  ai:'IA: basado en histórico', status:'proposed'},
    ],
    metrics:{ cards:[], weeks:[] },
    metricEntries:[
      {id:'m1', platform:'spotify',   metric:'Streams', value:60000,   date:'2026-05-18', source:'seed'},
      {id:'m2', platform:'spotify',   metric:'Streams', value:110000,  date:'2026-05-25', source:'seed'},
      {id:'m3', platform:'spotify',   metric:'Streams', value:198000,  date:'2026-06-01', source:'seed'},
      {id:'m4', platform:'tiktok',    metric:'Views',   value:1200000, date:'2026-06-01', source:'seed'},
      {id:'m5', platform:'instagram', metric:'Alcance', value:86000,   date:'2026-06-01', source:'seed'},
    ] },
  { id:'L-groserias', name:'Groserías', date:'2026-07-18', cover:'c2', status:'planning', preDays:21, postDays:21,
    dna:{}, content:{perweek:'5 piezas / semana', platform:'Instagram Reels', mix:['awareness','engagement']}, budget:{},
    cal:[], goals:[], metrics:{cards:[],weeks:[]} },
  { id:'L-xahi', name:'X Ahí', date:'2026-10-01', cover:'c3', status:'planning', preDays:21, postDays:21,
    dna:{}, content:{perweek:'3 piezas / semana', platform:'TikTok', mix:['storytelling','trend']}, budget:{},
    cal:[], goals:[], metrics:{cards:[],weeks:[]} },
];

function normalizeLaunch(l) {
  l.dna = l.dna || {}; l.content = l.content || {}; l.budget = l.budget || {};
  l.cal = Array.isArray(l.cal) ? l.cal : [];
  l.cal.forEach((ci, i) => { if (!ci.id) ci.id = 'ci-' + i + '-' + s(ci.fecha); });
  l.goals = Array.isArray(l.goals) ? l.goals : [];
  l.metrics = (l.metrics && typeof l.metrics === 'object') ? l.metrics : {cards:[],weeks:[]};
  if (!Array.isArray(l.metrics.cards)) l.metrics.cards = [];
  if (!Array.isArray(l.metrics.weeks)) l.metrics.weeks = [];
  l.ideas = Array.isArray(l.ideas) ? l.ideas : [];
  l.generated = Array.isArray(l.generated) ? l.generated : [];
  l.generatedPrev = Array.isArray(l.generatedPrev) ? l.generatedPrev : []; // generación IA anterior (no se borra hasta regenerar)
  l.letra = typeof l.letra === 'string' ? l.letra : '';                    // letra de la canción (para generar el Campaign DNA)
  l.metricEntries = Array.isArray(l.metricEntries) ? l.metricEntries : [];
  l.screenshots = Array.isArray(l.screenshots) ? l.screenshots : [];
  l.revenue = (l.revenue && typeof l.revenue === 'object') ? l.revenue : {};
  l.artistId = l.artistId || (artists[0] && artists[0].id);
  // CRM (Sprint 0): release type + tracklist (aditivo, no rompe nada)
  l.type = l.type || 'single';                                  // single | ep | album | evergreen (campaña always-on)
  l.color = l.color || '';                                       // color de campaña (evergreen)
  l.tracklist = Array.isArray(l.tracklist) ? l.tracklist : [];  // [{trackId, order}]
  // CRM (Sprint 1): checklist release-level (visual/distrib/mkt)
  l.releaseChecklist = (l.releaseChecklist && typeof l.releaseChecklist === 'object') ? l.releaseChecklist : {};
  l.releaseChecklist.visual  = l.releaseChecklist.visual  || {};
  l.releaseChecklist.distrib = l.releaseChecklist.distrib || {};
  l.releaseChecklist.mkt     = l.releaseChecklist.mkt     || {};
  // CRM (Sprint 2): identidad release-level + assets + tareas (aditivo)
  l.upc = l.upc || '';
  l.distributor = l.distributor || '';
  l.notes = l.notes || '';
  l.assets = Array.isArray(l.assets) ? l.assets : [];   // [{id, tipo, url, label}]
  l.tasks  = Array.isArray(l.tasks)  ? l.tasks  : [];   // [{id, titulo, capability, estado, dueDate}]
  // CRM (Sprint 4): finanzas
  l.expenses = Array.isArray(l.expenses) ? l.expenses : []; // [{id, monto, categoria, proveedor, fecha, metodo, reciboLink, note}]
  l.recoup = (l.recoup && typeof l.recoup === 'object') ? l.recoup : {}; // {ingresos, inversionTotal?}
  return l;
}
// Lanzamientos REALES del artista (excluye campañas evergreen, que son launches type:'evergreen').
function artistLaunches() { return launches.filter(l => l.artistId === currentArtistId && l.type !== 'evergreen'); }
// Campañas evergreen / always-on del artista (viven como launches type:'evergreen').
function artistEvergreen() { return launches.filter(l => l.artistId === currentArtistId && l.type === 'evergreen'); }
// ── Campañas del calendario: release activo + todas las evergreen del artista (cada una con color) ──
const CAMPAIGN_PALETTE = ['#FF6B30','#38bdf8','#a78bfa','#4ade80','#FFAA00','#f472b6','#22d3ee','#fb923c'];
let _calHidden = {}; // { launchId: true } campañas ocultas en el calendario
function campColorFor(l, i) { return (l.type === 'evergreen' && l.color) ? l.color : CAMPAIGN_PALETTE[i % CAMPAIGN_PALETTE.length]; }
function calCampaigns() {
  const out = [];
  const rel = (typeof activeLaunch === 'function') ? activeLaunch() : null;
  if (rel) out.push({ id: rel.id, name: rel.name, color: CAMPAIGN_PALETTE[0], isEvergreen: false, launch: rel });
  artistEvergreen().forEach((l, i) => out.push({ id: l.id, name: l.name, color: campColorFor(l, i + 1), isEvergreen: true, launch: l }));
  return out;
}
function campColor(launchId) { const c = calCampaigns().find(x => x.id === launchId); return c ? c.color : 'var(--accent)'; }
function toggleCampaign(id) { _calHidden[id] = !_calHidden[id]; renderCalendar(); }
// Piezas visibles agregadas de todas las campañas activas (release + evergreen), cada una tagueada con su campaña.
function calVisibleItems() {
  const out = [];
  calCampaigns().forEach(c => { if (_calHidden[c.id]) return; (c.launch.cal || []).forEach(ci => out.push(Object.assign({}, ci, { _campId: c.id, _campColor: c.color, _campName: c.name }))); });
  return out;
}
async function crearCampania() {
  if (typeof requireCan === 'function' && !requireCan('edit_launch')) return;
  const a = activeArtist(); if (!a) { uiAlert('Selecciona un artista primero.'); return; }
  const name = (await uiPrompt('Nombre de la campaña always-on (ej. Always-On, Lifestyle, Catálogo):', { title: 'Nueva campaña' }) || '').trim();
  if (!name) return;
  const color = CAMPAIGN_PALETTE[(artistEvergreen().length + 1) % CAMPAIGN_PALETTE.length];
  const l = normalizeLaunch({ id: 'cmp-' + Date.now(), artistId: a.id, name, type: 'evergreen', status: 'evergreen', color, cal: [] });
  launches.push(l); saveLaunches(); renderCalendar();
  uiToast('✓ Campaña creada');
}
async function borrarCampania(id) {
  const l = launches.find(x => x.id === id); if (!l || l.type !== 'evergreen') return;
  if (!(await uiConfirm(`¿Eliminar la campaña "${s(l.name)}" y su contenido?`))) return;
  launches = launches.filter(x => x.id !== id); delete _calHidden[id]; saveLaunches(); renderCalendar();
  uiToast('✓ Campaña eliminada');
}
// ── Página "Campañas en curso" (acceso directo a todas las campañas activas del workspace) ──
function inProgressCampaigns() {
  return launches.filter(l => l.type === 'evergreen' || ['active', 'planning', 'analisis', 'bloqueado'].indexOf(l.status) >= 0);
}
function renderCampanias() {
  const body = document.getElementById('campanias-body'); if (!body) return;
  const list = inProgressCampaigns();
  const sub = document.getElementById('campanias-sub'); if (sub) sub.textContent = list.length + ' campaña' + (list.length === 1 ? '' : 's') + ' en curso';
  if (!list.length) { body.innerHTML = '<div class="empty-hint">No hay campañas en curso. Crea un lanzamiento o una campaña always-on desde el Calendario.</div>'; return; }
  const today = dateKey(new Date());
  body.innerHTML = list.map(l => {
    const art = artists.find(a => a.id === l.artistId);
    const pieces = (l.cal || []).length;
    const next = (l.cal || []).filter(c => c.fecha && c.fecha >= today).sort((a, b) => a.fecha < b.fecha ? -1 : 1)[0];
    const isEv = l.type === 'evergreen';
    const col = isEv ? (l.color || 'var(--beat)') : 'var(--muted)';
    const st = isEv ? 'always-on' : ((STATUS_MAP[l.status] || {}).word || l.status);
    return `<div onclick="goToCampaign('${l.id}')" style="cursor:pointer;border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="width:12px;height:12px;border-radius:3px;background:${col};flex-shrink:0"></span>
      <div style="flex:1;min-width:200px">
        <div style="font-size:15px;font-weight:600">${esc(l.name)} <span style="font-size:9px;font-family:var(--font-mono);color:var(--text-dim)">${isEv ? 'ALWAYS-ON' : 'RELEASE'}</span></div>
        <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:2px">${art ? esc(art.name) : '—'} · ${esc(st)} · ${pieces} pieza${pieces === 1 ? '' : 's'}${next ? ` · próxima: ${powDM(next.fecha)}` : ''}</div>
      </div>
      <span class="chip" style="cursor:default">Ver →</span>
    </div>`;
  }).join('');
}
function goToCampaign(id) {
  const l = launches.find(x => x.id === id); if (!l) return;
  if (typeof setActiveArtist === 'function' && l.artistId) setActiveArtist(l.artistId);
  if (l.type === 'evergreen') {
    // Las campañas always-on NO cuelgan de un lanzamiento: viven en el calendario de contenido
    // del artista (release activo + todas las evergreen). No se fuerza ningún release.
    if (typeof _calHidden !== 'undefined' && _calHidden[l.id]) delete _calHidden[l.id]; // asegura que la campaña clicada se vea
    if (typeof showPage === 'function') showPage('calendario');
  } else if (typeof openLaunch === 'function') {
    openLaunch(id); setTimeout(() => { if (typeof setReleaseTab === 'function') setReleaseTab('campana'); }, 90);
  }
}

let launches = [];
try { launches = JSON.parse(localStorage.getItem('ao_launches')); } catch(e){}
if (!Array.isArray(launches) || !launches.length) { launches = SEED_LAUNCHES.map(normalizeLaunch); saveLaunchesLocal(); }
else { launches = launches.map(normalizeLaunch); }

function saveLaunchesLocal() { localStorage.setItem('ao_launches', JSON.stringify(launches)); }
function saveLaunches() {
  // Sella "modificado" del release abierto (heurística para ordenar por "modificado recientemente").
  if (typeof currentLaunchId !== 'undefined' && currentLaunchId) {
    const _l = launches.find(x => x.id === currentLaunchId); if (_l) _l._updatedAt = Date.now();
  }
  saveLaunchesLocal(); scheduleCloudSync();
}
// ── Ordenamiento de lanzamientos (lista + dashboard) ──
const LAUNCH_STATUS_ORDER = { active:0, planning:1, analisis:2, bloqueado:3, complete:4, cerrado:5 };
function launchSortMode() { return localStorage.getItem('ao_launch_sort') || 'date_desc'; }
function setLaunchSort(v) { localStorage.setItem('ao_launch_sort', v); renderAllLaunches(); }
function sortLaunches(list) {
  const mode = launchSortMode();
  const dnum = l => l.date ? new Date(l.date + 'T00:00:00').getTime() : null;
  const arr = (list || []).slice();
  arr.sort((a, b) => {
    switch (mode) {
      case 'date_asc':  { const x = dnum(a), y = dnum(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return x - y; }
      case 'updated':   return (b._updatedAt || b.createdAt || 0) - (a._updatedAt || a.createdAt || 0);
      case 'created':   return (b.createdAt || 0) - (a.createdAt || 0);
      case 'name':      return s(a.name).localeCompare(s(b.name));
      case 'status':    return ((LAUNCH_STATUS_ORDER[a.status] ?? 9) - (LAUNCH_STATUS_ORDER[b.status] ?? 9)) || ((dnum(b) || 0) - (dnum(a) || 0));
      case 'date_desc':
      default:          { const x = dnum(a), y = dnum(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return y - x; }
    }
  });
  return arr;
}

// ══════════════════════════════════════════
// MODELO DE DATOS — TRACKS (canción durable, CRM Sprint 0)
// ══════════════════════════════════════════
function normalizeTrack(t) {
  t = t || {};
  t.id = t.id || ('TRK-' + Date.now() + '-' + Math.floor(Math.random() * 9999));
  t.artistId = t.artistId || (artists[0] && artists[0].id);
  t.title = t.title || '';
  t.version = t.version || '';
  t.isrc = t.isrc || '';
  t.credits = t.credits || {};
  t.credits.featured  = Array.isArray(t.credits.featured)  ? t.credits.featured  : [];
  t.credits.producers = Array.isArray(t.credits.producers) ? t.credits.producers : [];
  t.credits.composers = Array.isArray(t.credits.composers) ? t.credits.composers : [];
  t.credits.writers   = Array.isArray(t.credits.writers)   ? t.credits.writers   : [];
  t.links = t.links || {}; t.meta = t.meta || {}; t.master = t.master || {}; t.publishing = t.publishing || {};
  t.labelCopy = t.labelCopy || {}; t.labelCopy.contacts = Array.isArray(t.labelCopy.contacts) ? t.labelCopy.contacts : [];
  t.legal = Array.isArray(t.legal) ? t.legal : [];
  t.checklist = t.checklist || {};
  t.checklist.audio   = t.checklist.audio   || {};
  t.checklist.legal   = t.checklist.legal   || {};
  t.checklist.distrib = t.checklist.distrib || {};
  t.status = (t.status && typeof t.status === 'object') ? t.status : {}; // {phase, override}
  t.metrics = (t.metrics && typeof t.metrics === 'object') ? t.metrics : {};
  t.metricEntries = Array.isArray(t.metricEntries) ? t.metricEntries : [];
  t.tasks = Array.isArray(t.tasks) ? t.tasks : [];
  t.createdAt = t.createdAt || new Date().toISOString();
  return t;
}
let tracks = [];
try { tracks = JSON.parse(localStorage.getItem('ao_tracks')); } catch (e) {}
if (!Array.isArray(tracks)) tracks = [];
tracks = tracks.map(normalizeTrack);
function saveTracksLocal() { localStorage.setItem('ao_tracks', JSON.stringify(tracks)); }
function saveTracks() { saveTracksLocal(); scheduleCloudSync(); }
function tracksOfLaunch(l) { return ((l && l.tracklist) || []).map(ref => tracks.find(t => t.id === ref.trackId)).filter(Boolean); }

// Migración (idempotente): cada launch sin tracklist → release type=single con 1 track extraído.
function migrateLaunchesToTracks() {
  let changed = false;
  (launches || []).forEach(l => {
    if (l.type === 'evergreen') return; // las campañas always-on no tienen tracks
    if (!l.type) { l.type = 'single'; changed = true; }
    if (!Array.isArray(l.tracklist)) l.tracklist = [];
    if (!l.tracklist.length) {
      const tid = 'TRK-' + l.id;
      if (!tracks.find(t => t.id === tid)) {
        tracks.push(normalizeTrack({ id: tid, artistId: l.artistId, title: l.name, createdAt: l.createdAt || new Date().toISOString() }));
      }
      l.tracklist = [{ trackId: tid, order: 0 }];
      changed = true;
    }
  });
  if (changed) { saveLaunchesLocal(); saveTracksLocal(); }
  return changed;
}
migrateLaunchesToTracks(); // sobre la data local al arrancar

// ── Contexto de lanzamiento activo ──
function activeLaunch() {
  const mine = artistLaunches();
  if (!mine.find(l => l.id === currentLaunchId)) currentLaunchId = mine[0] ? mine[0].id : null;
  return mine.find(l => l.id === currentLaunchId) || mine[0] || null;
}
function setActiveLaunch(id) {
  currentLaunchId = id;
  weekOffset = 0;
  const p = (document.querySelector('.page.active') || {}).id;
  if (p === 'page-calendario') renderCalendar();
  if (p === 'page-objetivos')  renderObjetivos();
  if (p === 'page-metricas')   renderMetricas();
  if (p === 'page-banco')      renderBanco();
  if (p === 'page-ideas')      renderIdeas();
}
function launchContextHTML() {
  // Dentro de una pestaña del release (página embebida) el selector de contexto es redundante → no se pinta.
  if (window._embeddingNow) return '';
  const a = activeLaunch();
  if (!a) return '';
  const st = STATUS_MAP[a.status] || STATUS_MAP.planning;
  const opts = artistLaunches().map(l =>
    `<option value="${esc(l.id)}" ${l.id===a.id?'selected':''}>${esc(l.name)}</option>`).join('');
  return `
    <div class="launch-ctx">
      <span class="ctx-label">Lanzamiento</span>
      <select class="ctx-select" onchange="setActiveLaunch(this.value)">${opts}</select>
      <span class="launch-status ${st.cls}" style="margin-left:4px"><span class="status-dot"></span>${st.word}</span>
      <span class="ctx-date">${launchDateLabel(a)}</span>
    </div>`;
}

const STATUS_MAP = {
  planning: { cls:'status-planning', word:'Planeando',  tag:'PLANEADO' },
  active:   { cls:'status-active',   word:'En campaña', tag:'EN CAMPAÑA' },
  bloqueado:{ cls:'status-blocked',  word:'Bloqueado',  tag:'BLOQUEADO' },
  analisis: { cls:'status-analysis', word:'En análisis',tag:'ANÁLISIS' },
  complete: { cls:'status-complete', word:'Completado', tag:'LANZADO' },
  cerrado:  { cls:'status-closed',   word:'Cerrado',    tag:'CERRADO' },
};
// Cambia el estado del release (con automatización + actividad).
function setLaunchStatus(id, st) {
  if (!requireCan('edit_launch')) return;
  const l = launches.find(x => x.id === id); if (!l || !STATUS_MAP[st]) return;
  const prev = l.status; if (prev === st) return;
  l.status = st; saveLaunches();
  if (typeof logActivity === 'function') logActivity('status_changed', `Release → ${STATUS_MAP[st].word}: ${s(l.name)}`, { artistId: l.artistId, releaseId: l.id });
  // B3 (captura "ahora"): al CERRAR un release, captura el snapshot del rollup operativo (idempotente).
  if ((st === 'complete' || st === 'cerrado') && typeof captureReleaseSnapshot === 'function') captureReleaseSnapshot(id, { silent: true });
  if (typeof runAutomations === 'function') runAutomations();
  if (typeof renderReleaseTab === 'function' && currentLaunchId === id) renderReleaseTab('resumen');
  renderAllLaunches();
}
// Dropdown de estado del release (editable) o badge estático según permiso. Reusable (header + resumen).
function statusDropdownHTML(l, extra) {
  const st = STATUS_MAP[l.status] || STATUS_MAP.planning;
  const editable = (typeof canDo === 'function') ? canDo('edit_launch') : true;
  if (!editable) return `<span class="launch-status ${st.cls}"><span class="status-dot"></span>${st.word}</span>`;
  return `<select class="status-select ${st.cls}" style="${extra || ''}" title="Cambiar estado del release" onchange="setLaunchStatus('${l.id}',this.value)">${Object.keys(STATUS_MAP).map(k => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${STATUS_MAP[k].word}</option>`).join('')}</select>`;
}
const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

function launchDateLabel(l) {
  const st = STATUS_MAP[l.status] || STATUS_MAP.planning;
  if (!l.date) return st.tag + ' · SIN FECHA';
  const d = new Date(l.date + 'T00:00:00');
  return `${st.tag} · ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// Número de catálogo estable derivado del id (cosmético, tipo "TMP-004").
function catalogNo(l) {
  let h = 0; const str = String((l && (l.id || l.name)) || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return 'TMP-' + String(h % 1000).padStart(3, '0');
}
function coverDateLabel(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00'); if (isNaN(d)) return '—';
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
function coverHTML(l, extraInner, extraClass) {
  const hasArt = l && l.cover && /^(https?:|data:)/.test(l.cover);
  return `<div class="launch-cover${extraClass ? ' ' + extraClass : ''}${hasArt ? ' has-art' : ''}" ${hasArt ? `style="background-image:url('${safeUrl(l.cover)}')"` : ''}>${extraInner || ''}` +
    `<div class="cover-cat">${catalogNo(l)} · ${up(l.type || 'single')}</div>` +
    `<div class="cover-title">${esc(up(l.name).slice(0, 12))}</div>` +
    `<div class="cover-date">${coverDateLabel(l.date)}</div></div>`;
}
function launchCardHTML(l) {
  const st = STATUS_MAP[l.status] || STATUS_MAP.planning;
  // Surface blocking alerts (missing cover, unsigned split, etc.) right on the card —
  // without this, "Lanzado"/"En campaña" is the *only* signal visible outside the release
  // detail page, even when something there needs urgent attention.
  const redAlerts = (typeof releaseAlerts === 'function') ? releaseAlerts(l).filter(a => a.level === 'red').length : 0;
  const alertBadge = redAlerts ? `<span class="launch-alert-badge" title="${redAlerts} alerta(s) sin resolver">${icon('warning', 11)}</span>` : '';
  return `
    <div class="launch-card fade-in" onclick="openLaunch('${l.id}')">
      <button class="del-btn" title="Eliminar" onclick="event.stopPropagation();borrarLanzamiento('${l.id}')">${icon('close',12)}</button>
      ${coverHTML(l, alertBadge)}
      <div class="launch-info">
        <div class="launch-name">${esc(l.name)}</div>
        <div class="launch-date">${launchDateLabel(l)}</div>
        <span class="launch-status ${st.cls}"><span class="status-dot"></span>${st.word}</span>
      </div>
    </div>`;
}

function renderLaunches() {
  const grid = document.getElementById('launches-grid');
  if (!grid) return;
  const sel = document.getElementById('launch-sort'); if (sel) sel.value = launchSortMode();
  grid.innerHTML =
    `<div class="launch-card add" onclick="abrirWizard()"><div class="plus">+</div><div style="font-size:12px">Nuevo Lanzamiento</div></div>`
    + sortLaunches(artistLaunches()).map(launchCardHTML).join('');
}
function renderDashLaunches() {
  const grid = document.getElementById('dash-launches');
  if (!grid) return;
  const mine = sortLaunches(artistLaunches());
  grid.innerHTML = mine.length
    ? mine.slice(0,3).map(launchCardHTML).join('')
    : `<div class="empty-hint" style="grid-column:1/-1">Aún no hay lanzamientos para este artista. Crea el primero con “+ Nuevo Lanzamiento”.</div>`;
}
function renderAllLaunches() { renderLaunches(); renderDashboard(); }

// ── Helpers numéricos para métricas ──
function parseMetricNum(v) {
  const m = s(v).trim().match(/([\d.,]+)\s*([KkMm]?)/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/,/g, '')) || 0;
  const suf = m[2].toLowerCase();
  if (suf === 'k') n *= 1e3; else if (suf === 'm') n *= 1e6;
  return n;
}
function fmtNum(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}
function diasRestantes(iso) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}
// Momento firma 01 (DESIGN.md v2): countdown como instrumento. T−NN en Space Mono tabular +
// regla de ticks; a T−3 o menos, numeral+ticks en naranja (único acento de la tarjeta).
function dropClockHTML(l, large) {
  const d = (l && l.date) ? diasRestantes(l.date) : null;
  const lg = large ? ' drop-clock--lg' : '';
  if (d == null) return `<div class="drop-clock${lg}"><div class="tc-out">SIN FECHA</div></div>`;
  if (d < 0) return `<div class="drop-clock${lg}"><div class="tc-out">SALIÓ<br>hace ${-d}d</div></div>`;
  const horizon = Math.max((l.preDays != null ? l.preDays : 21), 1);
  const p = Math.max(0.04, Math.min(1, (horizon - d) / horizon));
  const hot = d <= 3 ? ' hot' : '';
  return `<div class="drop-clock${lg}${hot}">` +
    `<div class="tc-row"><span class="tc">T−${String(d).padStart(2, '0')}</span><span class="tc-unit">DÍAS</span></div>` +
    `<div class="ruler"><i style="--p:${Math.round(p * 100)}%"></i></div></div>`;
}

// ── DASHBOARD (per-artista, datos reales) ──
// ── Tendencia (gráfica real, Chart.js bajo demanda) ──
let _chartJsP = null;
function ensureChartJs() {
  if (window.Chart) return Promise.resolve();
  if (_chartJsP) return _chartJsP;
  _chartJsP = new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    sc.onload = res; sc.onerror = rej; document.head.appendChild(sc);
  });
  return _chartJsP;
}
function fmtDateShort(iso) { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : `${d.getDate()} ${MESES_CAL[d.getMonth()]}`; }
// Serie temporal: agrega metricEntries (artista + lanzamientos), elige la métrica con más fechas distintas.
function dashTrendSeries(art, ls) {
  const all = [];
  ((art && art.metricEntries) || []).forEach(e => all.push(e));
  (ls || []).forEach(l => (l.metricEntries || []).forEach(e => all.push(e)));
  if (!all.length) return null;
  const groups = {};
  all.forEach(e => { const k = (e.platform || '') + '|' + (e.metric || ''); (groups[k] = groups[k] || []).push(e); });
  let best = null, bestScore = 0;
  Object.entries(groups).forEach(([k, arr]) => {
    const dates = new Set(arr.map(e => e.date || '').filter(Boolean));
    const pref = /stream|reproduc|oyente|listen|seguidor|follow|view|vista|alcance|reach/i.test(k) ? 1 : 0;
    const score = dates.size * 10 + pref;
    if (dates.size >= 2 && score > bestScore) { bestScore = score; best = { k, arr }; }
  });
  if (!best) return null;
  const byDate = {};
  best.arr.forEach(e => { const d = e.date || ''; if (d) byDate[d] = (byDate[d] || 0) + (+e.value || 0); });
  const dates = Object.keys(byDate).sort();
  if (dates.length < 2) return null;
  const [platform, metric] = best.k.split('|');
  return { dates, values: dates.map(d => byDate[d]), metric: metric || 'Métrica', platform: platform || '' };
}
let _dashChart = null;
async function renderDashTrend(art, ls) {
  const host = document.getElementById('dash-chart-host'); const sub = document.getElementById('dash-trend-sub');
  if (!host) return;
  const series = dashTrendSeries(art, ls);
  if (!series) {
    if (_dashChart) { try { _dashChart.destroy(); } catch (e) {} _dashChart = null; }
    host.innerHTML = '<div class="dash-chart-empty">Sin histórico suficiente para una tendencia.<br>Importa métricas en varias fechas (Métricas) y verás aquí la evolución.</div>';
    if (sub) sub.textContent = '';
    return;
  }
  host.innerHTML = '<canvas id="dash-trend"></canvas>';
  if (sub) sub.textContent = `${series.platform ? up(series.platform) + ' · ' : ''}${series.metric}`;
  try { await ensureChartJs(); } catch (e) { host.innerHTML = '<div class="dash-chart-empty">No se pudo cargar la gráfica (¿sin internet?).</div>'; return; }
  const cv = document.getElementById('dash-trend'); if (!cv) return;
  const css = getComputedStyle(document.documentElement);
  // Anti-slop (DESIGN.md §Color): la tendencia es dato, no urgencia → línea neutra, sin fill degradado.
  const line = (css.getPropertyValue('--text-muted').trim()) || '#9BA1A6';
  const grid = (css.getPropertyValue('--border').trim()) || 'rgba(255,255,255,.08)';
  const txt = (css.getPropertyValue('--text-muted').trim()) || '#8a8a8a';
  const ctx = cv.getContext('2d');
  if (_dashChart) { try { _dashChart.destroy(); } catch (e) {} }
  _dashChart = new Chart(ctx, {
    type: 'line',
    data: { labels: series.dates.map(fmtDateShort), datasets: [{ data: series.values, borderColor: line, backgroundColor: 'transparent', fill: false, tension: 0.32, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: line, pointBorderColor: line }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(10,12,10,.92)', borderColor: grid, borderWidth: 1, padding: 10, displayColors: false, callbacks: { label: c => fmtNum(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { color: txt, font: { size: 10 } } }, y: { grid: { color: grid }, ticks: { color: txt, font: { size: 10 }, callback: v => fmtNum(v) }, beginAtZero: false } }
    }
  });
}
function sigTile(ic, cls, val, label) {
  return `<div class="sig-tile"><div class="sig-ic ${cls}">${icon(ic, 17)}</div><div class="sig-main"><div class="sig-v">${val}</div><div class="sig-l">${label}</div></div></div>`;
}
function renderDashSignals(art) {
  const host = document.getElementById('dash-signals'); if (!host) return;
  if (!art) { host.innerHTML = '<div class="empty-hint" style="margin:0">Selecciona un artista.</div>'; return; }
  const f = artistFinance(art.id), legal = artistLegalPending(art.id), alerts = artistAlertCount(art.id), next = nextRelease(art.id);
  const rec = f.inv ? Math.min(100, Math.round(f.ing / f.inv * 100)) : null;
  host.innerHTML =
    sigTile('flag', next ? 'accent' : '', next ? (diasRestantes(next.date) >= 0 ? 'en ' + diasRestantes(next.date) + 'd' : 'hoy') : '—', next ? 'Próximo: ' + s(next.name) : 'Sin próximos drops') +
    sigTile('warning', alerts ? 'warn' : 'ok', alerts || '0', alerts ? 'alerta' + (alerts > 1 ? 's' : '') + ' abiertas' : 'sin alertas') +
    sigTile('file', legal ? 'beat' : 'ok', legal || '0', legal ? 'documentos legales pendientes' : 'legal al día') +
    sigTile('finance', (rec != null && rec >= 100) ? 'ok' : 'accent', rec != null ? rec + '%' : '—', 'recoup · ROI ' + (f.roi != null ? f.roi + '%' : '—'));
}

// Onboarding del Caso 1: checklist de arranque para el artista que abre y no tiene
// lanzamientos. Convierte las "vistas vacías" en un primer paso obvio (HANDOFF #3).
function dashOnboardingHTML(art) {
  return `<div class="onb fade-in">
    <div class="onb-title">EMPIEZA AQUÍ${art ? ' · ' + esc(up(art.name)) : ''}</div>
    <div class="onb-sub">Tres pasos para tener tu primer drop corriendo dentro de Tempo.</div>
    <div class="onb-steps">
      <div class="onb-step">
        <span class="onb-num">1</span>
        <div class="onb-step-body">
          <div class="onb-step-title">Crea tu primer lanzamiento</div>
          <div class="onb-step-desc">El single o EP que vas a sacar — todo (calendario, letra, contenido) cuelga de aquí.</div>
        </div>
        <button class="tk-btn tk-btn--primary" onclick="abrirWizard()">Crear lanzamiento</button>
      </div>
      <div class="onb-step locked">
        <span class="onb-num">2</span>
        <div class="onb-step-body">
          <div class="onb-step-title">Pega la letra de la canción</div>
          <div class="onb-step-desc">La letra es la semilla: alimenta ideas, contenido y estrategia. (Se desbloquea con tu lanzamiento.)</div>
        </div>
      </div>
      <div class="onb-step locked">
        <span class="onb-num">3</span>
        <div class="onb-step-body">
          <div class="onb-step-title">Genera el contenido del drop</div>
          <div class="onb-step-desc">Caption, guión y hashtags por pieza, listos para publicar. (Se desbloquea con tu lanzamiento.)</div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderDashboard() {
  renderDashLaunches();
  const art = activeArtist();
  const ls = artistLaunches();
  // Estado vacío guiado (Caso 1): si el artista no tiene lanzamientos, lidera con el
  // checklist de arranque y oculta tendencia/señales (vacías se ven rotas).
  const onbHost = document.getElementById('dash-onboarding');
  const dashMain = document.querySelector('#page-dashboard .dash-main');
  const isEmpty = !!art && ls.length === 0;
  if (onbHost) onbHost.innerHTML = isEmpty ? dashOnboardingHTML(art) : '';
  if (dashMain) dashMain.style.display = isEmpty ? 'none' : '';
  if (isEmpty && typeof hydrateIcons === 'function') hydrateIcons();
  const statsHost = document.getElementById('dash-stats');
  const nextHost = document.getElementById('dash-next');
  const titleEl = document.getElementById('dash-launches-title');
  if (titleEl) titleEl.textContent = art ? `LANZAMIENTOS DE ${up(art.name)}` : 'LANZAMIENTOS';
  if (!statsHost) return;

  // conteos por estado
  const counts = { active: 0, planning: 0, complete: 0 };
  ls.forEach(l => { counts[l.status] = (counts[l.status] || 0) + 1; });

  // streams agregados (último valor por métrica tipo "stream/reproduc")
  let streams = 0, hasMetrics = false;
  ls.forEach(l => latestEntries(l.metricEntries).forEach(e => {
    if (/stream|reproduc/i.test(e.metric)) { streams += e.value; hasMetrics = true; }
  }));

  // contenido del calendario (todos los lanzamientos del artista)
  const today = new Date(); today.setHours(0,0,0,0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
  let allCal = [];
  ls.forEach(l => (l.cal || []).forEach(ci => allCal.push(Object.assign({}, ci, { launch: l.name, launchId: l.id }))));
  const upcoming = allCal.filter(ci => new Date(ci.fecha + 'T00:00:00') >= today).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const next7 = upcoming.filter(ci => new Date(ci.fecha + 'T00:00:00') < in7);

  // próximo drop
  const drops = ls.filter(l => l.date && diasRestantes(l.date) >= 0).sort((a, b) => a.date < b.date ? -1 : 1);
  const nextDrop = drops[0];

  // ideas seleccionadas (total)
  let ideasCount = 0; ls.forEach(l => ideasCount += (l.ideas || []).length);

  // sparkline de streams (si hay histórico en ≥2 fechas)
  const streamHist = (function () {
    const by = {}; ls.forEach(l => (l.metricEntries || []).forEach(e => { if (/stream|reproduc/i.test(e.metric)) { const d = e.date || ''; if (d) by[d] = (by[d] || 0) + (+e.value || 0); } }));
    return Object.keys(by).sort().map(d => by[d]);
  })();
  const streamSpark = streamHist.length >= 2 ? sparklineSVG(streamHist, 130, 30, 'var(--accent)') : '';

  // título / subtítulo del dashboard
  const titleEl2 = document.getElementById('dash-title'), subEl = document.getElementById('dash-subtitle');
  if (titleEl2) titleEl2.textContent = art ? s(art.name) : 'Dashboard';
  if (subEl) subEl.textContent = art ? `${ls.length} lanzamiento${ls.length === 1 ? '' : 's'} · ${counts.active} en campaña · ${counts.planning} en plan` : 'Resumen del artista';

  const recoup = (function () { if (!art) return null; const f = artistFinance(art.id); return f.inv ? Math.min(100, Math.round(f.ing / f.inv * 100)) : null; })();
  const roi = art ? artistFinance(art.id).roi : null;
  statsHost.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Streams / Reproducciones</div>
      <div class="stat-value">${hasMetrics ? fmtNum(streams) : '—'}</div>
      ${streamSpark || `<div class="stat-sub">${hasMetrics ? 'Total acumulado' : 'Impórtalas en Métricas'}</div>`}
    </div>
    <div class="stat-card">
      <div class="stat-label">Lanzamientos</div>
      <div class="stat-value">${ls.length}</div>
      <div class="stat-trend" style="color:var(--beat)">${counts.active} en campaña · ${counts.planning} planeando${counts.complete ? ' · ' + counts.complete + ' lanzados' : ''}</div>
      <div class="stat-sub">${nextDrop ? `Próximo: ${s(nextDrop.name)} en ${diasRestantes(nextDrop.date)}d` : 'Sin próximos drops'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Contenido Programado</div>
      <div class="stat-value">${next7.length}</div>
      <div class="stat-trend" style="color:var(--beat)">esta semana · ${upcoming.length} próximos en total</div>
      <div class="stat-sub">${ideasCount} ideas · ${allCal.length} piezas en calendario</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Recoupment</div>
      <div class="stat-value">${recoup != null ? recoup + '%' : '—'}</div>
      <div class="kpi-delta ${roi != null ? (roi >= 0 ? 'up' : 'down') : 'flat'}">${roi != null ? icon(roi >= 0 ? 'trend' : 'trend', 12) + ' ROI ' + roi + '%' : 'sin inversión'}</div>
      <div class="stat-sub">${art ? 'inv ' + money(artistFinance(art.id).inv) : '—'}</div>
    </div>`;
  renderDashSignals(art);
  renderDashTrend(art, ls);

  // próximo contenido (lista)
  const dueSoon = upcoming.filter(ci => diasRestantes(ci.fecha) <= 2 && (ci.production && ci.production.estado) !== 'publicado');
  if (nextHost) {
    if (!upcoming.length) {
      nextHost.innerHTML = `<div class="empty-hint">No hay contenido próximo. Agrega piezas desde el Banco de Referencias o el Generador de Ideas.</div>`;
    } else {
      const alert = dueSoon.length ? `<div class="deadline-alert" style="display:flex;align-items:center;gap:8px">${icon('clock',15)}<span><strong>${dueSoon.length}</strong> pieza${dueSoon.length>1?'s':''} con deadline en las próximas 48h</span></div>` : '';
      nextHost.innerHTML = alert + upcoming.slice(0, 6).map(ci => {
        const col = catColor(ci.cat);
        const dr = diasRestantes(ci.fecha);
        const estado = (ci.production && ci.production.estado) || 'pendiente';
        const urgent = dr <= 2 && estado !== 'publicado';
        const dlabel = dr === 0 ? 'HOY' : (dr === 1 ? 'MAÑANA' : (() => { const d = new Date(ci.fecha + 'T00:00:00'); return `${MESES_CAL[d.getMonth()]} ${d.getDate()}`; })());
        return `<div onclick="openProduction('${ci.launchId}','${ci.id}')" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface);border:1px solid ${urgent?'rgba(255,71,87,0.35)':'var(--border)'};border-radius:6px;cursor:pointer;">
          <div style="font-family:var(--font-mono);font-size:10px;color:${dr === 0 ? 'var(--accent)' : (urgent?'#ff8a8a':'var(--text-muted)')};width:64px;display:flex;align-items:center;gap:4px">${urgent?icon('clock',11):''}${dlabel}</div>
          <span class="cal-item" style="margin:0;background:${col}18;color:${col};border-left:2px solid ${col}">${ESTADO_ICON[estado]||''} ${esc(ci.title)}</span>
          <div style="margin-left:auto;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">${s(ci.launch)}</div>
        </div>`;
      }).join('');
    }
  }
}

async function borrarLanzamiento(id) {
  if (!requireCan('edit_launch')) return;
  const l = launches.find(x => x.id === id);
  if (!await uiConfirm(`¿Eliminar el lanzamiento “${l ? l.name : ''}”? Esta acción no se puede deshacer.`, {danger:true, okText:'Eliminar'})) return;
  launches = launches.filter(x => x.id !== id);
  saveLaunches(); renderAllLaunches();
  cloudDelete('launches', id);
  if (editingId === id) cerrarWizard();
  if (currentLaunchId === id) { currentLaunchId = null; showPage('lanzamientos'); }
}
