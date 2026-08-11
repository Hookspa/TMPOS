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

// Contrato canónico de overlays: <dialog> nativo aporta top layer, foco protegido y
// Escape. El puente con la clase .open conserva las APIs existentes mientras la app
// migra sus aperturas a tempoDialogOpen()/tempoDialogClose().
const _tempoDialogPriorFocus = new WeakMap();
const _tempoDialogSelector = 'dialog.boxdrop-overlay, dialog.more-sheet-overlay, dialog.cmdk-overlay, dialog.wizard-overlay';
const _tempoDialogStack = [];

function tempoDialogSyncPageLock() {
  document.documentElement.classList.toggle('tempo-dialog-open', !!document.querySelector('dialog[open]'));
}

function tempoDialogPrepare(dialog) {
  if (!dialog || dialog.tagName !== 'DIALOG' || dialog.dataset.tempoDialogReady) return;
  dialog.dataset.tempoDialogReady = 'true';
  const title = dialog.querySelector('.boxdrop-title, .wiz-title, h2, h3');
  if (title) {
    if (!title.id) title.id = `${dialog.id || 'modal'}-title`;
    if (!dialog.hasAttribute('aria-label')) dialog.setAttribute('aria-labelledby', title.id);
  } else if (!dialog.hasAttribute('aria-label')) {
    dialog.setAttribute('aria-label', 'Diálogo');
  }
  dialog.querySelectorAll('.boxdrop-close').forEach(close => {
    if (!close.hasAttribute('aria-label')) close.setAttribute('aria-label', 'Cerrar');
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); tempoDialogRequestClose(dialog); });
  dialog.addEventListener('close', () => {
    if (dialog.classList.contains('open')) dialog.classList.remove('open');
    const stackIndex = _tempoDialogStack.lastIndexOf(dialog);
    if (stackIndex >= 0) _tempoDialogStack.splice(stackIndex, 1);
    tempoDialogSyncPageLock();
    const prior = _tempoDialogPriorFocus.get(dialog);
    _tempoDialogPriorFocus.delete(dialog);
    requestAnimationFrame(() => {
      const focusedInDialog = Array.from(document.querySelectorAll('dialog[open]')).some(openDialog => openDialog.contains(document.activeElement));
      if (!focusedInDialog && prior && document.contains(prior) && typeof prior.focus === 'function') prior.focus({ preventScroll: true });
    });
  });
}

function tempoDialogOpen(dialog) {
  if (!dialog || dialog.tagName !== 'DIALOG') return;
  tempoDialogPrepare(dialog);
  if (!dialog.open) {
    const prior = document.activeElement;
    if (prior && prior !== document.body && !dialog.contains(prior)) _tempoDialogPriorFocus.set(dialog, prior);
    dialog.showModal();
    _tempoDialogStack.push(dialog);
  }
  if (!dialog.classList.contains('open')) dialog.classList.add('open');
  tempoDialogSyncPageLock();
}

function tempoDialogRequestClose(dialog) {
  if (!dialog || !dialog.open) return;
  const cancelAction = dialog.dataset.dialogCancel;
  if (cancelAction && typeof window[cancelAction] === 'function') {
    window[cancelAction]();
    return;
  }
  dialog.click(); // reutiliza el contrato de cierre/backdrop y su limpieza de estado
  if (dialog.open && dialog.classList.contains('open')) tempoDialogClose(dialog);
}

function tempoDialogClose(dialog, returnValue) {
  if (!dialog || dialog.tagName !== 'DIALOG') return;
  if (dialog.classList.contains('open')) dialog.classList.remove('open');
  if (dialog.open) dialog.close(returnValue || '');
  else tempoDialogSyncPageLock();
}

(function initTempoDialogs() {
  document.querySelectorAll(_tempoDialogSelector).forEach(tempoDialogPrepare);
  const observer = new MutationObserver(records => records.forEach(record => {
    if (record.type === 'childList') record.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches(_tempoDialogSelector)) tempoDialogPrepare(node);
      if (node.querySelectorAll) node.querySelectorAll(_tempoDialogSelector).forEach(tempoDialogPrepare);
    });
    if (record.type === 'attributes') {
      const dialog = record.target;
      if (dialog.classList.contains('open')) tempoDialogOpen(dialog);
      else tempoDialogClose(dialog);
    }
  }));
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const dialog = _tempoDialogStack[_tempoDialogStack.length - 1];
    if (!dialog || !dialog.open) return;
    event.preventDefault();
    tempoDialogRequestClose(dialog);
  });
})();
