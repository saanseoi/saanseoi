# HKGov ALS Address

This document describes the HKGov ALS-specific side of the address pipeline.

Related docs:

- [Address resourceType](../../resourceType/address.md)
- [ResourceType common processing](../../resourceType/common.md)

## Dataset Role

- Dataset metadata uses `publisherCode: hkgov-dpo`, `code: ds-hk-hkgov-dpo-address`.
- Raw ALS is not ingested directly by the canonical pipeline.
- The CLI treats every `als_addresses_*.geojson` 2D district file in a release directory
  as one logical dataset and transforms them into one prepared parquet file in
  `apps/harbour-cli/src/lib/hkgovAls.ts`.
- The local SQL pipeline then ingests that prepared parquet using shared code under
  `libs/core/src/pipeline/services/addressPipeline`.
- The upload records an upstream release-notes URL, using the shared local cache or an
  explicit `--release-notes-url`; see
  [ResourceType common processing](../../resourceType/common.md#upstream-release-notes).

In runtime terms, HKGov ALS currently acts as a richer reconciliation and overwrite
layer on top of the Overture base set.

The canonical address lineage is anchored to the Overture address dataset. An Overture
release establishes revision `r0`; the paired ALS release produces a later revision of
the same cohort and lineage. HKGov ALS remains the primary source of the enriched
revision, while the matching Overture release is recorded as an enrichment source when
one exists.

## Cohort and prerequisites

- The prepared address `cohortKey` is the Overture cohort, for example `2025-09-24.0`.
  The ALS acquisition version remains the source version, for example `2025-09-03.1043`.
- This keeps address and the supporting Overture division snapshot on one exact cohort.
- Every address upload requires a published, same-cohort division snapshot with
  `variant: overture`.
- A same-cohort Overture address release is used when available, but is not required for
  pre-September-2025 ALS history. Those releases can be prepared from a later identity
  bridge.

## Preparation Step

The CLI preparation step:

- reads all 2D ALS GeoJSON district files as a single release
- skips `als_addresses_3d_*` files
- first removes only identical source-feature objects, retaining the first occurrence
  and printing a table with each address and its one-based source-feature positions
- then consolidates rows that share the configured physical identity, retaining the
  richer record; this is reported separately from exact source deduplication
- builds a stable ALS identity from the normalized `GeoAddress`/CSU building identity
  plus building-number range; district and route names are matching evidence, not part
  of the permanent identity
- derives the stable source ID `ss-<uuid-v5>` from that identity
- resolves a canonical GERS/Overture UUID with the conservative matching policy below,
  or keeps the `ss-` ID as the provisional canonical ID
- resolves `areaId` and `districtId` from both English and Traditional Chinese division
  names
- carries the latest `divisionSnapshotId`
- serializes provenance into `sources`
- serializes `hkgovCsuId` into `identifiers`
- formats `zhHantFormattedAddress`
- formats `enFormattedAddress`
- writes a prepared parquet file for local SQL ingestion

Prep commands:

- `bun run --cwd apps/harbour-cli prep-hkgov-dpo <source-dir>`
- `bun run --cwd apps/harbour-cli prep-hkgov-dpo:preview <source-dir>`
- `bun run --cwd apps/harbour-cli prep-hkgov-dpo:production <source-dir>`

Command behavior:

- `sourceVersion` is inferred from either a `YYYY-MM-DD.NN` path segment or an ALS
  directory named `YYYYMMDD-HHMM-ALS-GeoJSON`; otherwise `--source-version` is required
- `--overture-release` accepts an Overture release code or cohort and derives the
  trailing Overture cohort key; `--cohort-key` can set it explicitly
- `--identity-bridge <file>` applies a previously generated bridge
- `--bridge-out <file>` writes all confidently resolved ALS identity-to-GERS mappings
- `--match-report <file>` writes a JSON report partitioning provisional identities into
  true no-candidate records and rejected near-matches with candidate UUIDs and reason
  codes
- a temp parquet file named `hkgov-hk-{sourceVersion}-address.parquet` is written before
  upload

Environment mapping:

- `prep-hkgov-dpo` reads from the local preview D1 database state
- `prep-hkgov-dpo:preview` reads from the remote preview D1 database
- `prep-hkgov-dpo:production` reads from the remote production D1 database
- `--db` overrides environment-based lookup and reads from a specified SQLite file
  directly

If the selected database does not yet contain the seeded PRC level-0 division:

- `countryId` is left `null`
- `areaId` and `districtId` can still be resolved

Prepared parquet fields include:

- `id`
- `canonicalId`
- `identityAlias`
- `identityBuildingId`
- `identityKey`
- `identityMatchMethod`
- `divisionSnapshotId`
- `countryId`
- `areaId`
- `districtId`
- `geometry`
- `identifiers`
- `sources`
- `geoAddress`
- `hkgovCsuId`
- English and Traditional Chinese formatted and component fields
- `easting`
- `northing`

## Local Pipeline Normalization

For each prepared ALS row, the local pipeline:

- uses prepared `id` (`ss-<uuid-v5>`) as the stable source ID
- uses prepared `canonicalId` as the canonical address ID
- trusts prepared `divisionSnapshotId`, `countryId`, `areaId`, and `districtId`
- parses prepared `geometry`, `identifiers`, and `sources` JSON
- leaves canonical `bbox` as `null`
- creates `en` and/or `zh-hant` i18n rows when formatted addresses exist
- carries building name, estate name, street name, and street number into canonical i18n
  rows

The local SQL processor reads prepared parquet rows in small write batches and reads
2,048-row parquet windows from the CLI-side cached file.

Large address releases are processed as local parquet chunks. Each chunk carries one row
range (`rowStart`, `rowEnd`) plus a stable `processingRunStartedAt` marker. The shared
chunking, release-ordering, and local SQL lifecycle are documented in
[ResourceType common processing](../../resourceType/common.md).

The local processor still executes each row range through separate stage services:
`normalize`, `source`, `history`, `current`, and `finalize`. Normalized and resolved
chunk artifacts are stored under `.local/harbour-sql/releases/...` so later stages do
not need to re-decode parquet or repeat source normalization work.

For current-row cleanup, processed canonical rows are touched with the stable run marker
and processed source rows are advanced to the current release ID. Final cleanup can
therefore scan current rows in keyset pages without retaining the full release ID set in
memory.

The staged SQL import builder can emit HKGov ALS source SQL from normalized address
artifacts. It stages prepared raw payloads and localized rows, computes changed source
IDs in SQL, closes prior source rows, and inserts current source rows with
`INSERT ... SELECT ... ON CONFLICT`. Canonical history/current SQL is built from
resolved artifacts after TypeScript has performed canonical ID resolution and
`versionHash` generation.

The local SQL path also emits and imports meta SQL artifacts for snapshot metadata and
identity aliases before publish. For every confidently matched row it stores the stable
`ss-` identity as an `address` alias of the canonical GERS UUID. Transient local SQLite
lock failures are retried with backoff before the upload is failed. Local SQL imports
retry up to eight times; Harbour progress/control calls use the lower Harbour retry
limit.

This means HKGov ALS currently contributes the richer text model:

- `formattedAddress`
- `buildingName`
- `estateName`
- `streetNumber`
- `streetName`
- both `en` and `zh-hant` when available

## Identity matching and alias lifecycle

Preparation resolves identities before SQL ingestion:

1. Address-number matching uses the first component: ALS `23` to `25`, `23/24`, and
   `23-25` all match Overture number `23`. The complete ALS range remains part of the
   stable physical identity.
2. A unique same-district street-number match at the same point (coordinates rounded to
   five decimal places) selects the Overture/GERS UUID.
3. Otherwise, a unique same-district street-number match selects it.
4. Otherwise, a supplied bridge mapping selects its previously confirmed UUID.
5. Ambiguous or unmatched rows retain their deterministic `ss-<uuid-v5>` ID.

No ambiguous candidate is selected arbitrarily. If two ALS identities claim one live
GERS UUID, both remain provisional. A disagreement between a bridge and a live unique
match fails preparation for manual review.

Each later preparation retests provisional identities. When an `ss-` identity is
promoted to a GERS UUID, the `ss-` value is inserted into `entityAliases` as a permanent
address alias. Previously published history is not rewritten; alias resolution connects
old IDs to the current canonical identity. Existing registry aliases are loaded
automatically during later preparation runs and are never remapped by an import. A
bridge generated from a post-GERS release can therefore be supplied while preparing the
January-August 2025 archive.

The generated bridge is a versioned JSON interchange artifact rather than a fixture: it
can contain hundreds of thousands of identity mappings and is tied to the selected
Overture release in its metadata.

The optional match report is also versioned JSON. `noMatches` contains provisional ALS
records for which no plausible Overture candidate exists. `nearMatches` contains
provisional records with candidate metadata and one or more rejection reasons, such as
multiple exact coordinate candidates, multiple address candidates, a differing address
at the same coordinate, or multiple ALS identities claiming one GERS UUID. Candidate
details are capped at 25 per record; `candidateCount` and `candidatesTruncated` preserve
the complete cardinality.

Once prepared, the pipeline writes directly to `canonicalId`. Its older street-key
fallback remains available for legacy prepared files that do not contain a canonical
mapping.

Current canonical/source state is queried only for the source IDs and street-key
candidates in the active parquet batch. The local pipeline does not preload the full
current address or source-address table before ALS processing starts.

HKGov ALS does not currently drive canonical deletion:

- missing ALS rows do not close canonical current versions

## Source Retention

HKGov ALS-specific source rows are retained in:

- `hkgovAlsAddresses2d`
- `hkgovAlsAddress2dI18n`

Shared source-version behavior is documented in
[ResourceType common processing](../../resourceType/common.md#source-retention).

Current retained source fields include:

- `sourceRecordId`
- `versionHash`
- `releaseId`
- `validFromRelease`
- `validToRelease`
- `isCurrent`
- `identifiers` JSON with `geoAddress` and `csuId`
- `easting`
- `northing`
- `geometry`
- `districtCode`
- `districtName`
- `estateName`
- `buildingName`
- `blockNumber`
- `blockDescriptor`
- `phaseName`
- `phaseNumber`
- `floor`
- `unit`
- `streetNumber`
- `streetName`
- `villageName`
- `sources` JSON
- `rawProperties`

Localized source retention stores:

- `formattedAddress`
- `buildingName`
- `buildingNumberFrom`
- `buildingNumberTo`
- `blockType`
- `blockNumber`
- `blockTypeBeforeNumber`
- `phaseName`
- `phaseNumber`
- `estateName`
- `streetNumber`
- `streetName`
- `districtName`

## SQL Import Mode

ALS address ingestion writes generated import files under the local release cache in
`.local/harbour-sql/releases/<target>/<releaseCode>/`. The shared local SQL upload,
import ordering, and rollback behavior are documented in
[ResourceType common processing](../../resourceType/common.md).
