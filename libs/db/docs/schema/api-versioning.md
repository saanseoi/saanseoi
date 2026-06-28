# API Versioning

API versions describe the public contract shape and behavior of one API family.

Code format:

- `api-{family}-v{version}`
- examples:
  - `api-divisions-v0.1`
  - `api-addresses-v0.1`
  - `api-places-v0.1`

`family` is the contract family, not the storage model:

- `divisions`
- `addresses`
- `places`

`version` follows SemVer-like intent, but routing is still simplified.

## Meaning

- `x`
  - breaking API contract change
  - removed fields
  - renamed fields
  - incompatible semantic change
- `y`
  - additive API contract change
  - new optional fields
  - new optional relationships
  - new optional query parameters
- `z`
  - logic-only change with no contract change

## Routing

Patch releases are tracked in metadata and changelogs, but not routed directly.

Users can request:

- `v{x}`
  - latest `x.y.z`
- `v{x}.{y}`
  - latest `x.y.z` within that minor line

Examples:

- `/v0/divisions/...`
- `/v0.1/divisions/...`
- `/v0/addresses/...`

## Scope

API versions are scoped per family.

That allows:

- divisions to move from `v0.1` to `v0.2`
- addresses to stay on `v0.1`
- places to move to `v1`

## Metadata Fields

`apiVersions` stores:

- `code`
- `familyType`
- `version`
- `status`
- `publishedAt`
- `deprecatedAt`
- `retiredAt`

Recommended status flow:

- `draft`
- `current`
- `deprecated`
- `retired`

## Relationship To Data Versioning

An API version does not identify the data snapshot it serves.

That separation is deliberate:

- `apiVersion`
  - contract version
- `snapshotVersion`
  - published data snapshot version
- `schemaVersion`
  - canonical field-definition version
- `rulesetVersion`
  - transformation logic version

See [Data Versioning](./data-versioning.md).
