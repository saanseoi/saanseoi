This repo now tracks D1 migration sets by database family:

- `migrations/meta`
- `migrations/current`
- `migrations/history`
- `migrations/source`

Do not handcraft the new Drizzle snapshots for these families.
Run local snapshot generation after reviewing the schema:

- `bun run --filter @repo/db db:migration:generate:meta`
- `bun run --filter @repo/db db:migration:generate:current`
- `bun run --filter @repo/db db:migration:generate:history`
- `bun run --filter @repo/db db:migration:generate:source`
