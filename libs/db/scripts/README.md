# Local database migrations

Run `bun run db:migration:run:local` from the repository root to apply pending
migrations to the configured local databases. The runner serialises migration
invocations, takes a SQLite backup including committed WAL data, and applies each
database's pending migrations in one transaction. Foreign-key validation must pass
before the migration receipts and data commit together. Backups are retained under
`.local/d1/migration-backups/`.

Generated SQL initialises the destination schema. Use the
[local reset and rebuild workflow](../../../docs/datasets/pipeline.md#local-pipeline-initialisation)
to initialise populated local databases from the baselines.

Failed foreign-key checks roll back that database's entire pending batch. A failure
stops subsequent databases; databases already completed retain their receipts. Rerunning
the command skips migrations with committed receipts.

Run the migration regression tests with:

```sh
python3 -m unittest discover -s libs/db/scripts -p 'test_*.py'
```
