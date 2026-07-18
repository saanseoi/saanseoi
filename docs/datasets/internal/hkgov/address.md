# HKGov ALS Address

This document describes the Hong Kong Digital Policy Office Address Lookup Service (ALS)
address import.

Related docs:

- [Address resource type](../../resourceType/address.md)
- [Resource type common processing](../../resourceType/common.md)

## Dataset role

- Dataset metadata uses `publisherCode: hkgov-dpo` and `code: ds-hk-hkgov-dpo-address`.
- ALS is the sole source for Hong Kong address records. Address IDs are derived from
  stable ALS premise identities because GERS does not issue address identifiers.
- The division snapshot is selected with `--cohort-key` as a processing dependency.
- The CLI reads all 2D district GeoJSON files in one ALS release. It skips the separate
  `als_addresses_3d_*` file.

## Exact duplicate handling

ALS releases occasionally contain the same GeoJSON feature object more than once. The
preparer removes only exact feature-object duplicates (the same parsed JSON value),
retains the first occurrence, and prints:

| Record | Address         | Source feature positions (one-based)           |
| ------ | --------------- | ---------------------------------------------- |
| 1      | Example address | district-a.geojson #42, district-b.geojson #11 |

No coordinate-, `GeoAddress`-, street-, or number-based collapsing is performed. Two
rows at the same point can represent distinct ALS premises, such as blocks, towers,
facilities, or named buildings, and must remain separate address records. The only
additional consolidation is a representation variant whose complete granular premise
identity is identical. If the variants differ because
`EngBlock.BlockDescriptorPrecedenceIndicator` is missing in one source feature and
present in another, the importer deterministically retains the feature with the
indicator present. Other same-premise representation variants are printed separately
from exact feature duplicates.

## Stable ALS premise ID

Each retained row receives `ss-<uuid-v5>`. The UUIDv5 input is a normalized premise
identity composed of:

- `CsuId`, falling back to `GeoAddress` when no CSU ID is supplied
- district
- street or village kind and name
- number or number range
- estate, phase, block/tower descriptor and number
- building name
- unit descriptor and number when supplied

The preparer fails rather than silently merging if two non-identical rows produce the
same source ID. English components are preferred when present, with Traditional Chinese
components as the fallback. `GeoAddress` remains provenance and an identity anchor; it
is never treated as a unique premise by itself.

## ALS-to-ALS drift review

For historical ingestion, the command persists an ignored local identity history at
`.local/hkgov-dpo/als-identity-history.json` and human decisions at
`.local/hkgov-dpo/als-identity-decisions.json`.

Before its first prompt, historical ingestion performs a local, no-write preflight and
prints the total precedence-variant and identity-drift choices required across every
selected release. It also writes a batch Markdown review of unresolved changes involving
a block, house, or tower to
`.local/hkgov-dpo/identity-drift/block-house-tower-review.md`.

When a new row has the same unambiguous continuity anchor (CSU/GeoAddress, district,
route, number/range, and rounded point) but a different premise identity, it is a
candidate drift. This catches changes such as building name, estate, phase, block, or
unit changes without silently assuming that the record is the same premise.

Interactive imports show the old and new relevant details and require one choice:

- **Keep existing ID** — record a versioned decision and retain the prior `ss-` ID.
- **Generate a new ID** — record that the later row is a different premise.

With `--yes`, the command does not guess: it stops before that release's database write
and writes `.local/hkgov-dpo/identity-drift/{source-version}.json` for review. A changed
CSU/GeoAddress, route/name or number, district, coordinate movement, or several possible
historic candidates does not automatically link records.

## Commands

The local database must first contain a published Hong Kong division snapshot in its
current tables. This is a division dependency, not an Overture-address dependency. After
the normal local reset, use the current published `2025-12-17.0` division cohort.

Prepare one release (no database mutation):

```bash
bin/saanseoi prep-hkgov-dpo \
  data/hkgov/dpo/ALS/20260710-1054-ALS-GeoJSON \
  --target local --cohort-key 2025-12-17.0 \
  --identity-history .local/hkgov-dpo/als-identity-history.json \
  --identity-decisions .local/hkgov-dpo/als-identity-decisions.json \
  --identity-drift-report .local/hkgov-dpo/identity-drift/2026-07-10.1054.json
```

Ingest all ALS release directories in chronological order into local D1:

```bash
bin/saanseoi ingest-hkgov-dpo-local \
  data/hkgov/dpo/ALS --target local --cohort-key 2025-12-17.0
```

The command defaults to ALS releases from the cohort year onward (January 2025 here), so
pre-2025 directories are excluded. Use `--from-source-version YYYY-MM-DD.NNNN` to choose
a later start, or `--block-house-tower-review-file FILE` for a different batch-review
location.

It resumes safely after a successful local release: source versions already present in
the persisted ALS identity history are skipped rather than uploaded again.

Use `--dry-run` to validate each prepared parquet and its upload plan without database
mutation. Use `--yes` only after reviewing any generated drift reports. The command
stores prepared parquet files under `.local/hkgov-dpo/prepared/`, so a failed later
release can be inspected or uploaded again without regenerating it.

## Preparation fields

The prepared parquet includes stable `id` and `canonicalId`, `identityAlias`,
`identityBuildingId`, `identityKey`, `identityMatchMethod`, the selected division IDs,
geometry, provenance, `GeoAddress`, `hkgovCsuId`, both source-language premise payloads,
formatted English and Traditional Chinese addresses, and easting/northing.

The local SQL pipeline uses the prepared `id` and `canonicalId`, trusts the resolved
division fields, parses geometry/provenance JSON, and writes English and/or Traditional
Chinese i18n rows. It processes prepared parquet in bounded chunks through the shared
normalization, source, history, current, and finalize stages.
