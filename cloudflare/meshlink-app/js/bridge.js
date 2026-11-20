/* Android ↔ web messaging bridge.
 * Both sides use the same free public MQTT relay and the same tiny JSON
 * envelope, so a phone message appears in the browser and vice versa. */
import { MqttLite } from './vendor/mqtt-lite.js?v=10';

const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const PREFIX = 'meshlink/web/';
let client = null;
let me = '';

export function initBridge(meshId, onIncoming) {
  me = String(meshId || '').replace(/\D/g, '').slice(0, 10);
  if (!me) return;
  client = new MqttLite(BROKER, `meshlink-web-${me}-${Date.now()}`, (topic, text) => {
    if (!topic.startsWith(PREFIX)) return;
    let data;
    try { data = JSON.parse(text); } catch { return; }
    if (!data || !data.b) return;
    const from = String(data.u || '').replace(/\D/g, '').slice(0, 10);
    if (!from) return;
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
export function sendBridge(to, message) {
  if (!client || !client.connected || !to || !message) return false;
  return client.publish(PREFIX + String(to).replace(/\D/g, '').slice(0, 10), JSON.stringify({
    i: message.id || `m-${Date.now()}`,
    b: String(message.body || '').slice(0, 4000),
    n: String(message.name || 'MeshLink user').slice(0, 48),
    u: me,
  }));
}

/** Mirrors a web-sent message to other devices signed in as the same ID. */
export function sendBridgeSelf(peer, message) {
  const to = String(peer || '').replace(/\D/g, '').slice(0, 10);
  if (!client || !client.connected || !me || !to || !message) return false;
  return client.publish(PREFIX + me, JSON.stringify({
    i: message.id || `m-${Date.now()}`,
    b: String(message.body || '').slice(0, 4000),
    n: String(message.name || 'MeshLink user').slice(0, 48),
    u: me,
    d: to,
    s: 1,
    o: 'web',
  }));
}
