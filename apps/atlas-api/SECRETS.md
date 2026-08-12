# Atlas API Secrets

Atlas API requires the D1 placement probe key, the Substack session cookie used for
server-side newsletter signups, an Analytics Engine read token for the usage roll-up,
plus Telegram bot credentials for admin failure alerts:

- `D1_PLACEMENT_PROBE_API_KEY`
- `ANALYTICS_ENGINE_READ_TOKEN` (Cloudflare Account > Account Analytics > Read)
- `SUBSTACK_SESSION_COOKIE`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_ID` (the target admin channel or group chat ID)

## Local development

Wrangler loads local secrets from files next to
[wrangler.jsonc](apps/atlas-api/wrangler.jsonc).

- `apps/atlas-api/.dev.vars`: default local `wrangler dev`
- `apps/atlas-api/.dev.vars.preview`: local `wrangler dev --env preview`
- `apps/atlas-api/.dev.vars.production`: local `wrangler dev --env production`

The value can be either:

- the raw Substack session token
- the first `name=value` cookie pair, for example `substack.sid=...`

If you paste a full `Set-Cookie` string, Atlas API will only use the first `name=value`
segment.

## Deployed environments

Set the preview secret on the preview Worker:

```bash
bunx wrangler secret put D1_PLACEMENT_PROBE_API_KEY --config apps/atlas-api/wrangler.jsonc --env preview
bunx wrangler secret put ANALYTICS_ENGINE_READ_TOKEN --config apps/atlas-api/wrangler.jsonc --env preview
bunx wrangler secret put SUBSTACK_SESSION_COOKIE --config apps/atlas-api/wrangler.jsonc --env preview
bunx wrangler secret put TELEGRAM_BOT_TOKEN --config apps/atlas-api/wrangler.jsonc --env preview
bunx wrangler secret put TELEGRAM_ADMIN_ID --config apps/atlas-api/wrangler.jsonc --env preview
```

Set the production secret on the production Worker:

```bash
bunx wrangler secret put D1_PLACEMENT_PROBE_API_KEY --config apps/atlas-api/wrangler.jsonc --env production
bunx wrangler secret put ANALYTICS_ENGINE_READ_TOKEN --config apps/atlas-api/wrangler.jsonc --env production
bunx wrangler secret put SUBSTACK_SESSION_COOKIE --config apps/atlas-api/wrangler.jsonc --env production
bunx wrangler secret put TELEGRAM_BOT_TOKEN --config apps/atlas-api/wrangler.jsonc --env production
bunx wrangler secret put TELEGRAM_ADMIN_ID --config apps/atlas-api/wrangler.jsonc --env production
```

For local validation, Wrangler will warn when this required secret is missing.
