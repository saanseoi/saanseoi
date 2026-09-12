# Division statistics family

## Purpose

`stats` already means operational release statistics in the metadata database (record
counts, churn, coverage, processing decisions). That meaning must remain separate from
published subject-matter statistics such as population, households, housing stock or
land area.

This proposal introduces a **Division Statistics** family for the latter. It records a
published observation against a specific, versioned statistical geography and period. It
does not calculate demographic values from Saanseoi records, and it does not silently
attach a value from one district-boundary vintage to another.

The initial C&SD District Land Area, Population and Density processor writes source and
history records. The source layer includes C&SD's numeric `DC`; the history layer alone
resolves it through the reviewed C&SD numeric and HAD district-code bridges to the
canonical `divisionId` and district code. A snapshot-scoped current table is reserved
for the Stats API composition stage, which remains pending.

## Recommended model

The family should have three immutable concepts:

- a `statisticSeries`: publisher, source dataset/release, measure, unit, denominator,
  population/universe, frequency, caveats and licence;
- a `divisionStatistic`: one value for
  `(series, division, geography cohort, reference period)`, retaining the source
  row/field and any suppression or estimate flags;
- a `statisticalGeography`: the source's boundary/identifier cohort. It bridges to a
  canonical division only when its authority, code and effective period make that bridge
  unambiguous.

Values must retain `referencePeriod`, `publishedAt`, `sourceRelease`, `geographyCohort`,
`unit`, and the exact published measure definition. Derived rates must name their
numerator and denominator series; they are never substituted for a publisher's own
figure.

## API opinion

This is worth making a first-class family, rather than adding arbitrary JSON to a
division row. It gives statistics independent release/version provenance and lets the
same series serve maps, comparisons and time series.

The Division API may expose a bounded convenience relationship:

```text
GET /divisions/v0.1/:id?include=stats
GET /divisions/v0.1/:id?include=stats&stats[series]=censtatd.population-households&stats[period]=2025
```

`include=stats` without filters must return only a documented compact default set (or
links to the family); it must not expand every historical observation into one division
response. The dedicated family remains the complete interface:

```text
GET /v0/division-statistics?division=:id&series=:series&from=2021&to=2025
```

The response must expose the resolved statistical-geography cohort. If the requested
division snapshot and the statistic's geography cannot be bridged, return the value as
unmatched rather than implying a spatially exact join.

## Census and Statistics Department availability

The following CSDI datasets are available candidates for a `hkgov-censtatd` statistics
provider. They are source releases to ingest and preserve, not figures to copy into the
existing operational release `stats` table.

| Dataset                                                                                                                                                                                                                                                                    | Geography / use                                                            | Boundary availability                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| Census subdivided units by District Council district ([2016 By-census](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635932488538_10765); [2021 Census](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933617052_68946)) | Two 18-district census cohorts; subdivided-unit population                 | Includes individual district boundaries |
| [Permanent living quarters](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933883228_46491)                                                                                                                                                      | Area-level housing stock                                                   | Statistics only                         |
| [Permanent living quarters by District Council district](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635934103275_66203)                                                                                                                         | District-level housing stock                                               | Statistics only                         |
| [Population and household statistics by District Council district](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635934545173_69201)                                                                                                               | Annual land-based non-institutional population and socio-economic measures | Statistics only                         |
| [District Land Area, Population and Density](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635934215448_25451)                                                                                                                                     | District land area, population and density                                 | Statistics only                         |
| [2021 Census: housing market areas and building groups](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1728978338390_76872)                                                                                                                          | 173 housing market areas and 3,286 building groups                         | Includes individual boundaries          |
| [2021 Census: new towns](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1695181913136_27614)                                                                                                                                                         | 13 New Town areas                                                          | Includes individual boundaries          |
| [2021 Census: major housing estates](https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1695182015782_79001)                                                                                                                                             | 540 major housing estates                                                  | Includes individual boundaries          |

The 2021 housing-market/building-group link was supplied twice; it is intentionally
listed once above.

### District geometry decision

The C&SD 2016 and 2021 subdivided-unit datasets explicitly publish the 18 District
Council district boundaries. Prefer them over a Saanseoi-generated land clip when the
goal is to display the C&SD statistical geography for that census cohort. Ingest each as
an auditable `hkgov-censtatd` area variant and bridge it only to the matching district
cohort.

This does not make C&SD the universal geometry default: the C&SD boundary is
authoritative for the statistical product, while the active
administrative/district-boundary publisher may define a different current vintage or
coastal treatment. Provider variants make that distinction visible rather than
manufacturing one derived geometry.

## TODO

- [ ] Inspect each C&SD resource's downloadable files/API, schema, licence, update
      cadence, identifiers, publication date and statistical reference period.
- [x] Add planned `hkgov-censtatd` dataset fixtures and source documentation.
- [ ] Ingest and validate 2016 and 2021 C&SD district-boundary variants before choosing
      an API map default; compare area, identifiers and coastal treatment with HAD.
- [x] Add the initial C&SD land-area, population and density source/history schema and
      reviewed district-resolution processor.
- [ ] Design the `statisticSeries` and statistical-geography registry, generated through
      the normal Drizzle migration workflow.
- [ ] Define the initial compact `include=stats` series allowlist and the filter schema
      for the dedicated family.
- [ ] Add further Census, housing, labour, education and health datasets only after
      their measures and geographic cohorts have explicit series definitions.
