# Home Affairs Department District Boundary area ingestion

This page records the provider-specific profile. The reusable source contract is in
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md).

## Catalogue and service

| Property            | Value                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue           | [District Boundary](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=had_rcd_1634523272907_75218)                                             |
| Specification       | [Functional Area FSDT 1.2](https://static.csdi.gov.hk/csdi-webpage/download/common/f9f4daf727620fe453d5c551e7ce63523df27fc618862b5a35979fe309b79003) |
| Publisher           | Home Affairs Department (`hkgov-had`)                                                                                                                |
| Source artefact     | Native package from each CSDI Archived Dataset slot; format and files are recorded in its manifest                                                   |
| Feature service     | `https://portal.csdi.gov.hk/server/rest/services/common/had_rcd_1634523272907_75218/FeatureServer/0`                                                 |
| Source release data | Catalogue published July 2025; layer last revised in 2022                                                                                            |
| Source schema       | `1.2`                                                                                                                                                |
| Observed features   | 18 Polygon features                                                                                                                                  |
| Native CRS          | Recorded from the publisher package in each source-archive manifest                                                                                  |

The dataset update check maps the configured `sourceVersion` release metadata to the
`2022.0` source version. The catalogue page's `Creation Date` and `Revision Date` are
publisher timing, not the source version. The updater mirrors every native Archived
Dataset package and does not use the CSDI GeoJSON file API as input.

The `hkgov-had` District Boundary native package is read from the CSDI archive. Its File
Geodatabase `DCD` layer is required to contain 18 Polygon district features with
`AREA_ID`, `AREA_CODE`, and `AREA_TYPE`. The mirrored archive's managed key and SHA-256
are retained in every source assertion's `sources` provenance and carried into canonical
geometry provenance; the importer reads that local archive rather than the converted
GeoJSON delivery. `AREA_ID` and `AREA_CODE` are provider identifiers. They are resolved
through the versioned `identifierBridges` fixture/table for resource type `division`,
authority `hkgov-had`, cohort `2022`, and the administrative domain. The source release
is `dr-hk-hkgov-had-division-area-district-2022` with cohort key `2022` and source
schema version `1.2`. Its dataset code is `ds-hk-hkgov-had-division-area-district`.

The managed ZIP is linked after resource-release registration through the release's
canonical source-release lineage, so its download remains available independently of the
`divisionArea` materialisation that consumes it.

The compatibility layer exposes these source fields under `hkgov`, with database
capitalisation, in both source columns and canonical geometry `sourceKeys`:

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
projected fields. The source assertion retains the publisher's original attribute object
in `rawProperties` and its native geometry in `sourceGeometry`; normalised delivery
fields and the redundant GeoJSON feature wrapper are not persisted.

Preflight rejects null or empty geometry, invalid rings, and self-intersections. It does
not repair geometry. Feature counts, geometry-type counts, rejected rows, CRS, bridge
resolution, and source validity fields are recorded as ingestion statistics.

The named `simplified` display derivative is produced separately from the exact source
snapshot using Shapely 2.1's GEOS-backed coverage simplifier at a 10-metre tolerance.
The helper accepts and emits WGS84 GeoJSON, using a temporary local metre plane only to
apply that tolerance. It validates every derived Polygon or MultiPolygon and records the
engine version and any temporary `make_valid` input repair in derivation metadata; it
never changes the publisher geometry retained by the exact source snapshot.

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
