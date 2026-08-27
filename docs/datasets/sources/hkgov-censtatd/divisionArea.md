# Census and Statistics Department District Council district areas

## Source releases

The Census and Statistics Department (C&SD) publishes 18 District Council district
polygons alongside census, by-census and annual statistics. These are statistical
geographies: each geometry release is retained for its reference-year cohort and must
not be represented as an evergreen administrative boundary.

| Cohort | Upstream publication series                                             | CSDI dataset                       | Native layer  | SaanSeoi source dataset                                                  |
| ------ | ----------------------------------------------------------------------- | ---------------------------------- | ------------- | ------------------------------------------------------------------------ |
| 2016   | 2016 By-census subdivided units by District Council district            | `censtatd_rcd_1635932488538_10765` | `DC_16BC_SDU` | `ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district`      |
| 2021   | 2021 Population Census subdivided units by District Council district    | `censtatd_rcd_1635933617052_68946` | `DC_21C_SDU`  | `ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district`      |
| 2024   | Annual Population and Household Statistics by District Council district | `censtatd_rcd_1635934545173_69201` | `DC_GHS`      | `ds-hk-hkgov-censtatd-division-statistic-population-households-district` |

The 2016 and 2021 cohorts belong to the census/by-census subdivided-units series. The
2024 cohort belongs to the distinct annual population-and-household series. They share
the C&SD publisher and canonical district identities, but not an upstream dataset. Each
source fixture maps `versionPolicy.releaseField` to the configured release metadata's
`sourceVersion`; the CSDI catalogue `modified` date is a publisher revision signal, not
the reference-year release version. The updater mirrors every Archived Dataset slot's
native package and manifest; it does not use WFS or CSDI-converted GeoJSON as input.

The archive manifest records the exact native format for each slot, and the source CRS
is stored once in the dataset metadata record. Source processing retains the complete
publisher feature and projects only its accepted native geometry into the canonical
EPSG:4326 column. It does not simplify, clip or otherwise alter the exact-source
geometry. The uploader calculates the canonical WGS84 bbox from that geometry rather
than accepting an upstream bbox value, so source and canonical rows carry the same
geometry-derived extent.

To keep exact C&SD geometry available from the inline source-record API within D1's row
limit, the source shard stores the publisher geometry as a Brotli-compressed BLOB. The
API decompresses it before responding, so consumers receive the unchanged GeoJSON
geometry and do not need to negotiate a separate download or decompression format. The
exact WGS84 variant is likewise compressed in the current and history shards, then
decompressed by the divisions API. The named `simplified` derivative remains ordinary
JSON for map reads.

Each fixture records the observed CSDI archive slots and publisher-object hashes that
are byte-identical within its own cohorts. The updater suppresses only those exact no-op
objects; it continues to inspect the archive catalogue, so a changed slot or object key
remains eligible for review.

The 2016, 2021 and 2024 cohorts use separate source releases and cohort-specific native
ZIP members. Each mirrored ZIP is shared only by that cohort's exact and simplified
materialisations, and is linked to those processed resource releases through its own
canonical source-release lineage.

During a target bootstrap, the release report is evaluated separately for each source
fixture and cohort. An absent cohort is rebuilt from its native CSDI archive group,
while a cohort already reported by the target remains current even if the operator's
local source checks differ.

## Source contract

Each release contains exactly 18 Polygon/MultiPolygon features. Required properties are:

- `dc`: C&SD numeric district code;
- `dc_class`: the stable A–T district class, omitting I and O;
- `dc_eng` and `dc_chi`: English and Traditional Chinese district names.

All publisher properties, including the subdivided-unit measures, remain in
`rawProperties`; this geometry ingest does not yet publish them through the proposed
Division Statistics family. The source assertion also projects the publisher-native
`dc_eng` and `dc_chi` values to `districtEn` and `districtZhHant`; it does not create
locale-normalised source child rows. `dc_class` is bridged through a reviewed
`hkgov-censtatd` identifier bridge for each reference-year cohort; canonical
`sourceKeys` expose the provider's `class` and numeric `code`.

The source materialises into two C&SD companion families. The provider's census
subdivided-unit district geometry is land-clipped; annual district geometry and the
Permanent Living Quarters Area/type polygons are not. Every source-authorised cohort is
retained as an independent snapshot, even where its exact geometry is byte-identical to
an earlier cohort.

```text
dataset  ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district
variant  hkgov-censtatd-landclipped  (2016 and 2021 census/by-census districts)
releases dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016
         dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2021

dataset  ds-hk-hkgov-censtatd-division-statistic-population-households-district
variant  hkgov-censtatd              (annual districts and Area/type polygons)
release  dr-hk-hkgov-censtatd-division-statistic-population-households-district-2024
```

The publisher's 2021 `CENSTATD:T` feature has a self-intersecting ring. The C&SD adapter
retains that exact source geometry without a topology repair; full topology validation
is therefore not enabled for this provider profile. Structural validation, feature-count
checks and source-archive SHA-256 verification still apply. The same policy applies to
direct archive intake and `saanseoi update`.

## Display transformation

Each source geometry is retained as published. For Hong Kong-wide preview maps, Saanseoi
exposes a named geometry transformation for each companion snapshot, without clipping,
unioning or otherwise changing its topology:

```text
datasets  ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district
          ds-hk-hkgov-censtatd-division-statistic-population-households-district
transform simplified
applies   hkgov-censtatd-landclipped
          hkgov-censtatd
```

The derivation uses Shapely 2.1's GEOS-backed coverage simplifier at a 10-metre
tolerance. Its interface consumes and emits WGS84 GeoJSON; a temporary local metre plane
is used only to apply that tolerance. It simplifies shared coverage edges as one
operation, validates every resulting Polygon or MultiPolygon, and records the engine
version in derivation metadata. The exact source row retains the untouched C&SD geometry
and no derivation metadata; its derivative records the input dataset/release, method,
tolerance and `preservesLandClip: true`. The known invalid `CENSTATD:T` input is
repaired only in the helper's temporary display-processing copy with GEOS `make_valid`;
that derivative records `inputValidationRepair: make-valid`. The derived geometry is
materialised internally for fast map reads in a derivative row keyed to the exact source
record and its version hash; it remains a transform of the same source release rather
than a separate dataset, source record or API-composition member. The 2016 and 2021
derivatives declare `preservesLandClip: true`; the 2024 derivative declares
`preservesPublisherGeometry: true`.

Use `include=areas:hkgov-censtatd-landclipped:simplified` or
`include=areas:hkgov-censtatd:simplified` for low-detail display maps; omit the
transformation for source precision, reference-year accuracy and geometry auditability.
When querying the Divisions API, append `@<cohort>` to retain the selected release set's
canonical identities while choosing a particular C&SD geometry companion, for example
`include=areas:hkgov-censtatd-landclipped@2021&transform=simplified`. The cohort applies
only to the included area geometry; it does not change the top-level division snapshot.
The transformation belongs to its exact C&SD source dataset and does not introduce a new
publisher or snapshot family. For C&SD district statistics, unqualified `include=areas`
selects the exact reviewed C&SD companion automatically: 2024 district statistics select
the `hkgov-censtatd` snapshot for cohort `2024`, not the Geographic domain's Overture
default. The response permalink records the resolved variant. The choice is declared by
each Statistics dataset's `areaCompanionByReferencePeriod` fixture as a domain, variant
and cohort, and is materialised into the canonical statistic record during ingestion,
rather than inferred from its source-release string at read time.

The Atlas source-release Stats choropleth uses the 2021 land-clipped simplified variant
(`hkgov-censtatd-landclipped:simplified`) from this dataset. It intentionally does not
fall back to Home Affairs Department boundaries or the unsimplified C&SD source
geometry.

## Statistical area companions

The C&SD Permanent Living Quarters release supplies three regional polygons (`HK`,
`KLN`, and `NT`). They join the cohort-matched `hkgov-censtatd` companion rather than a
second division collection: each polygon is linked to the corresponding canonical
Overture division ID, including the deterministic synthetic Hong Kong, Kowloon, and New
Territories IDs where Overture has no row. Request them with
`include=areas:hkgov-censtatd`.

The companion snapshot preserves all its contributing C&SD source releases as
provenance. Required publication membership does not make geometry part of the default
response; clients still select it explicitly with `include`.

Each C&SD source release is retained as a `snapshotSource`. Before adding a second
source for the same companion cohort, ingestion compares its complete materialisation:
canonical record IDs, division references, land/territorial classification and exact
geometry hashes. When every incoming row is already present with the same materialised
geometry (the companion can also contain non-overlapping rows), the source attaches to
the existing snapshot with `selectionMode: verified_identical_geometry`; its archive and
raw source assertion are still retained, but the canonical geometry rows are not written
again. A source that adds non-overlapping rows is marked `contributed_geometry`, and
inherited rows are marked `carried_forward_companion`. This records where geometry was
deliberately not republished because a second publisher release supplied the same
geometry. A differing overlapping geometry requires a different companion variant; the
census/by-census land-clipped geometry is the current example.

During ingestion, the three references are checked against the closest published
canonical Overture division snapshot: the latest cohort at or before the C&SD cohort is
used first; only an absent earlier cohort permits the earliest later Overture cohort.
The selection is retained as a snapshot lookup dependency. Permanent Living Quarters
must not create a second C&SD division snapshot merely to satisfy its geometry
validation.

The 2021 Housing Market Areas and Building Groups release is different. Its 173 Housing
Market Area polygons have their own deterministic canonical division IDs and therefore
form the separate `hkgov-censtatd-hma` domain. Its native area variant is
`hkgov-censtatd-hma`; Building Groups remain source-only because their upstream geometry
is point-like. A Housing Market Area is non-hierarchical and is not presented as a
District Council district. The source-release fan-out publishes its HMA `division`
snapshot before the companion `divisionArea` snapshot; the latter validates against that
exact HMA snapshot. For the source-release Records by district map only, each HMA is
spatially associated with every official exact 2021 C&SD district polygon with which it
has a positive-area intersection. A boundary-only touch does not count. Consequently, an
HMA spanning a district boundary increments each intersected district and the map total
can exceed the number of HMA records. The association does not alter HMA canonical
division IDs and it does not emit Geometry by District measurements: whole-HMA area or
perimeter must never be attributed to every district it crosses.

The source's `hma_eng` and `hma_chi` labels become the English and Traditional Chinese
HMA names. A missing Simplified Chinese name is created only by the reviewable
source-release fixture process described in the Divisions family document; it is marked
unverified until reviewed.

The generated HMA division rows include the shared Parquet hierarchy columns. Their
`class` is `housing-market-area`; `subtype` and `parent_division_id` are empty because
HMAs have no hierarchy. Their authoritative classification remains the C&SD
`canonical_type` of `housing-market-area`.

## Ingestion

The updater passes the locally prepared native CSDI ZIP to the district importer. It
requires the cohort-specific `DC_16BC_SDU.gml`, `DC_21C_SDU.gml`, or `DC_GHS.gml`
member; the last is filtered to its 2024 records. It verifies the ZIP SHA-256 against
its prepared manifest and keeps the managed archive key and hash in source provenance.
Converted CSDI GeoJSON and a separately downloaded GML are not runtime inputs. Use
`saanseoi update`, or invoke the importer with the prepared archive:

```bash
bun run dataops -- hkgov-censtatd:district-area ./data/.../source.zip \
  --target preview --dataset-code ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district \
  --source-version 2021 --release-notes-url URL \
  --source-archive-key by-source/.../source.zip --source-archive-sha256 SHA256
```

Each C&SD upload materialises its `simplified` display transform from the same verified
source artefact, then publishes the exact and display snapshots together under the one
source release. The transform has no separate upload or release-notes URL; the source
release records the CSDI dataset URL instead.

The release Geometry statistics are calculated only from the exact canonical source
snapshot. Besides feature and Polygon/MultiPolygon-part counts, they record area,
boundary length, and non-zero boundary-segment count for every district. Segment count
describes the source geometry's complexity, not its accuracy, and is never recalculated
from or overwritten by the `simplified` display derivative.

Each C&SD reference-year cohort is a required Overture division-release input. The
selected source snapshots are carried forward at or before the Overture cohort, so their
stable source schema is always included in the release's API-field provenance. They are
independently selectable source variants with separate snapshot lineages; publishing the
2024 cohort never supersedes the 2016 or 2021 release or snapshot. Release churn is
measured only against the declared parent snapshot, so each initial cohort has an empty
baseline: its 18 district areas are additions, not removals from another cohort.
