# Geometry statistics backfill

This is a one-time, metadata-only operation. It reads immutable canonical geometry
snapshots and replaces only release-owned `stats.dimension = 'geometry'` rows. It never
re-ingests archives or changes source, current, history, snapshot, release, or
publication data.

Geometry area is calculated from canonical EPSG:4326 coordinates on the WGS84 authalic
sphere. Boundary length uses the WGS84 ellipsoidal geodesic inverse calculation.
Boundary segments count non-zero coordinate-to-coordinate edges, including every
exterior and interior polygon ring or every boundary line; they describe geometry
complexity, not accuracy. For division areas, holes reduce area. A shared division
boundary is counted for both adjacent districts.

Start with the production dry run and capture its output as the operational record. It
includes release IDs, snapshot IDs, assigned history shards, geometry-row counts,
district counts, totals, and whether a semantic stats change is needed.

```fish
./bin/saanseoi stats:backfill-geometry --target production --refresh-cache --dry-run
```

Inspect the listed releases and confirm the C&SD 2016 area release reports 18 canonical
geometry rows and 18 district groups (normally 90 geometry-stat rows: five metrics per
district). To narrow the operation, use `--release RELEASE_CODE[,RELEASE_CODE...]`,
`--dataset DATASET_CODE[,DATASET_CODE...]`, or
`--resource-type divisionArea|divisionBoundary`.

After review, perform the remote metadata write explicitly:

```fish
./bin/saanseoi stats:backfill-geometry --target production --yes
./bin/saanseoi reports:stats --target production --release RELEASE_CODE
./bin/saanseoi stats:backfill-geometry --target production --dry-run
```

Confirm the live source release page renders its Geometry table. Do not claim completion
until both the production metadata import and that live-page check succeed. The second
dry run should report `semanticChange=no` for already-backfilled releases.
