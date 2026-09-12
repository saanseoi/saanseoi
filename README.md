<p align="center">
<a href="https://saanseoi.hk/" target="_blank">
<img align="center" width="600" height="400" alt="SS" src="https://github.com/user-attachments/assets/e526c3b9-dfb2-4989-9790-643a22802d6e" /></a>
    <h1 align="center">山水 | SaanSeoi</h1>
    <h2 align="center" style="border:none">A DITIGAL COMMONS FOR HONG KONG</h2>
</p>

## Development

![Code Style](https://img.shields.io/badge/code_style-biome-60a5fa.svg?style=for-the-badge)
![Commitizen](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg?style=for-the-badge)
![Changesets](https://img.shields.io/badge/Changesets-enabled-green?style=for-the-badge)

This project is a monorepo managed by [Turborepo](https://turbo.build/).

Install Bun 1.4.2 before running the development commands.

```bash
git clone git@github.com:saanseoi/saanseoi.git && cd saanseoi
bun install
bun run dev:atlas
```

Run the focused local services you need:

```bash
bun run dev:atlas    # Atlas API and public site
bun run dev:harbour  # Harbour API and queue Worker
bun run dev:basemap  # Basemap release viewer
bun run dev:all      # All services currently included in the full stack
```

Development commands do not run local D1 migrations. Apply schema changes manually with
`bun run db:migration:run:local` before starting a Worker when needed.

For more detail on contributing, workflows, and project expectations, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- [Repository overview](docs/repo.md)
- [Taxonomy](docs/taxonomy.md)
- [Basemap tiles](docs/tiles.md)

### Dataset Docs

- [Address family](docs/datasets/families/address.md)
- [Division family](docs/datasets/families/division.md)
- [Overture division](docs/datasets/sources/overture/division.md)
- [HKGov ALS address](docs/datasets/sources/hkgov/address.md)
- [HKPost address](docs/datasets/sources/hkpost/address.md)

### App Docs

- [Basemap tiles](apps/basemap-tiles/README.md)

#### Atlas (Public Site)

- [Conventions](apps/atlas-app/docs/conventions.md)
