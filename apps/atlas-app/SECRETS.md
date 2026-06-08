# Atlas App Secrets

Atlas App uses Better Auth and requires:

- `BETTER_AUTH_SECRET`

## Local development

Wrangler loads local secrets from files next to [wrangler.jsonc](apps/atlas-app/wrangler.jsonc).

- `apps/atlas-app/.dev.vars`: default local `wrangler dev`
- `apps/atlas-app/.dev.vars.preview`: local `wrangler dev --env preview`
- `apps/atlas-app/.dev.vars.production`: local `wrangler dev --env production`

## Deployed environments

Set the preview secret on the preview Worker:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET --config apps/atlas-app/wrangler.jsonc --env preview
```

Set the production secret on the production Worker:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET --config apps/atlas-app/wrangler.jsonc --env production
```

Use a high-entropy value at least 32 characters long. You can generate one with:

```bash
bunx @better-auth/cli secret
```
