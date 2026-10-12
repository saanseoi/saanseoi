# LandsD Place Name database

Retained source assertions use
[distinct validity periods for recurring content](../../families/source-evidence.md#recurring-source-validity-periods).
An unchanged open occurrence continues; returning content starts a new occurrence.

Retained source evidence uses the
[managed manifest contract](../../families/source-evidence.md#managed-source-manifests).
Manifest JSON is a downloadable R2 sidecar; its META asset row links to the described
source object through `sourceAssetId`.

Canonical source references follow the
[source evidence contract](../../families/source-evidence.md). Original publisher
properties remain in retained source assertions. The release identifies the retained
archive; table-wide acquisition coordinates belong in the processing receipt. These
source tables do not need a `sourceLocator` column.

Source validity uses the owning release's version component in `validFromRelease` and
`validToRelease`. Dataset prefixes and resource suffixes are omitted;
`resourceReleaseId` retains the release association.

Native source replay preserves open matching versions without rewriting their release
metadata. Complete replacement membership closes omissions and superseded hashes; large
payload append statements skip complete unchanged assertions.

API inventory counts, locale coverage and identity/attribute churn use the shared
[division API statistics calculation and backfill](../../families/divisions.md#api-release-statistics).
The first published inventory is a baseline with every record counted as added.

The Lands Department Place Name database is a point gazetteer derived from the official
Hong Kong place-name record. The CSDI layer contains three broad classes: `Settlement`,
`Hydrographic`, and `Topographic`.

The source is registered as
[`ds-hk-hkgov-landsd-division`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-division.json).
The updater mirrors every native CSDI Archived Dataset package and its manifest; it does
not use the `GEO_PLACE_NAME` GeoJSON file API. Archive slots, rather than inferred
catalogue dates, identify upstream source releases.

Source-release statistics for LandsD Place Names cover all source records, including
Settlement, Hydrographic and Topographic. Record counts and class distribution come from
the source-validity window; changes compare the preceding published source release.
Locale completeness measures publisher-provided official names across that full
inventory. Canonical settlement statistics belong to the API release set.

## Divisions projection

The projection retains registered normalisation declarations and counts in the
[processing audit](../../processing-provenance.md). Translation fixtures and individual
translation context are retained separately from bulk rules, with available parent
division names for search. D1 registers the R2 manifest and attempt status.

The `select-landsd-settlements` Bulk Rule belongs to canonical assembly. It records all
native inputs, selected settlements and exclusions by publisher class. Source ingestion
stores every publisher record; its audit reports the complete import.

The divisions API uses the source as the primary collection in the `hkgov-landsd`
domain. Only `PLACE_CLASS=Settlement` is eligible for that projection. Each eligible
source row is a point division identified by `GEO_NAME_ID`, with `PLACE_TYPE` as the
source classification and `DISTRICT` as provenance.

Hydrographic and Topographic rows are deliberately excluded from divisions. They are
named geographic features and belong in a future government place-name projection under
the Places API family, rather than in the administrative division hierarchy.

## Upstream

- [CSDI dataset](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752)
- [CSDI GeoSpatial Services](https://portal.csdi.gov.hk/csdi-webpage/doc/GeoSpatialServices/)

## Native archive intake

Source-ledger recovery verifies the registered `sourceArchive` asset's SHA-256 before
restoring any records. It preserves every feature's publisher attributes and geometry,
including Hydrographic and Topographic features. A retained GeoJSON archive supplies
only its recorded properties and geometry; an absent relationship table contributes no
`placeNames` entries. Recovery retains the archive hash as provenance and does not
recalculate canonical divisions or replace the registered source asset.

The source `properties` JSON object stores parent attributes and joined `PLACE_NAME`
rows in `properties.placeNames`. Each entry contains `nameEn` (`NAME_EN`), `nameZhHant`
(`NAME_TC`) and `nameStatus` (`NAME_STATUS`: `Official` or `Alias`). Missing labels stay
`null`; paired labels and publisher row order are preserved. SOURCE does not group names
by locale. Locale-keyed names are derived for canonical assembly and completeness
metrics. All three place classes use this shape. Native geometry, source identity,
provenance and release history use the shared source envelope. The complete properties
object and native geometry determine the source version hash. Canonical names and
classifications belong to the divisions projection.

`hkgov-landsd:place-name` reads the locally mirrored FileGDB ZIP directly. It verifies
the updater-supplied archive key and SHA-256, joins `GEO_PLACE_NAME` to `PLACE_NAME`,
and writes the complete 2,706-record source ledger through the SQLite/D1 SQL pipeline.
Each source record stores joined `PLACE_NAME` rows in `properties.placeNames`; it does
not create source child rows. There is no GeoJSON or Parquet preparation/upload
boundary. The import retains a completed bulk processing audit covering the verified
archive hash, source tables and imported row counts before the release can publish.

For the Divisions projection, the official English and Traditional Chinese labels form
the canonical names. A missing Simplified Chinese name is created only by the reviewable
source-release fixture process described in the Divisions family document; it is marked
unverified until reviewed.

The same intake delivers the 1,613 `PLACE_CLASS=Settlement` rows through the canonical
division SQL pipeline before publishing the release. It passes the decoded FileGDB rows
directly, with official relationship labels first and aliases retained as alternative
names. Canonical geometry uses the decoded WGS84 point; native properties and EPSG:2326
geometry remain unchanged in the complete source ledger. Each division resolves to the
exact retained native source version.

Delivery writes current rows, immutable history, localised names and source resolutions,
then verifies row counts before completing the publication receipt. Source-ledger counts
or snapshot metadata alone cannot make the division snapshot ready. Reconciliation
reports the codes of snapshots missing a complete receipt.

The initialiser checks that receipt before skipping a published LandsD release. A
published release without complete canonical delivery remains eligible for recovery from
its verified native archive.

## Publisher source boundary

Native properties and publisher names retain their literal values, including whitespace
and empty strings. Division resolutions reference the native publisher identity and the
exact retained source version in the interpreting snapshot's `sourceResolutions`.

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`properties`.

## Publisher record envelope

Follow the [source record contract](../../source-records.md). The response contains
publisher attributes and source identity; internal resource types, variants and
acquisition locators are excluded. Optional geometry preserves native coordinates and
CRS, independently of canonical geometry processing.

Native source geometry uses the FileGDB point coordinates in EPSG:2326. The canonical
settlement projection uses its separately decoded WGS84 point. Retained source rows
containing projected longitude/latitude require replay from the original archive.

## Artefact destination

Fresh local initialisation supports `--target local --r2 production`: immutable source
and provenance objects are retained in production R2, with registrations kept in local
D1. Follow the
[storage-target workflow](../../d1-bootstrap.md#ingest-locally-with-production-r2) when
selecting or continuing this mode.

## Registry metadata

Dataset processing metadata declares source ingestion. Snapshot processing metadata
declares settlement selection and the geography identity bridge. Releases capture the
resolved policy at creation. Dataset source CRS metadata identifies the native EPSG:2326
geometry.

## Island inventory

The retained `2026-06-10.0` source includes 156 Topographic `Island` points and four
`Islands` group points, each with official English and Traditional Chinese names. These
are available outside the settlement projection as candidate naming evidence for
SaanSeoi Islands. The island projection combines this evidence with named island and
islet features from the Hong Kong basemap, then applies the curated policy in the
identity, exclusion and geometry files under
`fixtures/meta/curations/saanseoi-division/`. Gazetteer membership belongs in the
resulting source evidence rather than in a separate `hkgov-landsd` island domain. See
the [island inventory review](../../internal/island-inventory-review.md) for coverage,
geometry inputs and the release gate.

Constructed canonical divisions use stable `ss-` UUIDs and expose
`identifiers["hkgov-landsd"].geoNameId`; native source record IDs remain unchanged.

## SaanSeoi inventory membership

The curated monthly SaanSeoi edition includes the latest retained LandsD settlement
release preceding the edition month. The native FileGDB `GEO_NAME_ID` joins geometry
with official and alias names. Canonical LandsD division IDs are deterministic from that
publisher key, and source references use `LANDSD:PLACE_NAME:<GEO_NAME_ID>`. Row indexes
are diagnostic positions only.

A curated `identifiers.hkgovLandsd.geoNameId`, or unique matching English and
Traditional Chinese primary names or aliases within 5,000 metres, establishes positive
settlement membership. The matching rule requires a one-to-one match; ambiguous
candidates remain unresolved. SaanSeoi records retain the native key in `identifiers`
and the exact ingredient release and membership contribution in `sources`. No match
means unresolved membership, not a claim that LandsD excludes the place. Native LandsD
remains a separate settlement-name inventory/domain; using it as an ingredient does not
merge its rows into the geographic inventory.

The SaanSeoi dataops assembly reads the full native Place Names ledger at its pinned
release, including terrain features such as islands. The settlement-only canonical
projection remains independent. Naming an island from LandsD evidence and choosing its
Protomaps geometry are curated assembly decisions; neither modifies the native source
records.

Explicit LandsD exclusions in
`fixtures/meta/curations/saanseoi-division/division-exclusions.json` use the native
`LANDSD:PLACE_NAME:<GEO_NAME_ID>` identity and a reason code, such as `DEMOLISHED` or
`INSUFFICIENT_EVIDENCE`. These exclusions take precedence over automatic and explicit
membership matching during SaanSeoi assembly; the native LandsD records are retained.

The shared `GEO_PLACE_NAME` layer is retained once in the META native import receipt's
`tables[].locatorDefaults`. Each source record carries its native ID and attributes; no
repeated layer locator is required. A positive cross-dataset match supplies the LandsD
external identifier. Contribution attribution is reserved for data actually used in the
resulting record.

## Coordinate transformation

The native Place Name adapter projects EPSG:2326 easting/northing through the shared
`hkgov/hk1980.ts` seven-parameter Hong Kong 1980 to WGS 84 operation. Embedded FGDB WKT
alone does not supply the datum shift. `sourceGeometry` retains publisher coordinates;
projected geometry uses WGS84 and excludes native metre-based bounding boxes.
Independent PROJ controls verify both longitude and latitude.

## Processing policy ownership

Native ingestion validates archive identity and source references and retains place-name
properties and geometry. Settlement selection, identity matching and canonical Division
assembly belong to the selected snapshot recipe.

The [processing policy contract](../../pipeline.md#define-audit-processing-rules)
separates captured ingestion and snapshot assembly definitions.

## Field lineage

The native Division lineage fixture traces GEO_PLACE_NAME and PLACE_NAME by GEO_NAME_ID,
settlement selection, official-before-alias name order, HK80 projection and the fixed
settlement classification. It also records the source-release translation and canonical
response stages.

## Canonical source attribution

Canonical Division attribution uses `hkgov-landsd`, `ds-hk-hkgov-landsd-division` and
the retained `LANDSD:PLACE_NAME:<GEO_NAME_ID>` publisher record identity. Canonical
entity-resolution markers are excluded from public attribution.
