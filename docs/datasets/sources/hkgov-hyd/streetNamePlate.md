# Highways Department street datasets

The Highways Department Street Name Plate dataset provides point locations of street
name plates maintained by the department. The source layer is `SNP`; its important
attributes are `SNP_ID`, `LVL`, and `ROAD_NAME`.

The source is registered as
[`ds-hk-hkgov-hyd-street`](../../../../fixtures/meta/datasets/hkgov-hyd-hk-street.json).
The updater reads every CSDI Archived Dataset slot and mirrors the native publisher FGDB
package. It does not use CSDI's converted GeoJSON delivery. Every publisher artefact is
kept as an immutable R2 ZIP with a public Atlas API download and a provenance manifest.

The same HighwayD Streets domain also contains the CSDI `Sensitive Street` and
`Strategic Street` classifications. The Transport Department `Pedestrian Streets`
catalogue is grouped into this requested government Streets domain, while its TD
attribution and source provenance remain explicit. Their native source layers remain
distinct in each archive manifest.

This belongs to the Streets API family as official street-name evidence. It is not a
street-centerline or street-geometry dataset: the point is the sign location, and
several points may carry the same `ROAD_NAME`. The point geometry should therefore be
retained as source provenance when street ingestion is implemented, rather than exposed
as a false centerline geometry.

## Archive release notes

These observations are CSDI archive slots, not inferred quarter-end dates. SaanSeoi will
create a back-dated dataset release when native semantic or schema fingerprints show a
changed source.

- `2023-Q3` — initial inspected Street Name Plates baseline: 31,382 FGDB `SNP` point
  features with `SNP_ID` and `ROAD_NAME`.
- `2025-Q1` — schema and semantic change: 31,646 `SNP` point features. The source FGDB
  adds `LVL`; `SNP_ID` and `ROAD_NAME` remain. This is the first historic Street Name
  Plates release that requires a schema-change note.

## Upstream

- [CSDI dataset](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=hyd_rcd_1632211119955_31211)
- [CSDI Sensitive Street](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=hyd_rcd_1632361314743_27775)
- [CSDI Strategic Street](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=hyd_rcd_1632361405484_23178)
- [CSDI Pedestrian Streets](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=td_rcd_1697081765097_37742)
- [CSDI GeoSpatial Services](https://portal.csdi.gov.hk/csdi-webpage/doc/GeoSpatialServices/)
