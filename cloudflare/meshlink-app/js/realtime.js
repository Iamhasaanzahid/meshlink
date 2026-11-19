/* Realtime layer: WebSocket relay (optional) + BroadcastChannel fallback.
   The UI stays usable when neither is available, so this module never throws. */

const CHANNEL = 'meshlink-web-events';
const listeners = new Set();
let socket = null;
let channel = null;
let retryTimer = null;
let attempts = 0;
let connected = false;

export function initRealtime() {
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => dispatch(event.data);
  } catch { /* BroadcastChannel unsupported */ }
  connect();
  window.addEventListener('online', connect);
  window.addEventListener('offline', () => { connected = false; });
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  if (!location.protocol.startsWith('http')) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.hostname}:8765`;
  try {
    socket = new WebSocket(url);
  } catch {
    scheduleRetry();
    return;
  }
  socket.onopen = () => {
    connected = true;
    attempts = 0;
  };
  socket.onmessage = (event) => {
    try { dispatch(JSON.parse(String(event.data))); } catch { /* ignore junk */ }
  };
  socket.onclose = () => {
    connected = false;
    scheduleRetry();
  };
  socket.onerror = () => { /* onclose follows */ };
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  attempts = Math.min(attempts + 1, 6);
  retryTimer = setTimeout(connect, 1200 * attempts);
}

function dispatch(event) {
  if (!event || !event.type) return;
  listeners.forEach((fn) => {
    try { fn(event); } catch (err) { console.error('realtime handler', err); }
  });
}

export function onRemote(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function sendRemote(event) {
  if (!event || !event.type) return;
  try { channel?.postMessage(event); } catch { /* noop */ }
  try {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
  } catch { /* noop */ }
}

export function realtimeConnected() {
  return connected;
}
