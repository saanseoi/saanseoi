---
createdAt: "2026-07-22T00:00:00.000Z"
updatedAt: "2026-07-22T00:00:00.000Z"
dataset: "ds-hk-overture-division"
release: "dr-hk-overture-division-2025-11-19.0"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-11-19.0"
releaseVersion: "2025-11-19.0"
sourceSchemaVersion: "1.14.0"
type: "division"
cohortKey: "2025-11-19.0"
---

# EN

## Changelog

- <orange>Upstream</orange> Refreshed OSM data on <black>2025-11-06</black>
- <orange>Upstream</orange> Made minor, incremental updates to the data

## Compatibility

SaanSeoi's [Division](/docs#models/Division) retains compatibility with Overture's
[division](https://docs.overturemaps.org/schema/reference/divisions/division/) type
where possible. However, we will diverge from the source model when localised handling
is meaningful for Hong Kong. We deviate from Overture schema (`{{sourceSchemaVersion}}`)
in the following ways:

### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

### Enriched Fields

Fields which retain the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the
  <black>overture</black> key to allow conflation with other datasets while retaining
  attribution lineage of the source.

### Normalised Fields

Fields reorganized for storage, query, or API response shaping:

- `names` -
  [normalised by locale](saanseoi:en:note/overture-division-locale-normalization/v1)
  into [DivisionI18n](/docs#models/DivisionI18n)
  - `names.common` as <black>i18n.{{ LOCALE }}.name</black>
  - `names.primary` as fallback for <black>i18n.{{LOCALE}}.name</black> with an inferred
    locale
  - `names.rules` as <black>i18n.{{ LOCALE }}.rules</black>
- `hierarchies[][]` -
  [normalised as a division hierarchy](saanseoi:en:note/overture-division-hierarchy-normalization/v1)
  into [DivisionHierarchy](/docs#models/DivisionHierarchy). The original is available
  under <black>overture.hierarchies</black> as a compatibility field.
  - `hierarchies[][].division_id` - as <black>hierarchies[].division_id</black>

### Compatibility Fields

Fields which are retained through Overture compatibility keys (i.e.
<black>overture.{{ PROPERTYNAME }}</black>). These source fields are often used as
inputs into mappings that are more appropriate for the local context.

- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) maps to the
  [canonical <black>type</black> and <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1),
  and is available under <black>overture.subtype</black>
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) maps to the
  canonical <black>type</black> and <black>level</black>, and is available under
  <black>overture.class</black>
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) maps
  to the canonical <black>type</black> and <black>level</black>, with the original
  hierarchy retained under <black>overture.hierarchies</black>
- `version` - [FeatureVersion](/docs#models/FeatureVersion), retained under
  <black>overture.version</black>

### Dropped Fields

Fields which are not exposed as part of [Division](/docs#models/Division). A future
Overture compatibility API will make these available in the future
<orange>FORTHCOMING</orange>.

#### Due to zero variance

- `names.rules[].perspectives` - empty
- `names.rules[].between` - empty
- `names.rules[].side` - empty
- `theme` - always <black>divisions</black>
- `type` - always <black>division</black>
- `country` - always <black>HK</black>
- `region` - empty
- `perspectives` - empty
- `norms` - only <black>{driving_side: left}</black> for the whole SAR

#### Due to redundancy

- `parent_division_id` - redundant with the last retained canonical
  <black>hierarchy[].division_id</black> entry
- `hierarchies[][].name` - redundant, as the division record has a name too

#### Due to quality issues

- `local_type` appears to be sourced from <black>place=*</black> OSM data. It is not
  retained because the observed values are inconsistent, incomplete, and locally
  incongruous. Sample:

```text
borough          4
city             1
dependency       1
hamlet         960
locality         1
neighbourhood  149
quarter        183
region          19
square          72
suburb          209
town             16
village        199
```

- `population` - too sparse for storage or API exposure: only 5 of 1,810 records are
  non-null in this source version, and given the source of the data, this is expected to
  remain the case.

#### Due to veracity issues

- `capital_division_ids` - while each district is given a "capital", there is no concept
  of a district capital in Hong Kong
- `capital_of_divisions` - see <black>capital_division_ids</black>.

### Dropped Values

#### Due to redundancy

- `hierarchies[][]` - the top-level country ancestor is implicit for every division in
  the Hong Kong SAR, and the division itself is redundant with the row being described.
