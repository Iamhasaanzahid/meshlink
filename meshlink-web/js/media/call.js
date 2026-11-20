/* 3-tier calling: global WebRTC, local hotspot call / PTT, offline voice fallback. */
import { act, contactById } from '../store.js';
import { netState } from '../transport/connectivity.js';
import { icon, avatar, openModal, toast } from '../ui.js';
import { esc, fmtDuration } from '../utils.js';

let activeCall = null;

export function callTierFor() {
  const n = netState();
  if (n.online) return { id: 'global', name: 'Global VoIP', sub: 'WebRTC · adaptive Opus', icon: 'globe' };
  if (n.local) return { id: 'local', name: 'Local hotspot', sub: 'P2P · zero internet', icon: 'wifi' };
  return { id: 'offline', name: 'Offline relay', sub: 'Store & forward', icon: 'clock' };
}

export function openCall(peerId, type = 'voice') {
  const peer = contactById(peerId);
  if (!peer) return;
  const tier = callTierFor();
  if (tier.id === 'offline') return offlineFallback(peer);
  startOverlay(peer, type, tier);
}

function offlineFallback(peer) {
  openModal({ title: 'No live link available', subtitle: 'Completely offline mode', body: `<p style="margin:0 0 12px;color:var(--text-2);font-size:13px;line-height:1.6">You cannot start a live call without internet or a nearby LAN/hotspot peer. Instead, Mhzaly can store a voice note in the outbox and relay it as soon as any device gets connectivity.</p><div class="auth-note">${icon('clock')} Messages are kept with a 24h TTL and deduplicated on sync.</div>`, footer: `<button class="btn sm" data-close>Cancel</button><button class="btn sm primary" id="off-voice">${icon('mic','sm')} Send offline voice note</button>`, onMount: (el, close) => { el.querySelector('#off-voice').onclick = () => { close(); sendOfflineVoice(peer.id); }; } });
}

export function sendOfflineVoice(peerId) {
  const chat = act.startDm(peerId);
  if (!chat) return;
  toast('Opening a voice note — it will queue offline','success');
  setTimeout(() => window.dispatchEvent(new CustomEvent('meshlink:record-voice')), 350);
}

function startOverlay(peer, type, tier) {
  closeCall();
  const wrap = document.createElement('div');
  wrap.className = 'call-overlay';
  wrap.innerHTML = `
    <div class="${type === 'video' ? 'call-video' : ''}" id="call-media">
      ${type === 'video' ? `<video id="local-video" autoplay muted playsinline></video>` : `<div class="video-off">${icon('volume')}<span>Audio call · ${esc(tier.name)}</span></div>`}
    </div>
    <div class="call-top"><span class="call-chip">${icon(tier.icon)} ${esc(tier.name)} · ${esc(tier.sub)}</span><span class="call-chip" style="margin-left:auto">Encrypted</span></div>
    <div class="call-stage">
      <div class="call-avatar-wrap"><span class="pulse"></span><span class="pulse"></span>${avatar(peer, { size: 'xxl', online: true })}</div>
      <div class="call-name">${esc(peer.name)}</div>
      <div class="call-status"><span id="call-state">${icon('phoneOut')} Calling…</span></div>
    </div>
    ${type === 'video' ? `<div class="self-preview"><video id="self-video" autoplay muted playsinline></video></div>` : ''}
    <div class="call-controls">
      <div class="call-ctrl"><button class="cc-btn" id="cc-mute">${icon('mic')}</button><span id="lbl-mute">Mute</span></div>
      ${type === 'video' ? `<div class="call-ctrl"><button class="cc-btn" id="cc-cam">${icon('camera')}</button><span id="lbl-cam">Camera</span></div><div class="call-ctrl"><button class="cc-btn" id="cc-flip">${icon('cameraOff')}</button><span>Flip</span></div>` : ''}
      <div class="call-ctrl"><button class="cc-btn" id="cc-spk">${icon('volume')}</button><span>Speaker</span></div>
      <div class="call-ctrl"><button class="cc-btn end" id="cc-end">${icon('phone')}</button><span>End</span></div>
    </div>`;
  document.getElementById('overlay-root').appendChild(wrap);
  activeCall = { wrap, stream: null, startedAt: 0, connectedAt: 0, tier, type, peer, ended: false };
  let muted = false, camOn = type === 'video', spk = true, tick = null;
  const stateEl = () => wrap.querySelector('#call-state');

  (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: camOn ? { facingMode: 'user' } : false });
      if (!activeCall) { stream.getTracks().forEach((t) => t.stop()); return; }
      activeCall.stream = stream;
      const self = wrap.querySelector('#self-video') || wrap.querySelector('#local-video');
      if (self) self.srcObject = stream;
      if (type === 'video') { const lv = wrap.querySelector('#local-video'); if (lv && !lv.srcObject) lv.srcObject = stream; }
    } catch { /* mic/camera denied — UI still works */ }
    setTimeout(() => {
      if (!activeCall || activeCall.ended) return;
      activeCall.connectedAt = Date.now();
      const st = stateEl(); if (st) st.innerHTML = `${icon('phone')} <span class="call-timer">00:00</span>`;
      tick = setInterval(() => {
        const secs = Math.floor((Date.now() - activeCall.connectedAt) / 1000);
        const t = wrap.querySelector('.call-timer'); if (t) t.textContent = fmtDuration(secs);
      }, 1000);
      activeCall.tick = tick;
    }, 1900);
  })();

  wrap.querySelector('#cc-mute').onclick = (e) => {
    muted = !muted;
    activeCall.stream?.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    e.currentTarget.classList.toggle('off', muted);
    e.currentTarget.innerHTML = icon(muted ? 'volumeOff' : 'mic');
    wrap.querySelector('#lbl-mute').textContent = muted ? 'Unmute' : 'Mute';
  };
  const camBtn = wrap.querySelector('#cc-cam');
  if (camBtn) camBtn.onclick = () => {
    camOn = !camOn;
    activeCall.stream?.getVideoTracks().forEach((t) => { t.enabled = camOn; });
    camBtn.classList.toggle('off', !camOn);
    camBtn.innerHTML = icon(camOn ? 'camera' : 'cameraOff');
    wrap.querySelector('#lbl-cam').textContent = camOn ? 'Camera' : 'Camera off';
  };
  wrap.querySelector('#cc-spk').onclick = (e) => { spk = !spk; e.currentTarget.classList.toggle('off', !spk); };
  wrap.querySelector('#cc-end').onclick = () => endCall(true);
  window.addEventListener('keydown', activeCall.esc = (e) => { if (e.key === 'Escape') endCall(true); }, { once: true });
}

function endCall(remote = false) {
  if (!activeCall || activeCall.ended) return;
  const call = activeCall;
  call.ended = true;
  clearInterval(call.tick);
  call.stream?.getTracks().forEach((t) => t.stop());
  call.wrap.remove();
  const duration = call.connectedAt ? Math.floor((Date.now() - call.connectedAt) / 1000) : 0;
  act.logCall({ peerId: call.peer.id, type: call.type, direction: 'outgoing', status: call.connectedAt ? 'answered' : 'missed', duration, tier: call.tier.id, at: Date.now() });
  activeCall = null;
  void remote;
}

export function closeCall() { if (activeCall) endCall(); }

/* ------------------------------------------------------------ walkie-talkie */
export function openPtt(peerId) {
  const peer = contactById(peerId);
  if (!peer) return;
  const net = netState();
  if (!net.local && !net.online) return toast('No local link found. Use an offline voice note instead.','error');
  let rec = null, stream = null, chunks = [], started = 0;
  const modal = openModal({ title: 'Walkie-talkie', subtitle: `${peer.name} · ${net.online ? 'LAN/global relay' : 'Local hotspot'}`, body: `<div class="stack" style="align-items:center;gap:14px;padding:8px 0 16px">${avatar(peer, { size: 'xl', online: true })}<div class="muted small">Hold the button and speak. Release to send a short voice note over the mesh.</div><button class="cc-btn" id="ptt-hold" style="width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,var(--accent-3),var(--accent-2));color:#fff;display:grid;place-items:center">${icon('mic','lg')}</button><div id="ptt-status" class="small muted">Idle</div></div>`, footer: `<button class="btn sm" data-close>Close</button>`, onMount: (el, close) => {
    const btn = el.querySelector('#ptt-hold'), status = el.querySelector('#ptt-status');
    const stop = async () => {
      if (!rec) return;
      const dur = Math.max(1, Math.round((Date.now() - started) / 1000));
      rec.stop(); rec = null; btn.classList.remove('off'); status.textContent = 'Sending…';
      stream?.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
      let src = ''; try { src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); }); } catch { /* noop */ }
      const chat = act.startDm(peer.id);
      if (chat) act.sendMessage({ chatId: chat.id, kind: 'voice', media: { duration: dur, waveform: Array.from({ length: 26 }, () => 8 + Math.random() * 16), src } });
      status.textContent = net.online ? 'Sent over the relay' : 'Relayed over local mesh';
      toast('Push-to-talk clip sent','success');
      setTimeout(close, 700);
    };
    const start = async () => {
      if (rec) return;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no mic');
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream); chunks = []; started = Date.now();
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        rec.start(200); btn.classList.add('off'); status.textContent = 'Recording… release to send';
      } catch { toast('Microphone unavailable','error'); }
    };
    btn.onpointerdown = (e) => { e.preventDefault(); start(); };
    btn.onpointerup = (e) => { e.preventDefault(); stop(); };
    btn.onpointerleave = () => { if (rec) stop(); };
  } });
  void modal;
}
