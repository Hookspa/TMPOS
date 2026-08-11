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
if (typeof renderOnAir === 'function') { renderOnAir(); setInterval(renderOnAir, 30000); }  // franja ON AIR + reloj

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

// Accesibilidad transversal de modales: nombre, diálogo, cierre por teclado,
// foco inicial, trampa de Tab y restauración al control que abrió el modal.
(function initModalAccessibility() {
  const priorFocus = new WeakMap();
  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function prepareOverlay(overlay) {
    if (!overlay || !overlay.classList || !overlay.classList.contains('boxdrop-overlay')) return;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('tabindex', '-1');
    const title = overlay.querySelector('.boxdrop-title, .wiz-title, h2, h3');
    if (title) {
      if (!title.id) title.id = `${overlay.id || 'modal'}-title`;
      overlay.setAttribute('aria-labelledby', title.id);
    } else if (!overlay.hasAttribute('aria-label')) {
      overlay.setAttribute('aria-label', 'Diálogo');
    }
    overlay.querySelectorAll('.boxdrop-close').forEach(close => {
      if (!/^(BUTTON|A)$/.test(close.tagName)) {
        close.setAttribute('role', 'button');
        close.setAttribute('tabindex', '0');
      }
      if (!close.hasAttribute('aria-label')) close.setAttribute('aria-label', 'Cerrar');
      if (!close.dataset.keyboardClose) {
        close.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); close.click(); }
        });
        close.dataset.keyboardClose = 'true';
      }
    });
  }

  function openOverlay(overlay) {
    prepareOverlay(overlay);
    if (document.activeElement && !overlay.contains(document.activeElement)) priorFocus.set(overlay, document.activeElement);
    requestAnimationFrame(() => {
      const target = overlay.querySelector(focusableSelector) || overlay;
      if (typeof target.focus === 'function') target.focus({ preventScroll: true });
    });
  }

  document.querySelectorAll('.boxdrop-overlay').forEach(prepareOverlay);
  const observer = new MutationObserver(records => records.forEach(record => {
    if (record.type === 'childList') record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches('.boxdrop-overlay')) prepareOverlay(node);
      if (node.querySelectorAll) node.querySelectorAll('.boxdrop-overlay').forEach(prepareOverlay);
    });
    if (record.type === 'attributes') {
      const overlay = record.target;
      if (overlay.classList.contains('open')) openOverlay(overlay);
      else {
        const prior = priorFocus.get(overlay);
        if (prior && document.contains(prior) && typeof prior.focus === 'function') prior.focus({ preventScroll: true });
        priorFocus.delete(overlay);
      }
    }
  }));
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const overlays = Array.from(document.querySelectorAll('.boxdrop-overlay.open'));
    const overlay = overlays[overlays.length - 1];
    if (!overlay) return;
    const focusable = Array.from(overlay.querySelectorAll(focusableSelector)).filter(el => el.offsetParent !== null);
    if (!focusable.length) { event.preventDefault(); overlay.focus(); return; }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
