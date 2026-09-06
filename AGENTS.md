# AGENTS.md

## Working Agreement

### Task Execution & Autonomy

- CET is short for "Continue the Errored Codex Thread which contains the text" and you
  should then lookup the subsequent text in the current date's $HOME/.codex/sessions/ to
  pick up a failed thread.
- For implementation or fix requests, carry the authorized work through implementation
  and relevant verification. Do not stop at a proposed plan when you can proceed.
- Make reasonable assumptions for routine, reversible decisions. Ask a focused question
  when missing information materially affects correctness, scope, or authorization.
- Continue with authorized read-only actions, local worktrees, branch edits, and
  appropriate tests without repeatedly asking.
- Before requesting approval, finish the preparation that is already authorized and
  present a concrete, reviewable result.
- Respect required approval gates. Ask before destructive, irreversible, or otherwise
  unauthorized actions.
- Avoid boilerplate warnings about hypothetical risks. Explain concrete blockers or
  material risks when relevant.

### Instruction Conflicts

- Explicit user instructions take precedence over conflicting skill guidelines, subject
  to higher-priority instructions and actual permission boundaries.
- If a skill causes a pause or deviation, identify the file and relevant rule, and
  explain whether it is an explicit requirement or your interpretation. Continue any
  unaffected authorized work.

### Style & Output

- Lead with the result. Use plain language, active voice, and concise paragraphs.
  Include technical details that help assess the work.
- Use lists when they improve readability; avoid repetitive transitions and stock
  phrases such as "it's worth noting", "delve", "leverage", and "Bottom line".
- Report what changed, what was verified, and any remaining uncertainty.

### Verification

- Match verification to the scope and impact of the change. Complete required checks;
  expand testing when a concrete unresolved concern justifies it.

## Project shape

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

## Project Conventions

- Generally, source code files should aim be less than 1000 lines before they are
  refactored

## Tooling Conventions

- Package manager/runtime: `bun` (`packageManager: bun@1.4.2`)
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
