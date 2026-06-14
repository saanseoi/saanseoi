# Database Studio secrets

Drizzle Studio connects to remote Cloudflare D1 with these secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_TOKEN`

## Local development

The Studio launcher script loads local secrets from env files at the repo root.

- `bun run db:studio:meta`
- `bun run db:studio:current`
- `bun run db:studio:history`
- `bun run db:studio:source`
- `.env`: shared Cloudflare credentials for all Studio targets
- `.env.local`: local SQLite paths for each DB family
- `.env.preview.local`: preview D1 database IDs for each DB family
- `.env.prod.local`: production D1 database IDs for each DB family

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

Example `.env.preview.local`:

```bash
CLOUDFLARE_DATABASE_ID_META_PREVIEW=655743d2-5dcc-4a94-a12f-62eaf9955a84
CLOUDFLARE_DATABASE_ID_CURRENT_PREVIEW=1e704b3f-4374-42ea-b8b2-faca805d11eb
CLOUDFLARE_DATABASE_ID_HISTORY_HK_2025_PREVIEW=bea18422-d1ce-429d-b099-464a33716921
CLOUDFLARE_DATABASE_ID_HISTORY_HK_2026_PREVIEW=de2e7b41-29dd-4f97-a3eb-8eae47cf7a05
CLOUDFLARE_DATABASE_ID_SOURCE_HK_2025_PREVIEW=113ea535-e571-4e31-b15a-c18f116e0424
CLOUDFLARE_DATABASE_ID_SOURCE_HK_2026_PREVIEW=1231e30e-58da-4e70-9342-7b4bb6500dad
```

Example `.env.prod.local`:

```bash
CLOUDFLARE_DATABASE_ID_META_PRODUCTION=5cbcd2b2-5418-43e2-97f1-78f30037aaf3
CLOUDFLARE_DATABASE_ID_CURRENT_PRODUCTION=c15bf6b3-32a3-4d05-b7d2-1d2e2643037f
CLOUDFLARE_DATABASE_ID_HISTORY_HK_2025_PRODUCTION=c019b2b7-5511-4cee-8732-5bdba2aea264
CLOUDFLARE_DATABASE_ID_HISTORY_HK_2026_PRODUCTION=b9119da1-813d-4d03-a431-b8e4a540f918
CLOUDFLARE_DATABASE_ID_SOURCE_HK_2025_PRODUCTION=4dcb7029-51da-482a-a41c-729ecd7b7b12
CLOUDFLARE_DATABASE_ID_SOURCE_HK_2026_PRODUCTION=c005d6e0-02f7-45f4-9171-1291fc2dc1b5
```

## Deployed environments

These values are only used for local Drizzle Studio access. They are not Wrangler Worker secrets and do not need `wrangler secret put`.

Cloudflare Workers get D1 bindings from [apps/atlas-api/wrangler.jsonc](apps/atlas-api/wrangler.jsonc), while Studio uses the local env files above to authenticate directly against the remote D1 HTTP API.

## Sharded D1 layout

The repo uses the multi-DB layout described in
[libs/db/docs/schema/hybrid-canonical-d1-sharding.md](docs/schema/hybrid-canonical-d1-sharding.md).

The newly provisioned remote databases are:

| Role | Preview | Production |
|------|---------|------------|
| `meta` | `ss-meta-db-preview` (`655743d2-5dcc-4a94-a12f-62eaf9955a84`) | `ss-meta-db-prod` (`5cbcd2b2-5418-43e2-97f1-78f30037aaf3`) |
| `current` | `ss-current-db-preview` (`1e704b3f-4374-42ea-b8b2-faca805d11eb`) | `ss-current-db-prod` (`c15bf6b3-32a3-4d05-b7d2-1d2e2643037f`) |
| `history-hk-2025` | `ss-history-hk-2025-db-preview` (`bea18422-d1ce-429d-b099-464a33716921`) | `ss-history-hk-2025-db-prod` (`c019b2b7-5511-4cee-8732-5bdba2aea264`) |
| `history-hk-2026` | `ss-history-hk-2026-db-preview` (`de2e7b41-29dd-4f97-a3eb-8eae47cf7a05`) | `ss-history-hk-2026-db-prod` (`b9119da1-813d-4d03-a431-b8e4a540f918`) |
| `source-hk-2025` | `ss-source-hk-2025-db-preview` (`113ea535-e571-4e31-b15a-c18f116e0424`) | `ss-source-hk-2025-db-prod` (`4dcb7029-51da-482a-a41c-729ecd7b7b12`) |
| `source-hk-2026` | `ss-source-hk-2026-db-preview` (`1231e30e-58da-4e70-9342-7b4bb6500dad`) | `ss-source-hk-2026-db-prod` (`c005d6e0-02f7-45f4-9171-1291fc2dc1b5`) |

These are currently bound in Wrangler as:

- `DB_META`
- `DB_CURRENT`
- `DB_HISTORY_HK_2025`
- `DB_HISTORY_HK_2026`
- `DB_SOURCE_HK_2025`
- `DB_SOURCE_HK_2026`
