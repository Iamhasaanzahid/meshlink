/* MeshLink Pages Function: forwards 30-second QR pairing and email OTP
 * verification to the `meshlink-pair` Durable Object Worker; static otherwise. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/pair/') || url.pathname.startsWith('/api/verify/') || url.pathname === '/ws') {
      const id = env.PAIR_SESSIONS.idFromName('meshlink-web');
      return env.PAIR_SESSIONS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
