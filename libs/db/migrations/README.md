This repo now tracks D1 migration sets by database family:

- `migrations/meta`
- `migrations/current`
- `migrations/history`
- `migrations/source`

Do not handcraft the new Drizzle snapshots for these families. Run local snapshot
generation after reviewing the schema:

- `bun run --filter @repo/db db:migration:generate:meta`
- `bun run --filter @repo/db db:migration:generate:current`
- `bun run --filter @repo/db db:migration:generate:history`
- `bun run --filter @repo/db db:migration:generate:source`

The local migration runner adopts a regenerated baseline on an existing database only
after verifying its tables, constraints and indexes against a fresh SQLite database
created from that baseline. Column order and identifier quoting do not affect this
comparison. Runtime tables outside the baseline remain untouched. Adoption retains old
ledger entries and records the verified baseline before applying subsequent migrations.
The runner saves a consistent backup before recording or applying pending migrations.

If the existing schema differs, the runner stops without recording the baseline. Apply a
data-preserving schema upgrade before retrying; a baseline creates a fresh database and
does not describe how to transform retained data.
