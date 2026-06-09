# Database Studio secrets

Drizzle Studio connects to remote Cloudflare D1 with these secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_TOKEN`
- `CLOUDFLARE_DATABASE_ID_PREVIEW`
- `CLOUDFLARE_DATABASE_ID_PRODUCTION`

## Local development

The Studio launcher script loads local secrets from env files at the repo root.

- `bun run db:studio`: local SQLite Studio, using `LOCAL_D1_SQLITE_PATH` or the default `.local/d1/dev` Miniflare D1 path
- `.env`: shared Cloudflare credentials for all Studio targets
- `.env.preview.local`: preview database ID for `bun run db:studio:preview`
- `.env.prod.local`: production database ID for `bun run db:studio:production`

Keep these files untracked. They are ignored by [.gitignore](.gitignore).

Example `.env`:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_TOKEN=your-d1-api-token
```

Example `.env.preview.local`:

```bash
CLOUDFLARE_DATABASE_ID_PREVIEW=your-preview-database-id
```

Example `.env.prod.local`:

```bash
CLOUDFLARE_DATABASE_ID_PRODUCTION=your-production-database-id
```

## Deployed environments

These values are only used for local Drizzle Studio access. They are not Wrangler Worker secrets and do not need `wrangler secret put`.

Cloudflare Workers get D1 bindings from [apps/atlas-api/wrangler.jsonc](apps/atlas-api/wrangler.jsonc), while Studio uses the local env files above to authenticate directly against the remote D1 HTTP API.
