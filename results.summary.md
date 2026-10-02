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

## Authorised rebuild

Next, reset all local databases and ingestion state, then run
`./bin/saanseoi init --target local --r2 production`. This uses local D1 and production
R2; production D1 is not reset. Ingestion outcome will be recorded after completion.
