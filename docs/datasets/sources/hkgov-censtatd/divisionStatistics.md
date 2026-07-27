# Census and Statistics Department division statistics

The following C&SD datasets are registered as Stats-family sources. They preserve
publisher releases with their published geography cohort and measures; they never write
to SaanSeoi's operational release-statistics table.

| Dataset                                                          | CSDI identifier(s)                                                                   | Geography / intended use                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Census Subdivided Units by District Council District             | `censtatd_rcd_1635932488538_10765` (2016); `censtatd_rcd_1635933617052_68946` (2021) | Two 18-district census cohorts; subdivided-unit population                  |
| Permanent Living Quarters by Area and Type                       | `censtatd_rcd_1635933883228_46491`                                                   | Area-level housing stock                                                    |
| Permanent Living Quarters by District Council District           | `censtatd_rcd_1635934103275_66203`                                                   | District-level housing stock                                                |
| Population and Household Statistics by District Council District | `censtatd_rcd_1635934545173_69201`                                                   | Annual land-based, non-institutional population and socio-economic measures |
| District Land Area, Population and Density                       | `censtatd_rcd_1635934215448_25451`                                                   | District land area, population and density                                  |
| 2021 Census: Housing Market Areas and Building Groups            | `censtatd_rcd_1728978338390_76872`                                                   | 173 housing market areas and 3,322 building groups                          |
| 2021 Census: New Towns                                           | `censtatd_rcd_1695181913136_27614`                                                   | 10 new towns                                                                |
| 2021 Census: Major Housing Estates                               | `censtatd_rcd_1695182015782_79001`                                                   | 540 major housing estates                                                   |

The 2016 By-census and 2021 Census subdivided-unit district releases are retained as one
logical dataset with two one-off reference-year releases. They also publish the relevant
District Council boundaries. Their geometry profiles remain documented separately in
[`divisionArea.md`](./divisionArea.md): they are authoritative statistical-geography
variants for their respective census cohorts, not an evergreen administrative default.

The fixture records every observed archive slot whose native publisher package is
byte-identical to the 2016 or 2021 cohort. The updater suppresses only those exact no-op
object hashes while continuing to check the CSDI archive catalogue for a changed object.

District Land Area, Population and Density is an exception: its `Density_2022.gml` and
`Density_2024.gml` publisher packages differ, so they are retained as distinct `2022.0`
and `2024.0` source releases rather than archive no-ops.

## Remaining native statistics ingestion

The updater invokes one shared native CSDI statistics importer for the seven remaining
datasets. It accepts only its locally prepared publisher ZIP, verifies the updater
manifest SHA-256, requires each configured GML member, and checks its publisher layer,
required fields and feature count. Complete publisher properties, feature geometry and
archive key/hash are stored in `hkgovCenstatdStatistics`; the distinct measure schemas
remain publisher assertions rather than being forced into the district-density model.
The importer publishes through the selected local, preview or production target's local
SQLite cache, just as the density importer does.

## District land area, population and density ingestion

The native CSDI ZIP is the input. Each mapped archive contains one GML layer,
`Density_2022` or `Density_2024`, with 18 District Council district features in
EPSG:2326. The source shard retains C&SD's numeric `DC`, labels, publisher geometry and
complete property set without a canonical division value. The history processor resolves
each `DC` through the reviewed C&SD numeric bridge and the matching reviewed HAD
district code bridge. It writes the resulting canonical `divisionId` and SaanSeoi
`districtCode` only to the Division Statistics history observation.

`MYPOPN_LAND` is expressed in thousands by the publisher and is multiplied by 1,000
during ingestion, so `midYearPopulation` is the actual number of people. `PERIOD`, land
area (`LA`), and mid-year population density (`POPN_D`) are retained as statistic
assertions. The source's labels are exposed with the raw `DC` through
`sourceKeys.hkgovCenstatd`. The archive quarter is never a dataset version: the
fixture's `sourceVersion` creates `2022.0` and `2024.0`.

The current CSDI simplified data specification is recorded in the dataset fixture as
`schemaSpecificationURL`. The updater prepares and mirrors the publisher ZIP, then
passes that local prepared ZIP, its managed-asset key and its SHA-256 to the importer.
The importer verifies the local ZIP against that hash before parsing it; it never
reloads the ZIP from object storage. The source assertion retains both archive
references while the target-aware SQL processor uses its local target-database cache to
generate and publish the release for local, preview or production. Publish through
`saanseoi update`, or invoke the importer with the already-prepared archive:

```sh
bun run dataops -- hkgov-censtatd:district-land-area-population-density ./data/.../source.zip \
  --target preview --source-version 2022 --release-notes-url URL \
  --source-archive-key by-source/.../source.zip --source-archive-sha256 SHA256
```

Before an entry advances beyond planned, inspect and record its downloadable artefacts
or API, schema, licence, update cadence, identifiers, publication date, reference
period, measure definition, and geography cohort. A derived rate must identify its
numerator and denominator series and must not replace a publisher-supplied measure.
