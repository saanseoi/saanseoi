# Database Studio secrets

Drizzle Studio connects to remote Cloudflare D1 with these secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_TOKEN`

## Local development

The Studio launcher script loads local secrets from env files at the repo root.

- `bun run db:studio:meta`
- `bun run db:studio:current`
- `bun run db:studio:history`
- `bun run db:studio:history:2025`
- `bun run db:studio:source`
- `bun run db:studio:source:2025`
- `.env`: shared Cloudflare credentials for all Studio targets
- `.env.local`: local SQLite paths for each DB family

Keep these files untracked. They are ignored by [.gitignore](.gitignore).

Example `.env`:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_TOKEN=your-d1-api-token
```

Example `.env.local`:

```bash
LOCAL_D1_SQLITE_PATH_META=/abs/path/to/meta.sqlite
LOCAL_D1_SQLITE_PATH_CURRENT=/abs/path/to/current.sqlite
LOCAL_D1_SQLITE_PATH_HISTORY_HK_2025=/abs/path/to/history-hk-2025.sqlite
LOCAL_D1_SQLITE_PATH_HISTORY_HK_2026=/abs/path/to/history-hk-2026.sqlite
LOCAL_D1_SQLITE_PATH_SOURCE_HK_2025=/abs/path/to/source-hk-2025.sqlite
LOCAL_D1_SQLITE_PATH_SOURCE_HK_2026=/abs/path/to/source-hk-2026.sqlite
```

`db:studio:history` and `db:studio:source` default to the current calendar year. Use the `:2025` variants when you need the older shard explicitly.

Preview and production Studio targets resolve D1 database IDs from
[apps/harbour-api/wrangler.jsonc](../../apps/harbour-api/wrangler.jsonc), so no
repo-root env file is needed for remote database IDs.

## Deployed environments

These values are only used for local Drizzle Studio access. They are not Wrangler Worker secrets and do not need `wrangler secret put`.

Cloudflare Workers get D1 bindings from [apps/atlas-api/wrangler.jsonc](apps/atlas-api/wrangler.jsonc), while Studio uses the local env files above to authenticate directly against the remote D1 HTTP API.

## Sharded D1 layout

The repo uses the multi-DB layout described in
[libs/db/docs/schema/hybrid-canonical-d1-sharding.md](docs/schema/hybrid-canonical-d1-sharding.md).

The newly provisioned remote databases are:

| Role | Preview | Production |
|------|---------|------------|
| `meta` | `ss-meta-db-preview` (`d37ea879-848d-4548-a565-0d86b4bc3d43`) | `ss-meta-db-prod` (`cf03b2ff-b5ee-4265-899f-6916ed8b6c2c`) |
| `current` | `ss-current-db-preview` (`6d26bf3f-8cf6-4fa6-b80b-25322207dfde`) | `ss-current-db-prod` (`edd3cdf9-1d05-4847-b235-b7fd4189c38d`) |
| `history-hk-2025` | `ss-history-hk-2025-db-preview` (`9566cfa9-2af6-473c-a74b-c7f7c6a757a9`) | `ss-history-hk-2025-db-prod` (`09c217e2-0e04-4ce5-a197-b4210bcb1dea`) |
| `history-hk-2026` | `ss-history-hk-2026-db-preview` (`b76baf00-7138-44b0-bd24-e99f3aea4249`) | `ss-history-hk-2026-db-prod` (`f85a2708-a0aa-4549-8c61-e2289d3694cd`) |
| `source-hk-2025` | `ss-source-hk-2025-db-preview` (`113ea535-e571-4e31-b15a-c18f116e0424`) | `ss-source-hk-2025-db-prod` (`0e5ff999-c928-4e41-a0e1-e5d7c6fc6d20`) |
| `source-hk-2026` | `ss-source-hk-2026-db-preview` (`014dc342-54c8-4049-8667-cfbf7c92cbec`) | `ss-source-hk-2026-db-prod` (`dca6df89-880b-42f8-92a8-08f4919a582a`) |

These are currently bound in Wrangler as:

- `DB_META`
- `DB_CURRENT`
- `DB_HISTORY_HK_2025`
- `DB_HISTORY_HK_2026`
- `DB_SOURCE_HK_2025`
- `DB_SOURCE_HK_2026`
