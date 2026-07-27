# LandsD Place Name database

The Lands Department Place Name database is a point gazetteer derived from the official
Hong Kong place-name record. The CSDI layer contains three broad classes: `Settlement`,
`Hydrographic`, and `Topographic`.

The source is registered as
[`ds-hk-hkgov-landsd-division`](../../../../fixtures/meta/datasets/hkgov-landsd-hk-division.json).
The updater mirrors every native CSDI Archived Dataset package and its manifest; it does
not use the `GEO_PLACE_NAME` GeoJSON file API. Archive slots, rather than inferred
catalogue dates, identify upstream source releases.

## Divisions projection

The divisions API uses the source as the primary collection in the `hkgov-landsd`
domain. Only `PLACE_CLASS=Settlement` is eligible for that projection. Each eligible
source row is a point division identified by `GEO_NAME_ID`, with `PLACE_TYPE` retained
as the source classification and `DISTRICT` retained as provenance.

Hydrographic and Topographic rows are deliberately excluded from divisions. They are
named geographic features and belong in a future government place-name projection under
the Places API family, rather than in the administrative division hierarchy.

## Upstream

- [CSDI dataset](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752)
- [CSDI GeoSpatial Services](https://portal.csdi.gov.hk/csdi-webpage/doc/GeoSpatialServices/)

## Native archive intake

`hkgov-landsd:place-name` reads the locally mirrored FileGDB ZIP directly. It verifies
the updater-supplied archive key and SHA-256, joins `GEO_PLACE_NAME` to `PLACE_NAME`,
and writes the complete 2,706-record source ledger through the SQLite/D1 SQL pipeline.
There is no GeoJSON or Parquet preparation/upload boundary.

The divisions projection is a LandsD-specific SQL concern: it selects only
`PLACE_CLASS=Settlement` rows while retaining the full gazetteer as durable source
evidence. This preserves the native archive provenance for both the projected division
records and future Hydrographic/Topographic places work.
