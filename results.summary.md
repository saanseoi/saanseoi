# Archive schema migration results

Completed on 3 October 2026.

## Schema and ingestion

All dataset archive registrations use the `assets` table:

- `releaseSourceArchive` retains original source bytes and links directly to a source
  release. Its format can be ZIP or Parquet.
- `resourceSourceArchive` retains downloadable resource-source Parquet and links to a
  resource release.
- Manifests describe original filenames and packaging, and inherit archive ownership.

Removed `rawObjectKey` and `originalFileName` from source and resource releases. Updated
acquisition, upload, native SQL export, historical Planning backfill, reset queries,
public attribution and source-release downloads. Existing archive files were not
renamed.

Generated migration:
`libs/db/migrations/meta/20261002180752_melodic_komodo/migration.sql`. Applied locally
with the transaction and backup runner; foreign-key checks passed. Production D1 still
requires its planned schema reset/deployment; this run cleared its obsolete asset
registrations without deploying a new production schema.

## Backups and archive cleanup

Evidence and backups:
[.local/backups/asset-schema-20261003/backup-summary.json](.local/backups/asset-schema-20261003/backup-summary.json).

- Backed up local D1 and both local R2 stores, and exported production META.
- Backed up and SHA-256 verified all 178 deleted production archives/manifests:
  5,368,473,557 bytes.
- Deleted 261 local and 178 production objects under `by-source/`.
- Removed 154 local and 43 production obsolete archive/manifest registrations.
- Verified archive prefixes empty and production asset registrations empty. Preserved
  production provenance, guides and styles.
- Additional production objects have partial backups; a complete production bucket
  backup is not claimed.

## Verification

46 focused ownership, registration, ingestion and reset tests passed. Six storage tests
passed, and a fresh local archive was verified readable from the serving R2 store before
removal. SaanSeoi app checks reported zero errors or warnings; Harbour API type checks
passed.

Broader checks retain unrelated fixture/type failures (`apiComposition.notes`,
`apiReleaseSets.apiVersionId`, search SQL bindings and provenance Buffer types).
Migration lint reported zero errors and 11 existing snapshot-chain warnings.

## Local rebuild using production R2

Reset all local databases, then ran
`./bin/saanseoi init --target local --r2 production`. Production D1 was not reset. The
local storage marker confirms production R2.

Completed ingestion includes 13 Overture Division cohorts, HAD/C&SD, HMA, historical
Planning Units and New Towns, LandsD Divisions, Protomaps/RVD and curated SaanSeoi
Divisions. Statistics published 11 release sets with no skipped cohorts. Addresses
published the July 2024 baseline and 31 July release. Streets published its current
4,053 names as `data-hk-streets-2026-07-26.0`.

The Streets SQL workflow retains a processing audit with the registered source-retention
and lifecycle-assembly rules. Delivered source hashes and baseline coverage are checked
before publication, and retries reuse sealed delivery counts and retained audit graphs.
Eight focused delivery, source-hash and provenance-registration tests passed. Harbour
CLI type checking reports one existing provenance R2 Buffer/ArrayBuffer test error; no
errors were reported in the Streets changes.

Latest database audit: 90 resource releases (48 current, 41 archived, one failed), 82
original-source archives, 99 resource-source Parquets and 179 manifests. No foreign-key,
archive-ownership or manifest-ownership violations; removed release file columns are
absent. Evidence: `.local/backups/asset-schema-20261003/rebuild-audit.json`. Production
R2 readback verifies 12 archive/manifest samples against their stored hashes and
lengths; receipt: `production-r2-readback-receipt.json` in the same backup directory.

### Remaining ingestion blocker

Full initialisation is incomplete. The 21 August 2024 Address cohort is blocked by an
unreviewed deletion report proposing 15 building and five complex retirements. It
includes The Henderson, Two Taikoo Place, Fu Tip Estate and Ching Tin Estate. Fu Tip's
social-service building appears under a different name and ID at the same coordinates in
the incoming membership, so publisher absence alone does not establish retirement. No
approval receipt was fabricated. Remaining Address cohorts and dependent Places
initialisation require this retention/identity review before resuming.

Report:
`.local/harbour-sql/releases/local/dr-hk-hkgov-dpo-address-2024-08-21.0/address-deletions.json`.
Digest: `0a4dc3434e0c916ab3b38f9b2de44cd00d92d185ce2fb7de432227240aeb6a29`.

After resolving the report, resume Addresses and root initialisation using
`--target local --r2 production --continue`; do not reset again. A retained low-memory
Bun wrapper is available in the backup directory. During recovery, four stale Address
phases were marked failed after confirming their writer had exited; the metadata backup
and recovery receipt are retained. Two orphan SQL planning directories were removed
after checking that no process owned them. The July release then completed.

Migration/cleanup summary was committed separately as `5f66b4bb9`. The rebuild outcome
is recorded in this file; implementation edits remain in the working tree.
