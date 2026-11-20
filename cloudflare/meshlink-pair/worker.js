/* Mhzaly QR pairing Durable Object + email OTP verification.
 * Deployed as a separate Worker, then bound into the Pages project.
 *
 * The Mhzaly ID stays the identity. Email is only used to verify it —
 * it is never a login name and never a phone number. No plaintext OTP is
 * stored: only an HMAC-SHA256 digest plus expiry/attempt metadata.
 */
import { DurableObject } from 'cloudflare:workers';

const TTL = 30_000;
// A manually typed pairing code gets a little longer so it can be entered.
const MANUAL_TTL = 90_000;

// Email verification settings. Real email needs RESEND_API_KEY; without it the
// endpoint runs in demo mode and only accepts the demo code 123456.
const DEV_OTP_SECRET = 'meshlink-dev-otp-secret';
const OTP_TTL = 5 * 60_000;
const OTP_COOLDOWN = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const RATE_WINDOW = 10 * 60_000;
const EMAIL_RATE_LIMIT = 5;
const MESH_RATE_LIMIT = 10;
const encoder = new TextEncoder();

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  },
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase().slice(0, 254);
const normalizeMeshId = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const otpMessage = (meshId, email, code) => `${meshId}|${email}|${code}`;

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compare two strings without leaking their contents through early exit. */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Encrypt the OTP payload so it is safe to pass through a public Actions log. */
async function encryptOtpPayload(email, code, meshId, secretB64) {
  const raw = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify({ email, code, meshId, at: Date.now() }));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  let binary = '';
  for (const byte of combined) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Fallback sender: dispatch a GitHub Action that uses the owner's SMTP relay. */
async function sendViaGithub(token, secretB64, email, code, meshId) {
  if (!token || !secretB64) return 'missing-secret';
  try {
    const payload = await encryptOtpPayload(email, code, meshId, secretB64);
    const response = await fetch(
      'https://api.github.com/repos/Iamhasaanzahid/meshlink-android/actions/workflows/send-otp.yml/dispatches',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mhzaly-OTP-Relay',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main', inputs: { payload } }),
      },
    );
    if (response.status === 204) return 'ok';
    return `http-${response.status}:${(await response.text()).slice(0, 160)}`;
  } catch (e) {
    return `error:${String(e?.message || e).slice(0, 160)}`;
  }
}

function rateAllow(rate, key, limit, now) {
  const times = (rate[key] || []).filter((t) => t > now - RATE_WINDOW);
  if (times.length >= limit) { rate[key] = times; return false; }
  times.push(now);
  rate[key] = times;
  return true;
}

export class PairSessions extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
    this.sockets = new Set();
    // Per-isolate rate buckets for pairing endpoints (persisted verifyMeta is
    // handled separately below).
    this.rate = {};
  }

  clientIp(request) {
    return request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
      || 'unknown';
  }

  /** Fan out realtime events to every other connected browser/device. */
  handleSocket() {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sockets.add(server);
    server.addEventListener('message', (event) => {
      for (const socket of this.sockets) {
        if (socket !== server && socket.readyState === WebSocket.OPEN) {
          try { socket.send(event.data); } catch { /* dead socket */ }
        }
      }
    });
    const close = () => this.sockets.delete(server);
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    return new Response(null, { status: 101, webSocket: client });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleSocket();
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.startsWith('/api/bridge/')) return this.handleBridge(request, path);
    if (path.startsWith('/api/verify/')) return this.handleVerify(request, url, path);
    const sessions = (await this.state.storage.get('sessions')) || {};
    const codes = (await this.state.storage.get('codes')) || {};
    const now = Date.now();

    for (const [code, sid] of Object.entries(codes)) {
      if (!sessions[sid] || sessions[sid].expires < now) delete codes[code];
    }

    // WhatsApp Web style manual fallback: the phone shows an 8-digit code,
    // the web app claims it, then the phone approves the claimed session.
    if (path === '/api/pair/manual' && request.method === 'POST') {
      if (!rateAllow(this.rate, `manual:${this.clientIp(request)}`, 20, now)) {
        return json({ error: 'Too many pairing requests. Try again later.' }, 429);
      }
      let payload = {};
      try { payload = await request.json(); } catch { /* noop */ }
      const session = Array.from(crypto.getRandomValues(new Uint8Array(24)),
        (b) => b.toString(16).padStart(2, '0')).join('');
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)),
        (b) => b.toString(16).padStart(2, '0')).join('');
      const code = Array.from(crypto.getRandomValues(new Uint8Array(8)),
        (b) => String(b % 10)).join('');
      const expires = now + MANUAL_TTL;
      sessions[session] = {
        token, expires, status: 'pending', peer: null,
        peerName: String(payload.name || 'Mhzaly phone').slice(0, 48),
        peerMeshId: String(payload.meshId || '').replace(/\D/g, '').slice(0, 10),
      };
      codes[code] = session;
      await this.state.storage.put({ sessions, codes });
      return json({ session, token, code, expires: expires / 1000 });
    }

    if (path === '/api/pair/claim' && request.method === 'POST') {
      if (!rateAllow(this.rate, `claim:${this.clientIp(request)}`, 40, now)) {
        return json({ error: 'Too many code attempts. Try again later.' }, 429);
      }
      let payload = {};
      try { payload = await request.json(); } catch { /* noop */ }
      const code = String(payload.code || '').replace(/\D/g, '');
      const sid = codes[code];
      const s = sid ? sessions[sid] : null;
      if (!s || s.expires < now) return json({ error: 'invalid or expired code' }, 410);
      s.claimed = true;
      s.status = 'claimed';
      await this.state.storage.put('sessions', sessions);
      await this.state.storage.put(`claimed:${sid}`, true);
      return json({ session: sid, meshId: s.peerMeshId, name: s.peerName });
    }

    if (path === '/api/pair/session' && request.method === 'POST') {
      if (!rateAllow(this.rate, `session:${this.clientIp(request)}`, 20, now)) {
        return json({ error: 'Too many pairing requests. Try again later.' }, 429);
      }
      const session = Array.from(crypto.getRandomValues(new Uint8Array(24)),
        (b) => b.toString(16).padStart(2, '0')).join('');
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16)),
        (b) => b.toString(16).padStart(2, '0')).join('');
      sessions[session] = { token, expires: now + TTL, status: 'pending', peer: null };
      await this.state.storage.put('sessions', sessions);
      return json({ session, token, expires: (now + TTL) / 1000 });
    }

    const sid = url.searchParams.get('session') || '';
    if (path === '/api/pair/status') {
      const s = sessions[sid];
      if (!s || s.expires < now) return json({ status: 'expired' }, 410);
      const claimed = await this.state.storage.get(`claimed:${sid}`);
      return json({
        status: s.status,
        peer: s.peer,
        claimed: !!(claimed || s.claimed),
        bridgeSecret: s.status === 'approved' ? (s.bridgeSecret || '') : '',
        expires: s.expires / 1000,
      });
    }

    if (path === '/api/pair/approve' && request.method === 'POST') {
      let payload = {};
      try { payload = await request.json(); } catch { /* noop */ }
      const s = sessions[String(payload.session || '')];
      if (!s || s.expires < now) return json({ error: 'expired' }, 410);
      if (!s.token || !constantTimeEqual(String(payload.token || ''), s.token)) {
        return json({ error: 'invalid token' }, 403);
      }
      s.status = 'approved';
      s.peer = {
        meshId: String(payload.meshId || '').replace(/\D/g, '').slice(0, 10),
        name: String(payload.name || 'Mhzaly phone').slice(0, 48),
        about: 'Linked from Mhzaly mobile',
      };
      const secret = String(payload.bridgeSecret || '');
      if (/^[0-9a-f]{32,64}$/i.test(secret)) {
        s.bridgeSecret = secret;
        const bridge = await this.bridgeState();
        bridge.secrets[s.peer.meshId] = secret;
        await this.state.storage.put('bridge', bridge);
      }
      await this.state.storage.put('sessions', sessions);
      return json({ status: 'approved' });
    }

    return json({ error: 'not found' }, 404);
  }

  // ------------------------------------------- authenticated Cloudflare relay
  async bridgeState() {
    const bridge = (await this.state.storage.get('bridge')) || {};
    bridge.secrets = bridge.secrets || {};
    bridge.messages = bridge.messages || [];
    bridge.seq = bridge.seq || 0;
    return bridge;
  }

  /**
   * Private HTTPS bridge. Every device proves the pairing secret on each call,
   * so the relay is authenticated and no public MQTT topic is needed. Payloads
   * stay opaque to the worker: the app layer already encrypts them.
   */
  async handleBridge(request, path) {
    let payload = {};
    try { payload = await request.json(); } catch { /* noop */ }
    const meshId = normalizeMeshId(payload.meshId);
    const secret = String(payload.secret || '');

    if (path === '/api/bridge/register' && request.method === 'POST') {
      if (!meshId || !/^[0-9a-f]{32,64}$/i.test(secret)) {
        return json({ error: 'valid mesh ID and secret required' }, 400);
      }
      const bridge = await this.bridgeState();
      const known = bridge.secrets[meshId] || '';
      if (known && !constantTimeEqual(known, secret)) {
        return json({ error: 'secret already registered for this ID' }, 409);
      }
      bridge.secrets[meshId] = secret;
      await this.state.storage.put('bridge', bridge);
      return json({ ok: true });
    }

    if (!meshId || !secret) return json({ error: 'bridge authentication required' }, 401);
    let bridge = await this.bridgeState();
    if (!constantTimeEqual(bridge.secrets[meshId] || '', secret)) {
      return json({ error: 'unauthorized' }, 403);
    }

    if (path === '/api/bridge/publish' && request.method === 'POST') {
      const to = normalizeMeshId(payload.to);
      const data = String(payload.payload || '').slice(0, 20_000);
      if (!to || !data) return json({ error: 'recipient and payload required' }, 400);
      bridge.seq += 1;
      bridge.messages.push({
        id: `b${bridge.seq}-${meshId}`,
        seq: bridge.seq,
        to,
        from: meshId,
        data,
        expires: Date.now() + 7 * 86_400_000,
      });
      if (bridge.messages.length > 5_000) {
        bridge.messages = bridge.messages.slice(-2_000);
      }
      await this.state.storage.put('bridge', bridge);
      return json({ ok: true, seq: bridge.seq });
    }

    if (path === '/api/bridge/poll' && request.method === 'POST') {
      const since = Number(payload.since || 0) || 0;
      const deadline = Date.now() + 18_000;
      while (true) {
        const now = Date.now();
        bridge.messages = bridge.messages.filter((m) => m.expires > now);
        const fresh = bridge.messages.filter((m) => m.to === meshId && m.seq > since);
        if (fresh.length) return json({ ok: true, messages: fresh, seq: bridge.seq, now });
        if (now >= deadline) return json({ ok: true, messages: [], seq: bridge.seq, now });
        await new Promise((resolve) => setTimeout(resolve, 900));
        bridge = await this.bridgeState();
      }
    }

    return json({ error: 'not found' }, 404);
  }

  // ------------------------------------------------------ email verification
  handleVerify(request, url, path) {
    if (path === '/api/verify/send' && request.method === 'POST') return this.verifySend(request);
    if (path === '/api/verify/confirm' && request.method === 'POST') return this.verifyConfirm(request);
    if (path === '/api/verify/status' && request.method === 'GET') return this.verifyStatus(url);
    return json({ error: 'not found' }, 404);
  }

  get otpSecret() {
    return this.env?.OTP_SECRET || DEV_OTP_SECRET;
  }

  async otpHash(meshId, email, code) {
    return hmacHex(this.otpSecret, otpMessage(meshId, email, code));
  }

  async verifyMeta() {
    const meta = (await this.state.storage.get('verifyMeta')) || {};
    const now = Date.now();
    meta.pending = meta.pending || {};
    meta.cooldown = meta.cooldown || {};
    meta.rate = meta.rate || {};
    for (const [key, until] of Object.entries(meta.cooldown)) {
      if (until <= now) delete meta.cooldown[key];
    }
    for (const [key, times] of Object.entries(meta.rate)) {
      const fresh = (times || []).filter((t) => t > now - RATE_WINDOW);
      if (fresh.length) meta.rate[key] = fresh; else delete meta.rate[key];
    }
    return meta;
  }

  async verifySend(request) {
    let payload = {};
    try { payload = await request.json(); } catch { /* noop */ }
    const email = normalizeEmail(payload.email);
    const meshId = normalizeMeshId(payload.meshId);
    if (!validEmail(email) || meshId.length !== 10) {
      return json({ error: 'A valid email and 10-digit Mhzaly ID are required' }, 400);
    }

    const now = Date.now();
    const meta = await this.verifyMeta();
    for (const [key, rec] of Object.entries(meta.pending)) {
      if (!rec || rec.expires <= now) delete meta.pending[key];
    }
    if (meta.cooldown[email] > now) {
      return json({
        error: 'Please wait before requesting another code',
        retryAfter: Math.ceil((meta.cooldown[email] - now) / 1000),
      }, 429);
    }
    if (!rateAllow(meta.rate, `email:${email}`, EMAIL_RATE_LIMIT, now)
      || !rateAllow(meta.rate, `mesh:${meshId}`, MESH_RATE_LIMIT, now)) {
      await this.state.storage.put('verifyMeta', meta);
      return json({ error: 'Too many verification requests. Try again later.' }, 429);
    }
    meta.cooldown[email] = now + OTP_COOLDOWN;

    const apiKey = this.env?.RESEND_API_KEY;
    const demo = !apiKey;
    // In demo mode the only accepted 6-digit code is 123456 — nothing is sent.
    const code = demo
      ? '123456'
      : String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
    if (!demo) {
      try {
        const sent = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.env.VERIFY_FROM || 'onboarding@resend.dev',
            to: [email],
            subject: 'Mhzaly verification code',
            text: `Your Mhzaly verification code is ${code}. It expires in 5 minutes.\n\nIf you did not request this, you can ignore this email.`,
          }),
        });
        if (!sent.ok) {
          const relay = await sendViaGithub(
            this.env?.GITHUB_OTP_TOKEN,
            this.env?.OTP_RELAY_SECRET,
            email,
            code,
            meshId,
          );
          if (relay !== 'ok') {
            await this.state.storage.put('verifyMeta', meta);
            return json({ error: 'Could not send verification email' }, 502);
          }
        }
      } catch {
        const relay = await sendViaGithub(
          this.env?.GITHUB_OTP_TOKEN,
          this.env?.OTP_RELAY_SECRET,
          email,
          code,
          meshId,
        );
        if (relay !== 'ok') {
          await this.state.storage.put('verifyMeta', meta);
          return json({ error: 'Could not send verification email' }, 502);
        }
      }
    }

    meta.pending[`${meshId}|${email}`] = {
      hash: await this.otpHash(meshId, email, code),
      expires: now + OTP_TTL,
      attempts: 0,
    };
    await this.state.storage.put('verifyMeta', meta);
    // Only expose the demo flag — never the code, even in demo mode.
    return json({ ok: true, demo });
  }

  async verifyConfirm(request) {
    let payload = {};
    try { payload = await request.json(); } catch { /* noop */ }
    const email = normalizeEmail(payload.email);
    const meshId = normalizeMeshId(payload.meshId);
    const code = String(payload.code || '').trim().replace(/\D/g, '').slice(0, 6);
    if (!validEmail(email) || meshId.length !== 10 || !/^\d{6}$/.test(code)) {
      return json({ error: 'A valid email, Mhzaly ID and 6-digit code are required' }, 400);
    }

    const now = Date.now();
    const meta = await this.verifyMeta();
    const key = `${meshId}|${email}`;
    const pending = meta.pending[key];
    if (!pending || pending.expires <= now) {
      if (pending) delete meta.pending[key];
      await this.state.storage.put('verifyMeta', meta);
      return json({ error: 'Code expired — please request a new one' }, 410);
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS
      || !rateAllow(meta.rate, `confirm:email:${email}`, 20, now)
      || !rateAllow(meta.rate, `confirm:mesh:${meshId}`, 30, now)) {
      delete meta.pending[key];
      await this.state.storage.put('verifyMeta', meta);
      return json({ error: 'Too many attempts — please request a new code' }, 429);
    }
    pending.attempts += 1;

    const candidate = await this.otpHash(meshId, email, code);
    if (!constantTimeEqual(candidate, pending.hash)) {
      const exhausted = pending.attempts >= OTP_MAX_ATTEMPTS;
      if (exhausted) delete meta.pending[key];
      await this.state.storage.put('verifyMeta', meta);
      return json({
        error: exhausted ? 'Too many attempts — please request a new code' : 'Invalid code',
        attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - pending.attempts),
      }, exhausted ? 429 : 401);
    }

    delete meta.pending[key];
    await this.state.storage.put('verifyMeta', meta);
    // Verified record is keyed by meshId|email so status can find any email.
    await this.state.storage.put(key, { verified: true, email, at: now });
    return json({ verified: true, email });
  }

  async verifyStatus(url) {
    const meshId = normalizeMeshId(url.searchParams.get('meshId'));
    if (meshId.length !== 10) return json({ verified: false });
    const records = await this.state.storage.list({ prefix: `${meshId}|` });
    let found = null;
    for (const value of records.values()) {
      if (value?.verified && value.email && (!found || (value.at || 0) > (found.at || 0))) found = value;
    }
    return found ? json({ verified: true, email: found.email }) : json({ verified: false });
  }
}

export default {
  async fetch(request, env) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const id = env.PAIR_SESSIONS.idFromName('meshlink-relay-v2');
      return env.PAIR_SESSIONS.get(id).fetch(request);
    }
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/')) {
      const name = path.startsWith('/api/bridge/') ? 'meshlink-relay-v2' : 'meshlink-web-v2';
      const id = env.PAIR_SESSIONS.idFromName(name);
      return env.PAIR_SESSIONS.get(id).fetch(request);
    }
    return new Response('Mhzaly pairing + relay Worker', { status: 200 });
  },
};
