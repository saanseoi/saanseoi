# LandsD Place Name database

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

## Divisions projection

The projection retains registered normalisation declarations and counts in the
[processing audit](../../processing-provenance.md). Translation fixtures and individual
translation context are retained separately from bulk rules, with available parent
division names for search. D1 registers the R2 manifest and attempt status.

The `select-landsd-settlements` Bulk Rule records the native input count, selected
Settlement count and excluded count, with separate Hydrographic, Topographic, missing
class and unexpected class counters. These measure selection eligibility; downstream
materialisation is a separate operation. All native publisher records remain retained.

For published local releases, `bun scripts/backfill-landsd-selection-audit.ts --local`
previews counts reconstructed from the release's retained native source records. Add
`--apply` to append the rule to the registered audit. This explicit maintenance
operation preserves existing audit entries and objects, retains a rollback reference
under `.local/audit-backfills/landsd-selection/`, verifies the complete audit and search
index, and updates the registration only if its previous reference still matches.
Repeating it checks the existing counts and skips the write. It does not write to remote
storage.

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

The parent feature attributes are retained only in `properties`, alongside native
geometry and the source identity, provenance and release history. `placeNames` retains
the separate `PLACE_NAME` relationship, which is absent from the parent properties.
Canonical names and classifications belong to the divisions projection.

`hkgov-landsd:place-name` reads the locally mirrored FileGDB ZIP directly. It verifies
the updater-supplied archive key and SHA-256, joins `GEO_PLACE_NAME` to `PLACE_NAME`,
and writes the complete 2,706-record source ledger through the SQLite/D1 SQL pipeline.
Each source record includes its native `PLACE_NAME` relationship as paired English and
Traditional Chinese labels with the publisher's `Official` or `Alias` status; it does
not create locale-normalised source child rows. There is no GeoJSON or Parquet
preparation/upload boundary. The import retains a completed bulk processing audit
covering the verified archive hash, source tables and imported row counts before the
release can publish.

For the Divisions projection, the official English and Traditional Chinese labels form
the canonical names. A missing Simplified Chinese name is created only by the reviewable
source-release fixture process described in the Divisions family document; it is marked
unverified until reviewed.

The divisions projection is a LandsD-specific SQL concern: it selects only
`PLACE_CLASS=Settlement` rows while retaining the full gazetteer as durable source
evidence. This preserves the native archive provenance for both the projected division
records and future Hydrographic/Topographic places work.

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

Dataset processing metadata declares the registered settlement selection and geography
identity bridge. Releases retain the resolved policy at creation. Dataset source CRS
metadata identifies the native EPSG:2326 geometry.
