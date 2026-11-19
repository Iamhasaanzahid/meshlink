/* Icons + reusable UI primitives (no framework). */
import { esc, avatarGradient, initials, safeUrl } from './utils.js';

const P = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.4-.7L3 21l1.8-5.3A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/>',
  status: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 3.2"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>',
  calls: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  star: '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.6l6.5-.9Z"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2.2" fill="var(--panel)"/><circle cx="15" cy="12" r="2.2" fill="var(--panel)"/><circle cx="8" cy="18" r="2.2" fill="var(--panel)"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  paperclip: '<path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l8.9-8.9a4 4 0 0 1 5.7 5.7l-8.9 8.8a2 2 0 0 1-2.8-2.8l8.2-8.1"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  moreV: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2.5"/><path d="m16 10 6-3.5v11L16 14"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  volumeOff: '<path d="M11 5 6 9H2v6h4l5 4V5ZM22 9l-6 6M16 9l6 6"/>',
  camera: '<path d="M23 7.5 16 12l7 4.5v-9Z"/><rect x="1" y="5" width="15" height="14" rx="2.5"/>',
  cameraOff: '<path d="M1 5h4l11 14H3a2 2 0 0 1-2-2V5ZM16 10l7-4v11l-3.5-2M23 3 1 21"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  checkCheck: '<path d="m1.5 12.5 4.5 4.5L16 7"/><path d="m9 15.5 1.5 1.5L21 6.5"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  forward: '<path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h4"/>',
  play: '<path d="M6 3.5v17l14-8.5Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M7 4h4v16H7zM14 4h4v16h-4z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0M16.5 4.6a3.5 3.5 0 0 1 0 6.8M21.5 21a6 6 0 0 0-4-5.7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  shield: '<path d="M12 2 4 5.5V11c0 5 3.4 9.2 8 11 4.6-1.8 8-6 8-11V5.5Z"/><path d="m9 12 2 2 4-4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.5 21a2 2 0 0 0 3 0"/>',
  bellOff: '<path d="M18 8a6 6 0 0 0-9.3-5M6.3 6.3A6 6 0 0 0 6 8c0 7-3 8-3 8h14M10.5 21a2 2 0 0 0 3 0M2 2l20 20"/>',
  pin: '<path d="M12 17v5M8 3h8l-1.2 6.2 3.2 3.3v1.5H6v-1.5l3.2-3.3L8 3Z"/>',
  message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.4-.7L3 21l1.8-5.3A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/>',
  eye: '<path d="M1.5 12S5 5 12 5s10.5 7 10.5 7S19 19 12 19 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>',
  corner: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a3 3 0 0 0-3-3H4"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
  sparkles: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9Z"/>',
  zap: '<path d="M13 2 3 14h8l-1 8 11-13h-8Z"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  film: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  type: '<path d="M4 6V4h16v2M12 4v16M8 20h8"/>',
  palette: '<path d="M12 2a10 10 0 0 0 0 20c1.4 0 2.5-1.1 2.5-2.5 0-.7-.3-1.3-.7-1.8-.4-.5-.7-1-.7-1.7a2.5 2.5 0 0 1 2.5-2.5H18a4 4 0 0 0 4-4c0-4.4-4.5-7.5-10-7.5Z"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor"/><circle cx="10" cy="6.5" r="1" fill="currentColor"/><circle cx="15" cy="6.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1" fill="currentColor"/>',
  phoneIn: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/><path d="M15 3h6v6M21 3l-6 6"/>',
  phoneOut: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/><path d="M15 9h6V3M21 9l-6-6"/>',
  phoneMissed: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/><path d="m15 3 6 6M21 3l-6 6"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5Z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
};

export function icon(name, cls = '') {
  const path = P[name] || P.info;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

export function avatar(user = {}, { size = '', online = null, ring = false, cls = '' } = {}) {
  const name = user?.name || 'Unknown';
  const photo = safeUrl(user?.avatar || '');
  const style = photo ? '' : `background:${avatarGradient(name)};`;
  const inner = photo
    ? `<img src="${esc(photo)}" alt="${esc(name)}" loading="lazy">`
    : user?.emoji
      ? `<span class="emoji">${esc(user.emoji)}</span>`
      : esc(initials(name));
  const presence = online === true
    ? '<span class="presence" title="online"></span>'
    : online === false
      ? '<span class="presence off" title="offline"></span>'
      : '';
  return `<span class="avatar ${size} ${ring ? 'ring' : ''} ${cls}" style="${style}" title="${esc(name)}"><span class="av-inner">${inner}</span>${presence}</span>`;
}

export function toast(message, type = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info')}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, 3000);
}

let openModalClose = null;

export function openModal({ title = '', subtitle = '', body = '', footer = '', wide = false, dismissible = true, onMount } = {}) {
  if (openModalClose) openModalClose();
  const root = document.getElementById('overlay-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div class="mh-body"><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        ${dismissible ? `<button class="icon-btn modal-close" data-close aria-label="Close">${icon('x')}</button>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(backdrop);
  const modal = backdrop.querySelector('.modal');
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (openModalClose === close) openModalClose = null;
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });
  openModalClose = close;
  if (onMount) onMount(modal, close);
  return { el: modal, close };
}

export function closeModal() {
  if (openModalClose) openModalClose();
}

export function confirmDialog({ title, message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  return new Promise((resolve) => {
    const { close } = openModal({
      title,
      body: `<p style="margin:0;font-size:13px;line-height:1.6;color:var(--text-2)">${esc(message)}</p>`,
      footer: `<button class="btn sm" data-cancel>${esc(cancelLabel)}</button><button class="btn sm ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount: (el) => {
        el.querySelector('[data-cancel]').onclick = () => { close(); resolve(false); };
        el.querySelector('[data-ok]').onclick = () => { close(); resolve(true); };
      },
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); resolve(false); }
    };
    document.addEventListener('keydown', onKey, { once: true });
  });
}

let activeMenu = null;

export function closeMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

export function openMenu({ x = 0, y = 0, html = '', className = '' } = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = `menu ${className}`;
  menu.innerHTML = html;
  document.getElementById('overlay-root').appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(Math.max(10, x - rect.width + (className.includes('left') ? rect.width : 0)), window.innerWidth - rect.width - 10);
  const top = Math.min(Math.max(10, y), window.innerHeight - rect.height - 10);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  activeMenu = menu;
  setTimeout(() => {
    const outside = (e) => {
      if (!menu.contains(e.target)) {
        closeMenu();
        document.removeEventListener('pointerdown', outside, true);
      }
    };
    document.addEventListener('pointerdown', outside, true);
  }, 0);
  return menu;
}

export function openLightbox(src, { title = '', subtitle = '' } = {}) {
  if (!src) return;
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'story-overlay';
  wrap.innerHTML = `
    <div class="story-shell" style="cursor:zoom-out">
      <div class="story-head">
        <div class="grow"><div class="nm">${esc(title || 'Photo')}</div><div class="tm">${esc(subtitle || '')}</div></div>
        <button class="icon-btn" data-close style="color:#fff">${icon('x')}</button>
      </div>
      <div class="story-canvas has-media"><img src="${esc(src)}" alt="${esc(title || 'Photo')}" style="object-fit:contain;border-radius:22px"></div>
    </div>`;
  root.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]') || e.target.closest('img')) close();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
}

export function emptyState(iconName, title, text) {
  return `<div class="empty-page">${icon(iconName)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}
