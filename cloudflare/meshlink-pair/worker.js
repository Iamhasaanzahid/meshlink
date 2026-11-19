/* MeshLink QR pairing Durable Object.
 * Deployed as a separate Worker, then bound into the Pages project.
 */
import { DurableObject } from 'cloudflare:workers';

const TTL = 30_000;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export class PairSessions extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const sessions = (await this.state.storage.get('sessions')) || {};
    const now = Date.now();

    if (path === '/api/pair/session' && request.method === 'POST') {
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
      return json({ status: s.status, peer: s.peer, expires: s.expires / 1000 });
    }

    if (path === '/api/pair/approve' && request.method === 'POST') {
      let payload = {};
      try { payload = await request.json(); } catch { /* noop */ }
      const s = sessions[String(payload.session || '')];
      if (!s || s.expires < now) return json({ error: 'expired' }, 410);
      if (!s.token || String(payload.token || '') !== s.token) {
        return json({ error: 'invalid token' }, 403);
      }
      s.status = 'approved';
      s.peer = {
        meshId: String(payload.meshId || '').replace(/\D/g, '').slice(0, 10),
        name: String(payload.name || 'MeshLink phone').slice(0, 48),
        about: 'Linked from MeshLink mobile',
      };
      await this.state.storage.put('sessions', sessions);
      return json({ status: 'approved' });
    }

    return json({ error: 'not found' }, 404);
  }
}

export default {
  async fetch() {
    return new Response('MeshLink pairing DO', { status: 200 });
  },
};
