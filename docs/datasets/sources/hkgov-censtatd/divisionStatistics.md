# Census and Statistics Department division statistics

The following C&SD datasets are registered as **planned** Stats-family sources. They are
source releases to preserve with their published geography cohort and measures; no
values have been copied into Saanseoi's operational release-statistics tables.

| Planned dataset                                                  | CSDI identifier(s)                                                                   | Geography / intended use                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Census Subdivided Units by District Council District             | `censtatd_rcd_1635932488538_10765` (2016); `censtatd_rcd_1635933617052_68946` (2021) | Two 18-district census cohorts; subdivided-unit population                  |
| Permanent Living Quarters by Area and Type                       | `censtatd_rcd_1635933883228_46491`                                                   | Area-level housing stock                                                    |
| Permanent Living Quarters by District Council District           | `censtatd_rcd_1635934103275_66203`                                                   | District-level housing stock                                                |
| Population and Household Statistics by District Council District | `censtatd_rcd_1635934545173_69201`                                                   | Annual land-based, non-institutional population and socio-economic measures |
| District Land Area, Population and Density                       | `censtatd_rcd_1635934215448_25451`                                                   | District land area, population and density                                  |
| 2021 Census: Housing Market Areas and Building Groups            | `censtatd_rcd_1728978338390_76872`                                                   | 173 housing market areas and 3,286 building groups                          |
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

## District land area, population and density ingestion

The native CSDI ZIP is the input. Each mapped archive contains one GML layer,
`Density_2022` or `Density_2024`, with 18 District Council district features in
EPSG:2326. The processor retains the publisher geometry and labels as source evidence,
then records `DC`, `PERIOD`, land area (`LA`), mid-year population in thousands
(`MYPOPN_LAND`), and mid-year population density (`POPN_D`) as statistic assertions. It
does not publish the archive quarter as a version: the fixture's `sourceVersion` creates
`2022.0` and `2024.0`.

The current CSDI simplified data specification is recorded in the dataset fixture as
`schemaSpecificationURL`. The command resolves the immutable source archive through the
local asset registry. If an older local R2 layout contains the archive without a current
registry entry, it re-mirrors only the fixture-mapped CSDI package, verifies its content
hash, and then publishes the dataset release. Publish either release to the local target
with:

```sh
bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2022
bun run dataops -- hkgov-censtatd:district-land-area-population-density --target local --source-version 2024
```

Before an entry advances beyond planned, inspect and record its downloadable artefacts
or API, schema, licence, update cadence, identifiers, publication date, reference
period, measure definition, and geography cohort. A derived rate must identify its
numerator and denominator series and must not replace a publisher-supplied measure.
