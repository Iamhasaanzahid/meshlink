/* Short-lived QR link login, WhatsApp-style.
 *
 * The browser opens a 30-second pairing window on the MeshLink server and
 * shows a QR containing a one-time token. The MeshLink phone scans it and
 * approves the link with /api/pair/approve. The browser polls the status and
 * signs in as the linked phone identity — no phone number, no password.
 */

const API = '/api/pair';

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try { detail = (await res.json()).error || detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json();
}

async function get(path) {
  const res = await fetch(`${API}${path}`, { cache: 'no-store' });
  if (res.status === 410) return { status: 'expired' };
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

/** Render a scannable QR into `element` with the current one-time payload. */
export function renderQr(element, text) {
  if (!element || !text) return;
  const qr = window.qrcode?.(0, 'M');
  if (!qr) {
    element.innerHTML = '<div class="qr-error">QR engine unavailable</div>';
    return;
  }
  qr.addData(text);
  qr.make();
  element.innerHTML = qr.createSvgTag(4, 2, 'MeshLink pairing QR');
  const svg = element.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
  }
}

/**
 * Start the rotating QR login flow.
 * @param {object} handlers onUpdate(info), onApproved(peer), onError(error)
 * @returns {() => void} stop function
 */
export function startQrLogin({ onUpdate, onApproved, onError } = {}) {
  let stopped = false;
  let current = null;
  let rotateTimer = null;
  let pollTimer = null;
  let tickTimer = null;

  const emit = (patch) => onUpdate?.({ ...current, ...patch });

  async function poll() {
    if (stopped || !current) return;
    try {
      const data = await get(`/status?session=${encodeURIComponent(current.session)}`);
      if (stopped) return;
      if (data.status === 'approved') {
        clearTimers();
        onApproved?.({ ...(data.peer || {}), bridgeSecret: data.bridgeSecret || '' });
        return;
      }
      if (data.status === 'expired') emit({ status: 'expired' });
    } catch (err) {
      onError?.(err);
    }
  }

  function clearTimers() {
    clearTimeout(rotateTimer);
    clearInterval(pollTimer);
    clearInterval(tickTimer);
  }

  async function rotate() {
    if (stopped) return;
    try {
      const data = await post('/session');
      if (stopped) return;
      current = {
        ...data,
        expiresMs: data.expires * 1000,
        status: 'pending',
        payload: `meshlink://pair?s=${encodeURIComponent(data.session)}&t=${encodeURIComponent(data.token)}&h=${encodeURIComponent(location.origin)}`,
      };
      emit({ status: 'pending' });
      clearTimers();
      pollTimer = setInterval(poll, 1200);
      tickTimer = setInterval(() => {
        if (!current) return;
        const left = Math.max(0, Math.ceil((current.expiresMs - Date.now()) / 1000));
        emit({ remaining: left });
      }, 250);
      rotateTimer = setTimeout(rotate, Math.max(1000, (current.expiresMs - Date.now()) * 0.92));
      poll();
    } catch (err) {
      onError?.(err);
      rotateTimer = setTimeout(rotate, 4000);
    }
  }

  rotate();
  return () => { stopped = true; clearTimers(); };
}

/** Called by a paired mobile device (or a demo scanner) after reading the QR. */
export async function approvePair(session, token, identity) {
  return post('/approve', { session, token, ...identity });
}

/** Manual pairing fallback: claim the 8-digit code shown on the phone. */
export async function claimPairCode(code) {
  return post('/claim', { code });
}

/**
 * Poll an already-claimed manual pairing session until the phone approves.
 * @returns {() => void} stop function
 */
export function watchPair(session, { onUpdate, onApproved, onError } = {}) {
  let stopped = false;
  let timer = null;
  const stop = () => { stopped = true; clearInterval(timer); };
  async function poll() {
    if (stopped) return;
    try {
      const data = await get(`/status?session=${encodeURIComponent(session)}`);
      if (stopped) return;
      if (data.status === 'approved') {
        stop();
        onApproved?.({ ...(data.peer || {}), bridgeSecret: data.bridgeSecret || '' });
        return;
      }
      if (data.status === 'expired') {
        stop();
        onUpdate?.({ status: 'expired' });
        return;
      }
      onUpdate?.({ status: 'pending' });
    } catch (err) {
      onError?.(err);
    }
  }
  timer = setInterval(poll, 1200);
  poll();
  return stop;
}
