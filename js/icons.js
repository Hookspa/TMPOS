// ══════════════════════════════════════════
// SISTEMA DE ÍCONOS (SVG inline propio · "platform-like")
// Estilo uniforme: viewBox 24, stroke currentColor, weight 1.75, linecaps round.
// Uso: icon('nombre', 16) → string SVG. En HTML estático: <span data-icon="nombre"></span> + hydrateIcons().
// ══════════════════════════════════════════
const ICONS = {
  // — Navegación —
  dashboard:  '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  releases:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3a9 9 0 0 1 9 9"/>',
  label:      '<path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><line x1="9" y1="21" x2="9" y2="13"/><line x1="15" y1="21" x2="15" y2="13"/><line x1="12" y1="9" x2="12" y2="9.01"/>',
  artist:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>',
  dna:        '<path d="M9 3c4 3 4 6 0 9s-4 6 0 9"/><path d="M15 3c-4 3-4 6 0 9s4 6 0 9"/><line x1="9.5" y1="6" x2="14.5" y2="6"/><line x1="8.2" y1="12" x2="15.8" y2="12"/><line x1="9.5" y1="18" x2="14.5" y2="18"/>',
  references: '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v15H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20v5H7.5A2.5 2.5 0 0 1 5 19.5z"/>',
  ideas:      '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5.9 1.1 1 1.8h6c.1-.7.4-1.3 1-1.8A7 7 0 0 0 12 2z"/>',
  calendar:   '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><line x1="3" y1="9.5" x2="21" y2="9.5"/><line x1="8" y1="2.5" x2="8" y2="6"/><line x1="16" y1="2.5" x2="16" y2="6"/>',
  goals:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
  metrics:    '<path d="M4 20h16"/><line x1="7" y1="20" x2="7" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="17" y1="20" x2="17" y2="4"/>',
  learnings:  '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>',
  ai:         '<path d="M12 3.5l1.7 4.8L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/>',
  // — Paneles / acciones —
  team:       '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6"/><path d="M16 5.2a3.4 3.4 0 0 1 0 5.6"/><path d="M18 14.8c2.1.7 3.5 2.4 3.5 4.8"/>',
  person:     '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>',
  mic:        '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="8.5" y1="21" x2="15.5" y2="21"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13.5" width="4" height="6.5" rx="1.6"/><rect x="17" y="13.5" width="4" height="6.5" rx="1.6"/>',
  sound:      '<path d="M11 5L6.5 9H3v6h3.5L11 19z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18.5 6a8 8 0 0 1 0 12"/>',
  identity:   '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11.5" r="2.4"/><path d="M5.5 16.5c.4-1.8 1.9-2.7 3.5-2.7s3.1.9 3.5 2.7"/><line x1="15" y1="10" x2="18" y2="10"/><line x1="15" y1="14" x2="18" y2="14"/>',
  chart:      '<path d="M4 20h16"/><line x1="7" y1="20" x2="7" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="17" y1="20" x2="17" y2="4"/>',
  report:     '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><line x1="8.5" y1="17" x2="8.5" y2="14"/><line x1="12" y1="17" x2="12" y2="12.5"/><line x1="15.5" y1="17" x2="15.5" y2="15"/>',
  checklist:  '<path d="M9.5 6h10"/><path d="M9.5 12h10"/><path d="M9.5 18h10"/><path d="M4 6l1.3 1.3L7.8 4.8"/><path d="M4 12l1.3 1.3L7.8 10.8"/><path d="M4 18l1.3 1.3L7.8 16.8"/>',
  file:       '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  contacts:   '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="10.5" cy="10.5" r="2.3"/><path d="M6.8 16.5c.4-1.7 1.8-2.6 3.7-2.6s3.3.9 3.7 2.6"/><line x1="4" y1="8.5" x2="2.5" y2="8.5"/><line x1="4" y1="12" x2="2.5" y2="12"/><line x1="4" y1="15.5" x2="2.5" y2="15.5"/>',
  finance:    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10.5h18"/><circle cx="16.5" cy="14.5" r="1.4"/>',
  receipt:    '<path d="M5 3v18l2-1.4 2 1.4 2-1.4 2 1.4 2-1.4 2 1.4V3l-2 1.4L17 3l-2 1.4L13 3l-2 1.4L9 3 7 4.4z"/><line x1="8.5" y1="9" x2="15.5" y2="9"/><line x1="8.5" y1="13" x2="13.5" y2="13"/>',
  tag:        '<path d="M3.5 12.5L11 5a2 2 0 0 1 1.4-.6h6a2 2 0 0 1 2 2v6a2 2 0 0 1-.6 1.4l-7.5 7.5a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1 0-2.8z"/><circle cx="16" cy="8" r="1.4" fill="currentColor"/>',
  invite:     '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  key:        '<circle cx="8" cy="14" r="4"/><path d="M10.8 11.2L20 2"/><path d="M16 6l2.2 2.2"/><path d="M18.5 3.5l2.2 2.2"/>',
  save:       '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h7"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3.2 2"/>',
  zap:        '<path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10.5H13z"/>',
  settings:   '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  wrench:     '<path d="M14.5 5.6a3.6 3.6 0 0 0-4.7 4.7L3 17.1 6.9 21l6.8-6.8a3.6 3.6 0 0 0 4.7-4.7l-2.4 2.4-2.2-.6-.6-2.2z"/>',
  music:      '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  warning:    '<path d="M12 3L2 20.5h20z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17.3" r="0.7" fill="currentColor" stroke="none"/>',
  refresh:    '<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.6-4.1"/><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.6 4.1"/><path d="M21 3.5V8h-4.5"/><path d="M3 20.5V16h4.5"/>',
  search:     '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  shuffle:    '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  close:      '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  arrowLeft:  '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  check:      '<path d="M5 12.5l4.5 4.5L19 7"/>',
  star:       '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 18.1 6.6 20l1-6.1L3.2 9.5l6.1-.9z"/>',
  starFill:   '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 18.1 6.6 20l1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>',
  plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  eye:        '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  lock:       '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  moon:       '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"/>',
  link:       '<path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 4.9"/><path d="M14 11a5 5 0 0 0-7.1 0L4.1 13.8a5 5 0 0 0 7.1 7.1L13 19.1"/>',
  disc:       '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>',
  video:      '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  camera:     '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.4"/><path d="M8 7l1.4-2h5.2L16 7"/>',
  phone:      '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/>',
  image:      '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M3 17l5-5 4 4 3-3 6 6"/>',
  play:       '<path d="M7 4.5v15l13-7.5z"/>',
  apple:      '<path d="M16 13c0-2.2 1.7-3.2 1.8-3.3-1-1.5-2.6-1.7-3.1-1.7-1.3-.1-2.6.8-3.2.8-.7 0-1.7-.8-2.8-.8-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.5 2.2 2.6 2.1 1-.04 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.6 1.1-.02 1.8-1 2.5-2.1.5-.8.8-1.5 1-1.8-1.6-.6-2.6-2.4-2.6-3.8z"/><path d="M14 6c.6-.7.9-1.7.8-2.7-.8.04-1.8.5-2.4 1.2-.5.6-1 1.6-.8 2.5.9.1 1.8-.4 2.4-1z"/>',
  video2:     '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  graduation: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v4.5c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V11"/><line x1="21" y1="9" x2="21" y2="14"/>',
  trend:      '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  chat:       '<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12z"/>',
  trophy:     '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5H5v2a3 3 0 0 0 3 3"/><path d="M16 5h3v2a3 3 0 0 1-3 3"/><line x1="12" y1="13" x2="12" y2="17"/><path d="M9 20h6"/><path d="M10 17h4v3h-4z"/>',
  flame:      '<path d="M12 3c2.2 3 1 5 3 7s1.8 5.2-3 9.5C7.2 15.2 7 12.2 9 10c0 0-.8-3.8 3-7z"/>',
  heart:      '<path d="M12 20.5C5.5 16 3 12.5 3 9a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3.5-2.5 7-9 11.5z"/>',
  smile:      '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/>',
  pin:        '<path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  book:       '<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v15H7.5A2.5 2.5 0 0 0 5 19.5z"/><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20v5H7.5A2.5 2.5 0 0 1 5 19.5z"/>',
  rocket:     '<path d="M5 15c-1.5 1-2 4-2 4s3-.5 4-2c.6-.9.5-2 .5-2L7 13s-1.1-.1-2 .5z"/><path d="M9 15l-3-3c1-4 4-8 9-9 0 5-4 8-9 9z"/><circle cx="14" cy="10" r="1.3"/>',
  scissors:   '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><line x1="8.2" y1="7.5" x2="20" y2="18"/><line x1="8.2" y1="16.5" x2="20" y2="6"/>',
  thumb:      '<path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z"/><path d="M7 11l4-7a2 2 0 0 1 2 2v3h5.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 17 20H7"/>',
  menu:       '<line x1="3.5" y1="6.5" x2="20.5" y2="6.5"/><line x1="3.5" y1="12" x2="20.5" y2="12"/><line x1="3.5" y1="17.5" x2="20.5" y2="17.5"/>',
  logout:     '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 16l-4-4 4-4"/><line x1="5" y1="12" x2="15" y2="12"/>',
  upload:     '<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/>',
  download:   '<path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/><path d="M12 4v12"/><path d="M7 11l5 5 5-5"/>',
  info:       '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="8" r="0.7" fill="currentColor" stroke="none"/>',
  bell:       '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  pencil:     '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/><line x1="14.5" y1="5.5" x2="18.5" y2="9.5"/>',
  copy:       '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash:      '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  cloud:      '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17 18z"/>',
  palette:    '<path d="M12 3a9 9 0 0 0 0 18c1 0 1.5-.8 1.5-1.5 0-.5-.3-.9-.6-1.2-.3-.4-.5-.7-.5-1.1 0-.7.6-1.2 1.3-1.2H15a5 5 0 0 0 5-5c0-4.2-3.6-7-8-7z"/><circle cx="7.5" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="11" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="8.5" r="1" fill="currentColor" stroke="none"/>',
  galaxy:     '<circle cx="12" cy="12" r="2"/><path d="M12 4c5 0 8 3 8 6s-5 2-8 2-8 1-8-2 3-6 8-6z" transform="rotate(25 12 12)"/>',
  edit2:      '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  signature:  '<path d="M3 17c2.5 0 3-9 5-9s1.5 7 3 7 2-4 4-4 2 3 4 3"/><line x1="3" y1="20.5" x2="21" y2="20.5"/>',
  flag:       '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  globe:      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
  megaphone:  '<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14 8a4 4 0 0 1 0 8"/>',
  placeholder:'<rect x="4" y="4" width="16" height="16" rx="2"/>',
};
function icon(name, size = 16) {
  const body = ICONS[name] || ICONS.placeholder;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
// Hidrata íconos declarados en HTML estático: <span data-icon="team" data-isize="20"></span>
function hydrateIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach(el => {
    const n = el.getAttribute('data-icon'); if (!n) return;
    const sz = parseInt(el.getAttribute('data-isize') || '16', 10);
    el.innerHTML = icon(n, sz);
    el.removeAttribute('data-icon');
  });
}
// Quita un emoji/pictograma inicial de una etiqueta de datos (CSV) sin tocar el dato crudo.
function stripEmoji(str) { return String(str==null?'':str).replace(/^[\s\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+/u, '').trim(); }
