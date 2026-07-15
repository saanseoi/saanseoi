# Atlas API

## Status

This document is intentionally minimal for now.

The current planning focus is:

- data model
- normalization
- incremental ingestion
- identity and correction handling

The detailed API contract should be revised after the data model and ingestion flow are
settled.

## Current route outline

Public routes are region-scoped:

- `GET /v1/:region/places`
- `GET /v1/:region/places/:id`
- `GET /v1/:region/places/:id/history`
- `GET /v1/:region/places/changes`
- `GET /v1/:region/places/as-of`
- `GET /v1/meta/regions`
- `GET /v1/meta/datasets`

## Profiles

Named response profiles remain part of the design:

- `list`
- `detail`

Defaults:

- collection/list endpoints default to `list`
- single-resource endpoints default to `detail`

## Current filter direction

Public filtering should prefer:

- `basicCategory`
- `taxonomy`
- `taxonomyPrefix`
- `operatingStatus`
- `confidenceMin`
- `bbox`
- `near`
- `radiusM`
- `q`

Deprecated `categories` should not be part of the public contract.

## Dependency on data model

This API spec depends on the normalized tables and ingest stages described in:

- [atlas-data-model.md](./atlas-data-model.md)

The API contract should be revised after those modeling decisions are implemented or
locked.

## Divisions geometry relationships

The Divisions family exposes sparse geometry through plural, opt-in relationships:

- `include=areas`
- `include=boundaries`
- `include=areas:<provider>`
- `include=boundaries:<provider>`

An unqualified relationship resolves the provider configured as the API composition
default. A qualified relationship resolves only the named provider variant for the
requested exact cohort. Unknown, unavailable, or incompatible variants return a clear
4xx response; they do not fall back to another provider. The selected provider and
source release are included in resource provenance/metadata.

List and detail profiles omit geometry unless requested. Included geometry resources use
the `division-areas` and `division-boundaries` resource types, retain relationship
identifiers on the primary division, and are deduplicated across a collection response.
The geometry field contract, cohort rules, source bridges, and provider registration
requirements are defined in [`divisions-geometry.md`](./divisions-geometry.md).
