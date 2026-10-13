# Home Affairs Department District Boundary area ingestion

Retained source assertions use
[distinct validity periods for recurring content](../../families/source-evidence.md#recurring-source-validity-periods).
An unchanged open occurrence continues; returning content starts a new occurrence.

Canonical source references follow the
[source evidence contract](../../families/source-evidence.md). Original publisher
properties remain in retained source assertions. The release identifies the retained
archive; table-wide acquisition coordinates belong in the processing receipt. These
source tables do not need a `sourceLocator` column.

Canonical Area versions are immutable. Snapshot membership follows the selected parent's
inline canonical events and recorded history shards; complete releases remove only
members of that parent. Exact and simplified scopes and other providers retain their
versions independently. Inherited events preserve their original provenance; independent
roots and reversions store new events, and history `isCurrent` does not define
membership. Current projection receipts and publication checks remain required for each
selected scope.

Source validity uses the owning release's version component in `validFromRelease` and
`validToRelease`. Dataset prefixes and resource suffixes are omitted;
`resourceReleaseId` retains the release association.

Native source replay preserves open matching versions without rewriting release
metadata. Complete replacement membership closes omissions and superseded hashes through
indexed source-ID predicates.

Geometry processing retains registered rule declarations, counts and selected identity
curation fixtures in the [R2 audit](../../processing-provenance.md). D1 registers the
manifest and attempt status. Audit provides lazy fixture inspection and guard outcomes;
bulk rules contain no affected-record lists or copied geometry values.

Source storage uses `null` when no provenance references are supplied. Publisher area
identifiers and archive references are retained when available; internal source-record
IDs are not manufactured as provenance.

Local geometry materialisation uses WAL-safe SQLite planning copies and receipt-backed
SQL replay. Sealed plans retain current, history and source mutations, including closed
assertions, together with checksummed churn outputs. Recovery validates normalised
inputs and reuses the plan before publication.

Remote replay selects immutable canonical content through exact record and
introducing-snapshot keys and records removals as inline deletion events. Source
assertions closed by the release receive updates matching exact versions and closure
timestamps without retransmitting older source geometry.

Ordinary geometry metadata upserts skip updates to identical rows while retaining
ordered changes to lifecycle, provenance and statistics fields. The
[SQL delivery contract](../../sql-delivery.md) describes the oversized-row exception.

Parented area revisions follow the
[geometry membership contract](../../families/divisions.md#publication-readiness):
validated identical parent members inherit without new component writes; changes,
removals and reappearances remain explicit. Parentless checkpoints retain full
membership, and independently retained cohorts each receive their own current
projection. Source assertions and audit delivery remain separate from canonical
membership.

This page records the provider-specific profile. The reusable source contract is in
[`spec/divisions-geometry.md`](../../../../spec/divisions-geometry.md).

## Catalogue and service

| Property            | Value                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue           | [District Boundary](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=had_rcd_1634523272907_75218)                                             |
| Specification       | [Functional Area FSDT 1.2](https://static.csdi.gov.hk/csdi-webpage/download/common/f9f4daf727620fe453d5c551e7ce63523df27fc618862b5a35979fe309b79003) |
| Publisher           | Home Affairs Department (`hkgov-had`)                                                                                                                |
| Source artefact     | Native package from each CSDI Archived Dataset slot; format and files are recorded in its manifest                                                   |
| Feature service     | `https://portal.csdi.gov.hk/server/rest/services/common/had_rcd_1634523272907_75218/FeatureServer/0`                                                 |
| Source release data | CSDI publication date 2022-03-14; retained source cohort 2022                                                                                        |
| Source schema       | `1.2`                                                                                                                                                |
| Observed features   | 18 Polygon features                                                                                                                                  |
| Native CRS          | Recorded from the publisher package in each source-archive manifest                                                                                  |

The dataset update check maps the configured `sourceVersion` release metadata to the
`2022.0` source version. The catalogue page's `Creation Date` and `Revision Date` are
publisher timing, not the source version. The identification citation explicitly records
publication on 2022-03-14; see the
[publication-date evidence](../../source-publication-dates.md). The updater mirrors
every native Archived Dataset package and does not use the CSDI GeoJSON file API as
input.

The `hkgov-had` District Boundary native package is read from the CSDI archive. Its File
Geodatabase `DCD` layer is required to contain 18 Polygon district features with
`AREA_ID`, `AREA_CODE`, and `AREA_TYPE`. The mirrored archive's managed key and SHA-256
are retained by release acquisition metadata and carried into canonical geometry
provenance; the importer reads that local archive rather than the converted GeoJSON
delivery. `AREA_ID` and `AREA_CODE` are provider identifiers. They are resolved through
the versioned `curations/identity/` fixture for resource type `division`, authority
`hkgov-had`, cohort `2022`, and the administrative domain. The source release is
`dr-hk-hkgov-had-division-area-district-2022` with cohort key `2022` and source schema
version `1.2`. Its dataset code is `ds-hk-hkgov-had-division-area-district`.

The managed ZIP is linked after resource-release registration through the release's
canonical source-release lineage, so its download remains available independently of the
`divisionArea` materialisation that consumes it.

The compatibility layer exposes these source fields under `hkgov`, with database
capitalisation, in both source columns and canonical geometry `identifiers`:

| Source field         | Compatibility field     |
| -------------------- | ----------------------- |
| `OBJECTID`           | `hkgov.objectId`        |
| `CSDI_ADMIN_AREA_ID` | `hkgov.cdsiAdminAreaId` |
| `AREA_TYPE`          | `hkgov.areaType`        |
| `AREA_ID`            | `hkgov.areaId`          |
| `AREA_CODE`          | `hkgov.areaCode`        |

The normalised `divisionArea` fields are the retained EPSG:4326 polygon, `divisionId`,
`type = mixed`, and `isLand`/`isTerritorial = true`. `NAME_TC`, `NAME_EN`, `DATA_OWNER`,
`BEGIN_LIFESPAN`, `END_LIFESPAN`, `SHAPE_Length`, and `SHAPE_Area` are dropped from
projected fields. The source record includes the publisher's original attribute object
in `properties` and its native geometry in `sourceGeometry`; normalised delivery fields
and the redundant GeoJSON feature wrapper are not persisted. Publisher identifiers also
remain only in `properties`: indexed source columns are reserved for record identity and
release history, not canonical division lookup.

Preflight rejects null or empty geometry, invalid rings, and self-intersections. It does
not repair geometry. Feature counts, geometry-type counts, rejected rows, CRS, bridge
resolution, and source validity fields are recorded as ingestion statistics.

The named `simplified` display derivative is produced separately from the exact source
snapshot using Shapely 2.1's GEOS-backed coverage simplifier at a 10-metre tolerance.
The helper accepts and emits WGS84 GeoJSON, using a temporary local metre plane only to
apply that tolerance. It validates every derived Polygon or MultiPolygon and records the
engine version and any temporary `make_valid` input repair in derivation metadata; it
never changes the publisher geometry retained by the exact source snapshot.

The simplified WGS84 coverage is stored in the content-addressed
`.local/dataops/simplified-coverage` cache. Its key includes the exact geometry,
tolerance and simplification-contract version, so an unchanged re-upload reuses the
derived GeoJSON while a changed input creates a new derivative.

The DCD layer also exposes `NAME_TC`, `NAME_EN`, `DATA_OWNER`, `BEGIN_LIFESPAN`,
`END_LIFESPAN`, `SHAPE_Length`, and `SHAPE_Area`; these are intentionally not projected
because they are redundant, publisher metadata, or calculated values. The source
validity is `BEGIN_LIFESPAN = 20160101` with an open `END_LIFESPAN` when supplied, while
the requested source cohort is `2022`.

The release identity is `dr-hk-hkgov-had-division-area-district-2022`. This is an
administrative `divisionArea` variant, not a line boundary despite the catalogue title.
Overture remains the configured default area variant; clients select this source
explicitly with `include=areas:hkgov-had`. Canonical HAD district areas use
`type = mixed` with both `isLand` and `isTerritorial` true because the administrative
extent includes land and territorial coverage.

The HAD release is independently versioned and is not blocked on a same-cohort canonical
division release. When composing a later Divisions API release set, the registry selects
the latest published HAD geometry cohort at or before that set's cohort. Thus the 2022
district-area snapshot is eligible for a `2025-09-24.0` release set until a newer HAD
snapshot is published. It satisfies that set's `divisionArea` requirement when no
exact-cohort Overture area snapshot is available.

## Publication lineage

HAD district areas form a persistent geometry lineage. They may enrich an immutable
Overture domain release using the configured at-or-before cohort rule. A later HAD
backfill creates a new Overture domain-release revision and catalogue checkpoint rather
than mutating the earlier publication.

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

The FileGDB DCD reader retains native EPSG:2326 geometry separately from the projected
canonical geometry, matching the two representations by publisher `AREA_ID`.

## Artefact destination

Fresh local initialisation supports `--target local --r2 production`: immutable source
and provenance objects are retained in production R2, with registrations kept in local
D1. Follow the
[storage-target workflow](../../d1-bootstrap.md#ingest-locally-with-production-r2) when
selecting or continuing this mode.

## Registry metadata

Dataset processing metadata declares the registered geography identity bridge. Releases
retain the resolved policy at creation. Source geometry uses EPSG:4326.

## Retained record identity

`sourceRecordId` is the publisher `OBJECTID` rendered as a string. Intake requires a
non-empty, unique ID for every district in the release. Canonical area IDs remain
independent. Retained properties use names such as `objectId`, `csdiAdminAreaId`,
`areaCode` and `shapeLength`; provenance retains the original publisher field paths.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

## Publication readiness

HAD current area geometry uses one stable lineage/cohort scope. A new revision preserves
unchanged geometry rows and timestamps, writes changed content and removes absent
members within that scope. The local compiler transmits only final content differences.
Exact canonical Division dependencies resolve from a completed receipt or immutable
history, without restoring historical rows into serving current storage.

Each delivery batch checks its scope token. Complete geometry validation records
preparation; publication grants current readiness. Empty scopes require the same
completion evidence. Retained cohorts and variants remain independently available, with
older revisions replayed from history. See the
[publication-state contract](../../publication-state-plan.md).

Canonical area IDs are stable `ss-` UUIDs. Identifiers use `HAD:OBJECTID`,
`HAD:CSDI_ADMIN_AREA_ID`, `HAD:AREA_ID` and `HAD:AREA_CODE`.

## Local district comparison

The division editor offers all 18 unsimplified HAD district polygons from the retained
2025-Q3 native FGDB package as **HAD 2022 · native district extent**. Projection to
WGS84 uses the source adapter; no coastline clipping or display simplification is
applied. The archive checksum and publisher area identifier accompany each candidate.

The editor also offers C&SD's retained `Density_2024` district extents and the detailed
2021 census boundaries. Archive, statistical and boundary edition dates are distinct:
the retained density file named `2021.0.gml` actually contains `Density_2024`. HAD has
17,453 coordinate positions, the 2024 density layer 17,649, and the detailed 2021 census
layer 590,181 across 18 districts. More vertices indicate detail, not a newer
administrative boundary. At WGS84 `[113.92, 22.33]`, both HAD and the 2024 density layer
include the point in Tuen Mun. This comparison does not establish the current statutory
boundary.

## Coordinate transformation

Native `DCD` coordinates use Hong Kong 1980 Grid (EPSG:2326). Delivery applies the
seven-parameter Hong Kong 1980 to WGS 84 datum operation as well as the inverse grid
projection, through `hkgov/hk1980.ts`. The FGDB embedded WKT identifies the source datum
but supplies no `TOWGS84` operation; generic `fgdb` inverse projection alone is
unsuitable for canonical WGS84 delivery. Native coordinates remain unchanged in
`sourceGeometry`. Native metre-based bounding boxes are omitted from projected GeoJSON.
Regression controls use independently evaluated PROJ EPSG transformations.

## Processing policy ownership

Native ingestion validates archive identity and counts and retains publisher properties
and geometry. Canonical area geometry selection is captured by the DivisionArea snapshot
recipe rather than the dataset ingestion policy.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Archive ownership

Original publisher inputs use `releaseSourceArchive` assets owned by their source
release. Resource-specific source exports use Parquet `resourceSourceArchive` assets
owned by their resource release. Each archive has a downloadable manifest recording its
original filename and packaging.

## Source record identity declaration

The dataset fixture declares `OBJECTID` as the sole source identity component, within a
dataset release. The composer preserves its string value, including leading zeroes, and
adds no publisher prefix. Missing or duplicate keys block intake.
