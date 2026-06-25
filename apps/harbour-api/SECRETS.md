# Harbour R2 upload secrets

Harbour uses one general API auth secret, one D1 placement probe auth secret, the R2 signing secrets, and the shared Telegram bot credentials:

- `D1_PLACEMENT_PROBE_API_KEY`
- `HARBOUR_API_KEY`
- `R2_ACCOUNT_ID`
- `R2_RAW_ACCESS_KEY_ID`
- `R2_RAW_SECRET_ACCESS_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_ID` (the target admin channel or group chat ID)

## Local development

Wrangler loads local secrets from files next to [wrangler.jsonc](apps/harbour-api/wrangler.jsonc).

- `apps/harbour-api/.dev.vars`: default local `wrangler dev`
- `apps/harbour-api/.dev.vars.preview`: local `wrangler dev --env preview`
- `apps/harbour-api/.dev.vars.production`: local `wrangler dev --env production`

If preview and dev share the same R2 keypair, use the same values in `.dev.vars` and `.dev.vars.preview`.

## Deployed environments

Set preview secrets on the preview Worker:

```bash
bunx wrangler secret put HARBOUR_API_KEY --config apps/harbour-api/wrangler.jsonc --env preview
bunx wrangler secret put D1_PLACEMENT_PROBE_API_KEY --config apps/harbour-api/wrangler.jsonc --env preview
bunx wrangler secret put R2_ACCOUNT_ID --config apps/harbour-api/wrangler.jsonc --env preview
bunx wrangler secret put R2_RAW_ACCESS_KEY_ID --config apps/harbour-api/wrangler.jsonc --env preview
bunx wrangler secret put R2_RAW_SECRET_ACCESS_KEY --config apps/harbour-api/wrangler.jsonc --env preview
bunx wrangler secret put TELEGRAM_BOT_TOKEN --config apps/harbour-api/wrangler.jsonc --env preview
bunx wrangler secret put TELEGRAM_ADMIN_ID --config apps/harbour-api/wrangler.jsonc --env preview
```

Set production secrets on the production Worker:

```bash
bunx wrangler secret put HARBOUR_API_KEY --config apps/harbour-api/wrangler.jsonc --env production
bunx wrangler secret put D1_PLACEMENT_PROBE_API_KEY --config apps/harbour-api/wrangler.jsonc --env production
bunx wrangler secret put R2_ACCOUNT_ID --config apps/harbour-api/wrangler.jsonc --env production
bunx wrangler secret put R2_RAW_ACCESS_KEY_ID --config apps/harbour-api/wrangler.jsonc --env production
bunx wrangler secret put R2_RAW_SECRET_ACCESS_KEY --config apps/harbour-api/wrangler.jsonc --env production
bunx wrangler secret put TELEGRAM_BOT_TOKEN --config apps/harbour-api/wrangler.jsonc --env production
bunx wrangler secret put TELEGRAM_ADMIN_ID --config apps/harbour-api/wrangler.jsonc --env production
```

For local validation, Wrangler will now warn when these required secrets are missing.
