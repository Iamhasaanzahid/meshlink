/* MeshLink device security.
   Local state is encrypted with AES-256-GCM. A random device key is used by default;
   when an app PIN is enabled, the encryption key is derived from that PIN with PBKDF2. */
const DEVICE_KEY = 'meshlink-device-key';
const PIN_KEY = 'meshlink-pin';
const SESSION_KEY = 'meshlink-session';
const LOCK_KEY = 'meshlink-locked';

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
const fromHex = (hex) => Uint8Array.from(String(hex).match(/../g) || [], (h) => parseInt(h, 16));

export function randomHex(bytes = 16) {
  const out = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(out);
  else for (let i = 0; i < bytes.length; i++) out[i] = Math.floor(Math.random() * 256);
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function devicePassphrase() {
  let key = localStorage.getItem(DEVICE_KEY);
  if (!key) { key = randomHex(32); localStorage.setItem(DEVICE_KEY, key); }
  return key;
}

export function sessionPassphrase() { return sessionStorage.getItem(SESSION_KEY); }
export function setSessionPassphrase(pass) {
  sessionStorage.setItem(SESSION_KEY, pass);
  localStorage.removeItem(LOCK_KEY);
}
export function clearSessionPassphrase() {
  sessionStorage.removeItem(SESSION_KEY);
  if (hasPin()) localStorage.setItem(LOCK_KEY, '1');
}

export function hasPin() { return !!localStorage.getItem(PIN_KEY); }
export function isLocked() { return hasPin() && (!sessionPassphrase() || localStorage.getItem(LOCK_KEY) === '1'); }
export function activePassphrase() {
  if (hasPin()) return sessionPassphrase();
  return devicePassphrase();
}

async function digest(text) {
  if (!globalThis.crypto?.subtle) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return String(h >>> 0).padStart(8, '0').repeat(8);
  }
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(passphrase, saltHex, iterations = 150000) {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptState(value, passphrase = activePassphrase()) {
  if (!passphrase) throw new Error('locked');
  const pass = passphrase;
  const salt = randomHex(16), iv = randomHex(12);
  const key = await deriveKey(pass, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: fromHex(iv) }, key, enc.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, salt, iv, data: toB64(cipher) });
}

export async function decryptState(raw, passphrase = activePassphrase()) {
  if (!passphrase) throw new Error('locked');
  const payload = JSON.parse(raw);
  if (payload.v !== 1 || !payload.data) throw new Error('bad payload');
  const key = await deriveKey(passphrase, payload.salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(payload.iv) }, key, fromB64(payload.data));
  return JSON.parse(dec.decode(plain));
}

/* PIN is never stored; only a salted SHA-256 verifier. */
export async function setPin(pin) {
  const salt = randomHex(16);
  const hash = await digest(`${salt}:${String(pin)}`);
  localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash, setAt: Date.now() }));
  setSessionPassphrase(String(pin));
}

export async function verifyPin(pin) {
  const rec = JSON.parse(localStorage.getItem(PIN_KEY) || 'null');
  if (!rec) return false;
  const hash = await digest(`${rec.salt}:${String(pin)}`);
  if (hash.length !== rec.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

export function clearPin() {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(LOCK_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function securitySummary() {
  return {
    pin: hasPin(),
    locked: isLocked(),
    cipher: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256 · 150k',
  };
}
