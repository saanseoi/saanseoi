# Atlas API

## Status

This document is intentionally minimal for now.

The current planning focus is:

- data model
- normalisation
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

This API spec depends on the normalised tables and ingest stages described in:

- [atlas-data-model.md](./atlas-data-model.md)
- [the normative versioning and replay reference](../docs/versioning.md)

The API contract should be revised after those modelling decisions are implemented or
locked.

## Divisions geometry relationships

The Divisions family exposes sparse geometry through plural, opt-in relationships:

- `include=areas`
- `include=boundaries`
- `include=areas:<provider>`
- `include=areas:<provider>@<cohort>`
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

## Proposed division statistics relationship

Operational release `stats` are ingestion observability and remain separate from
published demographic, housing and other subject-matter observations. The latter should
be a versioned `division-statistics` API family, with a bounded `include=stats`
convenience relationship on division resources. Its data model, C&SD source inventory,
cohort rules, endpoint shape and implementation TODO are specified in
[`division-statistics.md`](./division-statistics.md).

## Divisions publication and time selection

The v0 Divisions routes expose the publication model while remaining explicitly
unstable. They run inside the existing Atlas Worker through a dedicated v0 handler
module. A future stable contract minor must retain its own execution path whenever a
change could alter observable data, defaults, ordering, or response shape; this does not
require a separate Worker deployment.

Selection parameters are:

- `domain`: selects one non-mixing domain; default `overture`
- `cohort`: selects an exact effective cohort in the chosen catalogue
- `effectiveAt`: selects the newest domain release effective at that instant
- `knownAt`: selects the newest family-and-region catalogue published by that instant
- `catalogRevision`: selects an exact immutable publication checkpoint
- `releaseSet`: selects an exact immutable domain release inside that checkpoint

`effectiveAt` answers “with the catalogue I selected, what data applies to this time?”.
`knownAt` answers “what publication did the API know at this time?”. Combining them is
the bitemporal time-machine query. A later backfill can therefore improve a 2022 domain
release in a later catalogue without changing what an earlier `knownAt` query resolves.

Successful JSON:API documents expose the resolved catalogue, catalogue publication time,
domain, and cohort in `meta`. Their top-level `links.permalink` fully qualifies all
defaults, including the catalogue revision, exact release set, domain, profile, locales,
includes, and pagination. Replay guarantees the same data and JSON:API shape/order for
that fully qualified request, not byte-identical serialisation.

Selectors and variants remain closed request-schema enums. Adding a new domain or
variant is recorded as a backward-compatible API contract minor revision. Adding or
backfilling another snapshot under an already supported selector changes only the
immutable domain release and catalogue revision; it does not bump the data schema or API
contract by itself.
