# Repo Layout

This repository is a Bun workspace monorepo managed by [Turborepo](https://turbo.build/).

## Top-level structure

```text
apps/
  atlas-api/           Cloudflare Workers app built with Hono
  harbour-api/         Cloudflare Workers API for Harbour
  harbour-cli/         Bun CLI for upload and data-management tasks
  harbour-workers/     Cloudflare Workers background/ingestion logic
  .local/              App-local runtime state for development
data/
  <release dirs>/      Versioned source-data snapshots used by the repo
docs/
  processing/          Processing notes, including Overture-specific docs
libs/
  config-eslint/       Shared ESLint config package
  config-typescript/   Shared base tsconfig used by workspace packages
  core/                Shared application logic and service helpers
  db/                  Shared Drizzle schema and database scripts
  i18n/                Shared Paraglide/inlang assets and compile step
.changeset/            Changesets metadata for versioning and releases
.github/               GitHub Actions workflows and repo automation
.local/                Root-level local development state
scripts/               Shared shell scripts used by apps and tooling
spec/                  Repository-level specs and reference material
turbo.json             Task graph and cache configuration
package.json           Root workspace scripts
biome.json             Repo-wide lint and formatting rules
```

## How Turborepo is used here

The root `package.json` exposes workspace-wide commands such as `bun run dev`, `bun run lint`, `bun run test`, and `bun run check`. Those commands delegate to `turbo run <task>`.

`turbo.json` defines how those tasks relate to each other:

- `build` depends on `^build`, so package dependencies build before the current package.
- `lint` depends on `^lint`, so lint tasks execute in dependency order across the workspace.
- `check` depends on `^check`, which is the right place for TypeScript validation.
- `test`, `test:watch`, and `test:coverage` depend on `^build` so tests can rely on built upstream packages when needed.
- `dev`, `install`, and `update` are marked uncached because they are interactive or environment-dependent.

In practice:

- Run `bun run lint` from the repo root to lint every workspace package that exposes a `lint` script.
- Run `bun run check` from the repo root to type-check every package with a `check` script.
- Run `bun run test` from the repo root to execute tests across all apps/libs that define them.
- Run package-local commands inside `apps/atlas-api` when you only want to work on that app.

## Shared configuration

`libs/config-typescript/tsconfig.json` is the base TypeScript config intended for workspace packages. Apps extend it and then add package-specific settings such as:

- runtime types
- `rootDir` and `outDir`
- include globs
- local path aliases

That separation matters because aliases like `@/*` are package-local and should not be imposed by a shared base config.

## Linting and formatting

The repo uses Biome through the root `biome.json`.

- `bun run lint` runs Turborepo lint tasks.
- `bun run format` formats the repository from the root.
- package-level `lint` and `format` scripts can target individual apps or libs while still using the same root Biome config.
