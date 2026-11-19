/* MeshLink Pages Function: forwards 30-second QR pairing to the
 * `meshlink-pair` Durable Object Worker; everything else is static. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/pair/')) {
      const id = env.PAIR_SESSIONS.idFromName('meshlink-web');
      return env.PAIR_SESSIONS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
