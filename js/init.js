// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
hydrateIcons();   // íconos SVG declarados en el HTML estático (nav, modales, paneles)
applyTheme(localStorage.getItem('ao_theme') || 'dark');
if (typeof migrateEmbeddedTasks === 'function') migrateEmbeddedTasks();   // tareas embebidas → tabla relacional (idempotente)
if (typeof runAutomations === 'function') runAutomations();               // motor de automatizaciones (recordatorios/atrasos/desbloqueo)
if (typeof updateTaskBadge === 'function') updateTaskBadge();             // contador del nav "Tareas"
if (typeof renderNotifBadge === 'function') renderNotifBadge();          // campana de notificaciones
renderSidebarArtist();
renderAllLaunches();

// Banco por defecto: CSV embebido (Test ArtistOS — Ideas de contenido)
(function loadEmbeddedBank() {
  try {
    const el = document.getElementById('bank-csv');
    if (el && el.textContent.trim()) {
      const parsed = parsearCSV(el.textContent);
      if (parsed.length) { setReferencias(parsed); bancoCargado = true; }
    }
  } catch (e) { console.warn('No se pudo cargar el banco embebido:', e); }
})();
if (typeof mergeCustomRefs === 'function') mergeCustomRefs(); // posts propios persistidos → al banco

iniciarBanco();

// Banco externo grande (CSV en el repo, miniaturas en Supabase) → se mezcla en runtime para no inflar app.html
if (typeof loadExternalBank === 'function') loadExternalBank('refs_02.csv');

// sincronización en la nube al arrancar (si está configurada → pide login)
if (cloudEnabled()) { showAuthGate(true); setSyncStatus('syncing'); authInit(); } else { setSyncStatus('off'); }
