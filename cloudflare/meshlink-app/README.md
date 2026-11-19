# MeshLink Web — Cloudflare ready

Static web app + 30-second QR pairing API as a Pages Function.

## Deploy

```bash
cd /home/mhzaly/Documents/Default\ Project/cloudflare/meshlink-app
npx wrangler pages deploy . --project-name=meshlink-app
```

First-time login: `npx wrangler login`.

The Durable Object binding in `wrangler.toml` gives the pairing API shared
state, so a QR scanned on the phone and the browser's status poll always meet.
Static assets keep the same CSP and hardening headers from `_headers`.

Local equivalent: `cd meshlink-web && python3 server.py`.
