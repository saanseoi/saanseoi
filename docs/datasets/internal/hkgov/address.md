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
  dependency. The addresses composition, rather than the ALS source dataset, declares
  that lookup requirement and its selection rule.
- The addresses API has one composition domain, `official`; its release codes therefore
  do not include a domain suffix.
- The CLI reads all 2D district GeoJSON files in one ALS release. It skips the separate
  `als_addresses_3d_*` file.

The automatic updater queries the DATA.GOV.HK historical file-version endpoint for the
official `ALS-GeoJSON.zip` resource. It treats the newest publisher timestamp as the new
release and earlier available timestamps as download-only archive packages. On a
confirmed new local release it downloads the exact ZIP, unpacks it into its timestamped
ALS source directory, then invokes `hkgov-dpo:ingest` for the existing identity review
and upload workflow. Archive-package downloads never upload by themselves. The query
ends on the previous UTC day because the archive API does not accept the current day. A
successful response whose body is truncated or otherwise invalid JSON is retried before
the DPO check is reported as an error.

The updater applies a ten-minute and 2 GiB compressed-download limit, validates ZIP
member names, counts, expanded sizes and compression ratios before extraction, and
recreates the timestamp-specific extraction directory on retry. A truncated, revised or
failed extraction therefore cannot leave stale GeoJSON members in a later intake.

When an addresses update is selected, the updater reads the composition dependency
graph, adds the required Overture division provider when necessary, and processes it
first. The address snapshot then records the exact division source release selected for
canonicalisation as a lookup input.

ALS directory names carry an upstream delivery time (`YYYYMMDD-HHMM`), but address
release versions use `YYYY-MM-DD.N`: the first release for a date is `.0`, and further
same-day releases increment `N` in delivery-time order. The delivery time is not itself
a correction number.

## Remote updater hand-off

`hkgov-dpo:backfill-local` deliberately rejects preview and production targets. It
currently discovers the applicable same-year Overture division snapshot by reading the
local databases, then prepares ALS and runs the normal uploader locally. To support
`saanseoi update --target preview|production`, split that responsibility into a
target-neutral preparation stage and a target-aware publication stage:

1. Keep download, ZIP extraction, ALS identity history, identity-decision review, and
   source preparation on the operator machine. These deterministic source-processing
   concerns must not depend on the selected target.
2. Resolve the required Overture division cohort from the selected target's published
   release metadata, rather than from local SQLite. Retain the current rule: use the
   latest same-year division cohort not later than the ALS source version, otherwise the
   first same-year cohort.
3. Pass that resolved cohort explicitly into preparation and publication. A local
   division database must not silently choose a different dependency for preview or
   production.
4. Invoke `runUploadCommand` with the requested target after identity review. Preserve
   the source version, address cohort, release-notes URL, processing actions, and
   snapshot-cleanup behaviour.
5. Keep `hkgov-dpo:backfill-local` as a local convenience wrapper; introduce a
   target-neutral `hkgov-dpo:ingest` command for updater use instead of broadening the
   old command's local assumptions.

Required tests: target-specific division-cohort selection, refusal when no same-year
division snapshot exists, identical local/remote prepared identities for the same ALS
input, and preview/production publication using the explicitly resolved cohort.

## Exact duplicate handling

ALS releases occasionally contain the same GeoJSON feature object more than once. The
preparer removes only exact feature-object duplicates (the same parsed JSON value),
retains the first occurrence, and reports only aggregate CLI counts: affected premises,
source features involved and removed, and source files involved. It does not print
canonical records or ignored-variant JSON to the terminal; that structured audit
evidence remains available through the processing-actions report.

No general coordinate-, `GeoAddress`-, street-, or number-based collapsing is performed.
Two rows at the same point can represent distinct ALS premises, such as blocks, towers,
facilities, or named buildings, and must remain separate address records. This includes
a singleton number that repeats an endpoint of a number range: the importer retains both
records because it cannot establish that they are duplicates. The only additional
consolidation is a representation variant whose complete granular premise identity is
identical. If the variants differ because `EngBlock.BlockDescriptorPrecedenceIndicator`
is missing in one source feature and present in another, the importer deterministically
retains the feature with the indicator present. Other same-premise representation
variants are printed separately from exact feature duplicates.

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

At an annual history-shard boundary, lifecycle churn is compared with the current
records from earlier shards as well as the new shard. The first release of a year
therefore reports changes from the prior release rather than treating the whole source
dataset as newly added.

Lifecycle churn excludes release-specific provenance and ingestion bookkeeping,
including the release cohort, input file path and position, resolved identity metadata,
and selected division snapshot. Those values remain stored for audit, but a new delivery
does not count as a changed address solely because it has a new release context. The
source assertion hash still includes the publisher address representation, coordinates,
identifiers, and projected address fields, so an actual ALS record change creates a new
version.

The source assertion keeps the original bilingual ALS properties unchanged in
`rawProperties`. Its paired `addressEn` and `addressZhHant` fields record the
reproducible address-component projection for that exact evidence; only canonical
address snapshots materialise locale-keyed rows.

## Stable ALS premise ID

Each retained row receives `ss-<uuid-v5>`. The UUIDv5 input is a normalised premise
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
the importer losslessly normalises only an exact
`<estate> <BLOCK|BLK|HOUSE|TOWER> <single identifier>` form into structured block
fields, and removes a building name that exactly duplicates its estate. It never parses
free-form names such as `WEST GATE TOWER`, and it refuses an embedded form that
conflicts with an already populated structured block.

Before applying that per-record cleanup, the importer examines the release's English
building names. When a name family uses an unambiguous trailing Roman numeral (for
example, `INTERNATIONAL ENTERPRISE CENTRE II`), every same-family trailing Arabic
building number is rendered as a Roman numeral (`INTERNATIONAL ENTERPRISE CENTRE 1`
becomes `INTERNATIONAL ENTERPRISE CENTRE I`). The importer applies the same rule to
structured English `BLOCK`/`BLK`, `HOUSE`, and `TOWER` numbers, scoped to their estate
or building family. Single-letter values such as `C` or `D` are treated as block labels,
not Roman numeral evidence. It does not alter unrelated numeric names or structured
numbers. Each changed retained address is stored as an automatic
`als_building_name_roman_numeral_normalised` or
`als_premise_number_roman_numeral_normalised` processing action, including the original
and normalised component value plus the complete peer source value that established the
Roman-numeral style.

The original English and Chinese ALS premise JSON is retained unchanged for provenance;
the cleaned component fields and formatted service address carry the post-processing. If
two source variants resolve to the same reviewed canonical ID in one release, one
service row is retained, favouring the representation with more structured premise
detail. This is not spatial or address-string deduplication. The processing action
records the exact source-representation fields that differed, including premise fields,
coordinates, and easting/northing, so the audit does not need to infer its explanation
at display time.

Formatted addresses use a street number and name when ALS supplies a street; otherwise
they use the village number, village name, and location name. This ensures village-only
premises retain their addressable route rather than being reduced to district and
region.

Canonical 2D components use `buildingNumberFrom` and `buildingNumberTo` for both street
and village premises; no synthetic `streetNumber` is stored. ALS does not publish a
range connector, so an ALS range stores only its supplied endpoints. Exact
building-number lookup rows retain those endpoints; a later parser may derive interior
members only when an explicit connector establishes a range.

## ALS-to-ALS drift review

For historical ingestion, the command reads and persists the human identity decisions in
the version-controlled
[`hkgov-dpo-address.json`](../../../../fixtures/meta/curations/hkgov-dpo-address.json)
curation fixture by default. The identity history is a derived local replay index at
`.local/hkgov-dpo/als-identity-history.json` and remains ignored.

Before its first prompt, historical ingestion performs a local, no-write preflight and
prints the total remaining identity-drift choices across every selected release.

When a new row has the same unambiguous continuity anchor (CSU/GeoAddress, district,
route, number/range, and rounded point) but a different premise identity, it is a
candidate drift. This catches changes such as building name, estate, phase, block, or
unit changes without silently assuming that the record is the same premise.

If, and only if, every other identity component is unchanged, the importer retains the
existing ID when ALS drops a building name, estate name, or phase name. Each automatic
retention is recorded as an `als_address_component_withdrawal_matched` processing action
with the dropped field and its prior value; other identity changes remain subject to
review.

If the only changed component is that ALS has withdrawn a previously populated building
name, the importer automatically retains the existing ID when that name does not
identify a qualified site part. Dropping a qualified `BLOCK`, `TOWER`, `HOUSE`, `VILLA`,
`HALL`, or equivalent numbered/positional site part produces a new ID unless the part is
transferred into structured block fields or the estate name. Building-name additions and
replacements still require review unless they match one of the automatic site-part or
descriptive-detail rules below.

The importer also retains the existing ID when an identical name is reassigned between
the building-name and estate-name fields, with every other premise component unchanged.
A premise with a structured block descriptor and number is automatically treated as a
different address from an otherwise unqualified premise.

The same distinction applies when ALS adds an unstructured trailing site-part qualifier
to a building name: a numeric, alphabetic, alphanumeric, or Roman-numeral qualifier; a
cardinal or intercardinal direction; or `HIGH`, `LOW`, `CENTER`, `CENTRE`, or `MIDDLE`
with a block, tower, villa, house, or HSE identifies a part of the previously whole
building or estate and receives a new ID. This rule takes precedence over older
retention decisions recorded before the distinction was automated. Other building-name
changes still require review.

The site-part rule also covers `STAGE`, `WING`, `SECTION`, `HALL`, and written block
numbers such as `ONE` and `TWO`. A first phase or stage (`I`, `1`, or `A`), including a
range beginning with that member, is treated as additional specification and retains the
ID when it is the complete added qualifier; a later range such as `PHASE II/III`
receives a new ID. A first-phase/stage qualifier combined with an otherwise unclassified
facility detail remains manual. Separate `3A` and `3B` premises receive new IDs, while
one aggregate `3A/3B` description retains its ID. Adding a recognised location,
`CENTRAL`, a branch or campus description, or a legal name suffix such as `LIMITED`
retains the ID when the street address is unchanged. Sponsorship wording remains a
manual decision. A `BLOCK`, `TOWER`, `HOUSE`, `HALL`, `SECTION`, `STAGE`, `WING`, or
`PHASE` without a sequence or positional member is not by itself a site-part decision;
it remains manual unless it is a recognised descriptive addition. Written block or
building numbers are converted to the family's established Roman-numeral style in the
same scoped way as Arabic numbers.

Identity history is evaluated as a release chain. When several earlier releases share a
continuity anchor, the latest earlier release is the canonical predecessor for the next
unambiguous change, so a reviewed `keep-existing-id` decision carries the same canonical
ID through successive renames. If the latest earlier release contains multiple
identities for that anchor, the importer refuses to choose between them and does not
automatically link the new record to either identity.

When a later release repeats an identity key that was previously retained under another
canonical ID, the importer reuses that canonical ID from identity history without asking
for the same decision again.

Interactive imports show the old and new relevant details and require one choice:

- **Keep existing ID** — record a versioned decision and retain the prior `ss-` ID.
- **Generate a new ID** — record that the later row is a different premise.

With `--yes`, the command does not guess: it stops before that release's database write
and writes `.local/hkgov-dpo/identity-drift/{source-version}.json` for review. It prints
the exact interactive command for that source version; after its decisions are saved, a
later `update --yes` can continue non-interactively. Because the decisions file is
checked in, review and commit any changes to it together with the ingestion result. A
changed CSU/GeoAddress, route/name or number, district, coordinate movement, or several
possible historic candidates does not automatically link records.

## Commands

The local database must first contain a published Hong Kong division snapshot in its
current tables. This is a division dependency, not an Overture-address dependency. After
the normal local reset, use the current published `2025-12-17.0` division cohort.

Prepare one release (no database mutation):

```bash
bun run dataops -- hkgov-dpo:prepare \
  data/hkgov/dpo/ALS/20260710-1054-ALS-GeoJSON \
  --target local --cohort-key 2025-12-17.0 \
  --identity-history .local/hkgov-dpo/als-identity-history.json \
  --identity-decisions fixtures/meta/curations/hkgov-dpo-address.json \
  --identity-drift-report .local/hkgov-dpo/identity-drift/2026-07-10.0.json
```

Ingest all ALS release directories in chronological order into local D1:

```bash
bun run dataops -- hkgov-dpo:backfill-local \
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
local HKGov ALS release are skipped rather than uploaded again. Pass `--force` to
reprocess and replace those local releases when processing-action evidence changes. The
persisted ALS identity history is not used as a skip marker, so resetting the local
database correctly re-ingests every release.

`hkgov-dpo:backfill-local` is the explicit exception for a missing older ALS release. It
registers that release as an independent historical address cohort, so it does not
supersede the newer active source release or replace the current Addresses API cohort.
It treats later superseded ALS releases as already complete, so a run beginning before a
gap processes the missing release rather than reprocessing the rest of the series. The
normal `hkgov-dpo:ingest` command remains chronological and continues to reject an older
source version.

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
normalisation, source, history, current, and finalise stages.
