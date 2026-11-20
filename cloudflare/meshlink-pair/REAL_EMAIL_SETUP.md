# Mhzaly live email OTP (Resend)

The Worker already sends real 6-digit codes when `RESEND_API_KEY` is set.
Without it, it runs in demo mode and accepts only `123456`.

## One-time setup

1. Create a free account at https://resend.com and verify the sender domain
   (or use Resend's test sender for development).
2. Create an API key with **Sending** access.
3. Set the secrets on the deployed Worker (from this directory):

   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put VERIFY_FROM   # optional, e.g. Mhzaly <verify@yourdomain.com>
   npx wrangler secret put OTP_SECRET    # random HMAC key for OTP hashes
   ```

4. Redeploy:

   ```bash
   npx wrangler deploy
   ```

5. Test: call `/api/verify/send` with a real `email` and 10-digit `meshId`.
   The response must show `"demo":false`. The code arrives by email and is
   stored only as an HMAC-SHA256 hash in the Durable Object.

Never commit API keys or secrets to this repository.
