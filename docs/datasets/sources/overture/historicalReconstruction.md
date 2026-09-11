# Overture historical reconstructions

Published Divisions API statistics replay retained snapshot version journals across
annual history shards. They include unchanged inherited records, localised names and
deletions without requiring the original monthly archive. The shared
[division API backfill](../../families/divisions.md#api-release-statistics) rebuilds
counts, coverage and churn for historical and current releases.

Division base records and individual locales inherit independently through explicit
snapshot ancestry. Unchanged publisher reissues add no canonical history, version
journal or source-interpretation rows. Changed source payloads retain their assertions
even when canonical content is unchanged; absent sources carry an explicit omission
assertion until they reappear. Reviewed supplementary Division fixtures supply the final
canonical content for their identities while preserving the native publisher assertion,
so transient source shapes do not create additional canonical versions.

Published rollback retains withdrawn snapshots and their original evidence. New releases
allocate unused revision numbers while selecting their predecessor from the accepted
catalogue. Canonical comparison uses that predecessor's exact journal and owning shard,
so a retained withdrawn revision cannot silently become the next release's parent.

Overture keeps only a limited window of full release payloads. When a monthly payload
has expired, SaanSeoi does not synthesise feature properties from a neighbouring release
or from a changelog: a changelog identifies changed records but does not carry their
complete geometry and attributes.

The `2025-11-19.0` Hong Kong SAR and Macao SAR directory is explicitly marked `partial`
in `data/overture/2025-11-19.0/provenance.json`. Its retained public source contains the
three Divisions types only. `division`, `division_area`, and `division_boundary` were
reconstructed under the `division.intersects.clipSmart` contract; no non-Divisions files
were generated.

The clipping runner preserves the original nested GeoParquet schema with PyArrow, adds
the Overture `theme` and `type` fields required for upload planning, and uses Shapely
for the exact intersection. Point-based `division` records are retained when they
intersect the frame; only polygon areas and line boundaries are clipped. It runs in the
pinned GDAL-based Docker image defined in `docker/overture-reconstruction/Dockerfile`.
Generated Hong Kong extracts use the canonical
`data/overture/<release>/divisions/China/Hong Kong` directory; Macao extracts use
`data/overture/<release>/divisions/China/Macau`.
