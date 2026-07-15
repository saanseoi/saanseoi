# Overture division geometry ingestion

Overture `division_area` and `division_boundary` parquet files are ingested as the
`divisionArea` and `divisionBoundary` resource types. The local SQL importer accepts the
documented geometry unions: Polygon and MultiPolygon for areas, LineString and
MultiLineString for boundaries.

The Hong Kong cut excludes rows with `region = 'CN-GD'`. A null country is valid for
maritime or international-water boundaries and is retained. Boundary rows must have
exactly two distinct `division_ids`; `perspectives` must be null. Area and boundary
source rows retain `rawProperties`, the original source array, Overture version, and
source-key fields. Canonical rows expose normalized left/right or division references,
`type` (`land` or `maritime`), geometry, bbox, and land/territorial flags.

Each release writes source, history, current, and release-level ingestion statistics.
Geometry snapshots are assembled and published only for the exact release cohort of the
primary division snapshot.
