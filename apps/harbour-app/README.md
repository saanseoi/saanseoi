# SaanSeoi Harbour

Local data review tools. Run `bun run dev:harbour-app` from the repository root and open
<http://localhost:5185/>. The index lists the available tools:

- [Division areas](http://localhost:5185/divisions/): draw boundaries, review source
  geometry and export curated fixtures. See the
  [geographic review guide](../../docs/datasets/internal/geographic-review.md) for
  required source archives and optional geometry assets.
- [Ingestion review](http://localhost:5185/ingestion/): inspect local SQLite shards,
  samples, completeness and review progress. See
  [ingestion review](ingestion/README.md).

`bun run review:divisions` and `bun run review:ingestion` open the corresponding tool.
Use the same hostname each time: browser storage is scoped to the origin. To transfer
working division drawings between browser origins, export them with **Download
fixtures**, then use **Import estimated areas** in the destination editor. Retain the
export until the imported geometry has been checked. Browser backups also belong to
their original origin. The on-disk editor project remains in
`.local/division-review/division-editor-project.json`.

The server binds to loopback. Ingestion reads local databases in read-only mode;
division input generation writes its local cache. There is no deployment command.
`bun run --cwd apps/harbour-app build` checks the browser bundles, but static hosting
does not provide the local query or geometry endpoints.

Run `bun run --cwd apps/harbour-app check` and `bun run --cwd apps/harbour-app test` to
verify both tools. New reusable review tools should have their own page and modules
here, with a link on the index. Temporary, case-specific map investigations can remain
in the ignored basemap review directories.

## Further candidates

The temporary basemap reviews include reusable candidates:

- Address identity changes: release-selectable review backed by sealed ALS evidence and
  the `identityReviewPlugin.ts` input endpoint.
- Place/address ingestion decisions: review cases and candidate address matches.
- Island/locality geometry review: compare source outlines and geographic coverage;
  assess overlap with the Division areas tool before creating another tool.

Estate-specific pages, single-release retirement maps and individual locality
investigations are case material. Promote their common workflow only when it has
versioned code and reproducible inputs; keep generated datasets local.

## Local hostname

Use <http://review.localhost/> with this loopback-only Caddy route:

```caddyfile
http://review.localhost {
    bind 127.0.0.1 ::1
    reverse_proxy localhost:5185
}
```

Harbour accepts `review.localhost` as a development host. The tile service's
`DEV_ORIGINS` includes `http://review.localhost` and the direct-server origin
`http://review.localhost:5185` for keyless map access. This allowlist takes effect when
the tile Worker configuration is deployed. Browser working state is scoped to the
hostname and port; export drawings before switching origins.
