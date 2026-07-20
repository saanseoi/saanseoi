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
- Each ALS release uses its own source version as its address/API cohort. The selected
  Overture division snapshot is recorded and reported as an out-of-cohort processing
  dependency.
- The CLI reads all 2D district GeoJSON files in one ALS release. It skips the separate
  `als_addresses_3d_*` file.

## Exact duplicate handling

ALS releases occasionally contain the same GeoJSON feature object more than once. The
preparer removes only exact feature-object duplicates (the same parsed JSON value),
retains the first occurrence, and reports only aggregate CLI counts: affected premises,
source features involved and removed, and source files involved. It does not print
canonical records or ignored-variant JSON to the terminal; that structured audit
evidence remains available through the processing-actions report.

No general coordinate-, `GeoAddress`-, street-, or number-based collapsing is performed.
Two rows at the same point can represent distinct ALS premises, such as blocks, towers,
facilities, or named buildings, and must remain separate address records. The only
additional consolidations are a representation variant whose complete granular premise
identity is identical, and a single number that repeats an endpoint of a number range.
For the latter, the importer retains the range only when the rows also have the same
complete numberless premise identity, `GeoAddress`, and point geometry. It does not
infer that an arbitrary number between the endpoints is part of the range: ALS supports
alphanumeric and odd/even numbering, and those can represent different premises. If the
variants differ because `EngBlock.BlockDescriptorPrecedenceIndicator` is missing in one
source feature and present in another, the importer deterministically retains the
feature with the indicator present. Other same-premise representation variants are
printed separately from exact feature duplicates.

## Processing audit trail

At upload, each automatic consolidation and each reviewed identity-drift decision is
stored against the release in the meta database. The `stats` table records aggregate
counts under the `processing` metric; `releaseProcessingActions` stores one compact JSON
evidence object per affected group or record, including the selected canonical ALS
record and ignored source variants where applicable. Inspect both through:

```bash
saanseoi reports:stats --source hkgov-dpo --type address
saanseoi reports:processing-actions --source hkgov-dpo --type address
```

The source release also persists presentation stats after consolidation: address count
and lifecycle churn, formatted-address coverage by locale, coverage of meaningful
optional label components (street name and number, village name, building, estate,
phase, and block), and counts by canonical district. Street and village names remain
separate coverage measures: village-addressed premises do not imply that a street name
was supplied. The district counts are keyed by canonical division ID so Atlas can join
them to the selected HAD district-area geometry without relying on display names.

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

## Conservative premise post-processing

ALS sometimes represents the same structural component in two incompatible ways: in
`EngBlock`, or embedded in a building name repeated from its estate (for example,
`LUNG MUN OASIS BLOCK 10` alongside estate `LUNG MUN OASIS`). Before identity creation,
the importer losslessly normalizes only an exact
`<estate> <BLOCK|BLK|HOUSE|TOWER> <single identifier>` form into structured block
fields, and removes a building name that exactly duplicates its estate. It never parses
free-form names such as `WEST GATE TOWER`, and it refuses an embedded form that
conflicts with an already populated structured block.

The original English and Chinese ALS premise JSON is retained unchanged for provenance;
the cleaned component fields and formatted service address carry the post-processing. If
two source variants resolve to the same reviewed canonical ID in one release, one
service row is retained, favouring the representation with more structured premise
detail. This is not spatial or address-string deduplication.

## ALS-to-ALS drift review

For historical ingestion, the command persists an ignored local identity history at
`.local/hkgov-dpo/als-identity-history.json` and human decisions at
`.local/hkgov-dpo/als-identity-decisions.json`.

Before its first prompt, historical ingestion performs a local, no-write preflight and
prints the total remaining identity-drift choices across every selected release.

When a new row has the same unambiguous continuity anchor (CSU/GeoAddress, district,
route, number/range, and rounded point) but a different premise identity, it is a
candidate drift. This catches changes such as building name, estate, phase, block, or
unit changes without silently assuming that the record is the same premise.

If the only changed component is that ALS has withdrawn a previously populated building
name, the importer automatically retains the existing ID. Building-name additions and
replacements still require review.

The importer also retains the existing ID when an identical name is reassigned between
the building-name and estate-name fields, with every other premise component unchanged.
A premise with a structured block descriptor and number is automatically treated as a
different address from an otherwise unqualified premise.

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

For this command, `--cohort-key` establishes the default start year (January 2025 here);
it is **not** applied to every address release. Each ALS release uses its source version
as its address cohort, while selecting the latest published same-year Overture division
cohort at or before that version, falling back to that year's first published cohort.
This is required because address and division uploads are sharded by year. Use
`--from-source-version YYYY-MM-DD.NNNN` to choose a later start. Unknown future drift
remains interactive.

It resumes safely after a successful local release: source versions with a published
local HKGov ALS release are skipped rather than uploaded again. The persisted ALS
identity history is not used as a skip marker, so resetting the local database correctly
re-ingests every release.

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
