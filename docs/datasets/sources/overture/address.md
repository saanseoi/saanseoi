# Overture Address

This document describes the Overture-specific side of the address pipeline.

Related family doc:

- [Address family](../../families/address.md)

## Dataset Role

- Dataset metadata uses `publisherCode: overture`, `code: ds-hk-overture-address`.
- Uploads are ingested directly from parquet.
- The worker path is `apps/harbour-workers/src/lib/services/address.ts`.
- In runtime terms, Overture currently acts as the base address feed for canonical `address2d`.
- For snapshot-source provenance, Overture releases are currently recorded with role `enrichment`.

## Source Fields Used

The worker currently projects these Overture fields:

- `id`
- `address_levels`
- `street`
- `number`
- `geometry`
- `bbox`
- `sources`
- `version`

Fields not currently projected into canonical address rows include:

- `postcode`
- any building-, phase-, floor-, unit-, or village-level structure
- other Overture fields outside the subset above

## Normalization

For each Overture row, the worker:

- uses Overture `id` as the source ID
- derives `areaId` from the first `address_levels` entry
- derives `districtId` from the second `address_levels` entry
- normalizes Hong Kong area aliases such as `HK`, `KLN`, and `NT`
- stores point geometry as parsed GeoJSON
- stores `bbox`
- stores `sources` as `{ "overture": <pruned row.sources> }`
- creates one `en` i18n row only
- formats the address as `<number> <street>` when both exist

Current Overture canonical contribution is therefore mostly:

- canonical address identity seed
- point geometry
- bbox
- English street text
- source provenance

Current non-contributions:

- `zh-hant` address text
- `identifiers`
- building and estate components

## Canonical Impact

When no existing canonical row is matched:

- Overture `id` becomes canonical `address2d.id`

When a canonical row is matched:

- Overture can update the canonical row’s geometry, bbox, and source payload

Overture is also the only source that currently drives canonical deletion:

- if an address disappears from the latest Overture release, the canonical current version can be closed

## Source Retention Tables

Current-state source tables:

- `sourceOvertureAddresses2d`
- `sourceOvertureAddress2dI18n`

Version tables:

- `sourceOvertureAddresses2dVersions`
- `sourceOvertureAddress2dI18nVersions`

For later releases with unchanged source payloads, the worker advances the current row to the new release without inserting another source version row.

Current retained source fields include:

- `releaseId`
- `datasetId`
- `sourceRecordId`
- `sourcePayloadHash`
- `regionCode`
- `version`
- `geometry`
- `bbox`
- `streetName`
- `streetNumber`
- `sources`
- `rawProperties`

Localized source retention currently stores:

- `streetName`
- `locality`
- `region`
- `country`

In the current worker flow, only `streetName` is populated for Overture address i18n rows and the other localized source fields remain `null`.
