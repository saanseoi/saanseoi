# Local database migrations

Run `bun run db:migration:run:local` from the repository root to apply pending
migrations to the configured local databases. The runner serialises migration
invocations, takes a SQLite backup including committed WAL data, and applies each
database's pending migrations in one transaction. Foreign-key validation must pass
before the migration receipts and data commit together. Backups are retained under
`.local/d1/migration-backups/`.

Generated SQL defines the destination schema. Data conversions that need retained
content run through explicit migration hooks:

- `inline_history_upgrade.py` reconstructs inline events from retained journals and
  verifies dictionary ownership against META.
- `place_publication_migration.py` rejects populated Place or Address data when applying
  publication dependency migrations. Use the
  [local reset and rebuild workflow](../../../docs/datasets/pipeline.md#local-pipeline-initialisation).

Failed foreign-key checks roll back that database's entire pending batch. A failure
stops subsequent databases; databases already completed retain their receipts. Rerunning
the command skips migrations with committed receipts.

These hooks belong to the native local SQLite runner. Remote migration commands do not
execute Python conversions.

Run the migration regression tests with:

```sh
python3 -m unittest discover -s libs/db/scripts -p 'test_*.py'
```
