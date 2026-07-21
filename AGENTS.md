# AGENTS.md

Repo-local operating notes for Codex and similar agents.

## Project shape

- Monorepo: Bun workspace managed by Turborepo
- Primary apps:
  - `apps/atlas-api`: Cloudflare Workers API built with Hono
  - `apps/harbour-api`: Cloudflare Workers API
  - `apps/harbour-workers`: Cloudflare Workers ingestion/background logic
  - `apps/harbour-cli`: Bun CLI for uploads and related data tasks
- Shared libs:
  - `libs/core`
  - `libs/db`
  - `libs/i18n`
  - `libs/config-typescript`

## Tooling and conventions

- Package manager/runtime: `bun` (`packageManager: bun@1.3.0`)
- Task runner: `turbo`
- Formatter/linter: `biome`
- Type checking: `tsc --noEmit` in package scripts
- Worker build/deploy tooling: `wrangler`
- Prefer `rg`/`rg --files` for search
- The product is pre-release: do not retain legacy compatibility paths or migration
  shims unless explicitly requested.
- Use `playwright` to validate front-end design changes. Ignore content changes.

## Component and styling conventions

- Keep distinct visual elements in dedicated components rather than embedding them in a
  parent.
- Prefer inline Tailwind utility classes over component-local style blocks; use scoped
  CSS only when utilities cannot express the needed styling.

## Documentation

- Whenever source-data processing changes, document it in the relevant
  `docs/datasets/families/*.md` and `docs/datasets/sources/{source}/*.md` files.
- In user-facing documentation use 'SaanSeoi' instead of 'Atlas', as the latter is the
  internal name.

## Migration workflow

- Do not handcraft Drizzle migration snapshots when a schema change requires interactive
  snapshot generation or rename resolution.
- In that case, stop and ask the user to run the snapshot-generation command locally and
  provide the generated migration artifacts for follow-up changes.
