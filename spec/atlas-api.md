# Atlas API

## Status

This document is intentionally minimal for now.

The current planning focus is:

- data model
- normalization
- incremental ingestion
- identity and correction handling

The detailed API contract should be revised after the data model and ingestion flow are settled.

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

The API contract should be revised after those modeling decisions are implemented or locked.
