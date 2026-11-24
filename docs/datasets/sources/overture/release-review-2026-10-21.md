# Overture October 2026 release review

Status (18 November 2026): all 45 regional Parquets are available and validated in
`data/overture/2026-10-21.0/`. The current local update applies October directly to the
September state. All three Division outputs, Places and supplementary Addresses have
published locally. Production still serves September and remains subject to review.

## Current local ingestion

Current evidence is retained in `.local/overture-october-ingestion/`. The older October
rehearsal and recovery results below describe that separate attempt.

- `baseline.json` identifies eight verified pre-ingestion SQLite backups and the
  stored-object/sidecar archive on the external disk. This is the recovery baseline for
  the current run.
- `entry-ledger-backup.json` identifies the hash-verified original supplementary Address
  ledger. Recovery must also restore it to
  `.local/overture-places/address-entries/local.json`. The field-name repair recorded in
  `entry-ledger-migration.json` preserves all Address IDs and identity keys.
- `update-divisions-retry.log` records successful local publication of Division,
  Division Area and Division Boundary for `2026-10-21.0`.
- `update-places-finalisation.log` records delivery of all 6,719 sealed Places SQL
  batches and successful candidate, dependency and history-replay validation. It ends at
  a post-publication search schema error; it is not the final completion record.
- `address-search-index-rebuild.json` records the transactional repair of the local
  derived Address search index from `estateName` to `premisesName`. Canonical records
  were not changed by that repair.
- `reconcile-completed-delivery.log` records successful supported reconciliation and
  calculation of 1,541 statistics rows. `delivery-completion.json` records verification
  of all retained batches before closing delivery ownership;
  `finalisation-completion.json` records the completed processing lifecycle.
- `verification.json` records clean foreign keys across eight databases, no active
  processing runs, current October publications, 200,988 Place search rows and a ready
  Address substring index. Places contains 147,599 processed records from 147,619 input
  rows. Search queries against both derived indexes return results.
- `dev-api-release-reports.json` confirms all five local October resource releases are
  current. `production-api-release-reports.json` confirms production remains on
  `2026-09-23.0`, using authenticated read-only requests.
- `final-audit-summary.json` links the completed external audit: 284,673 inserted,
  145,295 updated and 14,905 deleted ordinary rows across 62 tables in eight databases.
  These totals include source, history and metadata tables. The external
  `final-audit/row-images.jsonl` retains typed before/after images, keys and row hashes;
  virtual/shadow indexes are inventoried and covered by the whole-database backups.
- `current-state.json` records completion. The owned ingestion server is stopped.

The memory improvements bound candidate explanations, share identical identity evidence,
stream ledger writes and comparisons, and cache identity preparation only against the
exact source, predecessor and computation contract. Focused tests pass; full CLI
typechecking still reports unrelated errors in scheduling tests, the Address substring
index and the provenance search index.

The interrupted Address delivery retained 171 deletion events. The draft retry now
includes these exact-snapshot events when reconstructing the materialisation hash;
`materialisation-diagnosis.json` proves equality with the sealed plan. The focused
interruption regression passes without relaxing the delivery guard.

Hong Kong is the registered ingestion scope. Macau and Guangdong inputs are retained;
Guangdong coverage is broader than a GBA clip. Their empty Address Parquets are valid
source results and do not mean their other themes are missing.

Recovery must run under a write freeze and restore the matched database, stored-object,
sidecar and supplementary-ledger baseline together. The current run has not yet proved
selective rollback or production recovery. Production promotion requires a fresh
production baseline and target-specific SQL; local SQL plans are not remote plans.

## Availability evidence

Rechecked on 22 October 2026 at approximately 16:30 HKT (08:30 UTC):

| Check                                                                                 | Result                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bun ../overturist/overturist.ts releases --format json`                              | `2026-10-21.0` is available                              |
| Public S3 listings for `division`, `division_area`, `division_boundary`, `place`      | Non-empty Parquet objects exist for all four input types |
| [STAC catalogue](https://stac.overturemaps.org/catalog.json)                          | Latest is `2026-10-21.0`                                 |
| [October release notes](https://docs.overturemaps.org/blog/2026/10/21/release-notes/) | HTTP 200; data `2026-10-21.0`, schema `2.0.0`            |

The checks establish publisher availability, not completeness or validity of the
regional extracts. Downloads are pinned to `2026-10-21.0` and staged under
`.local/overture-release-2026-10-21/downloads/`.

The checked-in Hong Kong dataset fixtures deliberately skip `2026-09-23.1`. Retain that
decision; it is not the October release.

## Scope and local baseline

Download scope: Hong Kong, Macau and Guangdong, using the sibling Overturist checkout.
Retain the publisher payloads, extraction provenance, spatial options, checksums and
per-type counts separately for each region.

The current SaanSeoi Overture adapter has a fixed Hong Kong division ID and output path.
Only `ds-hk-overture-division` and `ds-hk-overture-place` are registered. Macau and
Guangdong downloads must not be passed to these Hong Kong dataset registrations.
Publishing additional regional datasets requires an explicit scope decision and their
own registrations and storage configuration.

Read-only inspection of local `DB_META` found:

- Divisions: 13 source releases, latest `2026-09-23.0`.
- Places: 12 source releases, latest `2026-09-23.0`.
- All 83 source releases current; resource releases current or archived.
- All 1,039 processing runs completed; the bootstrap metadata blocker check returned no
  incomplete releases, draft snapshots/release sets or queued/running processing runs.

These observations are not proof of production equality, data integrity or absence of
external writers. Refresh them immediately before taking the rehearsal baseline.

The following discovery attempt exited with status 1 because both local target release
reports were unavailable. No ingestion ran:

```fish
./bin/saanseoi update --target local \
  --dataset ds-hk-overture-division,ds-hk-overture-place \
  --check-now --no-upload --yes
```

Transcript: `logs/update-20261021T022008.595Z.log`. Island curation reported 257
geometry-ready islands and no pending decisions or uncurated names. Establish the
authenticated local Harbour API report before retrying. `--no-upload` is not a general
read-only flag: the updater can download inputs and write check state.

## Release-note preparation

Final source-release notes belong in `fixtures/meta/releases/ds-hk-overture-division/`
and `fixtures/meta/releases/ds-hk-overture-place/`, with English, Traditional Chinese
and Simplified Chinese sections following the existing manifest format. Do not create
publishable October fixtures with guessed schema versions or copied September changes.

| Theme     | Publisher evidence required                                                                | SaanSeoi review evidence required                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Divisions | October theme notes, schema version, OSM cut-off, announced changes to all three types     | Regional additions/removals/changes by stable ID and content; hierarchy and country-anchor integrity; geometry periods; exclusions and island curation                       |
| Places    | October theme notes, schema version, provider/coverage changes, taxonomy and field changes | Regional additions/removals/changes by stable ID and content; names and taxonomy; exact Division cohort; supplementary Addresses; ALS references; spatial and search indexes |

Working note status for both themes: **Translated source fixtures prepared; canonical
regional impact review pending.** Global upstream counts or churn must be labelled
global; they do not establish changes in Hong Kong, Macau or Guangdong. Schema
compatibility and the three translations need review against the published October
content before notes are accepted.

## Draft source release notes

The following draft changelogs are based on the published October notes. All numerical
changes below are **global publisher figures**, not measured regional changes. They are
ready for editorial review, but do not assert successful SaanSeoi publication.

### Divisions draft — English

- Overture data `2026-10-21.0` uses schema `2.0.0`; the OSM cut-off is 13 October 2026.
- Added names sourced from ESRI Community Maps, alongside mostly minor, incremental
  changes.
- Global counts: 4,700,999 divisions (+0.27%), 1,084,259 division areas (+0.33%) and
  87,536 division boundaries (+0.01%). Global GERS churn is 0.45%, 0.56% and 0.04%,
  respectively.

### Divisions draft — Traditional Chinese

- Overture 資料版本 `2026-10-21.0` 採用 schema `2.0.0`；OSM 資料截止日期為 2026 年 10 月
  13 日。
- 新增來自 ESRI Community Maps 的名稱，其他更新主要為小幅、漸進式調整。
- 全球共有 4,700,999 個區劃（+0.27%）、1,084,259 個區劃範圍（+0.33%）及 87,536
  條區劃邊界（+0.01%）。各類型的全球 GERS 識別碼變動率分別為 0.45%、0.56% 及 0.04%。

### Divisions draft — Simplified Chinese

- Overture 数据版本 `2026-10-21.0` 采用 schema `2.0.0`；OSM 数据截止日期为 2026 年 10 月
  13 日。
- 新增来自 ESRI Community Maps 的名称，其他更新主要为小幅、渐进式调整。
- 全球共有 4,700,999 个区划（+0.27%）、1,084,259 个区划范围（+0.33%）及 87,536
  条区划边界（+0.01%）。各类型的全球 GERS 标识码变动率分别为 0.45%、0.56% 及 0.04%。

### Places draft — English

- Overture data `2026-10-21.0` uses schema `2.0.0`.
- Global Place coverage grew by 8.55%, from 81,455,423 to 88,418,121 records, driven by
  BrightQuery expansion across Western Europe and new providers Uberall, Birdeye and
  OpenTravel.
- Operating status is selected by majority vote across contributing sources. The
  `sources` field identifies contributing provenance under
  `/properties/operating_status`. Global operating-status coverage rose from 23.74% to
  32.54%.
- Global GERS churn is 11.92%: 8,335,526 additions and 1,372,826 removals. Provider
  replacement can also change content while preserving the GERS ID; local review must
  compare content as well as identifiers.

### Places draft — Traditional Chinese

- Overture 資料版本 `2026-10-21.0` 採用 schema `2.0.0`。
- 全球地點數量由 81,455,423 增至 88,418,121，增幅為 8.55%，主要來自 BrightQuery
  在西歐擴展覆蓋，以及新增 Uberall、Birdeye 和 OpenTravel 資料來源。
- 營運狀態按各個資料來源的多數意見決定；`sources` 欄位透過
  `/properties/operating_status` 記錄來源依據。全球營運狀態覆蓋率由 23.74% 增至 32.54%。
- 全球 GERS 識別碼變動率為 11.92%，新增 8,335,526 個地點，移除 1,372,826
  個。資料來源替換亦可能在保留 GERS ID
  的同時更改內容，因此本地審核須同時比較內容及識別碼。

### Places draft — Simplified Chinese

- Overture 数据版本 `2026-10-21.0` 采用 schema `2.0.0`。
- 全球地点数量由 81,455,423 增至 88,418,121，增幅为 8.55%，主要来自 BrightQuery
  在西欧扩展覆盖，以及新增 Uberall、Birdeye 和 OpenTravel 数据来源。
- 营运状态按各个数据来源的多数意见决定；`sources` 字段通过
  `/properties/operating_status` 记录来源依据。全球营运状态覆盖率由 23.74% 增至 32.54%。
- 全球 GERS 标识码变动率为 11.92%，新增 8,335,526 个地点，移除 1,372,826
  个。数据来源替换也可能在保留 GERS ID
  的同时更改内容，因此本地审核须同时比较内容及标识码。

## Recovery implementation requirements

The SQL planner in `apps/harbour-cli/src/lib/pipeline/local/netSqlitePlan.ts` already
copies baselines, calculates per-table insert/update/delete counts, replays batches and
checks foreign keys and candidate equality. Its temporary directory is removed after
success. `SAANSEOI_KEEP_FAILED_NET_PLAN=1` retains failed plans only. These temporary
artefacts do not satisfy durable release recovery requirements.

Before ingestion, prepare and verify the following:

1. Freeze ingestion, cleanup and other relevant writers; record their state. Identify
   exact database bindings/IDs, source release pins, active snapshots/API release sets,
   R2 buckets and pending SQL deliveries. Resolve pending deliveries before starting.
2. Take SQLite online backups of the local databases while application writers are
   quiescent, including `DB_META`, `DB_CURRENT` and every configured source/history
   shard. Quiescence is necessary for a consistent multi-database baseline. Include
   local R2, membership sidecars, delivery receipts and caches needed to reset the run.
   Do not copy a live SQLite main file without accounting for its WAL.
3. Retain an immutable baseline and a separate working copy. Local paths are rooted at
   `.local/d1/dev`; an isolated checkout needs its own complete local persistence and
   API configuration. Prove that every writer targets the disposable copy before running
   `saanseoi update --target local`.
4. Persist a release-owned manifest before delivery. For every affected table, record
   the binding, primary/composite key, operation and full before-image for updates and
   deletions. Record keys and expected after-image digests for inserts and updates.
   Include source/current/history rows, translations, relationships, spatial indexes,
   search state, supplementary Addresses, release/snapshot metadata and publication
   pointers. Use a sidecar journal rather than adding marker columns to product rows.
5. Derive the affected-table inventory from the actual generated plans and compare all
   database tables before/after the rehearsal. Capture mutations outside the net SQL
   planner too. Record every created R2 key and the previous bytes/digest of any
   replaced object; do not delete shared content-addressed objects during recovery.
6. Build an inverse operation in foreign-key-safe order. It must refuse stale recovery
   if current values no longer match the expected after-images. Prove recovery of
   updated/deleted rows and removal of newly inserted rows on the disposable copy,
   including previous publication pointers and unrelated-row equality.
7. Retain complete database backups as a fallback. A full restore is coordinated
   recovery during a write freeze, not a selective rollback that preserves later work.
   Before production, capture fresh production backups and supported recovery points for
   every affected database; the local clone cannot substitute for these.

The complete partial-run audit now retains typed before/after images and created keys
across all eight databases. Whole-environment restoration passed checksum and
authenticated API verification. Selective inverse recovery has not been exercised;
whole-state recovery requires a write freeze and does not preserve subsequent unrelated
writes.

## Preparation completed on 22 October

- Hong Kong extraction completed: 1,819 divisions, 142 areas, 66 boundaries and 147,619
  Places. All IDs are unique within their type and none has null geometry. Retained
  inputs and checksums are under `data/overture/2026-10-21.0/`.
- Raw source-ID comparison with September found 8 added and 6 removed divisions, no
  added/removed areas or boundaries, and 8,078 added Places with no removed Place IDs.
  Whole-row comparisons include publisher version/provenance values and must not be
  reported as canonical SaanSeoi content changes.
- DuckDB column descriptions matched September, but the strict upload inspector found
  different Parquet `REQUIRED` flags. The exact October profiles are registered
  separately, including the prepared Division country-reference row. All four real Hong
  Kong inputs pass the strict validator; 78 schema/upload tests passed. No general
  nullability relaxation was introduced.
- Macau's first boundary query timed out against S3. Overturist then attempted to expand
  to China. That task-owned process was stopped; the retry uses a supervisor that
  rejects parent-boundary fallback. A timeout is not evidence of an absent Macau
  boundary. The guarded Macau retry and Guangdong extraction both completed
  successfully.
- Macau retained 74 divisions, 14 areas, 16 boundaries and 13,227 Places; Guangdong
  retained 46,570 divisions, 2,414 areas, 67 boundaries and 28,156 Places. All source
  IDs are unique within each type and no geometries are null. Macau adds 637 Place IDs;
  Guangdong adds 1,329, with no removed Place IDs in either extract. All twelve regional
  Parquet files are retained with SHA-256 manifests under `data/overture/2026-10-21.0/`.

- Prepared October source-release fixtures for Divisions and Places in English,
  Traditional Chinese and Simplified Chinese, using schema `2.0.0` and the published
  October changelog. The release-note tests passed (8 tests).
- Retained online SQLite backups of all eight local D1 bindings under
  `.local/overture-release-2026-10-21/baseline-20261022/`. Every backup passed
  `quick_check` and has a SHA-256 digest; source `data_version` values remained
  unchanged throughout the backup window.
- Retained a separate local R2 baseline with a file checksum manifest. Also retained 212
  membership/crosswalk sidecar files with checksums; the reset initially omitted these,
  so they were restored before the Places run. This is local recovery material, not a
  production backup.
- Created an isolated working copy at `.local/overture-release-2026-10-21/rehearsal/`,
  including local persistence. Its Harbour API runs on port 8788 with remote bindings
  disabled. Authenticated release reports returned 39 Division resource releases and 24
  Place/Address resource releases, with latest source version `2026-09-23.0`.
- Recorded the rehearsal source-file digests, preserving the concurrent checkout edits
  as a separate snapshot. Production must use a reviewed implementation; the original
  checkout has unrelated in-progress ingestion changes.
- Prepared a read-only row-audit utility in the local evidence directory. Its focused
  test covers inserted, updated and deleted rows, composite keys, rowid tables, blobs,
  nulls and exact 64-bit integers. It retains typed before/after images and row digests.
  Virtual/search shadow tables require the retained database baseline or a separately
  validated index rebuild. No production inverse has been authorised or tested.

The initial net SQL planning attempt exhausted the capacity of RAM-backed `/tmp` while
copying the 27 GB current database. That failed working state is retained separately.
The retry uses an absolute on-disk `TMPDIR` after resetting all eight databases and
local R2 from the baseline. The retry completed all three Division outputs;
authenticated release reports show October Division, Division Area and Division Boundary
as current in the same `2026-10-21.0` cohort. Places is blocked by identity review;
whole-environment recovery passed verification. The presence of backup files and passing
unit tests does not establish update readiness.

## Rehearsal and promotion gates

Run Divisions before Places, retaining the exact new Division cohort required by Places.
Do not add unrelated sources through a broad family update. The two dataset
registrations cover five outputs: Division, Division Area, Division Boundary, Place and
supplementary Address.

After source and notes review, run the exact selected datasets through `saanseoi update`
on the disposable local target. Verify all expected resource releases, snapshots and API
release sets, then check public current and historical API responses, foreign keys,
source provenance and referenced R2 objects. Compare every changed table with the
retained baseline and explain unexpected deletions or missing outputs.

Exercise interruption/resume at meaningful delivery boundaries and rerun the successful
update to demonstrate no duplicate publication or unintended data mutations. Restore the
baseline, repeat the clean update, rehearse the inverse, and prove logical row and
publication equality after recovery. Keep the reports and hashes for review.

Production remains gated on review of those concrete results. The production attempt
must use the reviewed source bytes and code, fresh production state checks and backups,
and the same exact dataset selection. Verify live API and asset results after promotion;
a command exit code or local rehearsal alone is not completion.

## Partial rehearsal outcome

The Division updater completed and authenticated reports confirmed all three October
outputs as current. Places stopped before publication with 13,878 unresolved identity
reviews: 4,027 identity changes, 3,858 outside the proximity allowance, 3,613 ambiguous
close matches and 2,380 contradictory components. No October Place or supplementary
Address output is published. Detailed cases are retained in
`.local/overture-release-2026-10-21/evidence/overture-place-address-review.json`.

The existing investigation path can retain publisher data without asserting an Address
link. This requires an explicit decision; it was not enabled for this run.

The complete ordinary-table audit is retained in `partial-run-audit-v2/row-images.jsonl`
and `summary.json` under the task directory. It records exact typed before/after images,
inserted keys and image digests across all eight databases. Virtual/search shadow tables
are covered by whole-database recovery. All eight post-run foreign-key checks passed. R2
gained 44 object keys, with no replaced or deleted objects; multipart state is also
captured in `partial-run-r2-audit/`.

The Division audit found six removed identities and 322 deleted translation rows. Of
these, 293 belong to the China reference identity: the scoped source uses the reviewed
fallback fixture with three language names. This reduction needs explicit review;
publication success alone does not establish acceptable content. Details are in
`evidence/deleted-division-translations.json`.

The partial databases and object store are preserved at
`rehearsal/.local/d1/partial-run-preserved/`; delivery files and review cases are
preserved at `rehearsal/.local/harbour-sql-partial-run-preserved/`. Whole-state recovery
restores the eight baseline databases, R2 and membership/crosswalk sidecars into the
disposable local target. Selective inverse recovery, a complete successful Places update
and idempotent replay remain unproven. Production is not ready for promotion.

### Verified whole-state recovery

All eight restored databases match their baseline SHA-256 digests. All 623,033 retained
R2 files and 211 membership/crosswalk sidecars also match their baseline hashes. The
restored Harbour API returned the original 39 Division and 24 Place/Address resource
releases, latest `2026-09-23.0`, with no October releases. The task-owned API was
stopped after verification. Evidence: `evidence/partial-run-restoration.json` and
`evidence/restored-api-reports.json` under the task directory.

The audit records 9,840 inserted, 105 updated and 328 deleted ordinary-table rows across
45 binding/table combinations. The images include publication metadata and failed-run
state as well as Division data. These totals are database mutations, not counts of new
geographic features. The failed Places attempt made no Place/Address data-table changes.

This verifies recovery of this partial local run under a write freeze. It does not prove
selective rollback, successful October Places publication or production recovery.
