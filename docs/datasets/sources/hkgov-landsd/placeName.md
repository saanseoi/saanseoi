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

## Update/upload integration handoff

The updater mirrors the complete native `GEO_PLACE_NAME` source package, but the
divisions release must publish only `PLACE_CLASS=Settlement` rows. Do not send the raw
archive directly to the generic upload pipeline: Hydrographic and Topographic rows
belong to a future Places projection and must not enter the divisions collection.

The next integration should:

1. add a LandsD-specific preparation step that filters `PLACE_CLASS=Settlement` and
   preserves `GEO_NAME_ID`, `PLACE_TYPE`, `DISTRICT`, and all original properties;
2. emit the filtered GeoJSON or Parquet file with the resolved source version, such as
   `2026-06-10.0`;
3. register an upload strategy for `source=hkgov-landsd`, `theme=divisions`,
   `type=division`, and point geometry; and
4. add tests proving Hydrographic/Topographic rows are excluded and Settlement rows
   retain deterministic identifiers and coordinates.

The intended inline command is equivalent to:

```bash
saanseoi upload data/hkgov/csdi/hkgov-landsd-division/2026-06-10.0.geojson \
  --region hk --source hkgov-landsd --source-version 2026-06-10.0 \
  --theme divisions --type division
```

The update command should run that upload only after the download spinner resolves to a
successful checkmark; the embedded invocation should suppress the standalone uploader
banner and outro while retaining its validation and publication output inline.
