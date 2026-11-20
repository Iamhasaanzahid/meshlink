/* MeshLink Pages Function: forwards QR/manual pairing and email OTP to the
 * `meshlink-pair` Durable Object Worker. Everything else is a static asset.
 *
 * Security: unknown paths return a real 404 instead of the SPA's index.html,
 * so scanners cannot report fake "leaks" for /git/config, /backup.zip, etc.
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '0',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Cache-Control': 'no-store',
};

function secure(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function notFound() {
  return secure(new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  }));
}

// Cloudflare Pages adds a wildcard CORS header to static assets by default.
// This app only calls same-origin APIs, so there is no reason to let any other
// origin read its files. Strip CORS from static responses (API responses keep
// their own strict, origin-echoing CORS policy).
function noStaticCors(response) {
  const headers = new Headers(response.headers);
  for (const name of [
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Methods',
    'Access-Control-Allow-Headers',
    'Access-Control-Expose-Headers',
    'Access-Control-Max-Age',
  ]) {
    headers.delete(name);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (
      path.startsWith('/api/pair/') ||
      path.startsWith('/api/verify/') ||
      path.startsWith('/api/bridge/') ||
      path === '/ws'
    ) {
      const id = env.PAIR_SESSIONS.idFromName('meshlink-web');
      const response = await env.PAIR_SESSIONS.get(id).fetch(request);
      // A WebSocket 101 must not be rebuilt or its handshake will break.
      if (response.status === 101) return response;
      return secure(response);
    }

    const allowed =
      path === '/' ||
      path === '/index.html' ||
      path === '/styles.css' ||
      path === '/favicon.ico' ||
      path === '/robots.txt' ||
      path.startsWith('/js/') ||
      path.startsWith('/assets/');
    if (!allowed) return notFound();

    return noStaticCors(await env.ASSETS.fetch(request));
  },
};
