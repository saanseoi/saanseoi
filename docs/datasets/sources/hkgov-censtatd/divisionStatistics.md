# Census and Statistics Department division statistics

The following C&SD datasets are registered as **planned** Stats-family sources. They are
source releases to preserve with their published geography cohort and measures; no
values have been copied into Saanseoi's operational release-statistics tables.

| Planned dataset                                                         | CSDI identifier                    | Geography / intended use                                                    |
| ----------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| 2021 Census: Subdivided Units by District Council District              | `censtatd_rcd_1635933617052_68946` | 18 District Council districts; subdivided-unit population                   |
| Permanent Living Quarters by Area and Type                              | `censtatd_rcd_1635933883228_46491` | Area-level housing stock                                                    |
| Permanent Living Quarters by District Council District                  | `censtatd_rcd_1635934103275_66203` | District-level housing stock                                                |
| Population and Household Statistics by District Council District        | `censtatd_rcd_1635934545173_69201` | Annual land-based, non-institutional population and socio-economic measures |
| Land Area, Mid-year Population and Density by District Council District | `censtatd_rcd_1635934215448_25451` | District land area, population and density                                  |
| 2021 Census: Housing Market Areas and Building Groups                   | `censtatd_rcd_1728978338390_76872` | 173 housing market areas and 3,286 building groups                          |
| 2016 By-census: Subdivided Units by District Council District           | `censtatd_rcd_1635932488538_10765` | Historic 18-district subdivided-unit population                             |
| 2021 Census: New Towns                                                  | `censtatd_rcd_1695181913136_27614` | 10 new towns                                                                |
| 2021 Census: Major Housing Estates                                      | `censtatd_rcd_1695182015782_79001` | 540 major housing estates                                                   |

The 2016 and 2021 subdivided-unit district datasets also publish the relevant District
Council boundaries. Their geometry profiles remain documented separately in
[`divisionArea.md`](./divisionArea.md): they are authoritative statistical-geography
variants for their respective census cohorts, not an evergreen administrative default.

Before an entry advances beyond planned, inspect and record its downloadable artefacts
or API, schema, licence, update cadence, identifiers, publication date, reference
period, measure definition, and geography cohort. A derived rate must identify its
numerator and denominator series and must not replace a publisher-supplied measure.
