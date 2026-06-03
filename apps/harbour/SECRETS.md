# Harbour R2 upload secrets

Harbour signs direct-to-R2 upload URLs with three secrets:

- `R2_ACCOUNT_ID`
- `R2_RAW_ACCESS_KEY_ID`
- `R2_RAW_SECRET_ACCESS_KEY`

## Local development

Wrangler loads local secrets from files next to [wrangler.jsonc](/home/io/code/saanseoi/apps/harbour/wrangler.jsonc).

- `apps/harbour/.dev.vars`: default local `wrangler dev`
- `apps/harbour/.dev.vars.preview`: local `wrangler dev --env preview`
- `apps/harbour/.dev.vars.production`: local `wrangler dev --env production`

If preview and dev share the same R2 keypair, use the same values in `.dev.vars` and `.dev.vars.preview`.

## Deployed environments

Set preview secrets on the preview Worker:

```bash
bunx wrangler secret put R2_ACCOUNT_ID --config apps/harbour/wrangler.jsonc --env preview
bunx wrangler secret put R2_RAW_ACCESS_KEY_ID --config apps/harbour/wrangler.jsonc --env preview
bunx wrangler secret put R2_RAW_SECRET_ACCESS_KEY --config apps/harbour/wrangler.jsonc --env preview
```

Set production secrets on the production Worker:

```bash
bunx wrangler secret put R2_ACCOUNT_ID --config apps/harbour/wrangler.jsonc --env production
bunx wrangler secret put R2_RAW_ACCESS_KEY_ID --config apps/harbour/wrangler.jsonc --env production
bunx wrangler secret put R2_RAW_SECRET_ACCESS_KEY --config apps/harbour/wrangler.jsonc --env production
```

For local validation, Wrangler will now warn when these required secrets are missing.
