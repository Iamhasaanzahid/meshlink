/* Local transport adapter: BroadcastChannel "LAN/hotspot" discovery + events.
   Two tabs on the same origin behave like two devices on the same hotspot.
   A real deployment swaps this for WebRTC DataChannels / mDNS / BLE. */
const PEERS_KEY = 'meshlink-local-peers-v1';
const CHANNEL = 'meshlink-local-lan';
const listeners = new Set();
let channel = null;
let peers = [];

export function initLocalTransport() {
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (e) => {
      const msg = e.data || {};
      if (msg.type === 'peer:hello') {
        peers = mergePeer(peers, msg.peer);
        save();
        emitPeers();
      } else if (msg.type === 'event') {
        listeners.forEach((fn) => { try { fn(msg.event); } catch { /* noop */ } });
      }
    };
  } catch { /* no BroadcastChannel */ }
  try {
    peers = JSON.parse(localStorage.getItem(PEERS_KEY) || '[]');
  } catch { peers = []; }
  announce();
  setInterval(announce, 15000);
  return peers;
}

function mergePeer(list, peer) {
  if (!peer?.id) return list;
  const others = list.filter((p) => p.id !== peer.id);
  return [...others, { ...peer, seenAt: Date.now() }].slice(-12);
}

function save() {
  try { localStorage.setItem(PEERS_KEY, JSON.stringify(peers)); } catch { /* noop */ }
}

function announce() {
  try {
    channel?.postMessage({
      type: 'peer:hello',
      peer: { id: navigator.userAgent.slice(-10), name: 'This device', transport: 'LAN', at: Date.now() },
    });
  } catch { /* noop */ }
}

export function localPeers() {
  return peers.filter((p) => Date.now() - (p.seenAt || 0) < 60000);
}

export function sendLocal(event) {
  try { channel?.postMessage({ type: 'event', event: { ...event, transport: 'local' } }); } catch { /* noop */ }
}

export function onLocalEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitPeers() {
  window.dispatchEvent(new CustomEvent('meshlink:local-peers', { detail: localPeers() }));
}

export const localTransport = {
  id: 'local', label: 'LAN / hotspot (BroadcastChannel demo)', init: initLocalTransport,
  send: sendLocal, onEvent: onLocalEvent,
};
