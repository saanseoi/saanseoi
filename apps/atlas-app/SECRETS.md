# Atlas App Secrets

Atlas App uses Better Auth and requires:

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `FACEBOOK_CLIENT_ID`
- `FACEBOOK_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## Local development

Wrangler loads local secrets from files next to
[wrangler.jsonc](apps/atlas-app/wrangler.jsonc).

- `apps/atlas-app/.dev.vars`: default local `wrangler dev`
- `apps/atlas-app/.dev.vars.preview`: local `wrangler dev --env preview`
- `apps/atlas-app/.dev.vars.production`: local `wrangler dev --env production`

## Deployed environments

Set the preview secret on the preview Worker:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET --config apps/atlas-app/wrangler.jsonc --env preview
bunx wrangler secret put GOOGLE_CLIENT_ID --config apps/atlas-app/wrangler.jsonc --env preview
bunx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/atlas-app/wrangler.jsonc --env preview
bunx wrangler secret put FACEBOOK_CLIENT_ID --config apps/atlas-app/wrangler.jsonc --env preview
bunx wrangler secret put FACEBOOK_CLIENT_SECRET --config apps/atlas-app/wrangler.jsonc --env preview
bunx wrangler secret put GITHUB_CLIENT_ID --config apps/atlas-app/wrangler.jsonc --env preview
bunx wrangler secret put GITHUB_CLIENT_SECRET --config apps/atlas-app/wrangler.jsonc --env preview
```

Set the production secret on the production Worker:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET --config apps/atlas-app/wrangler.jsonc --env production
bunx wrangler secret put GOOGLE_CLIENT_ID --config apps/atlas-app/wrangler.jsonc --env production
bunx wrangler secret put GOOGLE_CLIENT_SECRET --config apps/atlas-app/wrangler.jsonc --env production
bunx wrangler secret put FACEBOOK_CLIENT_ID --config apps/atlas-app/wrangler.jsonc --env production
bunx wrangler secret put FACEBOOK_CLIENT_SECRET --config apps/atlas-app/wrangler.jsonc --env production
bunx wrangler secret put GITHUB_CLIENT_ID --config apps/atlas-app/wrangler.jsonc --env production
bunx wrangler secret put GITHUB_CLIENT_SECRET --config apps/atlas-app/wrangler.jsonc --env production
```

Use a high-entropy value at least 32 characters long. You can generate one with:

```bash
bunx @better-auth/cli secret
```

## Facebook setup

Register these OAuth redirect URIs with the Facebook app:

- `https://preview.saanseoi.hk/api/auth/callback/facebook`
- `https://saanseoi.hk/api/auth/callback/facebook`

Set Facebook's User Data Deletion Callback URL to
`https://saanseoi.hk/api/auth/facebook/data-deletion`.
