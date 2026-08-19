# Overture division geometry ingestion

Overture `division_area` and `division_boundary` parquet files are ingested as the
`divisionArea` and `divisionBoundary` resource types. The local SQL importer accepts the
documented geometry unions: Polygon and MultiPolygon for areas, LineString and
MultiLineString for boundaries.

The registry dataset codes are `ds-hk-overture-division-area` and
`ds-hk-overture-division-boundary`. Release codes use
`dr-hk-overture-division-area-{sourceVersion}` and
`dr-hk-overture-division-boundary-{sourceVersion}`; camelCase remains confined to the
programmatic resource-type enum.

Geometry uploads perform structural checks by default (supported geometry type, required
IDs, and division references). Full topology validation, including self-intersection and
degenerate-ring detection, is opt-in with `--validate-geometry`. This avoids quadratic
edge-pair checks on detailed Overture polygons during ordinary ingestion.

The source-neutral contract is in
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). This page records
the Hong Kong release profile and Overture-specific decisions.

## Automated refresh

When a new STAC release is found, `saanseoi update` invokes the sibling Overturist CLI
with the Hong Kong division id `b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d`, the release
version, and the `divisions` theme. The resulting Hong Kong files are placed under
`data/overture/<release>/divisions/China/Hong Kong` for the normal ingestion workflow.
The exact Parquet file consumed for each source release is retained as that release's
managed source asset. Its public download has a dataset-and-version filename; the
pipeline's local `*.intersects.clipSmart.parquet` filename is never exposed. Overturist
also exposes `releases`, which emits the currently S3-available versions as JSON. The
updater uses that bounded catalogue to identify a displaced Overture release as an
archive package whenever it discovers a new release; archive downloads do not hold up
the current-release upload.

For a target with no reported Overture release, this same bounded catalogue is the
bootstrap set. The updater ignores the operator's saved source checks, selects the
current STAC release and retained archive releases, and processes the archive releases
in version order before the current release can be treated as complete. A rerun reads
the target report again, so already materialised releases are not selected merely
because another environment has a different local update state.

## 2026-06-17.0 Hong Kong profile

The inspected artefacts were:

- `/home/io/code/overturist/data/2026-06-17.0/divisions/China/Hong Kong/division_area.division.intersects.clipSmart.parquet`
- `/home/io/code/overturist/data/2026-06-17.0/divisions/China/Hong Kong/division_boundary.division.intersects.clipSmart.parquet`

The input contained 181 area rows and 67 boundary rows. The Hong Kong cut retains 142
areas and 66 boundaries, excluding 39 and 1 `region = 'CN-GD'` rows respectively. The
filter is `region <> 'CN-GD' OR region IS NULL`; null-country, null-region boundary rows
represent maritime/international waters and are retained. A future non-HK, non-null
country or non-null, non-`CN-GD` region must surface in preflight unless the explicit
allowlist is extended.

The dropped-field preflight treats `country = 'CN'` and `region = 'CN-GD'` as the
allowlisted signature of these early scoped-extract spillover rows for division
geometry. Normalisation still drops the rows before division-reference validation and
storage. Other non-HK country or region values continue to produce a preflight warning.

After the cut, boundaries contain 53 `LineString` and 13 `MultiLineString` records;
areas contain 133 `Polygon` and 9 `MultiPolygon` records. Single and multi geometries
are both expressly allowed and are accepted as-is, without promotion or filtering.

The upstream Overture invariant that exactly one of `is_land` and `is_territorial` is
true is violated by 138 retained area rows. The importer preserves those values as-is;
it neither repairs nor rejects them. DuckDB inspection of the public release confirmed
the defect for `id = 59e53dd7-e5f7-482c-bcba-c91abb74f7da`,
`division_id = a3f5d985-9d91-4629-a530-f66420a0be01` (`灣仔區 Wan Chai District`,
`class = land`, both flags true), so this is an upstream quality issue rather than a
Hong Kong clipping artefact.

## Source and canonical mapping

Source rows preserve the Overture `id` as `sourceRecordId`, publisher `sources`,
`version`, `subtype`, `class`, and land/territorial flags. `rawProperties` retains the
complete decoded source row, including the native ordered `division_ids`/`division_id`
relationships and dropped fields (`theme`, `type`, `country`, `region`, `is_disputed`,
and `perspectives`). Source tables do not duplicate canonical relationships.

Boundary canonical rows normalise `division_ids[0]` and `[1]` to left/right division
IDs; area rows normalise `division_id`. Both expose `sourceKeys` (`version`, `subtype`,
`class`), enriched Overture source provenance, `type` (`land`, `maritime`, or `mixed`),
bbox, geometry, and the source land/territorial flags. Boundary rows require exactly two
distinct division IDs and null `perspectives`.

| Source field                                        | Area treatment                                      | Boundary treatment                                    |
| --------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `id`, `bbox`, `geometry`                            | retain exactly                                      | retain exactly                                        |
| `version`, `subtype`, `class`                       | retain; expose through `overture` source keys       | retain; expose through `overture` source keys         |
| `sources`                                           | retain and enrich as `{ overture: ... }`            | retain and enrich as `{ overture: ... }`              |
| `isLand`, `isTerritorial`                           | normalise from `is_land`, `is_territorial`          | normalise from `is_land`, `is_territorial`            |
| `division_id`, `division_ids`                       | retain only in source evidence; derive canonical ID | retain only in source evidence; derive left/right IDs |
| `theme`, `type`, `country`, `region`, `admin_level` | drop after preflight; preserve in `rawProperties`   | drop after preflight; preserve in `rawProperties`     |
| `names`                                             | drop as redundant with the referenced division      | —                                                     |
| `is_disputed`, `perspectives`                       | —                                                   | drop; `perspectives` must be null in preflight        |

The source schema and canonical schema use the same shared source-versioning,
history-versioning, current-snapshot and `rawProperties` fragments as `division`. Each
geometry release is assigned to both its source and history shards, allowing the source
record API to resolve its retained publisher records. Stats include accepted counts,
land/maritime/mixed type, land/territorial combinations, and source or canonical change
counts. Geographic exclusions and rejected rows remain visible in CLI diagnostics rather
than persisted release stats; `CN-GD` exclusions are also retained as release audit
actions.

The Hong Kong cut excludes rows with `region = 'CN-GD'`. A null country is valid for
maritime or international-water boundaries and is retained. Boundary rows must have
exactly two distinct `division_ids`; `perspectives` must be null. Area and boundary
source rows retain `rawProperties`, the original source array, Overture version, and
source-key fields. Canonical rows expose normalised left/right or division references,
`type` (`land`, `maritime`, or `mixed`), geometry, bbox, and land/territorial flags.
`mixed` is derived when both source flags are true, including the known upstream
Overture records where the source class alone would otherwise suggest `land` or
`maritime`.

Starting with the 2026-02-18.0 release, Overture division, area, and boundary rows
include nullable integer `admin_level`. It is accepted by preflight and retained in
`rawProperties`; canonical geometry rows do not expose it because the referenced
division is the canonical owner of that administrative-level attribute.

When the Hong Kong cut excludes one or more `CN-GD` rows, the release writes one
`overture_division_geometry_cn_gd_excluded` audit action. Its evidence records the
filter, resource type, source version, count, and up to ten affected-record examples;
the action is absent when no rows are excluded.

Each release writes source, history, current, and release-level ingestion statistics.
Geometry snapshots are assembled and published only for the exact release cohort of the
primary division snapshot. The CLI preflight enforces that division-first order, while
area and boundary uploads can be performed in either order. If one geometry snapshot is
missing, the dataset itself is still published and the cohort's API release set remains
draft until the counterpart arrives.

## Synthetic Hong Kong areas

If the scoped Overture division input omits Hong Kong Island, Kowloon or the New
Territories, the division processor creates a reviewed level-1 identity from the
configured district members. The generated row carries the stable canonical ID and the
corresponding Wikidata ID: `Q3248921`, `Q239143`, or `Q596660`. Kowloon deliberately
reuses Overture's historic ID `17009785-57fd-4e5b-af86-2d27352e4718`, rather than a new
synthetic identifier. Whether Overture supplies the identity or not, each recognised
area receives a derived `divisionArea` when its source area geometry is absent. That
geometry is the union of its district land geometries and is returned by the Divisions
API with `include=areas:overture`.

## Scoped parent fixture

Hong Kong's scoped division extract omits the Overture PRC country record
`fb68fc73-3ac6-41c9-a692-22fcf20cb5be`, although both the Hong Kong division hierarchy
and the international land boundary reference it. Each Overture Hong Kong division
snapshot therefore adds the reviewed
`fixtures/divisions/overture/hk-prc-country-anchor.json` row. The fixture supplies only
the level-0 country identity and localised names; it deliberately has no country
geometry. It is ingested with every cohort so geometry and address references resolve
within the exact same division snapshot. The anchor is registered as referent-only, so
areas belonging to it are rejected before geometry decoding. Boundaries between Hong
Kong and the PRC remain valid: they may reference the anchor without storing the PRC's
area geometry.

## Publication lineage

Overture division, area, and boundary snapshots belong to persistent snapshot lineages.
A complete monthly Overture composition is published as an immutable `overture` domain
release. HAD area geometry may be selected at or before the Overture cohort, but
planning domains are published separately and are never mixed into this release.
