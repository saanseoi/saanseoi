# API Versioning

Saanseoi API versioning uses Semantic Versioning:

- `{x}.{y}.{z}`

## Meaning

- `x`
  - breaking response contract change
  - removes fields
  - renames fields
  - changes response shape
  - changes field semantics incompatibly
- `y`
  - additive response contract change only
  - adds fields
  - adds optional metadata blocks
  - adds optional request parameters without breaking existing clients
- `z`
  - logic-only change
  - no response shape changes
  - no field removals
  - no field renames

## Routing

Patch versions are documented but do not appear in routes.

Users can request:

- `v{x}`
  - resolves to the latest `x.y.z`
- `v{x}.{y}`
  - resolves to the latest `x.y.z` within that fixed response shape

Examples:

- `/v0/addresses/...`
  - latest `0.y.z` for addresses
- `/v0.1/addresses/...`
  - latest `0.1.z` for addresses

We do not route on `v{x}.{y}.{z}`.

## Initial Policy

We will start with:

- `v0`
- `v0.1`

The first concrete published version is:

- `0.1.0`

Changelog label:

- `Alpha Release`

## Scope

API versions are scoped to a contract family, not necessarily to the whole platform.

Examples:

- `ss-addresses-v0.1`
- `ss-places-v0.1`
- `ss-divisions-v0.1`

This allows:

- addresses to move from `v0.1` to `v0.2`
- places to remain at `v0.1`
- divisions to move to `v1`

## Changelog

Every published API version must document:

- version number
- release date
- whether the change is `x`, `y`, or `z`
- added fields
- removed fields
- renamed fields
- logic-only changes

Patch releases must still be documented even though they do not appear in routes.
