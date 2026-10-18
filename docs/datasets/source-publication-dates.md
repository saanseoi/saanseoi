# Upstream source publication dates

Release fixture `publicationDate` records the publisher's publication day or an
explicitly documented estimate, independent of the reference period in `sourceVersion`
and `cohortKey`. `publicationDateSource` identifies the upstream evidence. Upload
registration retains the date on both the source and resource release; local staged
metadata uses the same fixture. Estimates carry `publicationDateEstimated: true`, an
evidence URL, date precision and localised notes explaining the inference. Date
precision describes the evidence granularity, not certainty. Reference years and archive
quarters alone do not establish a publication day. Date-coded versions can supply their
day.

## CSDI evidence

The following dates were checked against the live CSDI ISO 19139 metadata on 3
October 2026. Each fixture links to its metadata XML. The field is the dataset's
identification citation (`gmd:identificationInfo` → `gmd:CI_Citation` → `gmd:CI_Date`)
whose `gmd:CI_DateTypeCode` is `publication`. Dates on cited specifications, metadata
timestamps, creation dates and revision dates are excluded.

These are publication dates of the CSDI dataset offerings. They do not claim the first
publication of the underlying census findings or the date of a later archive
replacement. Planning Department Division and DivisionArea fixtures share the
corresponding offering's date.

| Source offering                                   | Reference cohort | Publication date |
| ------------------------------------------------- | ---------------- | ---------------- |
| HAD District Boundary                             | 2022             | 2022-03-14       |
| C&SD subdivided units by district                 | 2016             | 2022-12-22       |
| C&SD subdivided units by district                 | 2021             | 2023-06-20       |
| C&SD permanent living quarters by area and type   | 2023-H2          | 2023-12-27       |
| C&SD permanent living quarters by district        | 2023-H2          | 2023-12-27       |
| C&SD housing market areas and building groups     | 2021             | 2026-03-30       |
| Planning Department planning units                | 2001, 2006, 2011 | 2022-03-16       |
| Planning Department planning units                | 2016             | 2022-03-30       |
| Planning Department planning units                | 2021             | 2022-06-24       |
| Planning Department new towns                     | 2006, 2011, 2016 | 2022-03-11       |
| Planning Department new towns                     | 2021             | 2022-06-24       |
| C&SD land area and population density by district | 2022             | 2023-12-27       |
| C&SD major housing estates                        | 2021             | 2024-12-23       |
| C&SD new towns                                    | 2021             | 2024-12-23       |

## Researched estimates

Checked on 18 October 2026. All 83 registered local source releases now have a date. The
93 release fixtures also contain no undated non-date-coded versions; 63 use the existing
date-coded version fallback rather than an explicit date field. These estimates do not
assert an independently verified geospatial publication day.

| Release                                        | Estimated date | Evidence and limits                                                                                                                                                                                                                  |
| ---------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Land area and population density, 2024         | 2025-03-31     | [CSDI metadata](https://portal.csdi.gov.hk/geoportal/rest/metadata/item/censtatd_rcd_1635934215448_25451/xml) records revision `2025-03`; use month end with month precision.                                                        |
| Population and households, 2024 geometry       | 2025-03-28     | [Official report announcement](https://www.info.gov.hk/gia/general/202503/28/P2025032800255.htm) establishes the statistical report day; use it as a proxy for its geometry companion.                                               |
| Population and households, 2026-Q2 compilation | 2026-03-26     | [CSDI creation/revision day](https://portal.csdi.gov.hk/geoportal/rest/metadata/item/censtatd_rcd_1635934545173_69201/xml) matches the [2025 report announcement](https://www.info.gov.hk/gia/general/202603/26/P2026032600228.htm). |

The native population packages contain observations through 2024 (2025-Q2 archive) and
2025 (2026-Q2 archive), respectively. Their `DC_GHS.gml` ZIP entry timestamps are 5 June
2025 and 22 April 2026. The live catalogue metadata timestamp is 12 May 2026. Packaging,
archive slots and catalogue refreshes do not establish first publication. The
catalogue's 27 December 2023 publication day belongs to the original offering.
