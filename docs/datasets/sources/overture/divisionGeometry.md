# Overture division geometry ingestion

Retained source assertions use
[distinct validity periods for recurring content](../../families/source-evidence.md#recurring-source-validity-periods).
An unchanged open occurrence continues; returning content starts a new occurrence.

Canonical Division identities use representative Points. Canonicalisation preserves a
valid source point or derives an interior point from polygonal source geometry using JTS
`InteriorPoint`. The `division-representative-point` audit guard verifies point validity
and strict containment where canonical area evidence is available. Source polygons and
separate DivisionArea geometries retain their full extent. See the
[Division point contract](../../families/divisions.md#representative-points-and-separate-areas)
for null handling and area selection.

Canonical source references follow the
[source evidence contract](../../families/source-evidence.md). Original publisher
properties remain in retained source assertions. The release identifies the retained
archive; table-wide acquisition coordinates belong in the processing receipt. These
source tables do not need a `sourceLocator` column.

Record-content hashes exclude observation timestamps and publisher version labels,
including nested attribution metadata. Effective dates, statistical periods and content
dependency hashes remain significant. Retained source payloads preserve the original
metadata. File checksums and processing-cache identities retain their complete inputs.

Unchanged open source versions remain untouched across releases. Complete publisher
membership closes omissions independently of the assertion release ID. Snapshot
materialisation and release-specific provenance remain separate from source validity.
`validFromRelease` and `validToRelease` store only the release's `sourceVersion`, such
as `2025-09-24.0`, for Division, Division Area and Division Boundary source records.
Dataset-prefixed release codes belong to release metadata.

Area and boundary source assertions are keyed by source record ID, content hash and
validity start. A return to identical content opens a separate validity period; closed
periods remain closed. Release-specific source resolutions retain complete publisher
membership, including records excluded from canonical materialisation.

Each newly published area or boundary resource release supersedes the preceding release
of that resource. Current snapshot cleanup removes superseded geometry once it is no
longer required by a current or draft API release set. Historical requests replay the
selected area or boundary snapshot from its version journal and history shards; they do
not require every monthly geometry snapshot to remain in current storage.

[Minimal initialisation](../../minimal-initialisation.md) processes 2025-09-24.0 and
2025-10-22.0 with all three Division, Division Area and Division Boundary resources.

Area and boundary rule declarations are explicit JSON fixtures in
`fixtures/meta/processing-rules/assembly/`, shared by their normalisers and audit. Both
depend on `division-geometry-exclusions.json`. Overture geometry excludes `CN-GD`
records and retains all division IDs, including country referents. ID-based editorial
exclusions and constructed district unions belong to SaanSeoi preparation.

The [processing audit](../../processing-provenance.md) retains registered geometry
normalisation and geometry-patch declarations with counts, including Guangdong spillover
exclusions. Bulk rules do not copy affected IDs or geometry values. Selected identity
and geometry patch fixtures remain readable in Audit.

Overture division, area and boundary source rows preserve supplied publisher `sources`.
When references are absent or empty, source storage uses `null` without generating a
self-reference from the ingested record ID.

The upload command automatically resumes retained local batches before it opens the
planning mirror. If an interrupted owning release needs to be re-entered directly,
`sql:resume` can recover its batches and `--continue` completes release publication. The
prerequisite lookup recognises only sealed plans owned by the pending release; it does
not clear ownership or allow another release to bypass unfinished work.

Source areas and boundaries retain publisher attributes in `properties`, original native
geometry in `sourceGeometry` and attribution in `properties.sources`. Source columns
track identity and release validity; classification and land/territorial flags are
projected only into canonical tables.

Geometry snapshots retain effective source rules, lookup selections and assembly runs.
Replay includes recipe parents under the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance).

Replay SQL streams from mirror-table iterators during plan preparation. Bounded
statement packing preserves row order and oversized-geometry append semantics. Retained
plans reuse payloads without reading the replay tables again.

Ordinary geometry metadata upserts leave identical rows untouched. Changes to release
assignments, processing actions, statistics and other replayed fields still apply in
order under the [SQL delivery contract](../../sql-delivery.md), which also describes the
oversized-row exception.

Replay selects immutable canonical content through the snapshot's upsert journal keys.
Delete journals determine removed membership. Source closures made by the release use
exact record and version keys, including their timestamps, without retransmitting
historical source geometry.

Local area and boundary materialisation runs on WAL-safe SQLite planning copies and
retains exact current, history and source mutations with checksummed churn counts.
Receipt-backed replay resumes interrupted writes without recalculating the mutations or
losing snapshot membership removals. Normalisation remains a separate stage.

Geometry SQL uses [sealed delivery phases](../../sql-delivery.md) with source-file and
snapshot identities. Remote delivery and exact mirror replay must complete before
publication.

Division, area and boundary delivery each own a separate publication receipt. Native
planning and remote replay retain atomic ownership checks with their mutation batches.
An interrupted geometry delivery leaves its receipt unprepared until the sealed replay
and its count validation finish, including when the valid inventory is empty.

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
[`spec/divisions-geometry.md`](../../../../spec/divisions-geometry.md). This page
records the Hong Kong release profile and Overture-specific decisions.

## Automated refresh

When a new STAC release is found, `saanseoi update` invokes the sibling Overturist CLI
with the Hong Kong division id `b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d`, the release
version, and the `divisions` theme. The resulting Hong Kong files are placed under
`data/overture/<release>/divisions/China/Hong Kong` for the normal ingestion workflow.
If the requested Parquet file is already present there and non-empty, the updater uses
that retained export without fetching it again. The exact Parquet file consumed for each
source release is retained as that release's managed source asset. Its public download
has a dataset-and-version filename; the pipeline's local
`*.intersects.clipSmart.parquet` filename is never exposed. Overturist also exposes
`releases`, which emits the currently S3-available versions as JSON. The updater uses
that bounded catalogue to identify a displaced Overture release as an archive package
whenever it discovers a new release; archive downloads do not hold up the
current-release upload.

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
`version`, `subtype`, `class`, and land/territorial flags. `properties` retains the
decoded publisher attributes, including the native ordered `division_ids`/`division_id`
relationships and dropped fields (`theme`, `type`, `country`, `region`, `is_disputed`,
and `perspectives`). Publisher geometry is retained once in `sourceGeometry`, and
attribution once in `sources`. Source tables do not duplicate canonical relationships.

Overture Division IDs are validated against the Overture GERS Registry rather than being
classified from their UUID shape. The local `cache:gers` command caches the registry
evidence for retained Division and Place IDs and reports unmatched IDs explicitly.

Boundary canonical rows normalise `division_ids[0]` and `[1]` to left/right division
IDs; area rows normalise `division_id`. Source-only `version`, `subtype`, and `class`
remain in `properties`; canonical rows expose enriched Overture source provenance,
`type` (`land`, `maritime`, or `mixed`), bbox, geometry, and the source land/territorial
flags. Boundary rows require exactly two distinct division IDs and null `perspectives`.

| Source field                                        | Area treatment                                      | Boundary treatment                                    |
| --------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| `id`, `bbox`, `geometry`                            | retain exactly                                      | retain exactly                                        |
| `version`, `subtype`, `class`                       | retain in `properties`                              | retain in `properties`                                |
| `sources`                                           | retain and enrich as `{ overture: ... }`            | retain and enrich as `{ overture: ... }`              |
| `isLand`, `isTerritorial`                           | normalise from `is_land`, `is_territorial`          | normalise from `is_land`, `is_territorial`            |
| `division_id`, `division_ids`                       | retain only in source evidence; derive canonical ID | retain only in source evidence; derive left/right IDs |
| `theme`, `type`, `country`, `region`, `admin_level` | drop after preflight; preserve in `properties`      | drop after preflight; preserve in `properties`        |
| `names`                                             | drop as redundant with the referenced division      | —                                                     |
| `is_disputed`, `perspectives`                       | —                                                   | drop; `perspectives` must be null in preflight        |

Source tables use shared source-versioning columns; canonical tables use
history-versioning and current-snapshot columns as for `division`. Each geometry release
is assigned to both its source and history shards, allowing the source record API to
resolve its retained publisher records. Stats include accepted counts,
land/maritime/mixed type, land/territorial combinations, and source or canonical change
counts. Geographic exclusions and rejected rows remain visible in CLI diagnostics rather
than persisted release stats; `CN-GD` exclusions are retained as source-ingestion audit
rules.

The Hong Kong cut excludes rows with `region = 'CN-GD'`. A null country is valid for
maritime or international-water boundaries and is retained. Boundary rows must have
exactly two distinct `division_ids`; `perspectives` must be null. Area and boundary
source rows retain Overture version and source-only attributes inside `properties`, with
original attribution in `properties.sources`, native geometry in `sourceGeometry` and
release tracking alongside them. The publisher version is accessible as
`properties.version`. Canonical rows expose normalised left/right or division
references, `type` (`land`, `maritime`, or `mixed`), geometry, bbox, and
land/territorial flags. `mixed` is derived when both source flags are true, including
the known upstream Overture records where the source class alone would otherwise suggest
`land` or `maritime`.

Starting with the 2026-02-18.0 release, Overture division, area, and boundary rows
include nullable integer `admin_level`. It is accepted by preflight and retained in
`properties`; canonical geometry rows do not expose it because the referenced division
is the canonical owner of that administrative-level attribute.

The source-ingestion audit retains the `exclude-overture-guangdong-source-geometry` rule
with the exact source version, resource type, `region = CN-GD` predicate, input count,
excluded count and in-scope output count. An executed filter with no exclusions has a
`not-applicable` outcome. Automatic rules retain declarations and counts, not record
fixtures. The filter is not reported as executed for pre-normalised input.

The ingestion audit also retains the registered `retain-overture-source` mapping:
publisher identifiers, attribute values, property-key mapping and native geometry.
Passed publisher attribution and property-key collision checks are counted against the
retained rows. Successful Division-reference checks and reviewed publisher-schema
compatibility checks are included only when their calling path executed them. Canonical
geometry normalisation remains in the snapshot assembly audit.

Extraction and clipping performed by Overturist require their own retained execution
receipt. A cached Parquet filename does not prove which extraction checks ran; source
ingestion does not manufacture preparation evidence from it.

Each release writes source, history, current, and release-level ingestion statistics.
Geometry snapshots are assembled and published only for the exact release cohort of the
primary division snapshot. The CLI preflight enforces that division-first order, while
area and boundary uploads can be performed in either order. If one geometry snapshot is
missing, the dataset itself is still published and the cohort's API release set remains
draft until the counterpart arrives.

## SaanSeoi geometry preparation

District unions, authored geometry, geometry selections and Shenzhen Bay Port clipping
belong to the SaanSeoi source archive builder. Native Overture area and boundary
materialisation retains the publisher shapes with common schema normalisation. Canonical
geometry uses lossless Brotli storage so large publisher polygons fit the D1 row budget;
API readers restore the exact coordinates. Native area and boundary source geometry also
uses lossless Brotli storage, restoring its original WKB representation for source
record responses.

## Pinned country ancestor

A scoped Hong Kong extract can omit the PRC country record
`fb68fc73-3ac6-41c9-a692-22fcf20cb5be` referenced by its hierarchy and international
boundary. Preparation uses the exact edition's country metadata from the local
Overturist cache when available. Editions without cached country metadata use the
reviewed `hk-prc-country-anchor.json` hierarchy reference. The Source Audit retains
which reference was used, its content hash and its complete definition. Reference
metadata supplies identity and names; preparation does not invent publisher geometry. It
rejects invalid or duplicate country references and writes a separate prepared Parquet
file, preserving the raw extract. An existing publisher country row is retained without
duplication. Canonical materialisation does not inject a country fixture or exclude its
area by ID.

## Publication lineage

Overture division, area, and boundary snapshots belong to persistent snapshot lineages.
A complete monthly Overture composition is published as an immutable `overture` domain
release. HAD area geometry may be selected at or before the Overture cohort, but
planning domains are published separately and are never mixed into this release.

## Publisher source boundary

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`properties`.

## Publisher record envelope

Follow the [source record contract](../../source-records.md). The response contains
publisher attributes and source identity; internal resource types, variants and
acquisition locators are excluded. Optional geometry preserves native coordinates and
CRS, independently of canonical geometry processing.

Publisher `sources` is exposed in `properties`; WKB geometry is retained as a lossless
base64 value with an explicit `wkb-base64` encoding.

## Artefact destination

Fresh local initialisation supports `--target local --r2 production`: immutable source
and provenance objects are retained in production R2, with registrations kept in local
D1. Follow the
[storage-target workflow](../../d1-bootstrap.md#ingest-locally-with-production-r2) when
selecting or continuing this mode.

## Registry metadata

Overture division, division-area and division-boundary dataset metadata declares
EPSG:4326 for source geometry.

## Retained field locations

Publisher attributes are retained with camelCase keys, including `divisionId`,
`divisionIds`, `isLand` and `isTerritorial`. Original Overture paths remain in API
provenance. Source geometry stays in its envelope; public bounding boxes are derived
from processed geometry. Canonical attribution is wrapped under `overture`.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

## Publication readiness

Current Division rows and localisations use their stable lineage scope. Areas and
boundaries use lineage/cohort scopes, preserving independent provider variants and
retained cohorts. Current columns named `snapshotId` contain those physical scopes;
metadata and immutable history retain logical snapshot IDs.

Local canonical and geometry candidates preserve unchanged rows and timestamps. The
shared compiler transmits only final content differences. Full replacement membership
removes absent components only within the owned scope. A new cohort has a separate
initial geometry materialisation.

Delivery claims and guards the scope with its sealed publication token, validates the
complete projection and records preparation. Publication alone grants current read
permission, including for empty snapshots. Exact older geometry can replay from
immutable history when the selected scope has advanced. See the
[publication-state contract](../../publication-state-plan.md).

Local candidate preparation and remote replay use the shared final-difference compiler.
Complete source membership replaces only its lineage/cohort scope. Unchanged geometry
and source assertions generate no content mutations; a new independent cohort requires
its initial materialisation. Binary geometry travels as bounded hexadecimal parameters
without splitting one changed row into assembly writes.

Parented area and boundary snapshots inherit identical selected versions and their
owning history shards without another payload or child upsert journal. Preparation
validates complete ancestry, shard assignments, retained content and the selected
parent's current projection before omitting inherited writes. Missing or inconsistent
parent evidence blocks preparation. Removals are explicit delete journals derived from
the parent's membership; changed and reappearing features receive upserts. Parentless
checkpoints retain full membership, including when their content matches another cohort.
Arbitrary removed versions in older annual shards are not reused.

Source-release assertions and shard assignments retain their separate lifecycle. Native
geometry plans retain `sourceResolutions`; remote geometry SQL does not export that
table, and the separately delivered R2 processing audit does not populate it. Remote
per-record source-resolution delivery requires separate work; its rows are excluded from
savings attributed to sparse canonical journals.

CLI Division history compares the base and each locale independently, retaining
unchanged component versions and their original owning shards. A publication-version
change alone does not replace canonical source provenance. Identical source
interpretations inherit through snapshot ancestry; changed interpretations and source
omissions remain explicit. This component optimisation applies to canonical Divisions;
area and boundary source-resolution assertions retain their geometry lifecycle.

## Local review derivatives

Division-area topology repair uses unsimplified source geometry and retains source
identity. The review derivative follows the
[local polygon topology repair contract](../../families/divisions.md#local-polygon-topology-repair):
shared graph construction, authoritative land clipping and conservative 5-metre
centreline snapping. Simplification requires a separate later action and retains the
unsimplified input. A simplified review export is not an authoritative source for
boundary reconstruction.

Canonical geometry IDs are stable `ss-` UUIDs derived from provider, entity kind and
original record identity. Native Overture IDs remain source record identities.

## Curated SaanSeoi assembly

Native Overture areas remain the fallback input to the
[SaanSeoi curated DivisionArea assembly](../saanseoi/divisionArea.md). Curated polygons
and island geometry take precedence per division in the separate `saanseoi` snapshot.
The geographic API composition selects that assembly for geocoding; Overture source
geometry retains its own snapshot and provenance.

Area selection excludes every identity in the curated Overture division-exclusion
fixture. The geometry exclusion policy retains these IDs explicitly so its audit
definition matches the selected rows. Original geometry remains in the retained
publisher archive.

SaanSeoi administrative geometry uses pinned native Overture SAR and District
territorial polygons. Its three Area territories are unions of constituent districts.
Each territory also supplies a separate land-clipped record using the pinned Protomaps
coastline land mask. Administrative editor drawings do not override either record;
source record IDs and release identities remain attached to each derived geometry.
Disconnected territorial parts and islands are retained.

## Processing policy ownership

Ingestion retains native Overture geometry and publisher attributes in SOURCE.
DivisionArea and DivisionBoundary snapshot recipes select only their own geometry
executor, with the shared exclusion declaration retained as a dependency.
Classification, translation and hierarchy processing are selected on Division recipes.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Archive ownership

Original publisher inputs use `releaseSourceArchive` assets owned by their source
release. Resource-specific source exports use Parquet `resourceSourceArchive` assets
owned by their resource release. Each archive has a downloadable manifest recording its
original filename and packaging.

## Three-area companion boundary

C&SD Permanent Living Quarters geometry refers to SaanSeoi's reviewed Hong Kong Island,
Kowloon and New Territories identities. It is selected by the SaanSeoi API composition,
not the native Overture composition. Overture release sets retain their own area and
boundary snapshots, HAD district areas and C&SD land-clipped district areas.

## Historical audit evidence

Recorded Guangdong geometry exclusions and source checks belong to ingestion. Historical
source revalidation and country-reference evidence checks carry their actual
revalidation date. They do not assert that those checks ran during the original import.
Extraction and clipping require their own retained execution evidence. Source records,
snapshots and API release membership remain unchanged.
