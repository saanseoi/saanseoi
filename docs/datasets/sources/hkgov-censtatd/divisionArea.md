# Census and Statistics Department District Council district areas

## Source releases

The Census and Statistics Department (C&SD) publishes 18 District Council district
polygons alongside census/by-census subdivided-unit statistics. These are statistical
geographies: each geometry release is retained for its census cohort and must not be
represented as an evergreen administrative boundary.

| Cohort | CSDI dataset                       | Native layer  |
| ------ | ---------------------------------- | ------------- |
| 2016   | `censtatd_rcd_1635932488538_10765` | `DC_16BC_SDU` |
| 2021   | `censtatd_rcd_1635933617052_68946` | `DC_21C_SDU`  |

The updater treats the C&SD dataset as a census-year release: the 2021 cohort is
`2021.0`, with `.1`, `.2`, and so on reserved for later corrections to that cohort. The
fixture maps `versionPolicy.releaseField` to the configured release metadata's
`sourceVersion`; the CSDI catalogue `modified` date is a publisher revision signal, not
the census-year release version. The updater mirrors every Archived Dataset slot's
native package and manifest; it does not use WFS or CSDI-converted GeoJSON as input.

The logical dataset is marked five-yearly in SaanSeoi, while CSDI's per-record
`updateFrequency` is recorded as one-off. Each release stores its own CSDI catalogue URL
and is checked independently; the fixture's monthly update policy limits routine network
checks without disabling correction detection.

The archive manifest records the exact native format for each slot, and the source CRS
is stored once in the dataset metadata record. Source processing retains the complete
publisher feature and projects only its accepted native geometry into the canonical
EPSG:4326 column. It does not simplify, clip or otherwise alter the exact-source
geometry. The uploader calculates the canonical WGS84 bbox from that geometry rather
than accepting an upstream bbox value, so source and canonical rows carry the same
geometry-derived extent.

The fixture records the observed CSDI archive slots and publisher-object hashes that are
byte-identical within the 2016 and 2021 cohorts. The updater suppresses only those exact
no-op objects; it continues to inspect the archive catalogue, so a changed slot or
object key remains eligible for review.

## Source contract

Each release contains exactly 18 Polygon/MultiPolygon features. Required properties are:

- `dc`: C&SD numeric district code;
- `dc_class`: the stable A–T district class, omitting I and O;
- `dc_eng` and `dc_chi`: English and Traditional Chinese district names.

All publisher properties, including the subdivided-unit measures, remain in
`rawProperties`; this geometry ingest does not yet publish them through the proposed
Division Statistics family. English and Traditional Chinese district names are
normalised to the C&SD source i18n table. `dc_class` is bridged through a reviewed
`hkgov-censtatd` identifier bridge for each census cohort; canonical `sourceKeys` expose
the provider's `class` and numeric `code`.

The exact source variants are:

```text
dataset  ds-hk-hkgov-censtatd-division-area-district
variants hkgov-censtatd:2016
         hkgov-censtatd:2021
releases dr-hk-hkgov-censtatd-division-area-district-2016
         dr-hk-hkgov-censtatd-division-area-district-2021
```

## Land-clipped display transformation

Both detailed source geometries are land-clipped already. For Hong Kong-wide preview
maps, Saanseoi exposes a named geometry transformation for each census cohort, without
clipping, unioning or otherwise changing its coastline:

```text
dataset   ds-hk-hkgov-censtatd-division-area-district
transform simplified
applies   hkgov-censtatd:2016
          hkgov-censtatd:2021
```

The derivation runs a topology-preserving simplification across all 18 canonical
EPSG:4326 polygons at a 10-metre tolerance in a local Hong Kong metre plane. Processing
all districts together keeps shared boundaries consistent. The exact source row retains
the untouched C&SD geometry and no derivation metadata; its derivative records the input
dataset/release, method, tolerance and `preservesLandClip: true`. The derived geometry
is materialised internally for fast map reads in a derivative row keyed to the exact
source record and its version hash; it remains a transform of the same source release
rather than a separate dataset, source record or API-composition member.

Use `include=areas:hkgov-censtatd:2016&transform=simplified` or
`include=areas:hkgov-censtatd:2021&transform=simplified` for low-detail display maps;
omit the transformation for source precision, census-cohort accuracy and geometry
auditability. The transformation belongs to the C&SD dataset and does not introduce a
new publisher or dataset.

The Atlas source-release Stats choropleth uses only the 2021 simplified variant
(`hkgov-censtatd:2021:simplified`) from this dataset. It intentionally does not fall
back to Home Affairs Department boundaries or the unsimplified C&SD source geometry.

## Ingestion

The updater passes the locally prepared native CSDI ZIP to the district importer. It
requires the cohort-specific `DC_16BC_SDU.gml` or `DC_21C_SDU.gml` member, verifies the
ZIP SHA-256 against its prepared manifest, and keeps the managed archive key and hash in
the source provenance. Converted CSDI GeoJSON and a separately downloaded GML are not
runtime inputs. Use `saanseoi update`, or invoke the importer with the prepared archive:

```bash
bun run dataops -- hkgov-censtatd:district-area ./data/.../source.zip \
  --target preview --source-version 2021 --release-notes-url URL \
  --source-archive-key by-source/.../source.zip --source-archive-sha256 SHA256
```

Each C&SD upload materialises its `simplified` display transform from the same verified
source artefact, then publishes the exact and display snapshots together under the one
source release. The transform has no separate upload or release-notes URL; the source
release records the CSDI dataset URL instead.

Both C&SD census cohorts are required Overture division-release inputs. The selected
source snapshots are carried forward at or before the Overture cohort, so their stable
source schema is always included in the release's API-field provenance. They are
independently selectable source variants with separate snapshot lineages; publishing the
2021 cohort never supersedes the 2016 release or snapshot. Release churn is measured
only against the declared parent snapshot, so each initial census cohort has an empty
baseline: its 18 district areas are additions, not removals from the other cohort.
