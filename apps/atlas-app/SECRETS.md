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

## Google setup

In Google Cloud Console, open the OAuth client used by the deployed app and add these
entries under **Authorised redirect URIs**:

- `https://preview.saanseoi.hk/api/auth/callback/google`
- `https://saanseoi.hk/api/auth/callback/google`

The app uses separate Google OAuth clients per environment:

- Preview: `972786292819-8o9mpvci3ldaccr9n2bb74ij6njmbv3b.apps.googleusercontent.com`
- Production: `972786292819-3qma9l177e9k2isbnt8lrukdldd8m99f.apps.googleusercontent.com`

The production callback must match exactly, including the scheme, hostname, path, and
the absence of a trailing slash. Local development uses
`http://localhost:5173/api/auth/callback/google`.

## GitHub setup

GitHub OAuth Apps support one callback URL each, so use a separate app for each
environment. Set the app's **Authorization callback URL** to the matching value:

- Local: `http://localhost:5173/api/auth/callback/github`
- Preview: `https://preview.saanseoi.hk/api/auth/callback/github`
- Production: `https://saanseoi.hk/api/auth/callback/github`

The current deployed client IDs are:

- Preview: `Ov23lix0sHaq58lHqbQC`
- Production: `Ov23liLPaefiHuQpOP2K`

The callback URL must match exactly, including the scheme, hostname, path, and the
absence of a trailing slash. Store each app's client ID and client secret in the
matching Worker environment.

## Facebook setup

In the Meta app dashboard, go to **App settings → Basic** and set **App domains** to:

- `saanseoi.hk`
- `preview.saanseoi.hk`

Then, in **Facebook Login → Settings**, set **Valid OAuth redirect URIs** to:

- `https://preview.saanseoi.hk/api/auth/callback/facebook`
- `https://saanseoi.hk/api/auth/callback/facebook`

Set Facebook's User Data Deletion Callback URL to
`https://saanseoi.hk/api/auth/facebook/data-deletion`.
