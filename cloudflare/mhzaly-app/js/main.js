/* Mhzaly app shell: auth, navigation, rendering, global events. */
import { initStore, act, getState, subscribe, unreadTotal, chatById } from './store.js';
import { icon, avatar, toast, confirmDialog } from './ui.js';
import { esc, playChime, browserNotify, canNotify, formatMeshId } from './utils.js';
import { hasPin, securitySummary } from './security.js';
import {
  renderSidebar, renderChatMain, mountChat, captureScroll, onComposerInput,
  handleChatAction, startVoiceRecording,
} from './chats.js';
import { renderStatusPage, openAddStatus, openStatusViewer } from './views/status.js';
import { renderCallsPage, handleCallsAction } from './views/calls.js';
import { renderNearbyPage, handleNearbyAction } from './views/nearby.js';
import { renderSettingsPage, handleSettingsAction } from './views/settings.js';
import { renderStarredPage, renderArchivedPage, handleCollectionsAction } from './views/collections.js';
import { renderAiPage, handleAiAction, askAi, refreshAiStatus } from './views/ai.js';
import { netState, onNetChange } from './transport/connectivity.js';
import { initRealtime, onRemote } from './realtime.js';
import { initLocalTransport } from './transport/localTransport.js';
import { openCall, closeCall } from './media/call.js';
import { startQrLogin, renderQr, approvePair, claimPairCode, watchPair } from './pairing.js?v=13';
import { initBridge } from './bridge.js?v=13';

const app = document.getElementById('app');
let profilePhoto = '';
let prevNet = null;
let lastActivity = Date.now();
let qrStop = null;
let qrCurrent = null;
let codeStop = null;

await initStore();
initRealtime();
initLocalTransport();

const WIDE = new Set(['calls', 'nearby', 'status', 'settings', 'starred', 'archived', 'ai']);

function render() {
  const s = getState();
  document.documentElement.dataset.theme = s.settings.theme || 'dark';
  if (s.auth.locked) {
    app.innerHTML = lockHTML();
    const first = document.getElementById('pin-1');
    first?.focus();
    return;
  }
  if (s.auth.stage !== 'ready' || !s.user) {
    if (s.auth.stage !== 'qr' && qrStop) { qrStop(); qrStop = null; }
    const active = document.activeElement?.id;
    const pos = document.activeElement?.selectionStart;
    app.innerHTML = authHTML(s);
    mountThemeToggle(s);
    restoreFocus(active, pos);
    if (s.auth.stage === 'email' && active !== 'verify-email') document.getElementById('verify-email')?.focus();
    if (s.auth.stage === 'otp' && active !== 'otp-code') document.getElementById('otp-code')?.focus();
    if (s.auth.stage === 'qr' && !qrStop) startQrFlow();
    return;
  }
  captureScroll();
  const active = document.activeElement?.id;
  const pos = document.activeElement?.selectionStart;
  const view = s.ui.view || 'chats';
  const wide = WIDE.has(view);
  let content = '';
  if (view === 'chats') content = renderChatMain(s);
  else if (view === 'status') content = renderStatusPage(s);
  else if (view === 'calls') content = renderCallsPage(s);
  else if (view === 'nearby') content = renderNearbyPage(s);
  else if (view === 'settings') content = renderSettingsPage(s);
  else if (view === 'starred') content = renderStarredPage(s);
  else if (view === 'archived') content = renderArchivedPage(s);
  else if (view === 'ai') content = renderAiPage(s);
  const chatOpen = view === 'chats' && s.ui.activeChatId;
  app.innerHTML = `<div class="app ${wide ? 'wide' : ''} ${chatOpen ? 'chat-open' : ''}">${railHTML(s)}${view === 'chats' ? renderSidebar(s) : ''}<main class="main">${content}</main></div>`;
  mountChat(s);
  mountThemeToggle(s);
  if (view === 'ai') refreshAiStatus();
  restoreFocus(active, pos);
}

function restoreFocus(id, pos) {
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  try { el.focus({ preventScroll: true }); if (typeof pos === 'number' && el.setSelectionRange) el.setSelectionRange(pos, pos); } catch { /* noop */ }
}

function railHTML(s) {
  const unread = unreadTotal();
  const view = s.ui.view || 'chats';
  const items = [
    ['chats', 'chat', 'Chats', unread],
    ['calls', 'calls', 'Calls', 0],
    ['nearby', 'wifi', 'Nearby', 0],
    ['ai', 'sparkles', 'Mhzaly AI', 0],
    ['status', 'status', 'Status', 0],
    ['starred', 'star', 'Starred', 0],
    ['archived', 'archive', 'Archived', 0],
    ['settings', 'settings', 'Settings', 0],
  ];
  return `<nav class="rail">
    <div class="rail-logo">${icon('message')}</div>
    <div class="rail-nav">${items.map(([v, ic, label, badge]) => `<button class="nav-btn ${view === v ? 'active' : ''}" data-action="nav" data-view="${v}" title="${label}">${icon(ic)}<span>${label}</span>${badge ? `<span class="nbadge">${badge > 99 ? '99+' : badge}</span>` : ''}</button>`).join('')}</div>
    <div class="rail-spacer"></div>
    <div class="rail-profile" data-action="nav" data-view="settings" title="Profile">${avatar(s.user || {}, { online: true })}</div>
    <div class="rail-version">v1.0</div>
  </nav>`;
}

function themeToggleHTML(s) {
  const light = (s?.settings?.theme || 'dark') === 'light';
  const label = light ? 'Dark mode' : 'Light mode';
  return `<button id="theme-toggle" class="theme-toggle" type="button" data-action="toggle-theme" title="Switch to ${label}" aria-label="Switch to ${label}" aria-pressed="${light}">${icon(light ? 'moon' : 'sun', 'sm')}<span>${light ? 'Dark' : 'Light'}</span></button>`;
}

// One compact toggle in whichever top bar is currently visible.
function mountThemeToggle(s) {
  const html = themeToggleHTML(s);
  const anchors = ['.chat-head .chat-actions', '.side-head .side-actions', '.page-head .head-actions'];
  for (const selector of anchors) {
    const el = document.querySelector(selector);
    if (el && el.offsetParent !== null) { el.insertAdjacentHTML('afterbegin', html); return; }
  }
  const authPanel = document.querySelector('.auth-panel');
  if (authPanel) authPanel.insertAdjacentHTML('afterbegin', `<div class="auth-theme-top">${html}</div>`);
}

function lockHTML() {
  const sec = securitySummary();
  return `<div class="lock-screen"><div class="lock-card">
    <div class="lock-logo">${icon('lock')}</div>
    <h1>Mhzaly is locked</h1>
    <p>Enter your 6-digit app PIN to open your encrypted vault.</p>
    <div class="pin-dots" id="pin-dots">${Array.from({ length: 6 }, () => '<span></span>').join('')}</div>
    <input type="hidden" id="pin-display" value="">
    <div class="pin-error" id="pin-error"></div>
    <div class="pin-pad">${[1,2,3,4,5,6,7,8,9].map((n) => `<button class="pin-key" data-action="pin-digit" data-digit="${n}">${n}</button>`).join('')}<button class="pin-key mute" data-action="pin-forgot">${icon('key')}</button><button class="pin-key" data-action="pin-digit" data-digit="0">0</button><button class="pin-key mute" data-action="pin-delete">${icon('back')}</button></div>
    <button class="btn primary lg block" data-action="pin-submit" id="pin-submit">${icon('lock','sm')} Unlock</button>
    <div class="auth-note">${icon('shield')} ${esc(sec.cipher)} · ${esc(sec.kdf)} · offline</div>
  </div></div>`;
}

function authHTML(s) {
  const stage = s.auth.stage || 'login';
  return `<div class="auth">
    <section class="auth-art">
      <div class="auth-brand"><span class="auth-logo">${icon('message')}</span> Mhzaly</div>
      <div class="auth-copy">
        <div class="auth-kicker"><span class="live"></span> Hybrid messenger + calls</div>
        <h1>Messages that<br><span class="grad">move with you.</span></h1>
        <p>Global chats and WebRTC calls when you're online. Nearby hotspot mesh when the internet disappears. A queued outbox when nothing is reachable.</p>
        <div class="auth-points"><span class="auth-point">${icon('globe')} Global relay</span><span class="auth-point">${icon('wifi')} Offline mesh</span><span class="auth-point">${icon('lock')} Local-first</span><span class="auth-point">${icon('phone')} 3-tier calls</span></div>
        <div class="auth-mock"><div class="auth-bubble"><div class="who">${icon('wifi','xs')} Mesh relay</div>No signal? I'll wait in the outbox and sync later.</div><div class="auth-bubble out"><div class="who">${icon('checkCheck','xs')} Delivered</div>Purple looks unreal 💜</div></div>
      </div>
      <div class="auth-foot">Mhzaly keeps messages usable without a data package. Demo runs fully in your browser.</div>
    </section>
    <section class="auth-panel"><div class="auth-card">
      <div class="auth-mobile-brand"><span class="auth-logo">${icon('message')}</span> Mhzaly</div>
      ${stage === 'login' ? loginHTML() : stage === 'email' ? emailHTML(s) : stage === 'otp' ? otpHTML(s) : stage === 'qr' ? qrHTML() : stage === 'code' ? codeHTML() : profileHTML(s)}
    </div></section>
  </div>`;
}

function loginHTML() {
  const id = formatMeshId(getState().auth.meshId);
  return `<div class="auth-card-head"><h2>Welcome to Mhzaly</h2><p>Mhzaly gives you a private 10-digit identity. Your phone number is never requested — email is only used to verify your ID, never to log in.</p></div>
  <div class="mesh-id-card"><div class="mid-top">${icon('shield')} Your Mhzaly ID</div><div class="mid-number">${esc(id)}</div><div class="mid-sub">Generated securely on this device · share only with people you want to chat with</div></div>
  <form class="auth-form" data-form="login">
    <button class="btn primary lg block" type="submit">Continue ${icon('chevronRight','sm')}</button>
    <div class="auth-or">or</div>
    <button class="btn primary lg block" type="button" data-action="qr-login">${icon('qr')} Scan QR with Mhzaly phone</button>
    <button class="btn lg block" type="button" data-action="code-login">${icon('key')} Use pairing code instead</button>
    <button class="btn lg block" type="button" data-action="demo-login">${icon('sparkles')} Explore demo account</button>
    <div class="auth-note">${icon('info')} QR login rotates every 30 seconds. Without email setup, the demo verification code is <b style="color:var(--accent-3)">123456</b>.</div>
  </form>`;
}

function emailHTML(s) {
  return `<a class="auth-back" href="#" data-action="auth-back">${icon('back','sm')} Back</a>
  <div class="auth-card-head"><h2>Verify your identity</h2><p>Your Mhzaly ID <b style="color:var(--accent-3)">${esc(formatMeshId(s.auth.meshId))}</b> stays your identity. We only use email to send a one-time security code.</p></div>
  <form class="auth-form" data-form="verify-email">
    <div class="field"><label>Email address</label><input class="input" id="verify-email" type="email" placeholder="you@example.com" autocomplete="email" value="${esc(s.auth.verifyEmail || '')}" required></div>
    <button class="btn primary lg block" type="submit" id="send-code">Send code ${icon('chevronRight','sm')}</button>
    <div class="auth-note">${icon('shield')} Email is never used for login, shown to contacts, or stored as a phone number. The code expires in 5 minutes.</div>
  </form>`;
}

function otpHTML(s) {
  const email = s.auth.verifyEmail || s.auth.verifiedEmail || '';
  return `<a class="auth-back" href="#" data-action="auth-back">${icon('back','sm')} Back</a>
  <div class="auth-card-head"><h2>Check your email</h2><p>Enter the 6-digit code sent to <b style="color:var(--accent-3)">${esc(email)}</b> to secure Mhzaly ID <b style="color:var(--accent-3)">${esc(formatMeshId(s.auth.meshId))}</b>.</p></div>
  <form class="auth-form" data-form="otp"><input class="input otp-input" id="otp-code" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="one-time-code"><button class="btn primary lg block" type="submit">Verify ${icon('check','sm')}</button><button class="btn ghost block" type="button" data-action="resend-otp">Resend code</button>${s.auth.verifyDemo ? '<div class="auth-demo">Demo code: <b>123456</b> · no email was sent</div>' : '<div class="auth-note">' + icon('info') + ' The code expires in 5 minutes.</div>'}</form>`;
}

function qrHTML() {
  return `<a class="auth-back" href="#" data-action="auth-back">${icon('back','sm')} Back</a>
  <div class="auth-card-head"><h2>Link with your phone</h2><p>Open <b>Mhzaly</b> on your phone → Settings → <b>Link web</b> → scan this code. The QR changes every 30 seconds.</p></div>
  <div class="qr-wrap">
    <div class="qr-frame" id="qr-image"></div>
    <div class="qr-expiry"><span class="qr-live"></span> <span id="qr-left">30</span>s · rotating</div>
    <div class="qr-status" id="qr-status">Waiting for your phone…</div>
  </div>
  <button class="btn ghost block" type="button" data-action="demo-scan">${icon('sparkles','sm')} Simulate phone scan</button>
  <div class="auth-note">${icon('shield')} One-time token · expires automatically · no password or phone number.</div>`;
}

function codeHTML() {
  return `<a class="auth-back" href="#" data-action="auth-back">${icon('back','sm')} Back</a>
  <div class="auth-card-head"><h2>Enter pairing code</h2><p>On your phone open <b>Mhzaly → Settings → Link web</b>, tap <b>Show pairing code</b>, then type the 8-digit code here.</p></div>
  <form class="auth-form" data-form="pair-code">
    <input class="input otp-input" id="pair-code" inputmode="numeric" maxlength="8" placeholder="••••••••" autocomplete="one-time-code">
    <button class="btn primary lg block" type="submit">Link this browser ${icon('chevronRight','sm')}</button>
  </form>
  <div class="qr-status" id="pair-code-status">Waiting for the code…</div>
  <div class="auth-note">${icon('shield')} The code expires in 90 seconds and the phone must approve the link.</div>`;
}

function profileHTML(s) {
  return `<div class="auth-card-head"><h2>Set up your profile</h2><p>This is how contacts see you. You can change it later in Settings.</p></div>
  <form class="auth-form" data-form="profile">
    <div class="stack" style="align-items:center;gap:8px"><div id="auth-avatar">${avatar({ name: 'New profile', avatar: profilePhoto }, { size: 'xl' })}</div><button class="btn sm" type="button" data-action="pick-avatar">${icon('upload','sm')} Add photo</button><input type="file" id="auth-avatar-file" accept="image/*" hidden></div>
    <div class="field"><label>Your name</label><input class="input" id="profile-name" placeholder="e.g. Ali Hassan" value="${esc(s.user?.name || '')}" required></div>
    <div class="field"><label>About</label><input class="input" id="profile-about" placeholder="Hey there! I am using Mhzaly." value="${esc(s.user?.about || '')}"></div>
    <div class="auth-note" style="margin-bottom:14px">${icon('shield')} Your Mhzaly ID <b style="color:var(--accent-3)">${esc(formatMeshId(s.auth.meshId))}</b> is assigned automatically. No phone number needed.${s.auth.verifiedEmail ? ` Email verified for <b>${esc(s.auth.verifiedEmail)}</b>.` : ''}</div>
    <button class="btn primary lg block" type="submit">Enter Mhzaly ${icon('chevronRight','sm')}</button>
  </form>`;
}

function startQrFlow() {
  qrStop?.();
  qrStop = startQrLogin({
    onUpdate(info) {
      qrCurrent = info;
      const frame = document.getElementById('qr-image');
      if (frame && info.payload) renderQr(frame, info.payload);
      const left = document.getElementById('qr-left');
      if (left) left.textContent = info.remaining ?? 30;
      const status = document.getElementById('qr-status');
      if (status) {
        status.textContent = info.status === 'expired'
          ? 'Code expired — generating a fresh one…'
          : info.status === 'approved'
            ? 'Phone confirmed. Signing you in…'
            : 'Waiting for your phone…';
        status.classList.toggle('approved', info.status === 'approved');
      }
    },
    onError(err) {
      const status = document.getElementById('qr-status');
      if (status) status.textContent = err?.message || 'Pairing server unavailable';
    },
    onApproved(peer) {
      qrStop?.();
      qrStop = null;
      act.linkFromPhone(peer);
      toast('Mhzaly phone linked successfully', 'success');
    },
  });
}

/* ------------------------------------------------------------------ events */
app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (handleChatAction(a, el, e)) return;
  if (handleCallsAction(a, el)) return;
  if (handleNearbyAction(a, el)) return;
  if (handleSettingsAction(a, el)) return;
  if (handleCollectionsAction(a, el)) return;
  if (a.startsWith('ai-')) { handleAiAction(a, el); return; }
  if (a === 'toggle-theme') { act.toggleTheme(); return; }
  if (a === 'nav') { act.setView(el.dataset.view); return; }
  if (a === 'demo-login') { act.loginDemo(); return; }
  if (a === 'qr-login') { codeStop?.(); codeStop = null; act.setStage('qr'); return; }
  if (a === 'code-login') { qrStop?.(); qrStop = null; act.setStage('code'); return; }
  if (a === 'demo-scan') {
    if (!qrCurrent) { toast('QR code is still loading', 'warn'); return; }
    approvePair(qrCurrent.session, qrCurrent.token, {
      meshId: (qrCurrent.peer?.meshId || '1234567890'),
      name: qrCurrent.peer?.name || 'Ali Hassan (phone)',
    }).then(() => toast('Scan approved · waiting for web', 'success'))
      .catch((err) => toast(err.message, 'error'));
    return;
  }
  if (a === 'auth-back') {
    e.preventDefault();
    qrStop?.(); qrStop = null;
    codeStop?.(); codeStop = null;
    act.backToLogin();
    return;
  }
  if (a === 'resend-otp') {
    const button = el;
    button.disabled = true;
    act.resendEmailVerification().then((r) => {
      toast(r.ok ? (r.demo ? 'Demo code resent: 123456' : 'New code sent') : r.error, r.ok ? 'success' : 'error');
    }).catch(() => toast('Verification service unavailable', 'error'))
      .finally(() => { button.disabled = false; });
    return;
  }
  if (a === 'pick-avatar') { document.getElementById('auth-avatar-file')?.click(); return; }
  if (a === 'add-status') { openAddStatus(); return; }
  if (a === 'view-status') { openStatusViewer(el.dataset.id); return; }
  if (a === 'close-call') { closeCall(); return; }
  if (a === 'lock-app') { act.lockApp(); return; }
  if (a === 'pin-digit') {
    const input = document.getElementById('pin-display');
    const dots = document.getElementById('pin-dots');
    const current = (input?.value || '') + el.dataset.digit;
    if (current.length > 6) return;
    if (input) input.value = current;
    if (dots) [...dots.children].forEach((d, i) => d.classList.toggle('on', i < current.length));
    document.getElementById('pin-error').textContent = '';
    return;
  }
  if (a === 'pin-delete') {
    const input = document.getElementById('pin-display');
    const dots = document.getElementById('pin-dots');
    const current = (input?.value || '').slice(0, -1);
    if (input) input.value = current;
    if (dots) [...dots.children].forEach((d, i) => d.classList.toggle('on', i < current.length));
    return;
  }
  if (a === 'pin-submit') { submitPin(); return; }
  if (a === 'pin-forgot') {
    confirmDialog({ title: 'Reset this device?', message: 'Your encrypted vault will be erased and a fresh Mhzaly ID will be generated. This cannot be undone.', confirmLabel: 'Erase & reset' })
      .then(async (ok) => { if (ok) { await act.resetDemo(); toast('Mhzaly reset with a new ID','success'); } });
    return;
  }
});

app.addEventListener('input', (e) => {
  if (e.target.id === 'chat-search') { act.setSearch(e.target.value); render(); }
  else if (e.target.id === 'msg-search') act.setChatSearch(e.target.value);
  else if (e.target.id === 'composer-input') onComposerInput(e.target.value);
  else if (e.target.id === 'ai-input') { const el = document.getElementById('ai-send'); if (el) el.classList.toggle('ready', !!e.target.value.trim()); }
  lastActivity = Date.now();
});

app.addEventListener('change', (e) => {
  if (['file-image', 'file-camera', 'file-video', 'file-doc'].includes(e.target.id)) {
    import('./chats.js').then((m) => m.handleFiles(e.target.files));
  }
  if (e.target.id === 'auth-avatar-file') {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { profilePhoto = String(r.result); const box = document.getElementById('auth-avatar'); if (box) box.innerHTML = avatar({ name: 'New profile', avatar: profilePhoto }, { size: 'xl' }); };
    r.readAsDataURL(f);
  }
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target.dataset.form;
  if (form === 'login') {
    act.setStage('email');
  } else if (form === 'pair-code') {
    const code = document.getElementById('pair-code')?.value.trim();
    const status = document.getElementById('pair-code-status');
    if (!code || code.replace(/\D/g, '').length !== 8) {
      if (status) status.textContent = 'Enter the 8-digit code shown on your phone.';
      return;
    }
    try {
      const claimed = await claimPairCode(code);
      if (status) status.textContent = 'Code found — tap Approve on your phone…';
      codeStop?.();
      codeStop = watchPair(claimed.session, {
        onUpdate(info) {
          if (status && info.status === 'expired') status.textContent = 'Code expired — show a new code on your phone.';
        },
        onError(err) {
          if (status) status.textContent = err?.message || 'Pairing server unavailable';
        },
        onApproved(peer) {
          codeStop = null;
          act.linkFromPhone(peer);
          toast('Mhzaly phone linked successfully', 'success');
        },
      });
    } catch (err) {
      if (status) status.textContent = err?.message || 'Invalid or expired code';
    }
  } else if (form === 'verify-email') {
    const email = document.getElementById('verify-email')?.value.trim();
    const button = document.getElementById('send-code');
    if (button) button.disabled = true;
    try {
      const r = await act.requestEmailVerification(email);
      if (!r.ok) toast(r.error, 'error');
      else if (r.demo) toast('Demo mode — use code 123456', 'success');
    } catch {
      toast('Verification service unavailable', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  } else if (form === 'otp') {
    const code = document.getElementById('otp-code')?.value.trim();
    const r = await act.verifyEmailCode(code);
    if (!r.ok) toast(r.error, 'error');
    else toast('Email verified', 'success');
  } else if (form === 'profile') {
    const name = document.getElementById('profile-name')?.value.trim();
    if (!name) return toast('Your name is required', 'error');
    act.completeProfile({ name, about: document.getElementById('profile-about')?.value.trim(), avatar: profilePhoto });
  } else if (form === 'ai') {
    const t = document.getElementById('ai-input')?.value.trim();
    if (t) askAi(t);
  }
});

app.addEventListener('keydown', (e) => {
  lastActivity = Date.now();
  if (getState().auth.locked) {
    if (/^[0-9]$/.test(e.key)) {
      const btn = document.querySelector(`[data-action="pin-digit"][data-digit="${e.key}"]`);
      btn?.click();
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      document.querySelector('[data-action="pin-delete"]')?.click();
      e.preventDefault();
    } else if (e.key === 'Enter') submitPin();
    return;
  }
  if (e.target.id === 'ai-input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const t = e.target.value.trim();
    if (t) askAi(t);
  }
  if (e.target.id === 'composer-input') {
    if (e.key === 'Enter' && !e.shiftKey && getState().settings.enterToSend) { e.preventDefault(); import('./chats.js').then((m) => m.sendCurrent()); }
  }
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    e.preventDefault(); document.getElementById('chat-search')?.focus();
  }
  if (e.key === 'Escape') { document.querySelector('.emoji-pop')?.remove(); document.querySelector('.composer-attach')?.remove(); }
});

/* ------------------------------------------------------------- app security */
async function submitPin() {
  const input = document.getElementById('pin-display');
  const err = document.getElementById('pin-error');
  const pin = input?.value || '';
  if (pin.length !== 6) { if (err) err.textContent = 'Enter all 6 digits'; return; }
  const ok = await act.unlockApp(pin);
  if (ok) { toast('Vault unlocked','success'); return; }
  if (err) err.textContent = 'Incorrect PIN. Try again.';
  if (input) input.value = '';
  document.getElementById('pin-dots')?.querySelectorAll('span').forEach((d) => d.classList.remove('on'));
}

/* --------------------------------------------------------------- integration */
subscribe(render);

window.addEventListener('meshlink:start-call', (e) => openCall(e.detail.peerId, e.detail.type));
window.addEventListener('meshlink:record-voice', () => startVoiceRecording());
window.addEventListener('meshlink:incoming', (e) => {
  const s = getState();
  if (s.settings.sound) playChime('message');
  if (s.settings.notifications && !e.detail.isActive) browserNotify(`${e.detail.chatTitle}`, `${e.detail.sender?.name || 'New'}: ${e.detail.body}`);
});
window.addEventListener('meshlink:queued', () => toast('Queued offline · 24h TTL','success'));
window.addEventListener('meshlink:synced', (e) => toast(`${e.detail.count} queued message${e.detail.count>1?'s':''} synced`,'success'));
onNetChange((n) => {
  if (prevNet && prevNet !== n.key) toast(n.label, n.online ? 'success' : '');
  prevNet = n.key;
  render();
});
onRemote((event) => {
  if (!event) return;
  if (event.type === 'message:new' && event.message) act.receiveMessage(event.message, { remote: true });
  if (event.type === 'message:update' && event.id) act.revertRemote(event.id, event.patch);
  if (event.type === 'chat:read' && event.chatId) { const c = chatById(event.chatId); if (c) { c.unread = 0; render(); } }
  if (event.type === 'typing' && event.chatId) act.setTyping(event.chatId, event.userId || 'u_peer', event.name || 'Someone', 2200);
});

render();

// Phone → web bridge: authenticated Cloudflare relay first, public MQTT only
// as a compatibility fallback for sessions that never paired with a phone.
function bridgeIncoming({ from, id, body, name, self, to, origin }) {
  const me = getState().auth?.meshId;
  if (self) {
    // A linked Android device sent this message. Show it as our own outgoing
    // message, not as an incoming chat from ourselves.
    if (origin === 'web' || origin === 'android') {
      const peer = to || (origin === 'android' ? from : '');
      if (!/^\d{10}$/.test(peer)) return;
      const chat = getState().chats.find((c) => c.type === 'dm' && c.peerId === peer)
        || act.startDm(peer);
      if (!chat) return;
      act.receiveMessage({
        id,
        chatId: chat.id,
        senderId: 'u_me',
        createdAt: Date.now(),
        kind: 'text',
        text: body,
        media: null,
        link: null,
        replyTo: null,
        reactions: {},
        starredBy: [],
        deletedFor: [],
        deletedForEveryone: false,
        status: 'sent',
        transport: 'global',
      }, { remote: true, own: true });
      render();
    }
    return;
  }
  if (from === me) return;
  const chat = getState().chats.find((c) => c.type === 'dm' && c.peerId === from)
    || act.startDm(from);
  if (!chat) return;
  act.receiveMessage({
    id,
    chatId: chat.id,
    senderId: 'u_peer',
    createdAt: Date.now(),
    kind: 'text',
    text: body,
    media: null,
    link: null,
    replyTo: null,
    reactions: {},
    starredBy: [],
    deletedFor: [],
    deletedForEveryone: false,
    status: 'sent',
    transport: 'global',
  }, { remote: true });
  render();
}

let activeBridgeKey = '';
function refreshBridge() {
  const s = getState();
  const key = `${s.auth?.meshId || ''}|${s.auth?.bridgeSecret || ''}`;
  if (key === activeBridgeKey) return;
  activeBridgeKey = key;
  initBridge(s.auth?.meshId, bridgeIncoming, s.auth?.bridgeSecret || '');
}
refreshBridge();

// Pairing can happen while the app is already open. Restart the bridge as soon
// as the long-lived secret arrives so the private relay takes over from MQTT.
subscribe(() => {
  const s = getState();
  const key = `${s.auth?.meshId || ''}|${s.auth?.bridgeSecret || ''}`;
  if (key !== activeBridgeKey) refreshBridge();
});

window.addEventListener('pointerdown', () => { lastActivity = Date.now(); }, { passive: true });
setInterval(() => {
  if (getState().auth.locked) return;
  if (hasPin() && Date.now() - lastActivity > 5 * 60 * 1000) act.lockApp();
}, 30000);
setInterval(() => { if (getState().auth.stage === 'ready') act.expireStatuses(); }, 60000);
if (!canNotify() && getState().settings.notifications) { /* prompt on first user gesture via Settings */ }
