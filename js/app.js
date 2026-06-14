
// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
const s  = v => (v == null ? '' : String(v));
const up = v => s(v).toUpperCase();
const trim = v => s(v).replace(/^["'﻿\r\s]+|["'\r\s]+$/g, '');

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
  if (typeof releaseRestorePages === 'function') releaseRestorePages(); // devuelve páginas embebidas a .content antes de navegar
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  const titles = {dashboard:'Dashboard',lanzamientos:'Lanzamientos',tareas:'Tareas',label:'Dashboard del Label',perfil:'Perfil del Artista',adn:'ADN Artístico',banco:'Banco de Referencias',ideas:'Generador de Ideas',calendario:'Calendario',objetivos:'Objetivos SMART',metricas:'Métricas',aprendizajes:'Aprendizajes',ia:'IA Estratégica'};
  let _ttl = titles[id] || id;
  if (id === 'launch') { const _l = (typeof launches !== 'undefined') ? launches.find(x => x.id === currentLaunchId) : null; if (_l) _ttl = _l.name; }
  document.getElementById('page-title').textContent = up(_ttl);
  document.getElementById('btn-sheet-config').style.display = id === 'banco' ? '' : 'none';
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
  if (id === 'tareas')       renderTareas();
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
  function makeBtns(tags, containerId, activeFn, activeVal) {
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
      btn.textContent = t;
      btn.addEventListener('click', function() { activeFn(this, t); });
      container.appendChild(btn);
    });
  }
  makeBtns(forTags, 'filtros-for', setForFilter, activeForFilter);
  makeBtns(catTags, 'filtros-cat', setCatFilter, activeCatFilter);
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
    return `<span style="display:inline-block;padding:2px 6px;border-radius:2px;font-size:${sz};font-family:var(--font-mono);margin:1px;background:${col}22;color:${col};border:1px solid ${col}44">${up(c)}</span>`;
  }).join('');
}
function forBadgeHTML(fors, small) {
  const sz = small ? '9px' : '10px';
  return (fors || []).filter(Boolean).map(f =>
    `<span style="display:inline-block;padding:2px 6px;border-radius:2px;font-size:${sz};font-family:var(--font-mono);margin:1px;background:rgba(255,255,255,0.04);color:var(--text-dim);border:1px solid var(--border)">${s(f)}</span>`
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
  const grid = document.getElementById('refs-grid');
  let filtered = referencias;
  if (activeForFilter !== 'all') filtered = filtered.filter(r => (r.for||[]).includes(activeForFilter));
  if (activeCatFilter !== 'all') filtered = filtered.filter(r => (r.cat||[]).includes(activeCatFilter));
  if (!filtered.length) {
    grid.style.gridTemplateColumns = '1fr';
    grid.innerHTML = `<div style="padding:60px;text-align:center;color:var(--text-muted)"><div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px">SIN REFERENCIAS CON ESTOS FILTROS</div></div>`;
    return;
  }
  grid.style.gridTemplateColumns = '';
  const totalPags = Math.ceil(filtered.length / porPagina);
  paginaActual = Math.max(1, Math.min(paginaActual, totalPags));
  const inicio = (paginaActual - 1) * porPagina;
  const slice  = filtered.slice(inicio, inicio + porPagina);
  const cards = slice.map(r => {
    const sel = ideaSelected(r);
    return `
    <div class="ref-page-card fade-in" onclick="openRefBoxdrop(${r._idx})">
      <div class="ref-page-thumb">
        ${(() => { const th = refThumbImmediate(r); const iid = 'rthumb-' + r._idx;
          return th
          ? `<img id="${iid}" class="ref-thumb-img" src="${s(th)}" alt="${s(r.title)}" loading="lazy" onerror="this.style.display='none';this.parentNode.querySelector('.ref-thumb-fallback').style.display='flex'"><span class="ref-thumb-fallback" style="display:none">${icon(s(r.icon)||'pin',30)}</span>`
          : `<img id="${iid}" class="ref-thumb-img" alt="${s(r.title)}" loading="lazy" style="display:none" onerror="this.style.display='none';this.parentNode.querySelector('.ref-thumb-fallback').style.display='flex'"><span class="ref-thumb-fallback" style="display:flex">${icon(s(r.icon)||'pin',30)}</span>`; })()}
        <button onclick="event.stopPropagation();toggleIdea(${r._idx},this)" title="Seleccionar idea para el lanzamiento activo"
          style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.45);border-radius:50%;padding:3px;border:none;cursor:pointer;display:flex;color:${sel?'var(--accent)':'#fff'};opacity:${sel?1:0.85};transition:all 0.2s;z-index:2">${icon(sel?'starFill':'star',15)}</button>
        ${r.link ? `<a href="${s(r.link)}" target="_blank" onclick="event.stopPropagation()" style="position:absolute;bottom:6px;right:6px;font-size:9px;font-family:var(--font-mono);background:rgba(0,0,0,0.7);padding:2px 6px;border-radius:2px;color:var(--accent);text-decoration:none;border:1px solid rgba(255,107,48,0.2);z-index:2">↗ VER</a>` : ''}
      </div>
      <div class="ref-page-info">
        <div class="ref-page-title">${s(r.title)}</div>
        ${r.hook ? `<div style="font-size:10px;color:var(--text-dim);font-style:italic;margin-bottom:5px;line-height:1.4">"${s(r.hook)}"</div>` : ''}
        <div style="margin-bottom:3px;display:flex;flex-wrap:wrap">${catBadgeHTML(r.cat, true) || '<span style="font-size:9px;color:var(--text-dim)">sin cat</span>'}</div>
        <div style="display:flex;flex-wrap:wrap">${forBadgeHTML(r.for, true)}</div>
      </div>
    </div>`;
  }).join('');
  const desde = inicio + 1, hasta = Math.min(inicio + porPagina, filtered.length);
  const paginacion = `
    <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:16px 4px 0;border-top:1px solid var(--border);margin-top:8px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Mostrar</span>
        ${[10,25,50].map(n => `<button onclick="cambiarPorPagina(${n})" style="padding:4px 9px;border-radius:3px;font-family:var(--font-mono);font-size:10px;cursor:pointer;border:1px solid ${porPagina===n?'var(--accent)':'var(--border)'};background:${porPagina===n?'rgba(255,107,48,0.1)':'transparent'};color:${porPagina===n?'var(--accent)':'var(--text-muted)'}">${n}</button>`).join('')}
      </div>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">${desde}–${hasta} de ${filtered.length}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" ${paginaActual===1?'disabled':''} onclick="cambiarPagina(${paginaActual-1})">‹</button>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:56px;text-align:center">Pág ${paginaActual}/${totalPags}</span>
        <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px" ${paginaActual===totalPags?'disabled':''} onclick="cambiarPagina(${paginaActual+1})">›</button>
      </div>
    </div>`;
  grid.innerHTML = cards + paginacion;
  // Resuelve async la miniatura real de los TikTok visibles que aún no están en caché (oEmbed + CORS).
  slice.forEach(r => {
    const link = s(r.link).trim();
    if (!r.thumb && /tiktok\.com/.test(link) && !_thumbCache()[link]) resolveTikTokThumb(link, 'rthumb-' + r._idx);
  });
}
function cambiarPagina(n) { paginaActual = n; renderBanco(); document.querySelector('.content').scrollTop = 0; }
function cambiarPorPagina(n) { porPagina = n; paginaActual = 1; renderBanco(); }

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
  const cats = (r.cat||[]).filter(Boolean);
  const fors = (r.for||[]).filter(Boolean);
  const a = activeLaunch();
  const sel = ideaSelected(r);
  document.getElementById('bd-title').textContent = up(r.title);
  document.getElementById('bd-date').textContent  = cats.map(up).join(' · ') || '—';
  document.getElementById('bd-idea').textContent  = s(r.title);
  document.getElementById('bd-hook').textContent   = s(r.hook) || 'Sin hook definido';
  document.getElementById('bd-desc').textContent   = s(r.comentarios) || 'Sin comentarios';

  // Tags & Keywords = cat + for
  const tagHTML = [
    ...cats.map(c => `<span class="brief-tag accent">${s(c)}</span>`),
    ...fors.map(f => `<span class="brief-tag">${s(f)}</span>`)
  ].join('');
  document.getElementById('bd-tags').innerHTML = tagHTML || '<span style="font-size:11px;color:var(--text-dim)">Sin tags</span>';

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
  const linkFooter = link
    ? `<div style="padding:10px;border-top:1px solid var(--border)"><a href="${s(link)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);font-family:var(--font-mono);text-decoration:none;word-break:break-all">${icon('link',12)} Abrir original</a></div>`
    : `<div style="padding:10px;border-top:1px solid var(--border);font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center">SIN LINK ASOCIADO</div>`;
  card.innerHTML = `
    <img id="bd-thumb-img" class="brief-thumb-img" src="${s(thumb)||''}" alt="${s(r.title)}" loading="lazy" style="${thumb?'':'display:none'}"
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
      style="padding:5px 12px;border-radius:3px;font-size:11px;font-family:var(--font-mono);cursor:pointer;border:1px solid rgba(255,107,48,0.3);background:rgba(255,107,48,0.06);color:var(--accent);transition:all 0.15s">+ Agregar al Calendario</button>`;
  const cres = document.getElementById('bd-content-result'); if (cres) cres.innerHTML = '';
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.boxdrop-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-brief').classList.add('active');
  document.querySelectorAll('.boxdrop-tab')[0].classList.add('active');
  document.getElementById('boxdrop').classList.add('open');
}

// ══════════════════════════════════════════
// AGREGAR AL CALENDARIO (del lanzamiento activo)
// ══════════════════════════════════════════
let calModalIdx = null;
function abrirModalCal(idx) {
  calModalIdx = idx;
  const r = referencias[idx];
  const a = activeLaunch();
  document.getElementById('mc-title').innerHTML =
    `${s(r.title)} ${a ? `<span style="color:var(--text-dim);font-weight:400">→ ${s(a.name)}</span>` : ''}`;
  document.getElementById('mc-fecha').value = '';
  document.getElementById('mc-status').textContent = '';
  document.getElementById('modal-cal').classList.add('open');
}
function cerrarModalCal(e) {
  if (!e || e.target === document.getElementById('modal-cal'))
    document.getElementById('modal-cal').classList.remove('open');
}
function confirmarCal() {
  const fecha = document.getElementById('mc-fecha').value;
  if (!fecha) { document.getElementById('mc-status').textContent = 'Selecciona una fecha'; return; }
  const a = activeLaunch();
  if (!a) { document.getElementById('mc-status').textContent = 'No hay lanzamiento activo'; return; }
  const r = referencias[calModalIdx];
  const cats = (r.cat||[]).filter(Boolean);
  a.cal.push({ id: 'ci-' + Date.now(), title: s(r.title), cat: cats[0]||'awareness', fecha, refIdx: calModalIdx, refLink: s(r.link) });
  saveLaunches();
  document.getElementById('mc-status').style.color = '#4ade80';
  document.getElementById('mc-status').textContent = `✓ Agregado a ${s(a.name)}`;
  setTimeout(() => { document.getElementById('modal-cal').classList.remove('open'); }, 800);
}

// ══════════════════════════════════════════
// CALENDARIO (scoped al lanzamiento activo)
// ══════════════════════════════════════════
const DAYS = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
const MESES_CAL = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
let weekOffset = 0;
let monthOffset = 0;
let calView = 'calendar';   // 'calendar' | 'kanban'
let calRange = '1w';        // '1w' | '2w' | '1m'

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
  const ls = (typeof artistLaunches === 'function') ? artistLaunches() : [];
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
  const a = activeLaunch();
  const base = (a && a.date) ? new Date(a.date + 'T00:00:00') : new Date(2026, 5, 2);
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
  const items = a ? a.cal : [];

  days.forEach(day => {
    const dk = dateKey(day);
    const isToday = day.getTime() === today.getTime();
    const isDrop = dk === dropKey;
    const outMonth = (month !== null && day.getMonth() !== month);
    const dayItems = items.filter(ci => ci.fecha === dk);
    const itemsHTML = dayItems.map(ci => {
      const col = catColor(ci.cat);
      const est = (ci.production && ci.production.estado) || 'pendiente';
      const estIcon = ESTADO_ICON[est] || '';
      return `<div onclick="openProduction('${a.id}','${ci.id}')" style="border-radius:3px;padding:3px 5px;font-size:9px;font-weight:500;margin-bottom:3px;cursor:pointer;line-height:1.3;background:${col}18;color:${col};border-left:2px solid ${col}" title="${s(ci.title)} · ${est}">${estIcon ? estIcon + ' ' : ''}${s(ci.title)}</div>`;
    }).join('');
    const dropBadge = isDrop ? `<div style="font-size:8px;font-family:var(--font-mono);color:var(--accent);letter-spacing:1px;margin-bottom:3px;display:flex;align-items:center;gap:4px">${icon('goals',10)} DROP</div>` : '';
    const div = document.createElement('div');
    div.className = 'cal-day' + (isToday ? ' today' : '');
    if (calRange === '1m') div.style.minHeight = '78px';
    if (isDrop) div.style.borderColor = 'rgba(255,107,48,0.5)';
    if (outMonth) div.style.opacity = '0.38';
    div.innerHTML = `<div class="cal-day-num">${day.getDate()}</div>${dropBadge}${itemsHTML}`;
    grid.appendChild(div);
  });

  const allCats = getUniqueTags('cat');
  const leyendaEl = document.getElementById('cal-leyenda');
  if (leyendaEl) {
    leyendaEl.innerHTML = allCats.length
      ? allCats.map(c => { const col = catColor(c); return `<div style="display:flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:2px;background:${col};display:inline-block;flex-shrink:0"></span><span style="font-size:11px;color:var(--text-muted)">${s(c)}</span></div>`; }).join('')
      : '<div style="font-size:10px;color:var(--text-dim)">Carga el banco para ver categorías</div>';
  }
  if (sideRefs) sideRefs.innerHTML = referencias.slice(0, 6).map((r) => {
    const cats = (r.cat||[]).filter(Boolean); const col = catColor(cats[0]);
    return `<div class="ref-item" onclick="openRefBoxdrop(${r._idx})">
      <div style="width:26px;height:26px;border-radius:4px;background:${col}22;color:${col};display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon(s(r.icon)||'pin',15)}</div>
      <div class="ref-info"><div class="ref-title">${s(r.title)}</div><div class="ref-meta">${cats.map(up).join(' · ') || '—'}</div></div>
    </div>`;
  }).join('');
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
  return `<div class="kanban-card" draggable="true" ondragstart="kanbanDrag(event,'${ci.id}')" onclick="openProduction('${launchId}','${ci.id}')" style="border-left:3px solid ${col}">
    <div class="kc-title">${s(ci.title)}</div>
    <div class="kc-meta">${fecha} · ${ESTADO_ICON[est] || ''} ${est}</div>
  </div>`;
}
function renderKanban() {
  const a = activeLaunch();
  const board = document.getElementById('cal-board');
  if (!a) { board.innerHTML = '<div class="empty-hint">Selecciona un lanzamiento.</div>'; return; }
  const items = a.cal || [];
  board.innerHTML = `<div class="kanban">${STAGE_DEF.map(st => {
    const cards = items.filter(ci => stageOf((ci.production && ci.production.estado) || 'pendiente') === st.key);
    return `<div class="kanban-col" data-stage="${st.key}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="kanbanDrop(event,'${st.key}')">
      <div class="kanban-head">
        <span>${st.title}</span>
        <span class="kanban-count">${cards.length}</span>
        <span class="kanban-info">ⓘ<span class="kanban-tip">${st.desc}</span></span>
      </div>
      <div class="kanban-cards">${cards.map(ci => kanbanCardHTML(a.id, ci)).join('') || '<div class="kanban-empty">Arrastra piezas aquí</div>'}</div>
    </div>`;
  }).join('')}</div>`;
}
function kanbanDrag(e, id) { e.dataTransfer.setData('text/plain', id); }
function kanbanDrop(e, stageKey) {
  e.preventDefault();
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  const id = e.dataTransfer.getData('text/plain');
  const a = activeLaunch(); if (!a) return;
  const ci = (a.cal || []).find(c => c.id === id); if (!ci) return;
  const st = STAGE_DEF.find(x => x.key === stageKey); if (!st) return;
  ensureProduction(ci);
  // si ya está en una etapa de esa columna, no cambiar; si no, poner el estado por defecto
  if (stageOf(ci.production.estado) !== stageKey) ci.production.estado = st.setTo;
  saveLaunches(); renderKanban();
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
  return `
    <div class="field-grid" style="margin-bottom:16px">
      <div class="field"><label>Objetivo</label><input class="input" value="${s(p.objetivo)}" onchange="prodSet('objetivo',this.value)" placeholder="¿Qué busca esta pieza?"></div>
      <div class="field"><label>Plataforma / formato</label><input class="input" value="${s(p.plataforma)}" onchange="prodSet('plataforma',this.value)" placeholder="TikTok · 9:16 · 15s"></div>
      <div class="field"><label>Responsable</label>${respSel}</div>
      <div class="field"><label>Fecha</label><input type="text" class="input" readonly placeholder="Elegir fecha…" value="${s(ci.fecha)}" onclick="openDayPicker(this)" onchange="prodSetFecha(this.value)" style="cursor:pointer"></div>
    </div>
    <div class="field" style="margin-bottom:16px"><label>Hook</label><input class="input" value="${s(p.hook)}" onchange="prodSet('hook',this.value)" placeholder="El gancho de los primeros segundos"></div>
    <div class="field"><label>Descripción / Brief</label><textarea class="textarea" onchange="prodSet('descripcion',this.value)" placeholder="Qué se graba, cómo, tono…">${s(p.descripcion)}</textarea></div>
    ${ci.refLink ? `<div style="margin-top:14px"><a href="${s(ci.refLink)}" target="_blank" style="font-size:11px;color:var(--accent);font-family:var(--font-mono);text-decoration:none">↗ Referencia de inspiración</a></div>` : ''}`;
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
  });
}
function buildContentPromptFromRef(r, l, art) {
  const adn = (art && art.adn) || {}; const d = (l && l.dna) || {};
  return contentPromptText({
    name: art && art.name, genre: art && art.genre, country: art && art.country,
    tone: (adn.personality || {}).tone, audience: (adn.audience || {}).ideal,
    launch: l && l.name, about: d.about, emotion: d.emotion, message: d.message, keywords: d.keywords,
    title: r.title, cat: (r.cat || [])[0], hook: r.hook, brief: r.comentarios,
  });
}
function contentPromptText(x) {
  return `Eres copywriter y creador de contenido musical para redes (TikTok/Reels/Shorts). Genera el contenido para UNA pieza, alineado al ADN del artista y a la campaña.

ARTISTA: ${s(x.name)} · Género: ${s(x.genre)} · País: ${s(x.country)}
Tono de comunicación: ${s(x.tone)} · Audiencia ideal: ${s(x.audience)}
CAMPAÑA (${s(x.launch)}): Concepto: ${s(x.about)} · Emoción: ${s(x.emotion)} · Mensaje: ${s(x.message)} · Keywords: ${s(x.keywords)}
PIEZA: ${s(x.title)} · Categoría: ${s(x.cat)} · Hook de referencia: ${s(x.hook)} · Brief: ${s(x.brief)}

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
    <div id="prod-content-result" style="margin-top:14px">${c ? contentResultHTML(c) : '<div class="empty-hint">Aún no hay contenido. Genera caption, script y hashtags a partir del ADN del artista + el Campaign DNA + esta pieza.</div>'}</div>`;
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
    ensureProduction(ci).content = obj;
    saveLaunches();
    renderProd();
  } catch (e) {
    res.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(e.message)} — revisa ${icon('settings',12)} API.</div>`;
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div class="brief-label" style="margin:0">Hashtags (${tags.length})</div><button class="btn btn-ghost" style="padding:3px 10px;font-size:10px" onclick="copyContent('hashtags',this)">Copiar todos</button></div>
      <div class="brief-tags">${tags.map(h => `<span class="brief-tag accent">${s(h).startsWith('#') ? s(h) : '#' + s(h)}</span>`).join('') || '—'}</div>
    </div>
  </div>`;
}
function contentBlock(label, key, pre) {
  const v = s(viewContent ? viewContent[key] : '');
  return `<div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div class="brief-label" style="margin:0">${label}</div><button class="btn btn-ghost" style="padding:3px 10px;font-size:10px" onclick="copyContent('${key}',this)">Copiar</button></div>
    <div class="brief-value" style="background:var(--surface2);padding:12px;border-radius:6px;white-space:pre-wrap;line-height:1.6;font-size:${pre ? '12px' : '13px'}">${v || '—'}</div>
  </div>`;
}
function contentTab(name, el) {
  const wrap = el.closest('.content-result'); if (!wrap) return;
  wrap.querySelectorAll('[data-cpane]').forEach(p => p.style.display = p.dataset.cpane === name ? '' : 'none');
  wrap.querySelectorAll('.ctab').forEach(t => t.classList.toggle('active', t.dataset.ctab === name));
}
function copyContent(key, btn) {
  if (!viewContent) return;
  const v = key === 'hashtags' ? (viewContent.hashtags || []).map(h => s(h).startsWith('#') ? s(h) : '#' + s(h)).join(' ') : s(viewContent[key]);
  if (navigator.clipboard) navigator.clipboard.writeText(v);
  if (btn) { const t = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = t; }, 1200); }
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
    res.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(e.message)} — revisa ${icon('settings',12)} API.</div>`;
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
        ? `<div class="brief-value" style="background:var(--surface2);padding:12px;border-radius:6px;line-height:1.6">${s(powRecommendation)}</div>`
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
  } catch (e) { rec.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(e.message)} — revisa ${icon('settings',12)} API.</div>`; }
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
  const t = powText();
  if (navigator.clipboard) navigator.clipboard.writeText(t);
  if (btn) { const o = btn.textContent; btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = o; }, 1200); }
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
      host.innerHTML = `<div class="empty-hint">Aún no hay metas para “${s(a.name)}”. Usa <b>“Sugerir con IA”</b> o <b>“+ Meta manual”</b>.</div>`;
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
      <div class="goal-target">${s(g.target)}<small>OBJETIVO</small></div>
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
  const ls = launches.filter(l => l.artistId === art.id);
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
  const statsHost = document.getElementById('label-stats');
  const listHost = document.getElementById('label-list');
  if (!artists.length) { statsHost.innerHTML = ''; listHost.innerHTML = '<div class="empty-hint">No hay artistas en este equipo todavía.</div>'; return; }
  const perf = artists.map(a => ({ art: a, p: artistPerformance(a) }));
  perf.sort((x, y) => (x.p.rank - y.p.rank) || ((x.p.avg == null ? 999 : x.p.avg) - (y.p.avg == null ? 999 : y.p.avg)));
  const need = perf.filter(x => x.p.rank === 0).length;
  const onTrack = perf.filter(x => x.p.rank === 3).length;
  const proximos = upcomingReleases(30).length;
  const legalPend = artists.reduce((a, ar) => a + artistLegalPending(ar.id), 0);
  const fin = artists.reduce((acc, ar) => { const f = artistFinance(ar.id); acc.inv += f.inv; acc.ing += f.ing; return acc; }, { inv: 0, ing: 0 });
  const card = (label, val, sub, col) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="${col ? `color:${col}` : ''}">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  statsHost.innerHTML =
    card('Artistas', artists.length, '') +
    card('Necesitan atención', need, need ? 'priorízalos' : 'todo en orden', need ? 'var(--accent2)' : '') +
    card('Próximos a salir', proximos, '≤ 30 días') +
    card('Legal pendiente', legalPend, legalPend ? 'requiere acción' : 'al día', legalPend ? 'var(--beat)' : '') +
    card('Recoupment', fin.inv ? Math.min(100, Math.round(fin.ing / fin.inv * 100)) + '%' : '—', `inv ${money(fin.inv)} · ing ${money(fin.ing)}`);
  listHost.innerHTML = perf.map(({ art, p }) => {
    const col = rankColor(p.rank);
    const launchInfo = p.latest ? `${s(p.latest.name)} · ${(STATUS_MAP[p.latest.status] || {}).tag || p.latest.status}` : 'sin lanzamientos';
    const cierre = p.end ? `${p.end}${p.dleft != null ? ` (${p.dleft >= 0 ? 'en ' + p.dleft + 'd' : Math.abs(p.dleft) + 'd atrás'})` : ''}` : '—';
    const bar = p.avg != null ? `<div style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;max-width:180px;margin-top:6px"><div style="height:100%;width:${Math.min(100, p.avg)}%;background:${col}"></div></div>` : '';
    const alerts = artistAlertCount(art.id), legal = artistLegalPending(art.id), next = nextRelease(art.id);
    const chips = [
      alerts ? `<span class="chip" style="cursor:default;color:var(--accent2)">${alerts} alerta${alerts > 1 ? 's' : ''}</span>` : '',
      legal ? `<span class="chip" style="cursor:default;color:var(--beat)">legal: ${legal}</span>` : '',
      next ? `<span class="chip" style="cursor:default">próximo: ${s(next.name)} · ${diasRestantes(next.date) >= 0 ? 'en ' + diasRestantes(next.date) + 'd' : 'hoy'}</span>` : '',
    ].filter(Boolean).join(' ');
    return `<div onclick="setActiveArtist('${art.id}');showPage('lanzamientos')" style="cursor:pointer;border:1px solid var(--border);border-left:3px solid ${col};border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div class="artist-avatar" style="width:40px;height:40px;font-size:15px">${up(art.name).slice(0, 1)}</div>
      <div style="flex:1;min-width:200px">
        <div style="font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px">${dotHTML(col, 9)} ${s(art.name)}</div>
        <div style="font-size:11px;font-family:var(--font-mono);color:var(--text-muted);margin-top:2px">${launchInfo} · cierre ${cierre}</div>
        ${chips ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${chips}</div>` : ''}
        ${bar}
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--font-display);font-size:26px;color:${col}">${p.avg != null ? p.avg + '%' : '—'}</div>
        <div style="font-size:10px;font-family:var(--font-mono);color:var(--text-muted)">${s(p.label)}${p.totalGoals ? ` · ${p.met}/${p.totalGoals} metas` : ''}</div>
      </div>
    </div>`;
  }).join('');
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
  return `Eres analista de marketing musical. Propón objetivos SMART (metas medibles) para la campaña de una canción.

ARTISTA: ${s(art.name)} · Géneros: ${s((adn.sound||{}).genres)} · Audiencia: ${s((adn.audience||{}).ideal)}
CAMPAÑA (${s(a.name)}): ${s(d.about)} · Mensaje: ${s(d.message)}
Plataforma principal: ${s((a.content||{}).platform)} · Pre/Post: ${a.preDays}/${a.postDays} días
HISTÓRICO DE LANZAMIENTOS DEL ARTISTA:
${hist}

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
    if (l) l.innerHTML = `${icon('warning',13)} ${s(e.message)} — revisa ${icon('settings',12)} API.`;
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
  if (!L.length) { host.innerHTML = `<div class="empty-hint">Aún no hay aprendizajes para ${s(art.name)}. Usa “Analizar con IA” (revisa tus lanzamientos y métricas) o registra uno manualmente.</div>`; return; }
  host.innerHTML = L.map((it, i) => {
    const cls = it.type === 'good' ? ' good' : (it.type === 'bad' ? ' bad' : '');
    return `<div class="learn-card${cls}">
      <button class="goal-btn reject" style="float:right" onclick="quitarAprendizaje(${i})" title="Quitar">${icon('close',12)}</button>
      <div class="learn-tag">${s(it.tag || art.name)}</div>
      <div class="learn-q">${s(it.q)}</div>
      <div class="learn-a">${s(it.a)}</div>
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
  } catch (e) { const l = document.getElementById('aprend-loading'); if (l) l.innerHTML = `${icon('warning',13)} ${s(e.message)} — revisa ${icon('settings',12)} API.`; }
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

ARTISTA: ${s(art.name)} · Géneros: ${s((adn.sound || {}).genres)} · Audiencia: ${s((adn.audience || {}).ideal)} · Tono: ${s((adn.personality || {}).tone)}
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
      <div class="panel-head"><span class="ph-icon">${icon('ai',18)}</span><span class="ph-title">Recomendaciones para ${s(art.name)}</span>
        <button class="btn btn-ghost" style="margin-left:auto;border-color:rgba(255,107,48,0.35);color:var(--accent)" onclick="generarEstrategiaIA()">${icon('ai',13)} Generar recomendaciones</button>
      </div>
      ${aiHintHTML(promptStr, 900)}
    </div>
    <div id="ia-results">${(st && st.items && st.items.length) ? strategyCardsHTML(st) : `<div class="empty-hint">Aún no hay recomendaciones para ${s(art.name)}. Genera con IA usando ADN, lanzamientos, métricas y aprendizajes. (Mientras más datos, mejores recomendaciones.)</div>`}</div>`;
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
  } catch (e) { res.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(e.message)} — revisa ${icon('settings',12)} API.</div>`; }
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
    <div style="display:flex;gap:10px;flex-wrap:wrap">${shots.map(sc => `<a href="${sc.dataUrl}" target="_blank" title="${s(sc.label)} · ${s(sc.scope)} · ${s(sc.date)}"><img src="${sc.dataUrl}" class="screenshot-thumb"></a>`).join('')}</div>`;
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
  l.metricEntries = Array.isArray(l.metricEntries) ? l.metricEntries : [];
  l.screenshots = Array.isArray(l.screenshots) ? l.screenshots : [];
  l.revenue = (l.revenue && typeof l.revenue === 'object') ? l.revenue : {};
  l.artistId = l.artistId || (artists[0] && artists[0].id);
  // CRM (Sprint 0): release type + tracklist (aditivo, no rompe nada)
  l.type = l.type || 'single';                                  // single | ep | album
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
function artistLaunches() { return launches.filter(l => l.artistId === currentArtistId); }

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
  const a = activeLaunch();
  if (!a) return '';
  const st = STATUS_MAP[a.status] || STATUS_MAP.planning;
  const opts = artistLaunches().map(l =>
    `<option value="${l.id}" ${l.id===a.id?'selected':''}>${s(l.name)}</option>`).join('');
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

function launchCardHTML(l) {
  const st = STATUS_MAP[l.status] || STATUS_MAP.planning;
  const cover = /^c[1-5]$/.test(l.cover) ? l.cover : 'c5';
  return `
    <div class="launch-card fade-in" onclick="openLaunch('${l.id}')">
      <button class="del-btn" title="Eliminar" onclick="event.stopPropagation();borrarLanzamiento('${l.id}')">${icon('close',12)}</button>
      <div class="launch-cover ${cover}">${up(l.name).slice(0,9)}</div>
      <div class="launch-info">
        <div class="launch-name">${s(l.name)}</div>
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
  const accent = (css.getPropertyValue('--accent').trim()) || '#FF6B30';
  const grid = (css.getPropertyValue('--border').trim()) || 'rgba(255,255,255,.08)';
  const txt = (css.getPropertyValue('--text-muted').trim()) || '#8a8a8a';
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 240);
  grad.addColorStop(0, accent + '40'); grad.addColorStop(1, accent + '00');
  if (_dashChart) { try { _dashChart.destroy(); } catch (e) {} }
  _dashChart = new Chart(ctx, {
    type: 'line',
    data: { labels: series.dates.map(fmtDateShort), datasets: [{ data: series.values, borderColor: accent, backgroundColor: grad, fill: true, tension: 0.32, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: accent, pointBorderColor: accent }] },
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

function renderDashboard() {
  renderDashLaunches();
  const art = activeArtist();
  const ls = artistLaunches();
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
          <span class="cal-item" style="margin:0;background:${col}18;color:${col};border-left:2px solid ${col}">${ESTADO_ICON[estado]||''} ${s(ci.title)}</span>
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
