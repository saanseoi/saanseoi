# Upstream source publication dates

Release fixture `publicationDate` is the publisher's explicit publication day,
independent of the reference period in `sourceVersion` and `cohortKey`.
`publicationDateSource` identifies the upstream evidence. Upload registration retains
the date on both the source and resource release; local staged metadata uses the same
fixture. Missing dates remain unknown for year, quarter and half-year versions.
Date-coded versions can supply their day.

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

## Unresolved release dates

- [Land area and population density, 2024](https://portal.csdi.gov.hk/geoportal/rest/metadata/item/censtatd_rcd_1635934215448_25451/xml):
  the shared catalogue gives publication `2023-12-27` and revision `2025-03`. Neither
  establishes a publication day for the 2024 compilation.
- [Population and households, 2024 and 2026-Q2](https://portal.csdi.gov.hk/geoportal/rest/metadata/item/censtatd_rcd_1635934545173_69201/xml):
  the shared catalogue gives publication `2023-12-27` and creation/revision
  `2026-03-26`. These do not establish publication days for either retained compilation.

The CSDI archive lists supply quarter slots and download links, without publication
days. These three release fixtures therefore omit `publicationDate`.
