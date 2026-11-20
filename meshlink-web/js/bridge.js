/* Android ↔ web messaging bridge.
 * Both sides use the same free public MQTT relay and a small AES-GCM envelope.
 * The relay only sees `{u, e}`; the message body stays encrypted with a key
 * derived from the two MeshLink IDs, matching Android's OnlineCrypto format. */
import { MqttLite } from './vendor/mqtt-lite.js?v=11';

const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const PREFIX = 'meshlink/web/';
const KEY_SALT = 'meshlink-online-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let client = null;
let me = '';

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pairKey(a, b) {
  const pair = a <= b ? `${a}|${b}` : `${b}|${a}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${KEY_SALT}|${pair}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function seal(mine, theirs, plaintext) {
  const key = await pairKey(mine, theirs);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  ));
  const blob = new Uint8Array(1 + iv.length + body.length);
  blob[0] = 1;
  blob.set(iv, 1);
  blob.set(body, 1 + iv.length);
  return bytesToBase64(blob);
}

async function open(mine, theirs, value) {
  try {
    const blob = base64ToBytes(value);
    if (blob.length <= 13 || blob[0] !== 1) return '';
    const iv = blob.slice(1, 13);
    const body = blob.slice(13);
    const key = await pairKey(mine, theirs);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
    return decoder.decode(plain);
  } catch {
    return '';
  }
}

export function initBridge(meshId, onIncoming) {
  me = String(meshId || '').replace(/\D/g, '').slice(0, 10);
  if (!me) return;
  client = new MqttLite(BROKER, `meshlink-web-${me}-${Date.now()}`, async (topic, text) => {
    if (!topic.startsWith(PREFIX)) return;
    let wire;
    try { wire = JSON.parse(text); } catch { return; }
    const from = String(wire?.u || '').replace(/\D/g, '').slice(0, 10);
    if (!from) return;
    let data = wire;
    if (wire.e) {
      const plain = await open(me, from, String(wire.e));
      if (!plain) return;
      try { data = JSON.parse(plain); } catch { return; }
    }
    if (!data || !data.b) return;
    onIncoming({
      from,
      id: String(data.i || `${from}-${Date.now()}`),
      body: String(data.b),
      name: String(data.n || 'MeshLink phone'),
      self: data.s === true || data.s === 1 || data.s === '1',
      to: String(data.d || '').replace(/\D/g, '').slice(0, 10),
      origin: String(data.o || ''),
    });
  });
  client.connect();
  client.subscribe([PREFIX + me]);
}

export function bridgeConnected() {
  return !!client?.connected;
}

/** Called by the store when a text message is sent to a 10-digit MeshLink ID. */
export async function sendBridge(to, message) {
  const dest = String(to || '').replace(/\D/g, '').slice(0, 10);
  if (!client || !client.connected || !dest || !message) return false;
  const plain = JSON.stringify({
    i: message.id || `m-${Date.now()}`,
    b: String(message.body || '').slice(0, 4000),
    n: String(message.name || 'MeshLink user').slice(0, 48),
    u: me,
  });
  const e = await seal(me, dest, plain);
  if (!client?.connected) return false;
  return client.publish(PREFIX + dest, JSON.stringify({ u: me, e }));
}

/** Mirrors a web-sent message to other devices signed in as the same ID. */
export async function sendBridgeSelf(peer, message) {
  const to = String(peer || '').replace(/\D/g, '').slice(0, 10);
  if (!client || !client.connected || !me || !to || !message) return false;
  const plain = JSON.stringify({
    i: message.id || `m-${Date.now()}`,
    b: String(message.body || '').slice(0, 4000),
    n: String(message.name || 'MeshLink user').slice(0, 48),
    u: me,
    d: to,
    s: 1,
    o: 'web',
  });
  const e = await seal(me, me, plain);
  if (!client?.connected) return false;
  return client.publish(PREFIX + me, JSON.stringify({ u: me, e }));
}
