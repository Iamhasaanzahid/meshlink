/* Minimal MQTT 3.1.1 client over WebSocket for the MeshLink web ↔ phone bridge.
 * Only CONNECT, SUBSCRIBE, PUBLISH and PING are needed — no external library. */
function encodeLength(length) {
  const out = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit |= 0x80;
    out.push(digit);
  } while (length > 0);
  return out;
}

function packet(type, payload) {
  return new Uint8Array([type, ...encodeLength(payload.length), ...payload]);
}

function utf8(value) {
  const bytes = new TextEncoder().encode(value);
  return [(bytes.length >> 8) & 0xff, bytes.length & 0xff, ...bytes];
}

export class MqttLite {
  constructor(url, clientId, onMessage) {
    this.url = url;
    this.clientId = clientId;
    this.onMessage = onMessage;
    this.socket = null;
    this.timer = null;
    this.connected = false;
  }

  connect() {
    if (this.socket && (this.socket.readyState === 1 || this.socket.readyState === 0)) return;
    const socket = new WebSocket(this.url, 'mqtt');
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      const id = utf8(this.clientId);
      socket.send(packet(0x10, [
        0, 4, 77, 81, 84, 84, // "MQTT"
        4,                    // protocol level 3.1.1
        2,                    // clean session
        0, 60,                // keep alive
        ...id,
      ]));
      this.timer = setInterval(() => {
        if (socket.readyState === 1) socket.send(packet(0xc0, []));
      }, 45000);
    };
    socket.onmessage = (event) => this.decode(new Uint8Array(event.data));
    socket.onclose = (event) => {
      this.connected = false;
      clearInterval(this.timer);
      console.warn('MeshLink MQTT closed', event.code, event.reason || '');
      setTimeout(() => this.connect(), 3000);
    };
    socket.onerror = () => console.warn('MeshLink MQTT error');
  }

  decode(data) {
    if (!data.length) return;
    const type = data[0] >> 4;
    let offset = 1;
    let multiplier = 1;
    let remaining = 0;
    let byte;
    do {
      byte = data[offset++];
      remaining += (byte & 0x7f) * multiplier;
      multiplier *= 128;
    } while (byte & 0x80);
    const body = data.subarray(offset, offset + remaining);
    if (type === 2) {
      this.connected = body[1] === 0;
      if (this.connected && this.topics) this.subscribe(this.topics);
    }
    if (type === 6 || type === 3) {
      const len = (body[0] << 8) | body[1];
      const topic = new TextDecoder().decode(body.subarray(2, 2 + len));
      const payload = body.subarray(2 + len);
      this.onMessage(topic, new TextDecoder().decode(payload));
    }
  }

  subscribe(topics) {
    this.topics = topics;
    if (!this.connected || !this.socket || this.socket.readyState !== 1) return;
    const parts = [0, 1]; // packet id
    for (const topic of topics) parts.push(...utf8(topic), 0);
    this.socket.send(packet(0x82, parts));
  }

  publish(topic, text) {
    if (!this.connected || !this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(packet(0x30, [...utf8(topic), ...new TextEncoder().encode(text)]));
    return true;
  }
}
