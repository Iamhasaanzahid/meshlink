/* Android ↔ web messaging bridge.
 *
 * Preferred transport: authenticated Cloudflare HTTPS relay. The pairing
 * secret proves the device on every call, so no public MQTT topic is exposed.
 * Fallback: public MQTT for older sessions that never paired with a phone.
 * The message body is always AES-GCM sealed with a MeshLink-derived key. */
import { MqttLite } from './vendor/mqtt-lite.js?v=13';

const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const PREFIX = 'meshlink/web/';
const RELAY = '/api/bridge';
const KEY_SALT = 'meshlink-online-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let transport = null;
let relayClient = null;
let mqttClient = null;
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
    const key = await pairKey(mine, theirs);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.slice(1, 13) }, key, blob.slice(13),
    );
    return decoder.decode(plain);
  } catch {
    return '';
  }
}

class RelayTransport {
  constructor(meshId, secret, onMessage) {
    this.meshId = meshId;
    this.secret = secret;
    this.onMessage = onMessage;
    this.since = 0;
    this.connected = false;
    this.stopped = false;
  }

  async request(path, extra = {}) {
    const res = await fetch(`${RELAY}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meshId: this.meshId, secret: this.secret, ...extra }),
    });
    if (!res.ok) throw new Error(`relay ${res.status}`);
    return res.json();
  }

  connect() {
    this.connected = true;
    this.poll();
  }

  stop() {
    this.stopped = true;
    this.connected = false;
  }

  async poll() {
    while (!this.stopped) {
      try {
        const data = await this.request('/poll', { since: this.since });
        for (const message of data.messages || []) {
          this.since = Math.max(this.since, Number(message.seq) || 0);
          let wire = String(message.data || '');
          try {
            const envelope = JSON.parse(wire);
            if (envelope && typeof envelope.v === 'string' && envelope.t === 'web') {
              wire = envelope.v;
            }
          } catch { /* plain legacy payload */ }
          if (wire) this.onMessage(wire);
        }
        this.connected = true;
      } catch {
        this.connected = false;
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    }
  }

  async publish(to, text) {
    try {
      await this.request('/publish', {
        to,
        payload: JSON.stringify({ t: 'web', v: text }),
      });
      return true;
    } catch {
      return false;
    }
  }
}

export function stopBridge() {
  relayClient?.stop();
  relayClient = null;
  mqttClient?.stop();
  mqttClient = null;
  transport = null;
}

export function initBridge(meshId, onIncoming, bridgeSecret = '') {
  stopBridge();
  me = String(meshId || '').replace(/\D/g, '').slice(0, 10);
  if (!me) return;

  const handleWire = async (text) => {
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
  };

  if (/^[0-9a-f]{32,64}$/i.test(String(bridgeSecret))) {
    relayClient = new RelayTransport(me, String(bridgeSecret), handleWire);
    transport = relayClient;
    relayClient.connect();
    return;
  }

  const client = new MqttLite(BROKER, `meshlink-web-${me}-${Date.now()}`, (topic, text) => {
    if (!topic.startsWith(PREFIX)) return;
    handleWire(text);
  });
  mqttClient = client;
  transport = {
    connected: () => client.connected,
    publish: (to, text) => client.publish(PREFIX + to, text),
  };
  client.connect();
  client.subscribe([PREFIX + me]);
}

export function bridgeConnected() {
  return !!transport?.connected;
}

async function publishWire(to, inner, keyPeer) {
  if (!transport?.connected || !to) return false;
  const e = await seal(me, keyPeer, JSON.stringify(inner));
  if (!transport?.connected) return false;
  return transport.publish(to, JSON.stringify({ u: me, e }));
}

/** Called by the store when a text message is sent to a 10-digit MeshLink ID. */
export function sendBridge(to, message) {
  const dest = String(to || '').replace(/\D/g, '').slice(0, 10);
  if (!dest || !message) return Promise.resolve(false);
  return publishWire(dest, {
    i: message.id || `m-${Date.now()}`,
    b: String(message.body || '').slice(0, 4000),
    n: String(message.name || 'MeshLink user').slice(0, 48),
    u: me,
  }, dest);
}

/** Mirrors a web-sent message to other devices signed in as the same ID. */
export function sendBridgeSelf(peer, message) {
  const to = String(peer || '').replace(/\D/g, '').slice(0, 10);
  if (!me || !to || !message) return Promise.resolve(false);
  return publishWire(me, {
    i: message.id || `m-${Date.now()}`,
    b: String(message.body || '').slice(0, 4000),
    n: String(message.name || 'MeshLink user').slice(0, 48),
    u: me,
    d: to,
    s: 1,
    o: 'web',
  }, me);
}
