/* Nearby offline peers: local discovery, chat, PTT, QR-style handshake. */
import { getState, contactById } from '../store.js';
import { icon, avatar, openModal, toast } from '../ui.js';
import { esc, fmtRelative } from '../utils.js';
import { netState, NET_MODES, getNetMode, setNetMode } from '../transport/connectivity.js';
import { openCall, openPtt } from '../media/call.js';
import { localPeers, initLocalTransport } from '../transport/localTransport.js';
import { act } from '../store.js';

let scanned = false;

export function renderNearbyPage() {
  const s = getState();
  const net = netState();
  const demo = s.contacts.slice(0, 5).map((c, i) => ({ ...c, distance: (i + 1) * 6, transport: i % 2 ? 'Bluetooth LE' : 'Wi-Fi Direct', strength: 92 - i * 9 }));
  if (scanned) initLocalTransport();
  return `<div class="page"><div class="page-inner">
    <div class="page-head"><div><div class="eyebrow">Zero-internet mesh</div><h1>Nearby peers</h1><p>Devices on the same hotspot or LAN can chat and call without internet.</p></div><div class="head-actions"><button class="btn" data-action="scan-peers">${icon('wifi')} ${scanned?'Scanning…':'Scan nearby'}</button><button class="btn primary" data-action="offline-broadcast">${icon('mic')} Broadcast voice</button></div></div>
    <div class="card set-card" style="margin-bottom:18px;display:flex;gap:14px;align-items:center;background:linear-gradient(135deg,var(--surface),var(--panel))">
      <div style="width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-3)">${icon('wifi','lg')}</div>
      <div class="grow"><div style="font-weight:750">${esc(net.label)}</div><div class="muted small">${net.local?'Local discovery is active. No cloud relay required.':'Global relay is active — local mesh remains available as fallback.'}</div></div>
      <span class="tag ${net.online?'mint':'purple'}">${esc(net.short)}</span>
    </div>
    <div class="page-section"><h3>Within range · demo peers</h3><div class="settings-grid" style="grid-template-columns:1fr 1fr">
      ${demo.map((p)=>`<div class="card set-card" style="display:flex;gap:12px;align-items:center">${avatar(p,{size:'lg',online:true})}<div class="grow" style="min-width:0"><div style="font-weight:700;font-size:13px">${esc(p.name)}</div><div class="muted small">${p.transport} · ${p.distance} m · ${p.strength}%</div><div class="row" style="gap:2px;margin-top:6px"><button class="icon-btn sm" data-action="peer-chat" data-id="${p.id}" title="Chat">${icon('message','sm')}</button><button class="icon-btn sm" data-action="peer-call" data-id="${p.id}" title="Call">${icon('phone','sm')}</button><button class="icon-btn sm" data-action="peer-ptt" data-id="${p.id}" title="Walkie-talkie">${icon('mic','sm')}</button></div></div></div>`).join('')}
    </div></div>
    <div class="page-section"><h3>Offline handshake</h3><div class="card set-card"><div class="row" style="gap:12px"><div class="si-ic" style="width:44px;height:44px">${icon('key')}</div><div class="grow"><div style="font-weight:700;font-size:13px">QR / SDP handshake</div><div class="muted small">In a real deployment, scan a peer's QR code to exchange SDP + ICE candidates with zero infrastructure. This demo uses BroadcastChannel between tabs on the same origin.</div></div><button class="btn sm" data-action="show-qr">Show demo code</button></div></div></div>
    <div class="page-section"><h3>Network mode simulator</h3><div class="settings-grid" style="grid-template-columns:1fr 1fr">${NET_MODES.map((m)=>`<button class="card set-card" data-action="set-net" data-mode="${m.id}" style="text-align:left;border-color:${getNetMode()===m.id?'var(--accent)':'var(--line)'}"><div class="row"><div class="si-ic">${icon(m.id==='online'?'globe':m.id==='local'?'wifi':m.id==='offline'?'clock':'sparkles')}</div><div class="grow"><div style="font-weight:700;font-size:12.5px">${esc(m.label)}</div><div class="muted small">${esc(m.desc)}</div></div></div></button>`).join('')}</div></div>
  </div></div>`;
}

export function handleNearbyAction(action, el) {
  if (action==='scan-peers') { scanned = true; initLocalTransport(); toast(`Found ${localPeers().length + 5} nearby peers (demo)`, 'success'); return true; }
  if (action==='peer-chat') { act.startDm(el.dataset.id); return true; }
  if (action==='peer-call') { openCall(el.dataset.id, 'voice'); return true; }
  if (action==='peer-ptt') { openPtt(el.dataset.id); return true; }
  if (action==='offline-broadcast') { openPtt(getState().contacts[0]?.id); return true; }
  if (action==='show-qr') { showQr(); return true; }
  if (action==='set-net') { setNetMode(el.dataset.mode); act.setNetworkMode(el.dataset.mode); toast(`Network mode: ${el.dataset.mode}`, 'success'); return true; }
  return false;
}

function showQr() {
  const id = `MESHLINK:${navigator.userAgent.slice(-8)}:${Date.now().toString(36)}`;
  openModal({ title:'Offline handshake code', subtitle:'Scan to exchange SDP/ICE without a server', body:`<div class="stack" style="align-items:center;gap:12px"><div style="width:190px;height:190px;border-radius:18px;background:#fff;padding:10px;display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${Array.from({length:49},(_,i)=>`<span style="background:${(i*7+3)%5<2||i<3?'#1d1135':'transparent'};border-radius:2px"></span>`).join('')}</div><code class="mono small" style="word-break:break-all;text-align:center;color:var(--muted)">${esc(id)}</code><div class="auth-note">${icon('shield')} This is a visual demo of an offline QR handshake. Real QR payloads can carry a compressed SDP offer for WebRTC.</div></div>`, footer:`<button class="btn sm" data-close>Close</button>` });
}
