# MacBook Catai Gateway

This is the initial low-traffic deployment path for Cashlog image analysis.
The model stays bound to the MacBook loopback interface. `cloudflared` creates
an outbound-only connection, so the router must have no port forwarding.

```text
Cashlog browser
  -> Vercel /api/analyze-image
  -> Cloudflare Access + Tunnel
  -> MacBook 127.0.0.1:8010
  -> Catai (MPS)
```

The older `infra/galaxy-gateway` path remains available as a rollback option,
but it is not needed for this direct MacBook setup.

## 1. Confirm Catai

The existing Catai LaunchAgent should run the API on loopback only:

```bash
curl http://127.0.0.1:8010/health
lsof -nP -iTCP:8010 -sTCP:LISTEN
```

The listener must be `127.0.0.1:8010`, never `*:8010` or `0.0.0.0:8010`.

## 2. Create a named tunnel

The `cashlog.ai.kr` zone must use Cloudflare DNS before Cloudflare can create
the `ai-gateway.cashlog.ai.kr` route.

```bash
cloudflared tunnel login
cloudflared tunnel create cashlog-catai
cloudflared tunnel route dns cashlog-catai ai-gateway.cashlog.ai.kr
cloudflared tunnel list
```

The create command prints a tunnel UUID and writes
`~/.cloudflared/<UUID>.json`. Do not commit that file.

## 3. Install automatic startup

```bash
./infra/macbook-catai/install.sh \
  TUNNEL_UUID \
  ai-gateway.cashlog.ai.kr
./infra/macbook-catai/verify.sh
```

The installer writes a protected Cloudflare config and a user LaunchAgent. It
does not copy the Catai key into the plist. Both Catai and the tunnel restart
after a Mac login and recover after a process failure.

Do not remove the old Galaxy SSH tunnel until the remote verification in step
6 passes.

## 4. Protect the hostname with Access

In Cloudflare Zero Trust:

1. Open **Access > Applications** and add a self-hosted application for
   `ai-gateway.cashlog.ai.kr`.
2. Create a **Service Auth** policy. Do not add a public bypass policy.
3. Open **Access > Service Auth > Service Tokens** and create a token for the
   Vercel backend.
4. Store its client ID and secret immediately. Cloudflare shows the secret only
   when the token is created.
5. Add a rate limit for `POST /analyze-image` and reject request bodies over
   10 MB. The application and Catai perform their own checks as well.

`GET /health` is also behind Access. It is intended for authenticated service
checks, not public monitoring.

## 5. Configure Vercel

Add these server-side variables to Production and Preview, then redeploy:

```text
PRODUCT_ANALYZER_API_URL=https://ai-gateway.cashlog.ai.kr
PRODUCT_ANALYZER_API_KEY=<same value as CATAI_INTERNAL_API_KEY on the Mac>
CLOUDFLARE_ACCESS_CLIENT_ID=<service token client ID>
CLOUDFLARE_ACCESS_CLIENT_SECRET=<service token client secret>
PRODUCT_ANALYZER_REQUIRE_AUTH=true
PRODUCT_ANALYZER_TIMEOUT_MS=65000
```

These are Vercel server variables. Never use the `VITE_` prefix and never put
them in browser code. Keep the Supabase service role key and every model secret
server-side too.

## 6. Verify end to end

Run a health check without printing the secrets:

```bash
export PRODUCT_ANALYZER_URL=https://ai-gateway.cashlog.ai.kr
export PRODUCT_ANALYZER_API_KEY='<Catai internal API key>'
export CLOUDFLARE_ACCESS_CLIENT_ID='<Access client ID>'
export CLOUDFLARE_ACCESS_CLIENT_SECRET='<Access client secret>'
./infra/macbook-catai/verify.sh
```

Then test an image through the same route Vercel uses:

```bash
npm run check:product-analyzer -- /absolute/path/to/sample.jpg
```

Finally test from the deployed Cashlog app on a phone using mobile data. The
Mac must be awake, logged in, online, and running both LaunchAgents.

## Operational limits

- No router port forwarding.
- Keep macOS Firewall, FileVault, and automatic security updates enabled.
- Disable unneeded Sharing services.
- Prevent sleep while serving, or schedule an awake period.
- Do not log raw images, OCR text, API keys, or Access headers.
- Rotate the Catai key and Access token after accidental exposure.
- Move Catai to a dedicated Mac, VM, or GPU service before availability becomes
  business-critical.
