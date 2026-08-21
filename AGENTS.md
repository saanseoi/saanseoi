# AGENTS.md

Repo-local operating notes for Codex and similar agents.

## Project shape

- Monorepo: Bun workspace managed by Turborepo
- Primary apps:
  - `apps/atlas-api`: Public Hono API
  - `apps/atlas-app`: Public SvelteKit App
  - `apps/harbour-api`: Private Hono API for dataset ingestion
  - `apps/harbour-cli`: Private Bun CLI for dataset mgmt
- Secondary apps:
  - `apps/harbour-dataops`: Bun CLI for data-processing operations
  - `apps/harbour-workers`: Cloudflare Workers snapshot-cleanup queue consumer
  - `apps/basemap-tiles`: Cloudflare Workers vector-tile service
  - `apps/basemap-viewer`: Svelte/Vite basemap viewer
  - `apps/telegram-discord-bridge`: Cloudflare Workers Telegram–Discord bridge
- Shared libs:
  - `libs/core`
  - `libs/db`
  - `libs/i18n`
  - `libs/config-typescript`

## Tooling Conventions

- Package manager/runtime: `bun` (`packageManager: bun@1.4.0`)
- Task runner: `turbo`
- Formatter/linter: `biome`
- Type checking: `tsc --noEmit` in package scripts
- Worker build/deploy tooling: `wrangler`
- Prefer `rg`/`rg --files` for search
- Use `bash` for scripts running on CI; use `fish` for scripts run locally.
- The product is pre-release: avoid legacy compatibility paths or migration shims.
- Validate complex front-end design changes with `playwright`. Ignore content changes.

## Component and styling conventions

- Svelte routes are responsible for orchestration and component composition. They should
  never see raw HTML in their bodies.
- Keep distinct visual elements in dedicated components rather than embedding them in a
  parent. See `apps/atlas-app/docs/components.md` for the full guide.
- Prefer inline Tailwind utility classes over component-local style blocks; use scoped
  CSS only when utilities cannot express the needed styling.

## Documentation

- Use British English in prose, documentation, and identifiers where applicable.
- In user-facing documentation use 'SaanSeoi' instead of 'Atlas', as the latter is the
- We are pre-release, do not mention how it was previously done or how something
  changed.
- After finishing a run that touched Markdown files, run `bun run format:markdown`.
- Whenever source-data processing changes, document it in the relevant
  `docs/datasets/families/*.md` and `docs/datasets/sources/{source}/*.md` files.
  internal name.
- When changing the Places API route, schema, pagination, category vocabulary, token
  requirements, basemap token exchange, map-style contract, or supported basemap
  regions, review and update the `/guides/create-a-map` tutorial. Update the associated
  coverage matrix in `docs/guides/create-a-map-coverage.md` too.

## Migration workflow

- When adding a Drizzle table, add it to the relevant local reset drop script under
  `libs/db/scripts/sql/` (including `drop-all-db.sql`).
- Call `bun run db:migration:generate:*` to generate migration schemas. This command can
  be interactive. Do not handcraft migrations.
