# Overture Hong Kong Division Geometry Inputs — implementation plan

## Purpose and scope

Add the two Overture division geometry datasets as required inputs to the Divisions API
family:

- `ds-hk-overture-divisionArea`
- `ds-hk-overture-divisionBoundary`

They are source datasets distinct from `ds-hk-overture-division`, but their output is
geometry associated with the same canonical division API. This work adds versioned
source retention, canonical history/current tables, local SQL ingestion, release-level
statistics, metadata fixtures and JSON:API relationships. It does not replace the
existing Overture division point dataset.

This document is the implementation plan and decision record for the geometry inputs.

## Evidence gathered from the 2026-06-17.0 input

Inputs inspected:

- `/home/io/code/overturist/data/2026-06-17.0/divisions/China/Hong Kong/division_area.division.intersects.clipSmart.parquet`
- `/home/io/code/overturist/data/2026-06-17.0/divisions/China/Hong Kong/division_boundary.division.intersects.clipSmart.parquet`

The upstream documentation defines division areas as an area for one division and
boundaries as the ordered border between two divisions. The boundary `division_ids`
order is significant: element zero is the division to the left of the directed line and
element one is the division to the right. The documentation also states that exactly one
of `is_land` and `is_territorial` is true for each feature.

The reported flag defect was independently confirmed against the public release object
using DuckDB. For `id = 59e53dd7-e5f7-482c-bcba-c91abb74f7da` and
`division_id = a3f5d985-9d91-4629-a530-f66420a0be01`, the remote
`theme=divisions/type=division_area` row has `country = HK`, `region = NULL`,
`class = land`, `is_land = true`, and `is_territorial = true` (version 4; primary name
`灣仔區 Wan Chai District`). This confirms the condition is upstream rather than a clip
or importer artefact.

Observed source profile:

| Input            | Rows | Intended Hong Kong cut | Excluded `CN-GD` rows | Other retained rows                                                  |
| ---------------- | ---: | ---------------------: | --------------------: | -------------------------------------------------------------------- |
| DivisionBoundary |   67 |                     66 |                     1 | 64 rows have `country = HK`; 2 have null `country` and null `region` |
| DivisionArea     |  181 |                    142 |                    39 | all retained rows have `country = HK` and null `region`              |

The intended region predicate should be `region <> 'CN-GD' OR region IS NULL`, not
`country = 'HK'`: the latter would discard the two intended maritime / international
waters boundary records with null country. The preflight should allow exactly the Hong
Kong rows and null-country/null-region maritime boundaries, and fail if a future non-HK,
non-null country or non-null, non-`CN-GD` region appears unless the allowlist is
deliberately extended.

The area-flag discrepancy remains to be investigated before implementation:

The supplied geometries use both forms expressly allowed by Overture: boundaries contain
53 `LineString` and 13 `MultiLineString` records after the Hong Kong cut, while areas
contain 133 `Polygon` and 9 `MultiPolygon` records. All are accepted as-is; no geometry
filtering or single-to-multi promotion is required.

138 retained area rows have both `is_land` and `is_territorial` set to true. A direct
DuckDB lookup against the public Overture release confirms that this is present upstream
and is not introduced by the Hong Kong clip. The values will therefore be retained
exactly as-is, with no rejection or repair; this remains an acknowledged upstream data
defect until a better source is available.

The implementation must retain the original WKB decoding path used by divisions and
validate the resulting GeoJSON geometry type before persistence: boundaries accept
`LineString` and `MultiLineString`; areas accept `Polygon` and `MultiPolygon`.

## Proposed data model

Follow the division table conventions: source tables use `sourceRecordId` for upstream
`id`, source-version rows use `sourceVersioning`, history tables use
`historyVersioning`, and current tables begin with `snapshotId` and end with timestamps.
This preserves the existing primary-key, shard, trace and rollback conventions rather
than introducing a second style of versioning.

Extract two reusable schema fragments rather than copying columns:

- Overture division-geometry source provenance: `sources`, `rawProperties`, and
  `version`, plus source-versioning columns. `rawProperties` retains the dropped raw
  source fields for both geometry inputs.
- Canonical division geometry: `id`, `bbox`, `geometry`, `sourceKeys`, canonical `type`,
  `isLand`, `isTerritorial`, and enriched source provenance.

Proposed physical table names:

| Layer   | Division area           | Division boundary            |
| ------- | ----------------------- | ---------------------------- |
| Source  | `overtureDivisionAreas` | `overtureDivisionBoundaries` |
| History | `divisionAreas`         | `divisionBoundaries`         |
| Current | `divisionAreas`         | `divisionBoundaries`         |

### Source: Overture DivisionBoundary

`overtureDivisionBoundaries` retains, in division source-table order:

1. `sourceRecordId` ← `id`
2. `subtype`
3. `class`
4. `isLand` ← `is_land`
5. `isTerritorial` ← `is_territorial`
6. `divisionIds` ← `division_ids` (JSON array, preserving order)
7. `geometry`, `bbox`
8. `sources`, `rawProperties`, `version`
9. source version-management columns.

`theme`, `type`, `country`, `region`, `is_disputed`, and `perspectives` are not exposed
as columns; dropped values are retained in `rawProperties` for audit and compatibility.
`theme` and `type` are checked as single values; `country` and `region` are checked
against the Hong Kong cut policy above. `perspectives` receives the requested blocking
preflight: all values must be absent/null before processing. `is_disputed` should also
be checked as uniformly false before it is dropped, even though no separate check was
requested, because it semantically accompanies perspectives.

### Canonical DivisionBoundary

`divisionBoundaries` in history/current retains:

1. `id`
2. `leftDivisionId` ← `SourceDivisionBoundary.divisionIds[0]`
3. `rightDivisionId` ← `SourceDivisionBoundary.divisionIds[1]`
4. `bbox`, `geometry`
5. `sourceKeys` ← `{ version, subtype, class }`
6. `sources` ← `{ overture: SourceDivisionBoundary.sources }`
7. `type` ← source `class`, constrained to `land | maritime`
8. `isLand`, `isTerritorial`
9. history/current version-management columns.

Indexes will support `(snapshotId, leftDivisionId)` and `(snapshotId, rightDivisionId)`
in current storage, plus equivalent current/history lookups and snapshot validity
lookups. The API relation lookup must query both sides without duplicating a boundary
where a malformed row names the same division twice; the preflight rejects such rows.

### Source: Overture DivisionArea

`overtureDivisionAreas` retains:

1. `sourceRecordId` ← `id`
2. `subtype`
3. `class`
4. `isLand` ← `is_land`
5. `isTerritorial` ← `is_territorial`
6. `divisionId` ← `division_id`
7. `geometry`, `bbox`
8. `sources`, `rawProperties`, `version`
9. source version-management columns.

`names` is dropped as redundant with its referenced division; `theme`, `type`,
`country`, and `region` are dropped after the same explicit preflight policy. No
division i18n tables are created for areas.

### Canonical DivisionArea

`divisionAreas` in history/current retains:

1. `id`
2. `divisionId`
3. `bbox`, `geometry`
4. `sourceKeys` ← `{ version, subtype, class }`
5. `type` ← source `class`, constrained to `land | maritime`
6. `isLand`, `isTerritorial`
7. `sources` ← `{ overture: SourceDivisionArea.sources }`
8. history/current version-management columns.

Current indexes will include `(snapshotId, divisionId)`; history gets matching current
and snapshot-validity indexes. `divisionId` is validated against the same-cohort
division snapshot before the geometry is made current, so that the relationship cannot
refer to a division absent from the assembled API snapshot.

## Ingestion and validation design

### Upload identity and routing

The core resource-type union currently contains only `division`, `address`, `place`, and
`street`, and the CLI routes only Overture `division` to the local division SQL
processor. Add the accepted resource types `divisionArea` and `divisionBoundary`, each
with its own snapshot and dataset `type` value. This lets the two inputs be
independently required, versioned and snapshotted in the API composition. It entails
extending the resource-type/theme constants, dataset/schema enums, upload planning,
release/snapshot assembly, worker bindings, local D1 cache profiles, rollback, and
fixtures.

Add explicit Overture parquet schema definitions for both types and 2025-09-24.0 onward
release windows. Their schema tests must test accepted files, missing fields,
unexpected/drifted fields, and numeric/boolean/list WKB column shapes. Extend the CLI's
assumption checker from division-only logic into source-kind-specific preflights.

For each upload, the local SQL pipeline will:

1. inspect and validate the registered parquet schema;
2. apply the geographic inclusion rule;
3. validate constant/dropped fields, empty `perspectives`, geometry type, two ordered
   distinct boundary IDs, class, booleans, and referenced division IDs;
4. decode and normalize source records, hash source and canonical payloads, and
   calculate changed/unchanged/deleted rows;
5. close/advance source and history versions, clone and patch the current snapshot, and
   write SQL artifacts for source, history, current, stats, and metadata;
6. publish only when the geometry snapshot is compatible with the anchored Division
   snapshot and required release sources are present.

The implementation should share generic full-snapshot source-version advancement,
canonical geometry hashing, SQL literal generation, current-snapshot cloning, stale-row
deletion, trace logging, and cache table profiles. Domain-specific normalization remains
separate for area versus boundary relationships.

### Statistics

Produce release-level `stats` rows for each geometry dataset, following the existing
division stats serialization and report surfaces. The initial importer writes:

- `records/count/count` total accepted records, with `groupBy = table`;
- `records/count/count` by `type` (`land`/`maritime`) and land / territorial-flag
  combination;
- geographic exclusions and rejected-row counters are deliberately not persisted as
  release stats; they remain visible in processing diagnostics.

The existing report surface can add relationship coverage and churn dimensions once
multiple geometry cohorts are available. Reference validation is blocking, so a
published geometry release cannot contain missing division IDs.

The API-release-set stats must additionally report the tables and relationship coverage
for areas/boundaries. Geographic-cut and rejected-row counters are not stored as stats.

## API composition and response proposal

Add both geometry resource types to `api-divisions-default.json` as required members
with `role: "geometry"`, `selectionMode: "exact_ref"`, anchor `division`, and lower
priority than the primary division member. `geometry` is a suitable role: the datasets
materially describe division geometry but are neither a competing primary record nor an
optional enrichment. The composition fixture's version hash must be regenerated, not
hand-edited.

Expose JSON:API relationships named `areas` and `boundaries` on a division resource.
Plural names are consistent with JSON:API relationship naming and with multiple area
variants or boundaries per division. The default list/detail responses do not join
either geometry table. A client opts in with:

- `include=areas`
- `include=boundaries`
- combinations with the existing relationship, e.g.
  `include=hierarchy,areas,boundaries`.

When requested, return `division-areas` / `division-boundaries` resource objects in the
top-level `included` array. The relationship identifiers can be returned with the
primary resource (and links added if supported) without forcing geometry
materialization; the implementation will align the exact behaviour with the existing
`hierarchy` relationship conventions. The response/OpenAPI schemas, service query types,
parsers, database query functions, serializer and tests all need to accept the
comma-separated include set and deduplicate included records across list responses.

This opt-in design is recommended because boundaries are sparse (currently district and
SAR-relevant only) and a list response could otherwise repeat linework many times. Areas
are also opt-in because a division can have both land/maritime variants and their
geometry payload is large. No `include=area` or `include=boundary` singular aliases
should be added.

Extend `fixtures/meta/apiFields/` beyond attribute-only provenance with relationship and
included-resource paths. At minimum, add existing `hierarchy` paths and the new:

- `division.relationships.areas` and `division.included.areas.*`
- `division.relationships.boundaries` and `division.included.boundaries.*`

The area/boundary fields should map each canonical attribute to its named source
dataset, including `sourceKeys.overture.version`, `.subtype`, `.class`, and the side-ID
mapping for boundaries. Add the API-field fixture for the geometry-enabled division
release set instead of retroactively claiming old snapshots exposed relationships.

## Fixture and documentation changes

Create the following after the data-model decisions are approved:

- `fixtures/meta/datasets/overture-hk-divisionArea.json` and
  `fixtures/meta/datasets/overture-hk-divisionBoundary.json`, based on the existing
  division fixture. Use the supplied English definitions; add matching Traditional and
  Simplified Chinese metadata with the same style as the division dataset.
- First release notes for source version `2025-09-24.0` in
  `fixtures/meta/releases/ds-hk-overture-divisionArea/` and
  `fixtures/meta/releases/ds-hk-overture-divisionBoundary/`, using the 2026-06-17.0
  division note's front matter, headings, retained/enriched/normalized/compatibility/
  dropped-field depth, and all three locales. The boundary note must explain that Hong
  Kong has district-level boundaries only; the area note must explain the division ID
  association and land/maritime extent.
- The API composition fixture and new geometry-aware API-fields fixture; rerun the
  fixture hashing command for every edited JSON fixture.
- `docs/datasets/resourceType/division.md` and the Overture source documentation with
  table ownership, full-snapshot semantics, validation, filter policy, stats and API
  include behaviour. Create source-specific DivisionArea/DivisionBoundary documents if
  keeping the existing one-source-one-document layout. Update the division family
  document if it is introduced/available in the documentation tree.
- Database schema documentation (`canonical-storage`, `relationships`, `api-contract`
  and data-versioning) for the new tables, source-key compatibility fields and
  include-only relationship contract.

## Tests and verification

Add focused tests before broad integration testing:

- source/canonical schema tests for order, primary keys, indexes and enum constraints;
- CLI plan/routing/schema-drift tests for both source kinds;
- preflight tests for the geographic cut, `perspectives`, constant fields, geometry
  acceptance, two ordered unique boundary IDs, type/class and division references;
- normalizer and hashing tests proving source version changes, source provenance,
  left/right order, stale source/history closure, current snapshot cloning and rollback;
- stats tests for coverage, churn and quality rows;
- local SQL ingestion tests against small fixtures for first load, unchanged load,
  changed load, deletion and an anchored division snapshot;
- Atlas database/service/OpenAPI/route tests for default omission, each individual
  include, combined includes, sparse no-result divisions, relationship identifier and
  included-resource de-duplication;
- registry/meta fixture tests covering the two required `geometry` members and new
  dataset/release metadata.

After schema implementation, generate migrations separately for `source`, `history` and
`current` with the repository commands, then run the generated migrations locally and
execute migration lint and the scoped test/check suite. Do not handcraft Drizzle
snapshots. If generation needs rename/drop resolution, it must be run interactively by
the user and the generated artifacts supplied before the work continues, as required by
the repository migration policy.

## Confirmed design decisions

- Accept the upstream-allowed `LineString` / `MultiLineString` boundary geometries and
  `Polygon` / `MultiPolygon` area geometries as-is.
- Use the new resource types `divisionArea` and `divisionBoundary`.
- Canonical areas mirror canonical boundaries for provenance, with
  `sources: { overture: SourceDivisionArea.sources }` and
  `sourceKeys: { version, subtype, class }`.
- API release sets use only exact same-cohort Division, DivisionArea and
  DivisionBoundary snapshots.
- Retain upstream `is_land = true` / `is_territorial = true` area values exactly; do not
  reject or repair them during ingestion.
