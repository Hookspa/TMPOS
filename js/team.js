// ══════════════════════════════════════════
// SINCRONIZACIÓN EN LA NUBE (Supabase)
// ══════════════════════════════════════════
let _sb = null, _cloudTimer = null, syncState = 'off';
// ── Credenciales del proyecto, horneadas en la app (la anon key es PÚBLICA por diseño; la protege RLS+Auth) ──
// Los usuarios comunes nunca las ven ni las teclean. El super-admin puede sobreescribirlas (se guardan en localStorage).
const TEMPO_SUPABASE = {
  url: 'https://fzemsxyrzyssxprewwzs.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZW1zeHlyenlzc3hwcmV3d3pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2OTI3OTcsImV4cCI6MjA5NjI2ODc5N30.6rZw5gzIhUryZOzC2Mx4-kgrZSxWtjXSXS_-EL--FUg' // anon key pública (la protege RLS+Auth)
};
// Solo estos correos ven el "backend" (credenciales Supabase + config de IA).
const ADMIN_EMAILS = ['josh@hookspa.com'];
let _isSuperAdmin = false; // se confirma con el RPC is_super_admin() al cargar sesión (autoritativo del servidor)
function isAdmin() { return _isSuperAdmin || !!(_user && ADMIN_EMAILS.indexOf(((_user.email)||'').toLowerCase()) >= 0); }
function supaCfg() {
  let c = {}; try { c = JSON.parse(localStorage.getItem('ao_supabase')) || {}; } catch (e) {}
  return { url: c.url || TEMPO_SUPABASE.url, key: c.key || TEMPO_SUPABASE.key };
}
function saveSupaCfg(c) { localStorage.setItem('ao_supabase', JSON.stringify(c)); }
function cloudEnabled() { const c = supaCfg(); return !!(c.url && c.key); }
function ensureSupabaseLib() {
  return new Promise((res, rej) => {
    if (window.supabase && window.supabase.createClient) return res();
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    sc.onload = () => res(); sc.onerror = () => rej(new Error('No se pudo cargar la librería de Supabase (¿sin internet?)'));
    document.head.appendChild(sc);
  });
}
async function getSb() {
  const c = supaCfg(); if (!c.url || !c.key) return null;
  await ensureSupabaseLib();
  if (!_sb) _sb = window.supabase.createClient(c.url, c.key);
  return _sb;
}
function setSyncStatus(state, msg) {
  syncState = state;
  const map = { off:['○','var(--text-dim)','Sin conectar'], syncing:['◍','var(--beat)','Sincronizando…'], ok:['●','var(--ok)','Sincronizado'], error:['●','var(--accent2)', msg || 'Error'] };
  const m = map[state] || map.off;
  const st = document.getElementById('sync-status'); if (st) { st.textContent = m[2]; st.style.color = m[1]; }
  const dot = document.getElementById('sync-menu-dot'); if (dot) { dot.textContent = m[0]; dot.style.color = m[1]; }
  // Sidebar dot: visible at a glance next to the artist switcher (not buried in the
  // dropdown menu's "Sincronización" row) — only shown once cloud sync is configured at all.
  const sbDot = document.getElementById('sb-sync-dot');
  if (sbDot) {
    sbDot.style.display = cloudEnabled() ? 'block' : 'none';
    sbDot.style.background = m[1];
    sbDot.title = 'Sincronización: ' + m[2];
  }
}
function scheduleCloudSync() {
  if (!cloudEnabled() || !authed() || !canEdit()) return;
  clearTimeout(_cloudTimer);
  _cloudTimer = setTimeout(cloudSyncAll, 1500);
}
async function cloudSyncAll() {
  if (!cloudEnabled() || !authed()) return;
  try {
    const sb = await getSb(); if (!sb) return;
    setSyncStatus('syncing');
    const now = new Date().toISOString();
    const aRows = artists.map(a => ({ id: a.id, data: a, team_id: _teamId, owner: _user && _user.id, visibility: a.visibility || 'team', user_id: a.userId || null, updated_at: now }));
    const lRows = launches.map(l => ({ id: l.id, artist_id: l.artistId, team_id: _teamId, data: l, updated_at: now }));
    const r1 = await sb.from('artists').upsert(aRows);
    const r2 = await sb.from('launches').upsert(lRows);
    if (r1.error) throw new Error(r1.error.message);
    if (r2.error) throw new Error(r2.error.message);
    // tracks: best-effort (no rompe la sync si la tabla aún no existe)
    try {
      const tRows = tracks.map(t => ({ id: t.id, artist_id: t.artistId, team_id: _teamId, data: t, updated_at: now }));
      if (tRows.length) await sb.from('tracks').upsert(tRows);
    } catch (e) { /* tabla tracks aún no creada → ignorar */ }
    // people book (Label Copy): best-effort (una fila por persona, team-scoped)
    try {
      const people = (typeof lcPeople === 'function') ? lcPeople() : [];
      const pRows = people.filter(p => p && p.name).map(p => ({ id: p.id || ('lcp-' + s(p.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)), team_id: _teamId, data: p, updated_at: now }));
      if (pRows.length) await sb.from('labelcopy_people').upsert(pRows);
    } catch (e) { /* tabla labelcopy_people aún no creada → ignorar */ }
    // capa colaborativa (tasks/comments/activity/notifications/approvals): best-effort
    if (typeof collabCloudSync === 'function') { try { await collabCloudSync(sb, now); } catch (e) {} }
    setSyncStatus('ok');
  } catch (e) { setSyncStatus('error', friendlyError(e, 'sincronizar')); }
}
async function cloudLoad() {
  try {
    const sb = await getSb(); if (!sb) return;
    setSyncStatus('syncing');
    const aq = sb.from('artists').select('data, user_id');  if (_teamId) aq.eq('team_id', _teamId);
    const lq = sb.from('launches').select('data'); if (_teamId) lq.eq('team_id', _teamId);
    const [ar, lr] = await Promise.all([ aq, lq ]);
    if (ar.error) throw new Error(ar.error.message);
    if (lr.error) throw new Error(lr.error.message);
    // La nube es la ÚNICA fuente de verdad (aunque esté vacía). Nunca subimos residuos locales.
    artists = (ar.data || []).map(r => { const a = normalizeArtist(r.data); a.userId = r.user_id || null; return a; });
    launches = (lr.data || []).map(r => normalizeLaunch(r.data));
    // tracks: best-effort (si la tabla no existe, conserva los locales)
    try {
      const tq = sb.from('tracks').select('data'); if (_teamId) tq.eq('team_id', _teamId);
      const tr = await tq;
      if (!tr.error) { tracks = (tr.data || []).map(r => normalizeTrack(r.data)); }
    } catch (e) {}
    // people book: MERGE de la nube (no reemplaza — nunca pierde contactos locales)
    try {
      const pq = sb.from('labelcopy_people').select('data'); if (_teamId) pq.eq('team_id', _teamId);
      const pr = await pq;
      if (!pr.error && typeof lcPeopleSetAll === 'function') lcPeopleSetAll((pr.data || []).map(r => r.data));
    } catch (e) {}
    // capa colaborativa: cargar de la nube (best-effort)
    if (typeof collabCloudLoad === 'function') { try { await collabCloudLoad(sb, _teamId); } catch (e) {} }
    // pool de referencias de la comunidad (best-effort; se mezcla en el banco)
    if (typeof communityCloudLoad === 'function') { try { await communityCloudLoad(); } catch (e) {} }
    saveArtistsLocal(); saveLaunchesLocal();
    // Migrar launches de la nube que aún no tengan track, y persistir si cambió
    let _migrated = migrateLaunchesToTracks();
    if (typeof migrateEmbeddedTasks === 'function' && migrateEmbeddedTasks()) _migrated = true;
    // La nube puede contener claves de referencia anteriores a los IDs del catálogo unificado.
    if (typeof migrateCatalogLegacyState === 'function' && migrateCatalogLegacyState()) {
      saveLaunchesLocal();
      _migrated = true;
    }
    if (_migrated) scheduleCloudSync();
    if (!artists.find(a => a.id === currentArtistId)) currentArtistId = artists[0] && artists[0].id;
    renderSidebarArtist(); renderAllLaunches();
    const p = (document.querySelector('.page.active') || {}).id;
    if (p === 'page-perfil' || p === 'page-adn') renderArtistForms();
    if (p === 'page-dashboard') renderDashboard();
    if (p === 'page-compas' && typeof renderCompas === 'function') renderCompas();
    setSyncStatus('ok');
  } catch (e) { setSyncStatus('error', friendlyError(e, 'cargar tus datos')); }
}
async function cloudDelete(table, id) {
  if (!cloudEnabled()) return;
  try { const sb = await getSb(); if (sb) await sb.from(table).delete().eq('id', id); } catch (e) {}
}
// Modal de conexión
function abrirSync() {
  toggleArtistMenu(false);
  const admin = isAdmin();
  const adminBox = document.getElementById('sync-admin');
  const userNote = document.getElementById('sync-note-user');
  if (adminBox) adminBox.style.display = admin ? '' : 'none';
  if (userNote) userNote.style.display = admin ? 'none' : '';
  if (admin) {
    let raw = {}; try { raw = JSON.parse(localStorage.getItem('ao_supabase')) || {}; } catch (e) {}
    const c = supaCfg();
    const su = document.getElementById('sync-url'); if (su) su.value = raw.url || c.url || '';
    const sk = document.getElementById('sync-key'); if (sk) sk.value = raw.key || '';
  }
  setSyncStatus(cloudEnabled() ? syncState : 'off');
  document.getElementById('modal-sync').classList.add('open');
}
function cerrarSync(e) { if (!e || e.target === document.getElementById('modal-sync')) document.getElementById('modal-sync').classList.remove('open'); }
async function conectarSupabase() {
  const url = document.getElementById('sync-url').value.trim().replace(/\/$/, '');
  const key = document.getElementById('sync-key').value.trim();
  if (!url || !key) { setSyncStatus('error', 'Falta URL o anon key'); return; }
  saveSupaCfg({ url, key });
  setSyncStatus('syncing', 'Recargando para iniciar sesión…');
  setTimeout(() => location.reload(), 400); // recarga → authInit muestra el login
}
async function desconectarSupabase() {
  if (!await uiConfirm('¿Restablecer las credenciales a las horneadas por defecto en este navegador?')) return;
  localStorage.removeItem('ao_supabase'); _sb = null; setSyncStatus('off');
  location.reload();
}

// ── AUTH + EQUIPOS + INVITACIONES ──
let _user = null, _teamId = null, _teamMembers = [], _teamName = 'Mi equipo', _myRole = 'owner';
let _teams = []; // todos los equipos del usuario: [{id, name, role}]
// ── PLANES / TIERS / ASIENTOS (v0.11) ──
let _teamPlan = 'free';   // 'free' | 'pro' | 'manager' | 'custom'
let _teamStatus = 'active'; // 'active' | 'suspended'
// ── BRANDING DE WORKSPACE (Sprint 10d) ──
let _brandColor = null, _logoUrl = null, _brandName = null;
let _myArtistId = null, _restrictedArtist = false; // artista ligado a su ficha → solo ve lo suyo
function computeArtistRestriction() {
  _myArtistId = null; _restrictedArtist = false;
  if (!authed() || !_user) return;
  const mine = artists.find(a => a.userId && a.userId === _user.id);
  if (mine) { _myArtistId = mine.id; _restrictedArtist = !isOwner(); _isArtist = true; } // el owner nunca se restringe
}
function applyArtistRestriction() {
  computeArtistRestriction();
  document.body.classList.toggle('artist-restricted', _restrictedArtist);
  if (_restrictedArtist) {
    if (_myArtistId && currentArtistId !== _myArtistId) { currentArtistId = _myArtistId; if (typeof saveActiveArtist === 'function') saveActiveArtist(); }
    const ap = document.querySelector('.page.active');
    if (ap && (ap.id === 'page-label')) showPage('perfil');
  }
  applyRolePerms();
  if (typeof updateLabelNav === 'function') updateLabelNav();
}
let _isArtist = false;    // el miembro actual es "el artista" del equipo
let _teamCounters = { ideas_generadas_mes: 0, ideas_reset_date: null, banco_refreshes: 0, banco_refreshes_reset_date: null };

// ════════════════════════════════════════════════════════════════
// CAPA DE PERMISOS Y LÍMITES
// ────────────────────────────────────────────────────────────────
// BILLING_ENFORCED controla SOLO los límites ligados a pago (tiers/cuotas).
// Hoy en false → ningún límite numérico aplica (operación libre sin pagos).
// Los permisos por ROL (canDo) SIEMPRE están activos: son colaboración, no pago.
// Para abrir TODO durante desarrollo (incluidos roles), poner DEV_OPEN = true.
// ════════════════════════════════════════════════════════════════
const BILLING_ENFORCED = false;
const DEV_OPEN = false;

// Permisos por rol/asiento (no dependen de pago)
// ── MATRIZ DE CAPACIDADES (PLAN_CRM §3) ──
// Capacidades atómicas (verbo × recurso). Los roles de negocio son PRESETS de capacidades.
const CAPS = ['ver_crm','editar_crm','ver_audio','editar_audio','ver_legal','editar_legal',
  'ver_labelcopy','editar_labelcopy','ver_marketing','editar_marketing','ver_assets','editar_assets',
  'ver_data','editar_data','ver_finanzas','editar_finanzas','ver_reportes','generar_reportes',
  'gestionar_tareas','aprobar_tareas','gestionar_artista','gestionar_equipo','gestionar_workspace','admin_sello'];
const ROLE_PRESETS = {
  owner:         CAPS.slice(),                                  // todo, incl. gestionar_equipo/workspace + admin_sello + propiedad
  admin:         CAPS.filter(c => c !== 'admin_sello'),         // todo lo operativo salvo super-admin; NO es dueño del workspace (sin billing/transferir/eliminar)
  label_manager: CAPS.filter(c => c !== 'admin_sello' && c !== 'gestionar_workspace'), // full operativo; no toca branding/asientos
  manager:       ['ver_crm','editar_crm','ver_audio','ver_labelcopy','ver_legal','ver_marketing','editar_marketing','ver_assets','editar_assets','ver_data','editar_data','ver_finanzas','ver_reportes','generar_reportes','gestionar_tareas','aprobar_tareas','gestionar_artista'],
  artista:       ['ver_crm','editar_crm','ver_audio','editar_audio','ver_labelcopy','ver_legal','ver_marketing','editar_marketing','ver_assets','editar_assets','ver_data','editar_data','ver_reportes','generar_reportes','gestionar_tareas','gestionar_artista'],
  productor:     ['ver_crm','ver_audio','editar_audio','ver_assets','editar_assets','gestionar_tareas'],
  ingeniero:     ['ver_crm','ver_audio','editar_audio','gestionar_tareas'],
  abogado:       ['ver_crm','ver_legal','editar_legal','ver_labelcopy','editar_labelcopy','gestionar_tareas'],
  marketing:     ['ver_crm','ver_marketing','editar_marketing','ver_assets','editar_assets','ver_data','editar_data','ver_reportes','generar_reportes','ver_finanzas','gestionar_tareas'],
  disenador:     ['ver_crm','ver_assets','editar_assets','gestionar_tareas'],
  // Roles legacy del modelo actual (owner/editor/lector):
  editor:        ['ver_crm','editar_crm','ver_audio','editar_audio','ver_labelcopy','editar_labelcopy','ver_legal','editar_legal','ver_marketing','editar_marketing','ver_assets','editar_assets','ver_data','editar_data','ver_finanzas','ver_reportes','generar_reportes','gestionar_tareas','aprobar_tareas'],
  lector:        ['ver_crm','ver_audio','ver_labelcopy','ver_legal','ver_marketing','ver_assets','ver_data','ver_reportes'],
};
// Presets de NEGOCIO ofrecidos en la UI (con etiqueta legible). Los legacy editor/lector se mantienen por compat.
const PRESET_LABELS = {
  owner: 'Owner (dueño)', admin: 'Admin', label_manager: 'Label Manager', manager: 'Manager del artista',
  artista: 'Artista', productor: 'Productor', ingeniero: 'Ingeniero', abogado: 'Abogado',
  marketing: 'Marketing Manager', disenador: 'Diseñador', editor: 'Miembro (editor)', lector: 'Invitado / Lector',
};
const BUSINESS_PRESETS = ['admin','label_manager','manager','artista','productor','ingeniero','abogado','marketing','disenador','editor','lector'];
let _myPreset = null; // rol de negocio del miembro actual (team_members.seat_role); cae a derivado si está vacío
// Alcance del miembro (de la invitación): null = todo el workspace; {artistIds:[],releaseIds:[]} = restringido.
let _myScope = null;
function scopeAllows(scope) {
  if (!_myScope) return true;                 // sin restricción de alcance
  if (!scope) return true;                    // acción sin contexto de artista/release → no la limita el alcance
  const aOk = !_myScope.artistIds || !_myScope.artistIds.length || !scope.artistId || _myScope.artistIds.indexOf(scope.artistId) >= 0;
  const rOk = !_myScope.releaseIds || !_myScope.releaseIds.length || !scope.releaseId || _myScope.releaseIds.indexOf(scope.releaseId) >= 0;
  return aOk && rOk;
}
function currentPreset() {
  if (!authed()) return 'owner';
  if (isOwner()) return 'owner';                       // dueño del workspace (rol DB 'owner') → siempre owner
  if (_myPreset && ROLE_PRESETS[_myPreset]) return _myPreset;
  if (_myArtistId || _isArtist) return 'artista';      // artista vinculado → trabaja en lo suyo
  return myRole() === 'lector' ? 'lector' : 'editor';
}
function hasCap(cap) {
  if (DEV_OPEN || !authed()) return true;
  const preset = ROLE_PRESETS[currentPreset()] || [];
  return preset.indexOf(cap) >= 0;
}
// ── MODELO DE VERBOS COMPLETO (Sprint 10): ver/crear/editar/aprobar/eliminar × módulo ──
// Se compone sobre la matriz de caps para no duplicarla. `can(verbo, modulo, scope?)`.
const PERM_MODULES = ['crm','audio','legal','labelcopy','marketing','assets','data','finanzas','reportes','tareas','artista','equipo','workspace'];
// Política del verbo destructivo ELIMINAR por preset ('*' = todos los módulos).
const DELETE_POLICY = {
  owner: '*', admin: '*', label_manager: '*',
  manager:   ['crm','marketing','assets','tareas','data'],
  artista:   ['crm','marketing','assets','tareas'],
  productor: ['audio','assets','tareas'],
  ingeniero: ['audio','tareas'],
  abogado:   ['legal','labelcopy','tareas'],
  marketing: ['marketing','assets','data','tareas'],
  disenador: ['assets','tareas'],
  editor:    ['crm','audio','labelcopy','legal','marketing','assets','data','tareas'],
  lector:    [],
};
function can(verb, mod, scope) {
  if (DEV_OPEN || !authed()) return true;
  if (!scopeAllows(scope)) return false;               // alcance de invitación (artista/release) — Sprint 10b
  switch (verb) {
    case 'ver':    return hasCap('ver_' + mod) || hasCap('editar_' + mod);
    case 'crear':
    case 'editar':
      if (mod === 'reportes')  return hasCap('generar_reportes');
      if (mod === 'artista')   return hasCap('gestionar_artista');
      if (mod === 'equipo')    return hasCap('gestionar_equipo');
      if (mod === 'workspace') return hasCap('gestionar_workspace');
      return hasCap('editar_' + mod);
    case 'aprobar':  return hasCap('aprobar_tareas');
    case 'eliminar': {
      const pol = DELETE_POLICY[currentPreset()] || [];
      return pol === '*' || pol.indexOf(mod) >= 0;
    }
    default: return false;
  }
}
// Dueño del workspace (rol DB 'owner'): único que transfiere propiedad, borra el workspace y toca billing/asientos pagados.
function isWorkspaceOwner() { return isOwner(); }
function canManageWorkspace() { return hasCap('gestionar_workspace'); } // owner + admin + (10d branding)
// Acciones (compat con el código existente) → capacidad. Las no mapeadas = 'ver' libre.
const ACTION_CAP = {
  create_launch: 'editar_crm', edit_launch: 'editar_crm',
  use_ia_estrategica: 'editar_marketing', use_generador_ia: 'editar_marketing',
  banco_add: 'editar_marketing', calendar_edit: 'editar_marketing',
  export: 'generar_reportes', generar_reportes: 'generar_reportes',
  edit_perfil_adn: 'gestionar_artista',
  invite_members: 'gestionar_equipo', manage_roles: 'gestionar_equipo', assign_artist: 'gestionar_equipo',
  manage_workspace: 'gestionar_workspace', branding: 'gestionar_workspace',
};
function canDo(action) {
  if (DEV_OPEN || !authed()) return true; // demo/dev: todo permitido
  if (CAPS.indexOf(action) >= 0) return hasCap(action); // capacidad directa
  const cap = ACTION_CAP[action];                        // acción legacy → capacidad
  return cap ? hasCap(cap) : true;                        // ver = libre por defecto
}
// Guard para handlers: si no puede, avisa y devuelve false.
function requireCan(action, msg) {
  if (canDo(action)) return true;
  uiAlert(msg || 'Solo lectura · necesitas rol Editor u Owner para hacer esto.');
  return false;
}

// Límites numéricos por tier (ligados a pago). Devuelve { ok, msg }.
// Con BILLING_ENFORCED=false siempre { ok:true } → no limita nada.
function checkPlanLimit(kind, ctx) {
  if (!BILLING_ENFORCED || DEV_OPEN) return { ok: true };
  ctx = ctx || {};
  const plan = _teamPlan;
  const resetMsg = () => {
    const d = _teamCounters.ideas_reset_date ? new Date(_teamCounters.ideas_reset_date) : new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return next.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
  };
  switch (kind) {
    case 'create_launch': {
      const active = launches.filter(l => l.status === 'active').length;
      if (plan === 'free' && active >= 1)
        return { ok: false, msg: 'Completa tu lanzamiento actual para iniciar uno nuevo. (Plan Free)' };
      return { ok: true };
    }
    case 'banco_add': {
      if (plan === 'free' && (referencias.length >= 50))
        return { ok: false, msg: 'Alcanzaste el límite de 50 referencias del plan Free.' };
      return { ok: true };
    }
    case 'banco_refresh': {
      if (plan === 'free' && (_teamCounters.banco_refreshes || 0) >= 2)
        return { ok: false, msg: 'Usaste tus 2 actualizaciones del banco este mes (plan Free). Vuelven el ' + resetMsg() + '.' };
      return { ok: true };
    }
    case 'ideas_ia': {
      if (['pro', 'manager'].indexOf(plan) >= 0 && (_teamCounters.ideas_generadas_mes || 0) >= 12)
        return { ok: false, msg: 'Alcanzaste las 12 ideas de este mes. Vuelven el ' + resetMsg() + '.' };
      return { ok: true };
    }
    case 'ia_estrategica': {
      const done = launches.filter(l => l.status === 'complete').length;
      if (done < 3)
        return { ok: false, msg: 'La IA estratégica se activa después de tu 3er lanzamiento completado.' };
      return { ok: true, note: done < 5 ? 'Mejores resultados a partir del 5to lanzamiento completado.' : null };
    }
    default:
      return { ok: true };
  }
}
// Incrementa un contador del equipo en Supabase (best-effort).
async function bumpTeamCounter(field) {
  if (!BILLING_ENFORCED) return;
  _teamCounters[field] = (_teamCounters[field] || 0) + 1;
  try { const sb = await getSb(); if (sb && _teamId) await sb.from('teams').update({ [field]: _teamCounters[field] }).eq('id', _teamId); } catch (e) {}
}
// Ideas restantes del mes (para mostrar en UI). null = sin límite aplicable.
function ideasRestantes() {
  if (!BILLING_ENFORCED || ['pro', 'manager'].indexOf(_teamPlan) < 0) return null;
  return Math.max(0, 12 - (_teamCounters.ideas_generadas_mes || 0));
}
function authed() { return !!(_user && _teamId); }
function activeTeam() { return _teams.find(t => t.id === _teamId) || null; }
function myRole() { if (!authed()) return 'owner'; const t = activeTeam(); return (t && t.role) || 'editor'; }
function canEdit() { return myRole() !== 'lector' || !!_myArtistId; } // el artista vinculado edita lo suyo
function isOwner() { return myRole() === 'owner'; }
function applyRolePerms() {
  const r = authed() ? myRole() : null;
  const lector = (r === 'lector') && !_myArtistId; // el artista vinculado no queda en solo-lectura sobre lo suyo
  document.body.classList.toggle('role-lector', lector);
  document.body.classList.toggle('role-editor', r === 'editor');
  document.body.classList.toggle('role-owner', r === 'owner');
  const tip = 'Solo lectura · necesitas rol Editor u Owner';
  const nb = document.querySelector('.topbar .btn-primary');
  if (nb) nb.title = lector ? tip : '';
  applyRoleNav();
  applyRolePill();
}
// ── 10c · El menú lateral morfa por rol: oculta secciones que el rol no puede ver ──
// Cap de VISTA requerida por página (null = siempre visible).
const NAV_VIEW_CAP = {
  dashboard: null, lanzamientos: 'ver_crm', tareas: null, perfil: null, adn: null,
  banco: 'ver_marketing', ideas: 'ver_marketing', calendario: 'ver_marketing',
  objetivos: 'ver_marketing', metricas: 'ver_data', aprendizajes: 'ver_marketing', ia: 'ver_marketing',
};
function applyRoleNav() {
  if (!authed() || DEV_OPEN) { // demo/dev: todo visible
    document.querySelectorAll('.nav-item[data-page]').forEach(n => { if (n.id !== 'nav-label') n.style.display = ''; });
    return;
  }
  let hidActive = false;
  document.querySelectorAll('.nav-item[data-page]').forEach(n => {
    const pg = n.dataset.page;
    if (pg === 'label') return; // lo controla updateLabelNav (staff + 2 artistas)
    const cap = NAV_VIEW_CAP[pg];
    const show = (cap == null) || hasCap(cap);
    n.style.display = show ? '' : 'none';
    if (!show && n.classList.contains('active')) hidActive = true;
  });
  // Si la página activa quedó oculta, manda al usuario a una visible (su home por rol).
  if (hidActive && typeof showPage === 'function') showPage(roleHomePage());
}
// Página de aterrizaje según el rol (las secciones especializadas caen a su mejor vista disponible).
function roleHomePage() {
  const p = currentPreset();
  if (['productor','ingeniero','abogado','disenador','lector'].indexOf(p) >= 0) return 'tareas';
  return 'compas'; // "Dashboard" (centro de mando fusionado: roster + zoom de artista)
}
function applyRolePill() {
  const pill = document.querySelector('.role-pill'); if (!pill) return;
  if (!authed()) { pill.style.display = 'none'; return; }
  const p = currentPreset();
  if (p === 'owner') { pill.style.display = 'none'; return; } // el dueño no necesita el chip
  const ro = (myRole() === 'lector') && !_myArtistId;
  pill.style.display = 'inline-flex';
  pill.innerHTML = `<span data-icon="${ro ? 'eye' : 'team'}" data-isize="13"></span> ${PRESET_LABELS[p] || p}`;
  if (typeof hydrateIcons === 'function') hydrateIcons(pill);
}
const agVal = id => (document.getElementById(id) || {}).value || '';
function agStatus(msg, err) {
  const status = document.getElementById('ag-status');
  const error = document.getElementById('ag-error');
  if (status) status.textContent = err ? '' : (msg || '');
  if (error) error.textContent = err ? (msg || '') : '';
}
function agBusy(busy) {
  const card = document.getElementById('auth-card');
  if (card) card.setAttribute('aria-busy', busy ? 'true' : 'false');
  document.querySelectorAll('#auth-gate [data-auth-action]').forEach(el => { el.disabled = !!busy; });
}
function agCredentials(requirePassword) {
  const emailEl = document.getElementById('ag-email');
  const passEl = document.getElementById('ag-pass');
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passEl ? passEl.value : '';
  if (!email || (emailEl && !emailEl.checkValidity())) {
    agStatus('Escribe un correo válido.', true);
    if (emailEl) emailEl.focus();
    return null;
  }
  if (requirePassword && password.length < 6) {
    agStatus('La contraseña debe tener al menos 6 caracteres.', true);
    if (passEl) passEl.focus();
    return null;
  }
  return { email, password };
}
function showAuthGate(show) {
  const gate = document.getElementById('auth-gate');
  if (!gate) return;
  if (show) {
    document.querySelectorAll('dialog[open]').forEach(dialog => {
      try { dialog.close(); } catch (e) {}
    });
  }
  gate.classList.toggle('is-open', !!show);
  gate.setAttribute('aria-hidden', show ? 'false' : 'true');
  document.body.classList.toggle('auth-open', !!show);
  Array.from(document.body.children).forEach(el => {
    if (el === gate || el.tagName === 'SCRIPT') return;
    if (show && !el.inert) { el.inert = true; el.dataset.authInert = 'true'; }
    if (!show && el.dataset.authInert === 'true') { el.inert = false; delete el.dataset.authInert; }
  });
  if (show) {
    agBusy(false);
    requestAnimationFrame(() => {
      const email = document.getElementById('ag-email');
      if (gate.classList.contains('is-open') && email && !gate.contains(document.activeElement)) email.focus();
    });
  } else {
    agBusy(false);
    agStatus('');
  }
}

async function authInit() {
  const sb = await getSb(); if (!sb) return;
  const inv = new URL(location.href).searchParams.get('invite');
  if (inv) localStorage.setItem('ao_pending_invite', inv);
  sb.auth.onAuthStateChange((_e, session) => { handleSession(session); });
  const { data } = await sb.auth.getSession();
  handleSession(data ? data.session : null);
}
async function handleSession(session) {
  if (session && session.user) { _user = session.user; await onAuthed(); }
  else { _user = null; _teamId = null; showAuthGate(true); }
}
async function onAuthed() {
  const sb = await getSb();
  let invitedTeam = null;
  const pend = localStorage.getItem('ao_pending_invite');
  if (pend) {
    try { const r = await sb.rpc('accept_invite', { tok: pend }); if (!r.error && r.data) invitedTeam = r.data; } catch (e) {}
    localStorage.removeItem('ao_pending_invite');
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  }
  await loadTeams();
  if (!_teams.length) {
    const r = await sb.rpc('provision_team');
    if (r.error) { agStatus(friendlyError(r.error, 'configurar tu equipo'), true); showAuthGate(true); return; }
    await loadTeams();
  }
  // Si vino por invitación, abrir ese equipo; si no, el guardado o el primero.
  const saved = localStorage.getItem('ao_active_team');
  const pick = (invitedTeam && _teams.find(t => t.id === invitedTeam)) ? invitedTeam
             : (_teams.find(t => t.id === saved) ? saved : (_teams[0] && _teams[0].id));
  _teamId = pick || null;
  if (_teamId) localStorage.setItem('ao_active_team', _teamId);
  await loadTeam();
  // Cuenta suspendida → bloquear (el super-admin nunca se bloquea)
  if (_teamStatus === 'suspended' && !isAdmin()) {
    showAuthGate(true);
    agStatus('Tu cuenta está suspendida. Contacta al administrador.', true);
    setSyncStatus('error', 'Suspendida');
    return;
  }
  showAuthGate(false);
  await cloudLoad();
  applyArtistRestriction();
  renderSidebarArtist();
  setSyncStatus('ok');
}
// Carga TODOS los equipos del usuario (para el selector multi-equipo)
async function loadTeams() {
  const sb = await getSb(); if (!sb || !_user) return;
  const tm = await sb.from('team_members').select('team_id, role').eq('user_id', _user.id);
  const rows = tm.data || [];
  const ids = rows.map(r => r.team_id);
  let names = {};
  if (ids.length) {
    const tn = await sb.from('teams').select('id, name').in('id', ids);
    (tn.data || []).forEach(t => { names[t.id] = t.name; });
  }
  _teams = rows.map(r => ({ id: r.team_id, role: r.role, name: names[r.team_id] || 'Mi equipo' }));
}
// Carga miembros + nombre del equipo ACTIVO
async function loadTeam() {
  const sb = await getSb(); if (!sb || !_teamId) return;
  // Reset mensual de contadores (best-effort; no rompe si el RPC no existe aún)
  try { await sb.rpc('reset_monthly_counters', { tid: _teamId }); } catch (e) {}
  // Miembros + is_artist + seat_role + scope (con fallback en cascada si las columnas aún no existen)
  let tm = await sb.from('team_members').select('user_id, role, email, is_artist, seat_role, scope, seat_type').eq('team_id', _teamId);
  if (tm.error) tm = await sb.from('team_members').select('user_id, role, email, is_artist, seat_role, scope').eq('team_id', _teamId);
  if (tm.error) tm = await sb.from('team_members').select('user_id, role, email, is_artist').eq('team_id', _teamId);
  if (tm.error) tm = await sb.from('team_members').select('user_id, role, email').eq('team_id', _teamId);
  _teamMembers = tm.data || [];
  const mine = _teamMembers.find(m => m.user_id === (_user && _user.id));
  _isArtist = !!(mine && mine.is_artist);
  // Rol de negocio (preset) y alcance del miembro actual
  _myPreset = (mine && mine.seat_role && ROLE_PRESETS[mine.seat_role]) ? mine.seat_role : null;
  _myScope = (mine && mine.scope && (Array.isArray(mine.scope.artistIds) || Array.isArray(mine.scope.releaseIds))) ? mine.scope : null;
  // Plan + contadores del equipo (con fallback si las columnas aún no existen)
  _teamPlan = 'free';
  _teamCounters = { ideas_generadas_mes: 0, ideas_reset_date: null, banco_refreshes: 0, banco_refreshes_reset_date: null };
  try {
    const tr = await sb.from('teams').select('plan, ideas_generadas_mes, ideas_reset_date, banco_refreshes, banco_refreshes_reset_date').eq('id', _teamId).single();
    if (!tr.error && tr.data) {
      _teamPlan = tr.data.plan || 'free';
      _teamCounters = {
        ideas_generadas_mes: tr.data.ideas_generadas_mes || 0,
        ideas_reset_date: tr.data.ideas_reset_date || null,
        banco_refreshes: tr.data.banco_refreshes || 0,
        banco_refreshes_reset_date: tr.data.banco_refreshes_reset_date || null,
      };
    }
  } catch (e) {}
  // Estado de la cuenta (suspendida) — query separada para no romper si la columna no existe
  _teamStatus = 'active';
  try { const ss = await sb.from('teams').select('status').eq('id', _teamId).single(); if (!ss.error && ss.data) _teamStatus = ss.data.status || 'active'; } catch (e) {}
  // Branding del workspace (Sprint 10d) — query separada/resiliente; cachea para pintado instantáneo.
  _brandColor = null; _logoUrl = null; _brandName = null;
  try {
    const br = await sb.from('teams').select('brand_color, logo_url, brand_name').eq('id', _teamId).single();
    if (!br.error && br.data) {
      _brandColor = br.data.brand_color || null; _logoUrl = br.data.logo_url || null; _brandName = br.data.brand_name || null;
      localStorage.setItem('ao_brand', JSON.stringify({ color: _brandColor, logo: _logoUrl, name: _brandName }));
    }
  } catch (e) {}
  applyBranding();
  // ¿Soy super-admin? (autoritativo del servidor; cae a false si el RPC no existe aún)
  try { const sa = await sb.rpc('is_super_admin'); _isSuperAdmin = !(sa && sa.error) && !!(sa && sa.data); } catch (e) { _isSuperAdmin = false; }
  const t = activeTeam();
  _teamName = (t && t.name) || 'Mi equipo';
  applyRolePerms();
}
// Cambiar de equipo activo
async function switchTeam(id) {
  if (id === _teamId || !_teams.find(t => t.id === id)) return;
  _teamId = id; localStorage.setItem('ao_active_team', id);
  setSyncStatus('syncing');
  await loadTeam();
  await cloudLoad();
  applyArtistRestriction();
  renderSidebarArtist();
  if (document.getElementById('modal-team').classList.contains('open')) renderTeamModal();
  setSyncStatus('ok');
}
// Crear un equipo nuevo (RPC create_team en Supabase) y cambiarse a él
async function createTeam() {
  const sb = await getSb(); if (!sb) return;
  const name = (await uiPrompt('Nombre del nuevo equipo:', {title:'Nuevo equipo'}) || '').trim();
  if (!name) return;
  const r = await sb.rpc('create_team', { team_name: name });
  if (r.error) { uiAlert(friendlyError(r.error, 'crear el equipo')); return; }
  await loadTeams();
  await switchTeam(r.data);
}
// Mover un artista (y sus lanzamientos) a otro equipo
async function moveArtistToTeam(artistId, targetId) {
  if (!targetId || targetId === _teamId) return;
  if (!requireCan('assign_artist')) return;
  const a = artists.find(x => x.id === artistId); if (!a) return;
  if (!await uiConfirm(`¿Mover "${s(a.name)}" y sus lanzamientos al equipo "${s((_teams.find(t=>t.id===targetId)||{}).name)}"? Dejará de verse en el equipo actual.`)) return;
  const sb = await getSb(); if (!sb) return;
  try {
    setSyncStatus('syncing');
    const r1 = await sb.from('artists').update({ team_id: targetId }).eq('id', artistId);
    if (r1.error) throw new Error(r1.error.message);
    await sb.from('launches').update({ team_id: targetId }).eq('artist_id', artistId);
    // quitar de la vista local del equipo actual
    artists = artists.filter(x => x.id !== artistId);
    launches = launches.filter(l => l.artistId !== artistId);
    if (currentArtistId === artistId) currentArtistId = artists[0] && artists[0].id;
    saveArtistsLocal(); saveLaunchesLocal();
    renderSidebarArtist(); renderAllLaunches();
    if (document.getElementById('modal-team').classList.contains('open')) renderTeamModal();
    setSyncStatus('ok');
  } catch (e) { setSyncStatus('error', friendlyError(e, 'mover')); uiAlert(friendlyError(e, 'mover el artista')); }
}
async function signIn() {
  const values = agCredentials(true); if (!values) return;
  agBusy(true); agStatus('Verificando acceso…');
  try {
    const sb = await getSb();
    if (!sb) throw new Error('El servicio de acceso no está disponible.');
    const r = await sb.auth.signInWithPassword(values);
    if (r.error) { agBusy(false); agStatus(friendlyError(r.error, 'iniciar sesión'), true); }
  } catch (e) { agBusy(false); agStatus(friendlyError(e, 'iniciar sesión'), true); }
}
async function signUp() {
  const values = agCredentials(true); if (!values) return;
  agBusy(true); agStatus('Creando tu cuenta…');
  try {
    const sb = await getSb();
    if (!sb) throw new Error('El servicio de acceso no está disponible.');
    const r = await sb.auth.signUp(values);
    agBusy(false);
    if (r.error) return agStatus(friendlyError(r.error, 'crear la cuenta'), true);
    if (r.data && r.data.session) agStatus('Cuenta creada. Ya puedes entrar.');
    else agStatus('Cuenta creada. Revisa tu correo para confirmarla.');
  } catch (e) { agBusy(false); agStatus(friendlyError(e, 'crear la cuenta'), true); }
}
async function signInMagic() {
  const values = agCredentials(false); if (!values) return;
  agBusy(true); agStatus('Enviando el enlace seguro…');
  try {
    const sb = await getSb();
    if (!sb) throw new Error('El servicio de acceso no está disponible.');
    const r = await sb.auth.signInWithOtp({ email: values.email, options: { emailRedirectTo: location.href } });
    agBusy(false);
    if (r.error) agStatus(friendlyError(r.error, 'enviar el enlace'), true);
    else agStatus('Enviamos el enlace a ' + values.email + '.');
  } catch (e) { agBusy(false); agStatus(friendlyError(e, 'enviar el enlace'), true); }
}
async function signOutTempo() {
  const sb = await getSb(); if (sb) await sb.auth.signOut();
  _user = null; _teamId = null;
  location.reload();
}
// equipo
function abrirTeam() { toggleArtistMenu(false); renderTeamModal(); document.getElementById('modal-team').classList.add('open'); }
function cerrarTeam(e) { if (!e || e.target === document.getElementById('modal-team')) document.getElementById('modal-team').classList.remove('open'); }
function renderTeamModal() {
  const body = document.getElementById('team-body');
  const me = _user ? _user.email : '';
  const canEditName = isOwner();
  // Selector de equipos (si hay más de uno) + crear nuevo
  const teamsList = _teams.map(t => {
    const active = t.id === _teamId;
    return `<article style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ${active?'var(--accent)':'var(--border)'};border-radius:8px;background:${active?'color-mix(in srgb, var(--accent) 6%, transparent)':'transparent'}">
      <div class="artist-avatar" style="width:26px;height:26px;font-size:var(--text-xs)">${up(t.name||'?').slice(0,1)}</div>
      <div style="flex:1"><div style="font-size:var(--text-base);font-weight:500">${s(t.name)}</div><div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${s(t.role)}</div></div>
      ${active?'<span style="color:var(--accent);font-size:var(--text-sm)">● activo</span>':`<button type="button" class="card-open" onclick="switchTeam('${t.id}')">Cambiar ${icon('link',10)}</button>`}
    </article>`;
  }).join('');
  // Panel de asignación de artistas al equipo
  const otherTeams = _teams.filter(t => t.id !== _teamId);
  const userOpts = m => `<option value="">— sin asignar</option>` + _teamMembers.map(u => `<option value="${u.user_id}" ${m===u.user_id?'selected':''}>${s(u.email)||u.user_id}</option>`).join('');
  const assignList = canEdit() && artists.length ? artists.map(a => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
      <div class="artist-avatar" style="width:26px;height:26px;font-size:var(--text-xs)">${up(a.name||'?').slice(0,1)}</div>
      <span style="flex:1;min-width:90px;font-size:var(--text-base)">${s(a.name)}</span>
      ${isOwner() ? `<select class="input" style="width:auto;padding:4px 8px;font-size:var(--text-xs)" title="Usuario-artista (solo verá esta ficha)" onchange="setArtistUser('${a.id}',this.value)">${userOpts(a.userId)}</select>` : ''}
      ${otherTeams.length ? `<select class="input" style="width:auto;padding:4px 8px;font-size:var(--text-xs)" onchange="if(this.value){moveArtistToTeam('${a.id}',this.value);this.value='';}">
        <option value="">Mover a…</option>
        ${otherTeams.map(t => `<option value="${t.id}">${s(t.name)}</option>`).join('')}
      </select>` : ''}
    </div>`).join('') : `<div class="empty-hint">${artists.length ? '' : 'No hay artistas en este equipo.'}</div>`;
  body.innerHTML = `
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('tag',18)}</span><span class="ph-title">Tus equipos (${_teams.length})</span></div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">${teamsList}</div>
    <button class="btn btn-ghost" style="margin-bottom:18px;font-size:var(--text-sm)" onclick="createTeam()">+ Crear equipo nuevo</button>
    <div class="field" style="margin-bottom:16px"><label>Nombre del equipo activo</label>
      <div style="display:flex;gap:8px"><input class="input" id="team-name" value="${s(_teamName)}" ${canEditName?'':'disabled'}>${canEditName?'<button class="btn btn-ghost" onclick="renameTeam()">Guardar</button>':''}</div>
    </div>
    ${canManageWorkspace() ? `
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('settings',18)}</span><span class="ph-title">Marca del workspace</span><span class="ph-sub">logo · color · nombre</span></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:flex-end">
      <label style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">Color de acento
        <div style="display:flex;gap:6px;align-items:center;margin-top:3px"><input type="color" id="brand-color" value="${_hex(_brandColor)||'#FF6900'}" style="width:42px;height:32px;border:1px solid var(--border);border-radius:6px;background:none;cursor:pointer"><input class="input" id="brand-color-hex" value="${_hex(_brandColor)||''}" placeholder="#FF6900" style="width:90px;font-size:var(--text-sm);font-family:var(--font-ui)" oninput="var c=document.getElementById('brand-color');if(/^#?[0-9a-fA-F]{6}$/.test(this.value))c.value=this.value.replace(/^#?/,'#')"></div>
      </label>
      <label style="flex:1;min-width:160px;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">Nombre de marca
        <input class="input" id="brand-name" value="${s(_brandName)}" placeholder="(opcional)" style="font-size:var(--text-sm);margin-top:3px">
      </label>
    </div>
    <label style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);display:block;margin-bottom:10px">URL del logo (imagen)
      <input class="input" id="brand-logo" value="${s(_logoUrl)}" placeholder="https://…/logo.png" style="font-size:var(--text-sm);margin-top:3px">
    </label>
    <div style="display:flex;gap:8px;margin-bottom:18px">
      <button class="btn btn-primary" onclick="saveBranding()">Guardar marca</button>
      <button class="btn btn-ghost" onclick="saveBranding(true)">Restablecer a TEMPO</button>
    </div>` : ''}
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('mic',18)}</span><span class="ph-title">Artistas de ${s(_teamName)} (${artists.length})</span><span class="ph-sub">asigna a otro equipo</span></div>
    <div style="margin-bottom:18px">${assignList}</div>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('team',18)}</span><span class="ph-title">Miembros (${_teamMembers.length})</span><span class="ph-sub">tu rol: ${s(myRole())}</span></div>
    <div style="margin-bottom:18px">${_teamMembers.map(m => {
      const mine = m.user_id === (_user && _user.id);
      const curSeat = (m.seat_role && ROLE_PRESETS[m.seat_role]) ? m.seat_role : (m.role === 'owner' ? 'owner' : (m.role === 'lector' ? 'lector' : 'editor'));
      const roleOpts = ['owner'].concat(BUSINESS_PRESETS).map(p =>
        `<option value="${p}" ${curSeat===p?'selected':''}>${PRESET_LABELS[p]||p}</option>`).join('');
      const roleCtl = (isWorkspaceOwner() && !mine)
        ? `<select class="input" style="width:auto;padding:4px 8px;font-size:var(--text-xs)" title="Rol del miembro" onchange="updateMemberRole('${m.user_id}',this.value)">${roleOpts}</select>`
        : `<span style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${PRESET_LABELS[curSeat]||s(m.role)}</span>`;
      const revokeCtl = (isWorkspaceOwner() && !mine)
        ? `<button class="btn btn-ghost" style="padding:3px 7px;font-size:var(--text-2xs);color:var(--accent2);border-color:rgba(255,77,77,0.3)" title="Revocar acceso" onclick="removeMember('${m.user_id}','${s(m.email)}')">${icon('close',12)}</button>`
        : '';
      const artistCtl = isOwner()
        ? `<label style="display:flex;align-items:center;gap:4px;font-size:var(--text-2xs);font-family:var(--font-ui);color:${m.is_artist?'var(--accent)':'var(--text-dim)'};cursor:pointer" title="Marca al artista del equipo (solo 1)">
             <input type="checkbox" ${m.is_artist?'checked':''} onchange="assignArtist('${m.user_id}',this.checked)">${icon('mic',13)}</label>`
        : (m.is_artist ? `<span style="font-size:var(--text-2xs);color:var(--accent)" title="Artista del equipo">${icon('mic',13)}</span>` : '');
      const nm = (typeof _nameMap==='function') ? (_nameMap()[s(m.email).toLowerCase()] || '') : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div class="artist-avatar" style="width:28px;height:28px;font-size:var(--text-xs)">${up(nm||m.email||'?').slice(0,1)}</div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px">
          <input class="input" style="padding:4px 8px;font-size:var(--text-sm);max-width:170px" placeholder="Nombre (para @menciones)" value="${s(nm)}" onchange="if(typeof setMemberName==='function')setMemberName('${s(m.email)}',this.value)">
          <span style="font-size:var(--text-2xs);color:var(--text-dim);font-family:var(--font-ui)">${s(m.email)||m.user_id}${mine?' · tú':''}</span>
        </div>
        ${artistCtl}
        ${roleCtl}
        ${revokeCtl}
      </div>`;
    }).join('')}</div>
    <div style="font-size:var(--text-2xs);color:var(--text-dim);margin:-10px 0 16px;font-family:var(--font-ui);line-height:1.6">Owner: dueño del workspace (propiedad, asientos, branding) · Admin: todo lo operativo · roles especializados (Productor/Abogado/Marketing…) ven y editan solo su área · Lector: solo ve · ${icon('mic',12)} = el artista (edita Perfil/ADN).</div>
    ${canSeePrivate() ? `
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('lock',18)}</span><span class="ph-title">Asientos del workspace</span><span class="ph-sub">plan · ocupación</span></div>
    <div id="team-seats" style="margin-bottom:18px"></div>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('eye',18)}</span><span class="ph-title">Auditoría de archivos</span><span class="ph-sub">ver · copiar · descargar</span></div>
    <div id="team-audit" style="margin-bottom:18px"><div class="empty-hint">Cargando…</div></div>` : ''}
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('invite',18)}</span><span class="ph-title">Invitar al equipo</span><span class="ph-sub">rol · alcance · expiración</span></div>
    <div class="empty-hint" style="margin-bottom:10px">Genera un enlace con rol y alcance. Quien lo abra e inicie sesión se unirá con ese rol. El enlace puede caducar.</div>
    ${isWorkspaceOwner() || canDo('invite_members') ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <label style="flex:1;min-width:130px;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">Rol
        <select class="input" id="inv-role" style="font-size:var(--text-sm);margin-top:3px">${BUSINESS_PRESETS.map(p=>`<option value="${p}" ${p==='editor'?'selected':''}>${PRESET_LABELS[p]}</option>`).join('')}</select>
      </label>
      <label style="flex:1;min-width:130px;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">Alcance
        <select class="input" id="inv-scope" style="font-size:var(--text-sm);margin-top:3px"><option value="">Todo el workspace</option>${artists.map(a=>`<option value="${a.id}">Solo ${s(a.name)}</option>`).join('')}</select>
      </label>
      <label style="flex:1;min-width:110px;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">Expira
        <select class="input" id="inv-exp" style="font-size:var(--text-sm);margin-top:3px"><option value="7">En 7 días</option><option value="1">En 24 horas</option><option value="30">En 30 días</option><option value="">Nunca</option></select>
      </label>
    </div>
    <button class="btn btn-primary" onclick="createInvite()">Generar enlace de invitación</button>
    <div id="team-invite" style="margin-top:12px"></div>
    <div id="team-invites-pending" style="margin-top:14px"></div>` : '<div class="empty-hint">No tienes permiso para invitar.</div>'}
    <div class="panel-head" style="margin:18px 0 8px"><span class="ph-icon">${icon('contacts',18)}</span><span class="ph-title">Contactos para @menciones</span><span class="ph-sub">nombre + correo</span></div>
    <div class="empty-hint" style="margin-bottom:8px">Pre-registra a quien aún no se une (o ponle nombre a un correo): aparecerá en el autocompletado @ de los comentarios.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      <input class="input" id="contact-name" placeholder="Nombre" style="flex:1;min-width:120px;font-size:var(--text-sm)">
      <input class="input" id="contact-email" placeholder="correo@ejemplo.com" style="flex:1;min-width:150px;font-size:var(--text-sm)">
      <button class="btn btn-ghost" onclick="addContactName()">Agregar</button>
    </div>
    <div style="border-top:1px solid var(--border);margin-top:20px;padding-top:16px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:var(--text-xs);color:var(--text-dim);font-family:var(--font-ui)">${s(me)}</span>
      <button class="btn btn-ghost" style="color:var(--accent2);border-color:rgba(255,77,77,0.3)" onclick="signOutTempo()">Cerrar sesión</button>
    </div>`;
  renderPendingInvites(); // carga las invitaciones activas (best-effort)
  if (canSeePrivate()) { renderSeats(); renderAuditLog(); } // 10e/10f (best-effort)
}
// Guardar branding del workspace (Sprint 10d). reset=true → vuelve a la marca TEMPO.
async function saveBranding(reset) {
  if (!canManageWorkspace()) return uiAlert('Solo Owner/Admin pueden cambiar la marca del workspace.');
  const color = reset ? null : (_hex(agVal('brand-color-hex')) || _hex(agVal('brand-color')));
  const name = reset ? null : (agVal('brand-name').trim() || null);
  const logo = reset ? null : (agVal('brand-logo').trim() || null);
  _brandColor = color; _brandName = name; _logoUrl = logo;
  localStorage.setItem('ao_brand', JSON.stringify({ color, name, logo }));
  applyBranding();
  const sb = await getSb();
  if (sb && _teamId) {
    const r = await sb.from('teams').update({ brand_color: color, brand_name: name, logo_url: logo }).eq('id', _teamId);
    if (r && r.error) { uiAlert(friendlyError(r.error, 'guardar la marca en la nube') + ' (se quedó aplicada solo en este navegador por ahora.)'); return; }
  }
  uiToast(reset ? '✓ Marca restablecida' : '✓ Marca guardada');
  renderSidebarArtist();
}
// ── AUDITORÍA (Sprint 10e) ── registro append-only de ver/copiar/descargar de archivos privados + reportes.
// Quién puede VER archivos privados (confidenciales): roles de gestión.
function canSeePrivate() {
  if (DEV_OPEN || !authed()) return true;
  return isWorkspaceOwner() || canManageWorkspace() || hasCap('gestionar_equipo') || hasCap('editar_finanzas');
}
const AUDIT_LABEL = { ver: 'abrió', copiar: 'copió link de', descargar: 'descargó' };
async function logAudit(action, targetType, targetId, label) {
  if (!authed()) return; // sin sesión no hay auditoría
  try {
    const sb = await getSb(); if (!sb || !_teamId) return;
    await sb.from('audit_log').insert({
      team_id: _teamId, actor: (_user && _user.email) || (_user && _user.id) || 'desconocido',
      action, target_type: targetType, target_id: targetId || null, label: label || null,
    });
  } catch (e) {} // best-effort: si la tabla aún no existe, no rompe nada
}
async function renderAuditLog() {
  const host = document.getElementById('team-audit'); if (!host) return;
  const sb = await getSb(); if (!sb || !_teamId) { host.innerHTML = ''; return; }
  let r = await sb.from('audit_log').select('actor, action, target_type, label, created_at').eq('team_id', _teamId).order('created_at', { ascending: false }).limit(40);
  if (r.error) { host.innerHTML = '<div class="empty-hint">La auditoría no está disponible todavía para este workspace. Contacta a soporte si la necesitas.</div>'; return; }
  const rows = r.data || [];
  if (!rows.length) { host.innerHTML = '<div class="empty-hint">Sin actividad de archivos todavía.</div>'; return; }
  host.innerHTML = rows.map(e => {
    const nm = (typeof _nameMap === 'function') ? (_nameMap()[s(e.actor).toLowerCase()] || '') : '';
    const when = e.created_at ? new Date(e.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs)">
      <span style="flex:1;min-width:0"><strong>${s(nm || e.actor)}</strong> ${AUDIT_LABEL[e.action] || s(e.action)} ${s(e.label || e.target_type || '')}</span>
      <span style="color:var(--text-dim);font-family:var(--font-ui);white-space:nowrap">${when}</span>
    </div>`;
  }).join('');
}
// ── ASIENTOS / PLANES INTERNOS (Sprint 10f) ── maquinaria lista; BILLING_ENFORCED sigue off (no cobra).
const PLAN_SEATS = { free: 2, pro: 5, manager: 10, custom: 99 };
const PLAN_LABEL = { free: 'Free', pro: 'Pro', manager: 'Manager', custom: 'Custom' };
function renderSeats() {
  const host = document.getElementById('team-seats'); if (!host) return;
  const included = PLAN_SEATS[_teamPlan] || 2;
  const members = _teamMembers || [];
  const used = members.length;
  const addl = members.filter(m => m.seat_type === 'additional').length;
  const over = Math.max(0, used - included);
  const planSel = isWorkspaceOwner()
    ? `<select class="input" style="width:auto;padding:4px 8px;font-size:var(--text-xs)" onchange="setTeamPlan(this.value)">${Object.keys(PLAN_SEATS).map(p => `<option value="${p}" ${_teamPlan===p?'selected':''}>${PLAN_LABEL[p]}</option>`).join('')}</select>`
    : `<span class="chip on" style="cursor:default">${PLAN_LABEL[_teamPlan] || _teamPlan}</span>`;
  const list = members.map(m => {
    const nm = (typeof _nameMap === 'function') ? (_nameMap()[s(m.email).toLowerCase()] || '') : '';
    const seat = m.seat_type === 'additional' ? 'additional' : 'included';
    const ctl = isWorkspaceOwner()
      ? `<select class="input" style="width:auto;padding:3px 7px;font-size:var(--text-2xs)" onchange="setMemberSeat('${m.user_id}',this.value)"><option value="included" ${seat==='included'?'selected':''}>Incluido</option><option value="additional" ${seat==='additional'?'selected':''}>Adicional</option></select>`
      : `<span style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">${seat==='additional'?'adicional':'incluido'}</span>`;
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs)"><span style="flex:1;min-width:0">${s(nm || m.email || m.user_id)}</span>${ctl}</div>`;
  }).join('');
  host.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <span style="font-size:var(--text-xs);font-family:var(--font-ui);color:var(--text-muted)">Plan</span>${planSel}
      <span style="font-size:var(--text-xs);font-family:var(--font-ui);color:${over?'var(--beat)':'var(--text-muted)'}">${used} de ${included} asientos${over?` · +${over} adicional${over>1?'es':''}`:''}</span>
    </div>${list}
    <div style="font-size:var(--text-2xs);color:var(--text-dim);margin-top:6px;font-family:var(--font-ui)">Cobro desactivado (BILLING_ENFORCED=off): los asientos son informativos por ahora.</div>`;
}
async function setTeamPlan(plan) {
  if (!isWorkspaceOwner()) return;
  const sb = await getSb(); if (!sb || !_teamId) return;
  const r = await sb.from('teams').update({ plan }).eq('id', _teamId);
  if (r && r.error) { uiAlert(friendlyError(r.error, 'cambiar el plan')); return; }
  _teamPlan = plan; renderSeats(); uiToast('✓ Plan: ' + (PLAN_LABEL[plan] || plan));
}
async function setMemberSeat(userId, seatType) {
  if (!isWorkspaceOwner()) return;
  const sb = await getSb(); if (!sb || !_teamId) return;
  const r = await sb.from('team_members').update({ seat_type: seatType }).eq('team_id', _teamId).eq('user_id', userId);
  if (r && r.error) { uiAlert(friendlyError(r.error, 'cambiar el asiento')); return; }
  const m = _teamMembers.find(x => x.user_id === userId); if (m) m.seat_type = seatType;
  renderSeats();
}
async function renameTeam() {
  if (!requireCan('manage_roles')) return;
  const sb = await getSb(); if (!sb || !_teamId) return;
  const name = agVal('team-name').trim() || 'Mi equipo';
  await sb.from('teams').update({ name }).eq('id', _teamId);
  _teamName = name;
  const t = activeTeam(); if (t) t.name = name;
  renderSidebarArtist(); renderTeamModal();
}
async function createInvite() {
  if (!requireCan('invite_members')) return;
  const sb = await getSb(); if (!sb || !_teamId) return;
  const tok = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('inv-' + Date.now() + Math.random().toString(36).slice(2));
  const role = agVal('inv-role') || 'editor';
  const scopeArtist = agVal('inv-scope');
  const expDays = agVal('inv-exp');
  const row = { token: tok, team_id: _teamId };
  row.seat_role = role;
  if (scopeArtist) row.scope = { artistIds: [scopeArtist] };
  if (expDays) row.expires_at = new Date(Date.now() + parseInt(expDays, 10) * 86400000).toISOString();
  // Inserta con metadatos; si las columnas nuevas aún no existen, cae al insert mínimo.
  let r = await sb.from('invites').insert(row);
  if (r.error) r = await sb.from('invites').insert({ token: tok, team_id: _teamId });
  if (r.error) { document.getElementById('team-invite').innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(friendlyError(r.error, 'crear la invitación'))}</div>`; return; }
  const link = `${location.origin}${location.pathname}?invite=${tok}`;
  const meta = [PRESET_LABELS[role] || role, scopeArtist ? 'alcance: ' + s((artists.find(a => a.id === scopeArtist) || {}).name || '') : 'todo el workspace', expDays ? 'expira en ' + expDays + 'd' : 'sin caducidad'].join(' · ');
  document.getElementById('team-invite').innerHTML = `
    <div style="display:flex;gap:8px">
      <input class="input" id="invite-link" value="${link}" readonly style="font-size:var(--text-xs)">
      <button class="btn btn-ghost" onclick="copyInvite(this)">Copiar</button>
    </div>
    <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted);margin-top:5px">${meta}</div>`;
  renderPendingInvites();
}
// Lista de invitaciones activas (no usadas, no revocadas) con botón de revocar.
async function renderPendingInvites() {
  const host = document.getElementById('team-invites-pending'); if (!host) return;
  const sb = await getSb(); if (!sb || !_teamId) return;
  let r = await sb.from('invites').select('token, seat_role, scope, expires_at, used_at, revoked').eq('team_id', _teamId);
  if (r.error) { host.innerHTML = ''; return; } // tabla sin las columnas nuevas → no muestra el panel
  const now = Date.now();
  const live = (r.data || []).filter(i => !i.used_at && !i.revoked && (!i.expires_at || new Date(i.expires_at).getTime() > now));
  if (!live.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim);margin-bottom:6px">Invitaciones activas (${live.length})</div>` +
    live.map(i => {
      const a = i.scope && i.scope.artistIds && i.scope.artistIds[0] ? (artists.find(x => x.id === i.scope.artistIds[0]) || {}).name : '';
      const exp = i.expires_at ? new Date(i.expires_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : 'sin caducidad';
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs)">
        <span style="flex:1;min-width:0">${PRESET_LABELS[i.seat_role] || i.seat_role || 'Miembro'}${a ? ' · ' + s(a) : ''} <span style="color:var(--text-dim);font-family:var(--font-ui)">· ${exp}</span></span>
        <button class="btn btn-ghost" style="padding:3px 8px;font-size:var(--text-2xs);color:var(--accent2);border-color:rgba(255,77,77,0.3)" onclick="revokeInvite('${i.token}')">Revocar</button>
      </div>`;
    }).join('');
}
async function revokeInvite(token) {
  const sb = await getSb(); if (!sb) return;
  let r = await sb.from('invites').update({ revoked: true }).eq('token', token).eq('team_id', _teamId);
  if (r.error) r = await sb.from('invites').delete().eq('token', token).eq('team_id', _teamId); // fallback si no hay columna revoked
  if (r && r.error) { uiAlert(friendlyError(r.error, 'revocar la invitación')); return; }
  uiToast('✓ Invitación revocada');
  renderPendingInvites();
}
function copyInvite(btn) {
  const v = (document.getElementById('invite-link') || {}).value || '';
  if (navigator.clipboard) navigator.clipboard.writeText(v);
  if (btn) { const o = btn.textContent; btn.textContent = '✓'; setTimeout(() => { btn.textContent = o; }, 1200); }
}
// visibilidad por artista
function setArtistVisibility(id, vis) {
  if (!canEdit()) return; // el rol solo limita edición, no la visibilidad de lectura
  const a = artists.find(x => x.id === id); if (!a) return;
  a.visibility = vis; saveArtists(); // el upsert lleva la nueva visibilidad → RLS aplica quién la ve
  renderArtistForms();
}
// Marcar/desmarcar al artista del equipo (único por equipo → limpia los demás primero)
// Vincular un usuario-artista a SU ficha (solo verá esa ficha; el staff ve todas)
async function setArtistUser(artistId, userId) {
  if (!requireCan('assign_artist')) return;
  const a = artists.find(x => x.id === artistId); if (!a) return;
  a.userId = userId || null; saveArtistsLocal();
  const sb = await getSb();
  if (sb) { const r = await sb.from('artists').update({ user_id: userId || null }).eq('id', artistId); if (r && r.error) { uiAlert(friendlyError(r.error, 'vincular el artista')); } }
  renderTeamModal();
  uiToast(userId ? '✓ Artista vinculado a su ficha' : '✓ Vínculo quitado');
}
async function assignArtist(userId, makeArtist) {
  if (!requireCan('assign_artist')) return;
  const sb = await getSb(); if (!sb || !_teamId) return;
  try {
    if (makeArtist) {
      await sb.from('team_members').update({ is_artist: false }).eq('team_id', _teamId);
      const r = await sb.from('team_members').update({ is_artist: true }).eq('team_id', _teamId).eq('user_id', userId);
      if (r.error) throw new Error(r.error.message);
    } else {
      const r = await sb.from('team_members').update({ is_artist: false }).eq('team_id', _teamId).eq('user_id', userId);
      if (r.error) throw new Error(r.error.message);
    }
    await loadTeam(); renderTeamModal();
  } catch (e) { uiAlert(friendlyError(e, 'asignar el artista')); }
}
// Mapea un rol de negocio (preset) al rol DB que entiende RLS (owner/editor/lector).
function seatToDbRole(seat) {
  if (seat === 'owner') return 'owner';
  if (seat === 'lector') return 'lector';
  return 'editor'; // todos los demás presets escriben → rol DB 'editor'; la matriz de caps acota la UI
}
async function updateMemberRole(userId, seat) {
  if (!requireCan('manage_roles')) return;
  if (!isWorkspaceOwner()) return uiAlert('Solo el dueño del workspace puede cambiar roles.');
  const sb = await getSb(); if (!sb) return;
  const dbRole = seatToDbRole(seat);
  // Escribe seat_role + rol DB; si la columna seat_role aún no existe, cae a solo el rol DB.
  let r = await sb.from('team_members').update({ role: dbRole, seat_role: seat }).eq('team_id', _teamId).eq('user_id', userId);
  if (r && r.error) r = await sb.from('team_members').update({ role: dbRole }).eq('team_id', _teamId).eq('user_id', userId);
  if (r && r.error) { uiAlert(friendlyError(r.error, 'cambiar el rol')); return; }
  await loadTeam(); renderTeamModal();
}
// Revocar acceso: saca al miembro del equipo (solo el dueño).
async function removeMember(userId, email) {
  if (!isWorkspaceOwner()) return uiAlert('Solo el dueño del workspace puede revocar acceso.');
  if (userId === (_user && _user.id)) return uiAlert('No puedes revocarte a ti mismo.');
  const ok = await uiConfirm(`¿Revocar el acceso de ${email || 'este miembro'} al workspace?`);
  if (!ok) return;
  const sb = await getSb(); if (!sb) return;
  const r = await sb.from('team_members').delete().eq('team_id', _teamId).eq('user_id', userId);
  if (r && r.error) { uiAlert(friendlyError(r.error, 'revocar el acceso')); return; }
  uiToast('✓ Acceso revocado');
  await loadTeam(); renderTeamModal();
}
// olvidé mi contraseña (desde el login)
async function forgotPassword() {
  const values = agCredentials(false); if (!values) return;
  agBusy(true); agStatus('Enviando instrucciones…');
  try {
    const sb = await getSb();
    if (!sb) throw new Error('El servicio de acceso no está disponible.');
    const r = await sb.auth.resetPasswordForEmail(values.email, { redirectTo: location.href });
    agBusy(false);
    if (r.error) agStatus(friendlyError(r.error, 'enviar el enlace'), true);
    else agStatus('Enviamos las instrucciones a ' + values.email + '.');
  } catch (e) { agBusy(false); agStatus(friendlyError(e, 'enviar el enlace'), true); }
}
// ajustes de cuenta
function abrirCuenta() { toggleArtistMenu(false); renderCuenta(); document.getElementById('modal-account').classList.add('open'); }
function cerrarCuenta(e) { if (!e || e.target === document.getElementById('modal-account')) document.getElementById('modal-account').classList.remove('open'); }
function renderCuenta() {
  const body = document.getElementById('account-body');
  body.innerHTML = `
    <div class="field" style="margin-bottom:18px"><label>Correo</label><input class="input" value="${s(_user ? _user.email : '')}" readonly></div>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('key',18)}</span><span class="ph-title">Cambiar contraseña</span></div>
    <div class="field" style="margin-bottom:10px"><input class="input" id="acc-pass" type="password" placeholder="Nueva contraseña (mín. 6)"></div>
    <button class="btn btn-primary" onclick="cambiarPassword()">Actualizar contraseña</button>
    <div id="acc-status" style="font-family:var(--font-ui);font-size:var(--text-xs);margin-top:10px;min-height:14px;color:var(--text-muted)"></div>

    <div style="border-top:1px solid var(--border);margin-top:22px;padding-top:16px"></div>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('save',18)}</span><span class="ph-title">Respaldo de datos</span></div>
    <div class="empty-hint" style="margin-bottom:12px">Exporta una copia (.json) de tus artistas y lanzamientos, o restaura desde un archivo. La API key no se incluye por seguridad.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="exportarDatos()">⤓ Exportar backup (.json)</button>
      <button class="btn btn-ghost" onclick="importarDatos()">⤒ Importar backup</button>
    </div>

    <div style="border-top:1px solid var(--border);margin-top:22px;padding-top:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:var(--text-xs);color:var(--text-dim);font-family:var(--font-ui)">Equipo: ${s(_teamName)} · rol ${s(myRole())}</span>
      <button class="btn btn-ghost" style="color:var(--accent2);border-color:rgba(255,77,77,0.3)" onclick="signOutTempo()">Cerrar sesión</button>
    </div>`;
}
async function cambiarPassword() {
  const sb = await getSb(); const pass = (document.getElementById('acc-pass') || {}).value || '';
  const st = document.getElementById('acc-status');
  if (pass.length < 6) { st.style.color = 'var(--accent2)'; st.textContent = 'Mínimo 6 caracteres'; return; }
  const r = await sb.auth.updateUser({ password: pass });
  if (r.error) { st.style.color = 'var(--accent2)'; st.textContent = friendlyError(r.error, 'actualizar la contraseña'); }
  else { st.style.color = 'var(--ok)'; st.textContent = '✓ Contraseña actualizada'; }
}

// ══════════════════════════════════════════
// MODALES IN-APP (reemplazo de alert/confirm/prompt nativos)
// ══════════════════════════════════════════
let _uiResolve = null, _uiMode = 'alert', _toastTimer = null;
function uiModal(mode, message, opts) {
  opts = opts || {};
  _uiMode = mode;
  document.getElementById('ui-title').textContent = opts.title || (mode === 'confirm' ? 'Confirmar' : mode === 'prompt' ? '' : 'Aviso');
  document.getElementById('ui-message').textContent = message || '';
  const iw = document.getElementById('ui-input-wrap'), inp = document.getElementById('ui-input');
  iw.style.display = mode === 'prompt' ? '' : 'none';
  if (mode === 'prompt') { inp.value = opts.def || ''; inp.placeholder = opts.placeholder || ''; }
  const cancel = document.getElementById('ui-cancel');
  cancel.style.display = mode === 'alert' ? 'none' : '';
  cancel.textContent = opts.cancelText || 'Cancelar';
  const ok = document.getElementById('ui-ok');
  ok.textContent = opts.okText || (mode === 'alert' ? 'OK' : mode === 'confirm' ? 'Confirmar' : 'Aceptar');
  ok.style.borderColor = opts.danger ? 'rgba(255,77,77,.5)' : '';
  ok.style.color = opts.danger ? 'var(--accent2)' : '';
  document.getElementById('modal-ui').classList.add('open');
  if (mode === 'prompt') setTimeout(() => inp.focus(), 60);
  return new Promise(res => { _uiResolve = res; });
}
function uiModalResolve(ok) {
  const mode = _uiMode, r = _uiResolve; _uiResolve = null;
  document.getElementById('modal-ui').classList.remove('open');
  if (!r) return;
  if (mode === 'prompt') r(ok ? document.getElementById('ui-input').value : null);
  else if (mode === 'confirm') r(!!ok);
  else r(true);
}
function uiModalKey(e) { if (e.key === 'Enter') { e.preventDefault(); uiModalResolve(true); } else if (e.key === 'Escape') { uiModalResolve(false); } }
function uiModalBackdrop(e) { if (e.target === document.getElementById('modal-ui')) uiModalResolve(_uiMode === 'alert'); }
// API pública (promesas)
function uiAlert(message, opts) { return uiModal('alert', message, opts); }
function uiConfirm(message, opts) { return uiModal('confirm', message, opts); }
function uiPrompt(message, opts) { return uiModal('prompt', message, opts); }
// Toast no bloqueante para avisos de éxito breves
function uiToast(message, ms) {
  const el = document.getElementById('ui-toast'); if (!el) return;
  el.textContent = message;
  el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(20px)'; }, ms || 2600);
}

// Traduce errores técnicos (Postgres/Supabase/red/JS) a un mensaje en español que la persona
// que usa la app pueda entender y, cuando aplica, accionar. El error crudo siempre queda en
// consola para quien necesite depurar — nunca se pierde, solo deja de mostrarse en la UI.
// No usar para pantallas de admin/backend (isAdmin()): esa audiencia sí puede actuar sobre
// mensajes técnicos (faltan tablas, falta correr un .sql, etc.) y debe seguir viéndolos tal cual.
function friendlyError(e, actionLabel) {
  const raw = (e && e.message) || (typeof e === 'string' ? e : '') || '';
  console.error('[friendlyError]' + (actionLabel ? ' ' + actionLabel : ''), e);
  const low = raw.toLowerCase();
  const accion = actionLabel ? `No se pudo ${actionLabel}.` : 'No se pudo completar la acción.';
  if (/failed to fetch|networkerror|network request failed|load failed/.test(low))
    return `${accion} Revisa tu conexión a internet e intenta de nuevo.`;
  if (/jwt|session|not authenticated|401/.test(low))
    return `${accion} Tu sesión expiró — vuelve a iniciar sesión.`;
  if (/row-level security|permission denied|403|not authorized|forbidden/.test(low))
    return `${accion} No tienes permiso para hacer esto.`;
  if (/duplicate key|unique constraint|already exists/.test(low))
    return `${accion} Ya existe un registro con esos datos.`;
  if (/timeout|timed out/.test(low))
    return `${accion} La operación tardó demasiado. Intenta de nuevo.`;
  // Errores de autenticación (Supabase Auth) — ya bastante legibles en inglés, pero el resto
  // de la app está en español, así que se traducen los casos más comunes del login.
  if (/invalid login credentials/.test(low)) return `${accion} Correo o contraseña incorrectos.`;
  if (/user already registered/.test(low)) return `${accion} Ya existe una cuenta con ese correo — inicia sesión en vez de crear una nueva.`;
  if (/email not confirmed/.test(low)) return `${accion} Confirma tu correo antes de iniciar sesión (revisa tu bandeja de entrada).`;
  if (/password should be at least/.test(low)) return `${accion} La contraseña debe tener al menos 6 caracteres.`;
  // Errores de la API de IA (OpenAI/Anthropic/etc., configurada por la persona en Ajustes).
  if (/invalid[_ ]api[_ ]?key|incorrect api key/.test(low)) return `${accion} Tu API key no es válida — revísala en Ajustes.`;
  if (/insufficient_quota|insufficient quota|exceeded.*quota/.test(low)) return `${accion} Se acabó el crédito de tu cuenta de IA, o alcanzaste su límite de uso.`;
  if (/rate limit|too many requests|429/.test(low)) return `${accion} Demasiadas solicitudes a la IA por ahora — espera un momento e intenta de nuevo.`;
  return `${accion} Intenta de nuevo en un momento. Si el problema sigue, contacta a soporte.`;
}

// ══════════════════════════════════════════
// BACKEND SUPER-ADMIN (panel)
// ══════════════════════════════════════════
let _adminData = {};
const _money = (n, d) => '$' + (Number(n) || 0).toFixed(d == null ? 2 : d);
const _fdate = v => v ? new Date(v).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function abrirAdmin() {
  if (!isAdmin()) return;
  toggleArtistMenu(false);
  document.getElementById('modal-admin').classList.add('open');
  document.querySelectorAll('#admin-tabs .mtab').forEach(b => b.classList.toggle('active', b.dataset.atab === 'cuentas'));
  adminTab('cuentas');
}
function cerrarAdmin(e) { if (!e || e.target === document.getElementById('modal-admin')) document.getElementById('modal-admin').classList.remove('open'); }

async function adminTab(name, el) {
  document.querySelectorAll('#admin-tabs .mtab').forEach(b => { const on=b.dataset.atab===name; b.classList.toggle('active',on); b.setAttribute('aria-selected',String(on)); });
  const body = document.getElementById('admin-body');
  body.innerHTML = '<div class="empty-hint">Cargando…</div>';
  try {
    if (name === 'cuentas') await renderAdminCuentas();
    else if (name === 'uso') await renderAdminUso();
    else if (name === 'keys') renderAdminKeys();
    else if (name === 'descuentos') await renderAdminDescuentos();
    else if (name === 'admins') await renderAdminSupers();
  } catch (e) {
    body.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(e.message)}<br><span style="font-size:var(--text-2xs)">¿Corriste <b>admin_backend.sql</b> en Supabase?</span></div>`;
  }
}

// ── CUENTAS ──
async function renderAdminCuentas() {
  const sb = await getSb(); const r = await sb.rpc('admin_overview');
  if (r.error) throw new Error(r.error.message);
  const d = r.data || {}; _adminData.overview = d;
  const t = d.totals || {};
  const card = (label, val, sub) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${val}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
  const planChips = (d.by_plan || []).map(p => `<span class="chip">${s(p.plan)}: <b>${p.n}</b></span>`).join(' ');
  const rows = (d.teams || []).map(adminTeamRow).join('');
  document.getElementById('admin-body').innerHTML = `
    <div class="dashboard-grid" style="margin-bottom:16px">
      ${card('Equipos', t.teams || 0, `${t.active || 0} activos · ${t.suspended || 0} suspendidos`)}
      ${card('Usuarios', t.users || 0, '')}
      ${card('Llamadas IA', t.ia_calls || 0, 'histórico')}
      ${card('Costo IA', _money(t.ia_cost), `este mes ${_money(t.ia_cost_month)}`)}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${planChips}</div>
    <div style="display:flex;flex-direction:column;gap:8px">${rows || '<div class="empty-hint">Sin equipos.</div>'}</div>`;
}
function adminTeamRow(tm) {
  const planSel = ['free', 'pro', 'manager', 'custom'].map(p => `<option value="${p}" ${tm.plan === p ? 'selected' : ''}>${p}</option>`).join('');
  const suspended = tm.status === 'suspended';
  return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;${suspended ? 'opacity:.6;border-color:var(--accent2)' : ''}">
    <div style="flex:1;min-width:140px">
      <div style="font-size:var(--text-base);font-weight:500">${s(tm.name)} ${suspended ? '<span style="color:var(--accent2);font-size:var(--text-2xs)">· SUSPENDIDO</span>' : ''}</div>
      <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${tm.members} miembros · ${tm.artists} artistas · ${tm.launches} lanz. · IA ${_money(tm.ia_cost)} · últ. ${_fdate(tm.last_ia)}</div>
      <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">ideas/mes: ${tm.ideas_generadas_mes} · refresh: ${tm.banco_refreshes}</div>
    </div>
    <select class="input" style="width:auto;padding:4px 8px;font-size:var(--text-xs)" onchange="adminSetPlan('${tm.id}',this.value)" title="Plan">${planSel}</select>
    <button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--text-xs)" onclick="adminEditMembers('${tm.id}','${s(tm.name)}')">Miembros</button>
    <button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--text-xs)" onclick="adminResetCounters('${tm.id}')" title="Resetear contadores">↺</button>
    <button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--text-xs);color:${suspended ? 'var(--ok)' : 'var(--accent2)'}" onclick="adminSetStatus('${tm.id}','${suspended ? 'active' : 'suspended'}')">${suspended ? 'Activar' : 'Suspender'}</button>
  </div>`;
}
async function adminRpc(fn, args, okMsg) {
  const sb = await getSb(); const r = await sb.rpc(fn, args || {});
  if (r.error) { uiAlert(r.error.message); return false; }
  return true;
}
async function adminSetPlan(tid, plan) { if (await adminRpc('admin_set_plan', { tid, new_plan: plan })) adminTab('cuentas'); }
async function adminSetStatus(tid, st) {
  if (st === 'suspended' && !await uiConfirm('¿Suspender esta cuenta? El equipo no podrá acceder.', {danger:true, okText:'Suspender'})) return;
  if (await adminRpc('admin_set_status', { tid, new_status: st })) adminTab('cuentas');
}
async function adminResetCounters(tid) { if (await uiConfirm('¿Resetear contadores (ideas/mes y refreshes) de este equipo?') && await adminRpc('admin_reset_counters', { tid })) adminTab('cuentas'); }
async function adminEditMembers(tid, name) {
  const body = document.getElementById('admin-body'); body.innerHTML = '<div class="empty-hint">Cargando miembros…</div>';
  const sb = await getSb(); const r = await sb.rpc('admin_team_members', { tid });
  if (r.error) { body.innerHTML = `<div class="empty-hint" style="border-color:var(--accent2)">${icon('warning',13)} ${s(r.error.message)}</div>`; return; }
  const rows = (r.data || []).map(m => {
    const roleSel = ['owner', 'editor', 'lector'].map(x => `<option value="${x}" ${m.role === x ? 'selected' : ''}>${x}</option>`).join('');
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:var(--text-base)">${s(m.email) || m.user_id}</span>
      <label style="display:flex;align-items:center;gap:4px;font-size:var(--text-2xs);font-family:var(--font-ui);color:${m.is_artist ? 'var(--accent)' : 'var(--text-dim)'};cursor:pointer">
        <input type="checkbox" ${m.is_artist ? 'checked' : ''} onchange="adminSetArtist('${tid}','${m.user_id}',this.checked,'${s(name)}')">${icon('mic',13)}</label>
      <select class="input" style="width:auto;padding:4px 8px;font-size:var(--text-xs)" onchange="adminSetMemberRole('${tid}','${m.user_id}',this.value,'${s(name)}')">${roleSel}</select>
    </div>`;
  }).join('');
  body.innerHTML = `<button class="btn btn-ghost" style="margin-bottom:12px;font-size:var(--text-sm)" onclick="adminTab('cuentas')">← Volver a cuentas</button>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('team',18)}</span><span class="ph-title">Miembros de ${s(name)}</span></div>
    <div>${rows || '<div class="empty-hint">Sin miembros.</div>'}</div>`;
}
async function adminSetMemberRole(tid, uid, role, name) { if (await adminRpc('admin_set_member_role', { tid, uid, new_role: role })) adminEditMembers(tid, name); }
async function adminSetArtist(tid, uid, val, name) { if (await adminRpc('admin_set_artist', { tid, uid, val })) adminEditMembers(tid, name); }

// ── USO IA ──
async function renderAdminUso() {
  const sb = await getSb(); const r = await sb.rpc('admin_usage', { days: 30 });
  if (r.error) throw new Error(r.error.message);
  const d = r.data || {}; _adminData.usage = d;
  const byModel = (d.by_model || []).map(m => `<tr>
    <td style="padding:6px 8px;font-family:var(--font-ui);font-size:var(--text-xs)">${s(m.model)}</td>
    <td style="padding:6px 8px;text-align:right">${m.calls}</td>
    <td style="padding:6px 8px;text-align:right;font-family:var(--font-ui);font-size:var(--text-xs)">${(m.in_tok || 0).toLocaleString()} / ${(m.out_tok || 0).toLocaleString()}</td>
    <td style="padding:6px 8px;text-align:right;color:var(--accent)">${_money(m.cost, 4)}</td></tr>`).join('');
  const recent = (d.recent || []).map(u => `<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:var(--text-xs)">
    <span style="font-family:var(--font-ui);color:var(--text-dim);white-space:nowrap">${_fdate(u.created_at)}</span>
    <span style="flex:1">${s(u.team) || '—'} · ${s(u.feature) || s(u.model)}</span>
    <span style="font-family:var(--font-ui);color:var(--accent)">${_money(u.cost, 4)}</span></div>`).join('');
  const totCost = (d.by_model || []).reduce((a, m) => a + (+m.cost || 0), 0);
  document.getElementById('admin-body').innerHTML = `
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('zap',18)}</span><span class="ph-title">Consumo de IA (últimos 30 días)</span><span class="ph-sub">total ${_money(totCost, 4)}</span></div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <thead><tr style="text-align:left;font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted);text-transform:uppercase">
        <th style="padding:6px 8px">Modelo</th><th style="padding:6px 8px;text-align:right">Llamadas</th><th style="padding:6px 8px;text-align:right">Tokens in/out</th><th style="padding:6px 8px;text-align:right">Costo</th></tr></thead>
      <tbody>${byModel || '<tr><td colspan="4" style="padding:10px;color:var(--text-dim)">Sin uso registrado todavía.</td></tr>'}</tbody>
    </table>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('clock',18)}</span><span class="ph-title">Últimas llamadas</span></div>
    <div>${recent || '<div class="empty-hint">Sin llamadas registradas.</div>'}</div>`;
}

// ── KEYS / APIs ──
function renderAdminKeys() {
  const c = supaCfg();
  const lastIa = (_adminData.usage && (_adminData.usage.recent || [])[0]) || (_adminData.overview && null);
  const row = (label, val, note) => `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted);text-transform:uppercase;letter-spacing:var(--track-caps)">${label}</div>
    <div style="font-family:var(--font-ui);font-size:var(--text-sm);word-break:break-all;margin-top:3px">${val}</div>
    ${note ? `<div style="font-size:var(--text-2xs);color:var(--text-dim);margin-top:3px">${note}</div>` : ''}</div>`;
  document.getElementById('admin-body').innerHTML = `
    <div class="empty-hint" style="margin-bottom:14px">Inventario de APIs/keys del app. Solo tú (super-admin) ves esto. La key de Anthropic es un <b style="color:var(--text-muted)">secreto del servidor</b> y nunca se expone en el navegador.</div>
    ${row('Supabase · Project URL', s(c.url), 'pública')}
    ${row('Supabase · anon key', '<span style="color:var(--ok)">configurada '+icon('check',11)+'</span> ' + (c.key ? '<span style="color:var(--text-dim)">…' + s(c.key.slice(-6)) + '</span>' : '<span style="color:var(--accent2)">falta</span>'), 'pública por diseño (la protege RLS + Auth)')}
    ${row('Anthropic · API key', '<span style="color:var(--ok)">secreto en servidor '+icon('check',11)+'</span> <span style="color:var(--text-dim)">•••• (Edge Function)</span>', 'No accesible desde el cliente. Editar: Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY')}
    ${row('Edge Function · claude', '<span style="color:var(--ok)">desplegada</span>', 'Proxy seguro a Anthropic (verify_jwt on). Inserta uso en ai_usage.')}
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost" style="font-size:var(--text-sm)" onclick="adminTab('uso',document.querySelector('[data-atab=uso]'))">Ver uso de IA →</button>
      <button class="btn btn-ghost" style="font-size:var(--text-sm)" onclick="abrirSync()">Editar credenciales Supabase →</button>
    </div>`;
}

// ── DESCUENTOS ──
async function renderAdminDescuentos() {
  const sb = await getSb(); const r = await sb.from('discount_codes').select('*').order('created_at', { ascending: false });
  if (r.error) throw new Error(r.error.message);
  const list = (r.data || []).map(dc => {
    const val = dc.kind === 'percent' ? `${dc.value}%` : _money(dc.value);
    const exp = dc.expires_at ? ('vence ' + dc.expires_at) : 'sin vencimiento';
    const uses = (dc.max_uses != null) ? `${dc.used_count}/${dc.max_uses}` : `${dc.used_count}/∞`;
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;${dc.active ? '' : 'opacity:.55'}">
      <div style="flex:1;min-width:140px">
        <div style="font-size:var(--text-base);font-weight:600;font-family:var(--font-ui);letter-spacing:var(--track-caps)">${s(dc.code)} <span style="color:var(--accent)">${val}</span></div>
        <div style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-muted)">${dc.plan ? 'plan ' + s(dc.plan) : 'cualquier plan'} · usos ${uses} · ${exp}${dc.note ? ' · ' + s(dc.note) : ''}</div>
      </div>
      <button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--text-xs)" onclick="adminToggleDiscount('${s(dc.code)}',${!dc.active})">${dc.active ? 'Desactivar' : 'Activar'}</button>
      <button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--text-xs);color:var(--accent2)" onclick="adminDeleteDiscount('${s(dc.code)}')">${icon('close',12)}</button>
    </div>`;
  }).join('');
  document.getElementById('admin-body').innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-head" style="margin-bottom:10px"><span class="ph-icon">${icon('tag',18)}</span><span class="ph-title">Nuevo código</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
        <div class="field"><label>Código</label><input class="input" id="dc-code" placeholder="LANZA20" style="text-transform:uppercase"></div>
        <div class="field"><label>Tipo</label><select class="input" id="dc-kind"><option value="percent">% descuento</option><option value="fixed">monto fijo</option></select></div>
        <div class="field"><label>Valor</label><input class="input" id="dc-value" inputmode="decimal" placeholder="20"></div>
        <div class="field"><label>Plan</label><select class="input" id="dc-plan"><option value="">cualquiera</option><option value="pro">pro</option><option value="manager">manager</option><option value="custom">custom</option></select></div>
        <div class="field"><label>Máx. usos</label><input class="input" id="dc-max" inputmode="numeric" placeholder="∞"></div>
        <div class="field"><label>Vence</label><input class="input" id="dc-exp" type="date"></div>
        <div class="field" style="grid-column:1/-1"><label>Nota</label><input class="input" id="dc-note" placeholder="Opcional (ej. campaña verano)"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="adminCreateDiscount()">Crear código</button>
    </div>
    <div class="panel-head" style="margin-bottom:8px"><span class="ph-icon">${icon('checklist',18)}</span><span class="ph-title">Códigos (${(r.data || []).length})</span></div>
    <div style="display:flex;flex-direction:column;gap:8px">${list || '<div class="empty-hint">Aún no hay códigos.</div>'}</div>`;
}
async function adminCreateDiscount() {
  const code = (document.getElementById('dc-code').value || '').trim().toUpperCase();
  if (!code) { uiAlert('Escribe un código.'); return; }
  const obj = {
    code, kind: document.getElementById('dc-kind').value,
    value: parseFloat(document.getElementById('dc-value').value) || 0,
    plan: document.getElementById('dc-plan').value || null,
    max_uses: parseInt(document.getElementById('dc-max').value) || null,
    expires_at: document.getElementById('dc-exp').value || null,
    note: (document.getElementById('dc-note').value || '').trim() || null,
  };
  const sb = await getSb(); const r = await sb.from('discount_codes').insert(obj);
  if (r.error) { uiAlert(r.error.message); return; }
  adminTab('descuentos');
}
async function adminToggleDiscount(code, active) {
  const sb = await getSb(); const r = await sb.from('discount_codes').update({ active }).eq('code', code);
  if (r.error) { uiAlert(r.error.message); return; } adminTab('descuentos');
}
async function adminDeleteDiscount(code) {
  if (!await uiConfirm('¿Eliminar el código ' + code + '?', {danger:true, okText:'Eliminar'})) return;
  const sb = await getSb(); const r = await sb.from('discount_codes').delete().eq('code', code);
  if (r.error) { uiAlert(r.error.message); return; } adminTab('descuentos');
}

// ── SUPER-ADMINS ──
async function renderAdminSupers() {
  const sb = await getSb(); const r = await sb.from('super_admins').select('*').order('added_at');
  if (r.error) throw new Error(r.error.message);
  const me = (_user && (_user.email || '').toLowerCase());
  const rows = (r.data || []).map(a => {
    const mine = (a.email || '').toLowerCase() === me;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="flex:1;font-size:var(--text-base)">${s(a.email)}${mine ? ' <span style="color:var(--text-dim)">(tú)</span>' : ''}</span>
      <span style="font-size:var(--text-2xs);font-family:var(--font-ui);color:var(--text-dim)">${_fdate(a.added_at)}</span>
      ${mine ? '' : `<button class="btn btn-ghost" style="padding:4px 8px;font-size:var(--text-xs);color:var(--accent2)" onclick="adminRemoveSuper('${s(a.email)}')">${icon('close',12)}</button>`}
    </div>`;
  }).join('');
  document.getElementById('admin-body').innerHTML = `
    <div class="empty-hint" style="margin-bottom:14px">Quienes tengan acceso a este backend. Verificado del lado servidor (tabla <b>super_admins</b> + RLS).</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input class="input" id="sa-email" type="email" placeholder="correo@dominio.com">
      <button class="btn btn-primary" onclick="adminAddSuper()">Agregar</button>
    </div>
    <div>${rows}</div>`;
}
async function adminAddSuper() {
  const email = (document.getElementById('sa-email').value || '').trim().toLowerCase();
  if (!email) { uiAlert('Escribe un correo.'); return; }
  const sb = await getSb(); const r = await sb.from('super_admins').insert({ email });
  if (r.error) { uiAlert(r.error.message); return; } adminTab('admins');
}
async function adminRemoveSuper(email) {
  if (!await uiConfirm('¿Quitar a ' + email + ' del backend?', {danger:true})) return;
  const sb = await getSb(); const r = await sb.from('super_admins').delete().eq('email', email);
  if (r.error) { uiAlert(r.error.message); return; } adminTab('admins');
}

// ══════════════════════════════════════════
// TEMA (light / dark)
// ══════════════════════════════════════════
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('ao_theme', t);
  const b = document.getElementById('theme-toggle');
  if (b) b.innerHTML = icon(t === 'light' ? 'sun' : 'moon', 15);
  applyBranding(); // el color de marca debe sobrevivir el cambio de tema
}
// ── BRANDING (Sprint 10d) ── color de acento + logo + nombre del workspace.
function _hex(v) { v = String(v || '').trim(); return /^#?[0-9a-fA-F]{6}$/.test(v) ? ('#' + v.replace('#', '')) : null; }
function _shade(hex, p) { // oscurece (p<0) / aclara (p>0) un hex; p en [-1,1]
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = x => Math.max(0, Math.min(255, Math.round(x + (p < 0 ? x * p : (255 - x) * p))));
  return '#' + [f(r), f(g), f(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function _contrast(hex) {
  // Contraste WCAG real (la luma aproximada elegía blanco sobre naranjas medios: 2.9:1).
  // Devuelve el par v7: crema sobre fills oscuros, tinta sobre fills claros/vivos.
  const n = parseInt(hex.slice(1), 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const CREMA = 0.937, TINTA = 0.0042; // luminancia relativa de #FFF7ED y #180A02
  return (CREMA + 0.05) / (L + 0.05) >= (L + 0.05) / (TINTA + 0.05) ? '#FFF7ED' : '#180A02';
}
// Lee branding de cache local (pintado instantáneo antes del login) y de la nube tras loadTeam.
function brandCache() { try { return JSON.parse(localStorage.getItem('ao_brand')) || {}; } catch (e) { return {}; } }
function applyBranding() {
  const c = brandCache();
  const color = _hex(_brandColor || c.color);
  const root = document.documentElement.style;
  if (color) {
    root.setProperty('--accent', color);
    root.setProperty('--accent-fill', color);
    root.setProperty('--accent-dark', _shade(color, -0.22));
    root.setProperty('--accent-fg', _contrast(color));
    /* anti-slop #3: la marca NO reintroduce --glow de color; queda el neutro del tema */
  } else {
    ['--accent', '--accent-fill', '--accent-dark', '--accent-fg'].forEach(v => root.removeProperty(v));
  }
  // Logo: si hay logo_url, reemplaza el logotipo SVG por la imagen; el nombre va al subtítulo.
  const logoEl = document.querySelector('.sidebar .logo');
  const url = (_logoUrl || c.logo);
  const name = (_brandName || c.name);
  if (logoEl) {
    const word = logoEl.querySelector('.logo-word');
    const img = logoEl.querySelector('.brand-logo-img');
    if (url) {
      if (word) word.style.display = 'none';
      if (!img) {
        const i = document.createElement('img');
        i.className = 'brand-logo-img'; i.alt = name || 'Logo';
        i.style.cssText = 'max-height:30px;max-width:140px;object-fit:contain;display:block';
        const mark = logoEl.querySelector('.logo-mark');
        logoEl.insertBefore(i, mark ? mark.nextSibling : logoEl.firstChild);
      }
      logoEl.querySelector('.brand-logo-img').src = url;
    } else {
      if (word) word.style.display = '';
      if (img) img.remove();
    }
  }
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'light' ? 'dark' : 'light');
}
