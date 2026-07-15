---
createdAt: "2026-07-06T14:53:59.654Z"
updatedAt: "2026-07-06T19:27:16.581Z"
dataset: "ds-hk-overture-address"
release: "overture-hk-2025-09-24.0-address"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-09-24.0"
sourceSchemaVersion: "1.12.0"
type: "address"
cohortKey: "2025-09-24.0"
---

# EN

## Changelog

Initial 山水 | SaanSeoi release.

## Compatibility

山水 | SaanSeoi retains compatibility with the Overture address type where possible, but
diverges from the source model where localised handling provides a richer view of the
data.

The SaanSeoi [Address](/docs#models/Address) is an assembly of the Overture
[address](https://docs.overturemaps.org/schema/reference/addresses/address/)
(`{{sourceSchemaVersion}}`) and HK Government Address Lookup Services
(`hkgov-dpo-address-v2026-01-01.0`) datasets, with the latter serving as the primary
reference. As such, it deviates from the Overture schema in the following ways:

### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id)
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `version` - [FeatureVersion](/docs#models/FeatureVersion)

### Enriched Fields

Fields processed to better fit the local scope or support future conflation with other
datasets. Original source attribution is preserved:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the `overture` key to
  allow conflation with other datasets while preserving source-lineage attribution.

### Normalized Fields

Fields reorganized to create strong links with divisions and support API response
shaping:

- `address_levels[]` -
  [normalized into canonical division references](saanseoi:en:note/overture-address-division-normalization/v1).
  The Overture `{{sourceVersion}}` Hong Kong SAR address file contains exactly two
  address levels per row: area (`HK`, `KLN`, or `NT`) followed by one of the 18 district
  names.
  - `address_levels[0].value` - as `areaId`
  - `address_levels[1].value` - as `districtId`
- `number` - as `i18n.en.streetNumber`
- `street` - as `i18n.en.streetName`
- `number` and `street` - formatted as `i18n.en.formattedAddress` when both are present
- `country` - the raw source value is validated as `HK` but is not copied into the
  canonical row. The pipeline resolves canonical `countryId` from the same-cohort
  division snapshot.

### Dropped Fields

Fields that are not retained as canonical address fields. They are therefore not offered
as part of the `address` resourceType, but remain available for source audit through
retained Overture source rows in `rawProperties`.

#### Due to zero variance

- `theme` - always `addresses`
- `type` - always `address`
- raw `country` - always `HK`
- `postcode` - empty
- `postal_city` - empty
- `unit` - empty

# ZH-HANT

# ZH-HANS
