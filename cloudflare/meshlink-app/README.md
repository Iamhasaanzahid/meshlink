# MeshLink Web — Cloudflare ready

Static web app + 30-second QR pairing API and email OTP verification as a Pages Function.

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

## Email verification

The app-generated 10-digit MeshLink ID remains the identity. Email is used only
to verify it; it is never a login or a phone number. `/api/verify/*` is forwarded
to the same `PAIR_SESSIONS` Durable Object as `/api/pair/*`.

For real codes, set these secrets on the **meshlink-pair Worker** (the Durable
Object's environment), not only on the Pages project:

```bash
cd cloudflare/meshlink-pair
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put OTP_SECRET
npx wrangler secret put VERIFY_FROM   # optional, default onboarding@resend.dev
```

Without `RESEND_API_KEY`, the API runs openly in demo mode and accepts only the
demo code `123456`; no email is sent. Only HMAC-SHA256 hashes of codes are stored.
