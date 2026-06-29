# API Contract

This document defines the response-shape rules for Saanseoi APIs.

## JSON:API

Saanseoi API responses should be compatible with JSON:API v1.1.

That means:

- top-level documents follow JSON:API structure
- resources use:
  - `type`
  - `id`
  - `attributes`
  - `relationships`
  - `links`
  - `meta`
- compound documents use `included`
- `?include=` is the primary mechanism for related resource expansion

## Join Tables With Data

When join-table data is meaningful in the domain, do not try to force attributes onto JSON:API relationship linkage objects.

Instead:

- promote the join to a full resource
- expose it as its own `type`
- include it through `?include=`
- keep `/relationships/...` endpoints as plain linkage endpoints

Examples:

- `place-divisions`
- `street-addresses`
- `dataset-memberships`
- `api-release-set-members`

Recommended pattern:

- `/places/{id}`
  - relationship to `place-divisions`
- `/places/{id}?include=place-divisions,place-divisions.division`
  - fetch join resource plus related division

This is less elegant than a relationship-with-attributes model, but it fits JSON:API cleanly and predictably.

## Sparse Fieldsets

We do not support JSON:API sparse fieldsets.

That means:

- we do not implement `fields[type]=...`

Instead, we support:

- `?profile=...`

Profiles are named response presets that act as shorthand for internally defined fieldsets.

Examples:

- `?profile=compact`
- `?profile=default`
- `?profile=full`
- `?profile=map`

Important note:

- this `profile` query parameter is an application-level feature
- it is not the same thing as the JSON:API media-type `profile` parameter

## Internationalized Fields

Internationalized fields should be grouped consistently under:

- `attributes.i18n.{locale}.{field}`

Examples:

```json
{
  "type": "addresses",
  "id": "addr_123",
  "attributes": {
    "geometry": { "type": "Point", "coordinates": [114.1, 22.3] },
    "i18n": {
      "en": {
        "formattedAddress": "10 Nathan Road"
      },
      "zhHant": {
        "formattedAddress": "彌敦道10號"
      },
      "zhHans": {
        "formattedAddress": "弥敦道10号"
      }
    }
  }
}
```

### Why This Shape

Benefits:

- locale handling is consistent across all resources
- consumers can turn locale groups on or off by profile
- provenance can target i18n fields consistently
- clients do not need to learn suffix/prefix naming conventions like `nameEn`, `nameZhHant`

Tradeoff:

- responses become more nested

Recommendation:

- use the nested `attributes.i18n.{locale}.{field}` shape
- accept the extra nesting because the consistency is worth it for a tri-lingual dataset platform

## Locale Handling

Recommended query parameters:

- `?locales=en,zhHant`
  - limits which locale blocks appear under `attributes.i18n`
- `?locales=none`
  - suppresses `attributes.i18n`
- profile defaults may also imply locale inclusion rules

This `?locales=...` filter should be supported consistently across all API endpoints that expose internationalized fields.

## Relationship Naming

Relationship names should be stable, predictable, and noun-based.

Examples:

- `street`
- `area`
- `district`
- `place-divisions`
- `current-release`

Avoid source-specific names in the API contract.

Bad examples:

- `otStreet`
- `hkgovAddressRow`

## Canonical Resource Type Names

Use singular canonical resource type names everywhere the contract needs a stable identifier vocabulary:

- `address`
- `division`
- `street`
- `place`

This applies to:

- `apiField` identifiers
- endpoint metadata like `resourceType`
- profile definitions
- provenance rows

JSON:API `type` values should remain plural resource names:

- `addresses`
- `divisions`
- `streets`
- `places`

Join-resource `type` values should remain hyphenated plural nouns, for example:

- `place-divisions`
- `street-addresses`
- `api-release-set-members`

## `apiField` Identifier Format

`apiField` is the canonical identifier used by:

- `apiFieldProvenance`
- profile definitions
- changelog notes where field-level references are needed

### Format

Use dot-separated JSON-path-like identifiers rooted at the resource type.

Pattern:

- `{resourceType}.id`
- `{resourceType}.attributes.{field}`
- `{resourceType}.attributes.i18n.{locale}.{field}`
- `{resourceType}.relationships.{relationship}`
- `{resourceType}.meta.{field}`

Examples:

- `address.id`
- `address.attributes.geometry`
- `address.attributes.streetNumber`
- `address.attributes.i18n.en.formattedAddress`
- `address.attributes.i18n.zhHant.formattedAddress`
- `address.relationships.street`
- `place.attributes.i18n.en.name`
- `place.attributes.i18n.zhHans.name`
- `place.relationships.place-divisions`

### Provenance Scope

Provenance is recorded per API release set and per `apiField`, not per individual row.

An API field may have one or many source mappings within the same API release.

That means:

- `address.attributes.geometry`
  - can point to dataset `ds-hk-overture-address`
- `address.attributes.i18n.zhHant.formattedAddress`
  - can point to dataset `ds-hk-hkgov-als-address`
- `place.attributes.i18n.en.name`
  - can point to multiple datasets if the field is merged, enriched, or has fallback rules

The provenance describes how the contract field is sourced for that API release, not where each row instance came from.

If a field can be sourced from multiple datasets, provenance should expose:

- each source dataset that may contribute
- the source field path used from that dataset
- the resolver or precedence rule that decides between them

At this layer we document the rule, not the actual chosen row instance per response row.

## Profiles

Profiles should be defined as named field groups over `apiField` identifiers.

Examples:

- `compact`
  - `address.id`
  - `address.attributes.geometry`
  - `address.relationships.street`
- `default`
  - `address.id`
  - `address.attributes.geometry`
  - `address.attributes.i18n.en.formattedAddress`
  - `address.attributes.i18n.zhHant.formattedAddress`
  - `address.relationships.street`
- `full`
  - all contract fields for that resource type

This makes profiles and provenance use the same field vocabulary.

## Initial Profile Names

The initial shared profile vocabulary is:

- `compact`
- `default`
- `full`
- `map`
