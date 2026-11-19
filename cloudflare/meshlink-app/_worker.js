/* MeshLink Pages Function: 30-second QR pairing for the static web app.
 * State lives in a Durable Object so polling and phone approval always meet.
 */

const TTL = 30_000;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/pair/')) {
      const id = env.PAIR_SESSIONS.idFromName('meshlink-web');
      return env.PAIR_SESSIONS.get(id).fetch(request);
    }
    return fetch(request);
  },
};

export class PairSessions {
  constructor(state) {
    this.state = state;
  }

  async store() {
    return (await this.state.storage.get('sessions')) || {};
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const sessions = await this.store();
    const now = Date.now();

    if (path === '/api/pair/session' && request.method === 'POST') {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const session = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      const tokenBytes = crypto.getRandomValues(new Uint8Array(16));
      const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
      if (String(payload.token || '') !== s.token) return json({ error: 'invalid token' }, 403);
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
