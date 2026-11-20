/* Small, dependency-free helpers shared across T LINK. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let counter = 0;
export const uid = (prefix = 'id') => {
  counter = (counter + 1) % 9999;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

/* T LINK assigns a private 10-digit identity. Email is only used to verify it,
 * never as a login name or phone number. */
export function generateMeshId() {
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  const digits = [3 + (bytes[0] % 7)];
  for (let i = 1; i < 10; i++) digits.push(bytes[i] % 10);
  return digits.join('');
}

export const formatMeshId = (value = '') => {
  const d = String(value).replace(/\D/g, '').slice(0, 10);
  if (d.length < 4) return d;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
};

export const esc = (value = '') =>
  String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export const safeUrl = (value = '') => {
  const v = String(value).trim();
  return /^(https?:|data:image\/|data:video\/|data:audio\/|blob:)/i.test(v) ? v : '';
};

export const initials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const GRADIENTS = [
  'linear-gradient(135deg,#8b5cf6,#c084fc)',
  'linear-gradient(135deg,#f472b6,#a855f7)',
  'linear-gradient(135deg,#38bdf8,#818cf8)',
  'linear-gradient(135deg,#34d399,#0ea5e9)',
  'linear-gradient(135deg,#fbbf24,#f472b6)',
  'linear-gradient(135deg,#f87171,#a855f7)',
  'linear-gradient(135deg,#22d3ee,#6366f1)',
  'linear-gradient(135deg,#a3e635,#14b8a6)',
  'linear-gradient(135deg,#fb923c,#e879f9)',
];

export const avatarGradient = (name = '') => {
  let hash = 0;
  for (let i = 0; i < String(name).length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
};

export const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const isToday = (ts) => startOfDay(ts) === startOfDay(Date.now());
export const isYesterday = (ts) => startOfDay(ts) === startOfDay(Date.now()) - 864e5;

export const fmtListTime = (ts) => {
  if (!ts) return '';
  if (isToday(ts)) return fmtTime(ts);
  const d = new Date(ts);
  const diff = startOfDay(Date.now()) - startOfDay(ts);
  if (diff === 864e5) return 'Yesterday';
  if (diff < 7 * 864e5) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: d.getFullYear() === new Date().getFullYear() ? undefined : '2-digit' });
};

export const fmtDayDivider = (ts) => {
  if (isToday(ts)) return 'Today';
  if (isYesterday(ts)) return 'Yesterday';
  const diff = startOfDay(Date.now()) - startOfDay(ts);
  if (diff < 7 * 864e5) return new Date(ts).toLocaleDateString([], { weekday: 'long' });
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
};

export const fmtRelative = (ts) => {
  if (!ts) return 'a while ago';
  const diff = Date.now() - ts;
  if (diff < 60e3) return 'just now';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} min ago`;
  if (diff < 864e5) return `${Math.floor(diff / 3600e3)} h ago`;
  if (diff < 7 * 864e5) return new Date(ts).toLocaleDateString([], { weekday: 'long' });
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
};

export const fmtDuration = (seconds = 0) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtSize = (bytes = 0) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export const fmtPhone = (phone = '') => String(phone).replace(/\s+/g, ' ').trim();

export const lastSeenText = (user) => {
  if (!user) return 'offline';
  if (user.online) return 'online';
  return `last seen ${fmtRelative(user.lastSeen || Date.now() - 3600e3)}`;
};

const KIND_LABEL = {
  image: '📷 Photo',
  video: '🎥 Video',
  voice: '🎤 Voice message',
  doc: '📄 Document',
  sticker: 'Sticker',
  gif: 'GIF',
};

export const previewOf = (message, senderName = '', meId = 'u_me') => {
  if (!message) return '';
  if (message.deletedForEveryone) return '🚫 This message was deleted';
  let body;
  if (message.kind === 'text' || !message.kind) {
    body = String(message.text || '').replace(/\s+/g, ' ').trim();
    if (message.link) body = `🔗 ${message.link.title}`;
  } else if (message.kind === 'doc') {
    body = `📄 ${message.media?.name || 'Document'}`;
  } else if (message.kind === 'sticker') {
    body = `${message.text || '🌟'} Sticker`;
  } else {
    body = KIND_LABEL[message.kind] || 'Message';
  }
  if (message.kind === 'voice' && message.media?.duration) body += ` (${fmtDuration(message.media.duration)})`;
  const isMe = message.senderId === meId;
  return `${isMe ? 'You: ' : ''}${body}`.slice(0, 160);
};

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/gi;

export const extractUrl = (text = '') => {
  const match = String(text).match(URL_RE);
  return match ? match[0] : '';
};

export const domainOf = (url = '') => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

export const linkPreviewFor = (url) => {
  const domain = domainOf(url);
  let path = '';
  try {
    const u = new URL(url);
    path = decodeURIComponent(u.pathname.split('/').filter(Boolean).slice(-2).join(' / ')).replace(/[-_]/g, ' ');
  } catch { /* noop */ }
  const title = path
    ? path.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 70)
    : (domain ? `${domain.split('.')[0].replace(/\b\w/g, (c) => c.toUpperCase())} link` : 'Shared link');
  return {
    url,
    domain: domain || 'link',
    title,
    desc: 'Shared from the web · tap to open the original link.',
  };
};

export const linkify = (text = '') =>
  esc(text).replace(URL_RE, (m) => `<a href="${esc(m)}" target="_blank" rel="noopener noreferrer">${esc(m)}</a>`);

export const typingText = (name = 'Someone') => `${name} is typing…`;

export const debounce = (fn, wait = 180) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

export const readAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const imageAsDataURL = async (file, maxSide = 1440, quality = 0.84) => {
  const raw = await readAsDataURL(file);
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') return raw;
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = raw;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return raw;
  }
};

export const downloadText = (filename, text, type = 'application/json') => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const playChime = (kind = 'message') => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.0001;
    const now = ctx.currentTime;
    const notes = kind === 'call' ? [523.25, 659.25, 783.99] : [740, 988];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      const t = now + i * 0.1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t);
      o.stop(t + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* audio is a nice-to-have */ }
};

export const canNotify = () => 'Notification' in window && Notification.permission === 'granted';

export const browserNotify = (title, body, tag = 'meshlink') => {
  if (!canNotify() || !document.hidden) return;
  try {
    new Notification(title, { body, tag, icon: 'assets/favicon.svg' });
  } catch { /* noop */ }
};

export const isMobileView = () => window.matchMedia('(max-width: 980px)').matches;

export const scrollToBottom = (el, smooth = false) => {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
};

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const escapeAttr = esc;

export const makeArt = (title, subtitle, from = '#6d28d9', to = '#ec4899', accent = '#c4b5fd') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <radialGradient id="r" cx=".25" cy=".15" r=".9"><stop offset="0" stop-color="${accent}" stop-opacity=".7"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="900" height="1100" fill="url(#g)"/>
  <rect width="900" height="1100" fill="url(#r)"/>
  <circle cx="720" cy="240" r="190" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="2"/>
  <circle cx="720" cy="240" r="120" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
  <circle cx="160" cy="880" r="240" fill="rgba(255,255,255,.06)"/>
  <path d="M0 760 Q220 640 460 760 T900 720 V1100 H0Z" fill="rgba(12,4,24,.28)"/>
  <text x="70" y="820" font-family="Inter,Segoe UI,sans-serif" font-size="58" font-weight="800" fill="#fff">${esc(title)}</text>
  <text x="72" y="872" font-family="Inter,Segoe UI,sans-serif" font-size="24" fill="rgba(255,255,255,.72)">${esc(subtitle)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const makeAvatarArt = (label = 'M', from = '#8b5cf6', to = '#ec4899') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="300" height="300" fill="url(#g)"/>
  <circle cx="240" cy="60" r="110" fill="rgba(255,255,255,.12)"/>
  <circle cx="40" cy="270" r="120" fill="rgba(0,0,0,.12)"/>
  <text x="150" y="188" text-anchor="middle" font-family="Inter,Segoe UI,sans-serif" font-size="120" font-weight="800" fill="#fff">${esc(label)}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const downloadJson = (data, filename = 'tlink-export.json') =>
  downloadText(filename, JSON.stringify(data, null, 2));
