/* Connectivity / fallback manager. Pure module: no store imports. */
const listeners = new Set();
let mode = 'auto';

export const NET_MODES = [
  { id: 'auto', label: 'Auto', desc: 'Use internet when available, otherwise nearby hotspot/LAN.' },
  { id: 'online', label: 'Global online', desc: 'Force global relay + WebRTC calling.' },
  { id: 'local', label: 'Offline hotspot / LAN', desc: 'Force local mesh. No internet or cloud needed.' },
  { id: 'offline', label: 'Completely offline', desc: 'Queue everything in the outbox with 24h TTL.' },
];

export function setNetMode(next) {
  mode = NET_MODES.some((m) => m.id === next) ? next : 'auto';
  emit();
}

export function getNetMode() { return mode; }

export function netState() {
  const browserOnline = !!navigator.onLine;
  if (mode === 'online') return stateOf('online', true);
  if (mode === 'local') return stateOf('local', false);
  if (mode === 'offline') return stateOf('offline', false);
  return browserOnline ? stateOf('online', true) : stateOf('local', false);
}

function stateOf(key, browserOnline) {
  const map = {
    online: { online: true, local: false, label: 'Online — Global Calls & Chat', short: 'Online', tone: 'online', tier: 'global' },
    local: { online: false, local: true, label: 'Offline — Local Hotspot/LAN Ready', short: 'Local mesh', tone: 'local', tier: 'local' },
    offline: { online: false, local: false, label: 'Offline — Queue & Mesh Mode', short: 'Queue mode', tone: 'offline', tier: 'queue' },
  };
  return { key, browserOnline, ...map[key] };
}

export function onNetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const n = netState();
  listeners.forEach((fn) => { try { fn(n); } catch { /* noop */ } });
  window.dispatchEvent(new CustomEvent('meshlink:network', { detail: n }));
}

window.addEventListener('online', emit);
window.addEventListener('offline', emit);
