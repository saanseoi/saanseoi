# Local release exports

From the SaanSeoi repository root on `preview`:

```sh
bun run dev:exports
```

This starts only the export Worker on `127.0.0.1:8793`, with inspector port `9253`.
Caddy forwards `http://api.atlas.localhost/*/exports/*` to that listener. The main API
can remain running on port `8791`. Both `bun run dev` and `bun run dev:atlas` include
the export Worker when starting a complete stack.

In another terminal, seed the building search data once:

```sh
bun run exports:seed:local
```

The seed command downloads the public building release, pins names, points and addresses
to that release, checks every file's SHA-256 and byte count, and uploads only to the
loopback Worker. Publication validates matching building IDs, shard ranges and
JSON/NDJSON representations before exposing the release. It also prepares the street
catalogue used to parse address candidates. If no canonical physical street release
exists locally, the catalogue is explicitly marked as a baseline mock. All writes are to
local R2 simulation; no remote publication or database reset occurs.

An existing prepared bundle can be loaded with
`bun run exports:seed:local --directory /absolute/path/to/bundle`. Retries are immutable
and the seed command can be rerun to import a newer release.

The default store is `.local/d1/dev` inside this checkout. It survives stopping the
development server. `EXPORT_PERSIST_PATH` overrides it; relative paths are resolved from
`apps/release-exports`. Use the same override when starting and seeding. `EXPORT_PORT`
and `EXPORT_INSPECTOR_PORT` override the listeners; update Caddy if changing the public
listener. The launcher refuses occupied ports and creates a separate local preparation
credential in ignored `.dev.vars.preview`.

The three required manifests are under
`http://api.atlas.localhost/buildings/v0.1/exports/physical/overture/`, at
`names/manifest.json`, `points/manifest.json` and `addresses/manifest.json`. All
subsequent detail requests must carry the names manifest's `exportReleaseId` as the
`release` query parameter. Addresses are point-in-footprint candidates; multiple
candidates are retained without choosing a nearest address or creating canonical
building membership. Refs #68.
