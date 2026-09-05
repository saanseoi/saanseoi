# Dataset ingestion

This is the operational checklist for taking one publisher dataset from preflight to an
API family release set. It complements the deeper
[dataset pipeline](datasets/pipeline.md) and
[resource processing contract](datasets/resourceType/common.md). Follow the stages in
order: a successful upload is not proof that the source release, canonical data,
snapshot and public release set all agree.

## The lifecycle

```text
publisher evidence
  -> preflight and release identity
  -> prepared upload and immutable source asset
  -> staged source release
  -> source SQL
  -> canonical history and current SQL
  -> snapshot and metadata
  -> source-release publication
  -> API release-set reconciliation
  -> published API family release set
```

Each API family may have different parsing and canonicalisation, but it must expose the
same phase boundaries and feedback. Use the shared progress helpers in
`apps/harbour-cli/src/lib/localPipeline/orchestrator.ts` for bounded work, report real
units where they are known, and fail the active phase before propagating an error.
Source-specific processors should describe _what_ is happening; the shared helper owns
timing, count formatting, clamping and completion behaviour.

## 1. Define the source and release before processing it

Decide the durable identities first:

- `datasetCode` identifies the publisher dataset;
- `source` identifies the importer lineage;
- `sourceVariant` distinguishes provider source records in a composition;
- `sourceVersion` is the publisher or reference version;
- `cohortKey` controls compatible snapshot and release-set assembly; and
- the SaanSeoi release version follows the dataset's checked-in `versionPolicy`.

Create or update the following files as applicable:

| Concern                                        | Files to create or modify                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Publisher and licence                          | `fixtures/meta/dataPublishers/`, `fixtures/meta/dataLicenses/`                  |
| Dataset identity, discovery and release policy | `fixtures/meta/datasets/<dataset>.json`                                         |
| Source release and notes                       | `fixtures/meta/releases/<dataset-code>/<release>.md`                            |
| Provider facts and parsing decisions           | `docs/datasets/sources/<provider>/*.md`                                         |
| Family membership and release-set rules        | `docs/datasets/families/<family>.md`                                            |
| Resource contract                              | `docs/datasets/resourceType/<resource>.md` and, when normative, `spec/`         |
| Canonical identity or curation                 | `fixtures/meta/identifierBridges/`, `fixtures/meta/curations/`                  |
| Normalisation and audit rules                  | `fixtures/meta/rulesetVersions/` plus the dataset's `mergeRules`                |
| Public composition or schema                   | `fixtures/meta/apiCompositions/`, `apiFields/`, `apiEndpoints/`, `apiVersions/` |

Never use an archive quarter, download time or local filename as a dataset identity
unless the checked-in version policy explicitly says it is the release version. Rehash
changed versioned fixtures with `bun run rehash:fixture`; do not hand-edit a
`versionHash`.

## 2. Implement preflight

Preflight runs before target mutation and should return a prepared, deterministic upload
plan. It must reject the source record and reason for at least:

- an unsupported source version, format, layer, CRS or axis order;
- schema drift, missing required values or duplicate stable keys;
- invalid or unsupported geometry;
- unresolved identifier bridges or missing composition dependencies;
- source archive path traversal, unsafe member names or excessive download, entry,
  expansion or compression-ratio limits; and
- a source digest that does not match an explicitly supplied source-archive digest.

Publisher object identifiers and content digests are separate provenance values. For
CSDI, retain the catalogue object identifier in update state and address each local
download by that identifier; calculate and retain the actual publisher-byte and
prepared-archive SHA-256 values in the manifest. Do not assume those values are equal.

The usual implementation files are:

- `apps/harbour-cli/src/lib/sources/<provider>/*.ts` for native parsing, validation and
  preparation;
- a neighbouring `*.test.ts` covering accepted input and each rejection condition;
- `apps/harbour-dataops/src/commands/*.ts` and `src/cli.ts` when ingestion needs OCR,
  review, historical reconstruction or a staged backfill; and
- `libs/core/src/sourceSchemas.ts` for each supported source-version-to-schema-version
  mapping.

Source-specific preparation must finish before the central upload dispatcher selects a
processor. It must not write source, history, current or metadata tables directly.

## 3. Retain the source evidence and register the upload

For automated discovery, wire the dataset into
`apps/harbour-cli/src/lib/sources/sourceUpdates.ts`:

1. resolve a source adapter from the dataset fixture;
2. return stable discovery keys, source/release versions and a bounded download action;
3. retain immutable publisher evidence and its manifest;
4. pass the prepared local artefact, exact target and provenance to DataOps or
   `saanseoi upload`; and
5. update operational state only after the corresponding mirror or database stage has
   succeeded.

Add update tests for first discovery, unchanged input, a revision in the same release
slot, target reset, cached download identity, state cursors and the exact ingestion
hand-off. `.local/harbour/update-state.json` is only scheduler state; the selected
target's release report is authoritative.

Direct upload uses the same path:

```sh
./bin/saanseoi upload <prepared-file> --target local \
  --source <source> --source-version <version> --cohort-key <cohort> \
  --type <resource-type> --theme <family> --release-notes-url <url>
```

`apps/harbour-cli/src/lib/commands/upload.ts` must recognise the source/resource pair,
perform preflight, register or resume the staged release, seed the raw object and select
one processing strategy. The request to Harbour creates the source release; it does not
make that release published.

## 4. Write the source record

The local processor belongs under the relevant resource directory in
`apps/harbour-cli/src/lib/`, for example `divisionSql/`, `streetSql/`, `statisticsSql/`
or `localPipeline/`. Keep the top-level processor linear and move only genuinely reused
mechanics into shared helpers.

The first database mutation retains the publisher source record in the source shard. A
new source shape normally requires:

- tables and indexes in `libs/db/src/schema/source/` and its `index.ts`;
- a generated source migration;
- the table in the applicable `libs/db/scripts/sql/` reset/drop scripts;
- source SQL generation, batching, replay and rollback coverage; and
- the source table in the smallest applicable local-cache profile.

Preserve the source identifier, release identity, provenance, validity/current state and
raw publisher properties needed to audit the transformation. Generate deterministic,
idempotent SQL and enforce both batch and individual-statement limits before local or
remote replay.

Use a visible `sql-source` phase. For remote targets, resolve the exact environment's
credentials and D1 shard identifiers before mutating the persistent planning cache.
Never select production shard metadata merely because a target is remote.

## 5. Canonicalise into history and current

Canonicalisation turns the source record into the public resource model. Keep it as pure
transformation code in `libs/core/src/pipeline/services/` where practical; the CLI
processor coordinates it and writes the resulting SQL.

The expected order is:

1. `normalise`: map fields, identifiers, geometry and locales and emit audit actions;
2. `sql-history`: append or close immutable versions;
3. `sql-current`: replace or upsert the current projection; and
4. metadata: stats, frozen rule definitions, processing actions and release state.

New canonical storage may require tables and exports in `libs/db/src/schema/history/`
and `libs/db/src/schema/current/`, generated migrations, reset/drop entries,
cache-profile changes and rollback SQL. Full-snapshot sources must explicitly close or
remove records absent from a later release; delta sources must not infer deletions.

Tests must cover first, unchanged and changed records, deletions when applicable,
history validity, locale and geometry behaviour, deterministic hashes, audit actions,
stats and rollback. A focused parser test is not enough: replay the produced SQL into
the relevant local databases.

## 6. Create snapshots and publish the source release

After source and canonical SQL succeed, the processor writes the snapshot and metadata
required by its family. A snapshot is immutable and must identify its member source
releases and cohort. Reuse the family's existing snapshot service and composition
fixtures; do not embed a second composition policy in the importer.

Call Harbour's publish operation only after all required source, history, current,
snapshot, stats and audit work has succeeded. On any error, mark the active stage failed
and leave the source release retryable. The terminal must distinguish:

- a published source release with no API composition;
- a published source release attached to a draft API release set; and
- a current API release set and its catalogue revision.

Statistics sources, for example, may intentionally publish as source-only until a
Statistics API composition is activated. Do not create a placeholder snapshot merely to
make the terminal look uniform.

## 7. Reconcile and release the API family

Harbour assembles API release sets from `fixtures/meta/apiCompositions/` and the
eligible snapshots for the family, region, domain and cohort. If a required member is
absent, the release set remains draft. After the missing member is published, reconcile
drafts:

```sh
./bin/saanseoi release-sets:reconcile \
  --target local --api-family <family> --region <region>
```

The reconciliation must publish only complete release sets, preserve older immutable
sets and create or select the appropriate API catalogue revision. Create or update the
release-set notes in `fixtures/meta/apiReleaseSets/<family>/`, then publish checked-in
source and release-set documentation:

```sh
./bin/saanseoi docs:new --target local --scope apiReleaseSets \
  --api-family <family> --region <region> --cohort-key <cohort>
./bin/saanseoi docs:publish --target local --scope all --dry-run
./bin/saanseoi docs:publish --target local --scope all
```

## 8. Prove the final state

Validate locally before preview, and preview before production. For every target, check
the result rather than trusting the child-process exit code:

```sh
./bin/saanseoi reports:ingestion --target local
./bin/saanseoi reports:releases --target local
./bin/saanseoi reports:stats --target local
./bin/saanseoi release-sets:reconcile --target local \
  --api-family <family> --region <region>
```

Confirm the exact dataset/source version is published, the intended snapshot is current,
the API release set contains every required member, and representative API queries use
that release set. Repeat an unchanged ingestion to prove idempotency, and exercise a
failed or interrupted run to prove continuation does not skip uncommitted target work.

Before review, run the focused tests, package type check and lint, migration checks when
schemas changed, `bun run format:markdown`, and `git diff --check`.

## File-wiring checklist

- [ ] Provider, family and resource documentation records the input and its semantics.
- [ ] Publisher, licence, dataset, release, ruleset and composition fixtures are added
      or updated and rehashed.
- [ ] Source schemas, source-version mapping, migrations and reset drops are wired.
- [ ] Preflight parser and rejection tests cover the publisher-native artefact.
- [ ] DataOps preparation is registered only when work precedes normal upload.
- [ ] `sourceUpdates.ts` deliberately automates discovery or the source remains manual.
- [ ] `upload.ts` dispatches the source/resource pair to one tested processor.
- [ ] Source, history, current, metadata, cache, rollback and remote shard paths agree.
- [ ] Shared progress phases provide consistent action, subject, count, timing and
      failure feedback.
- [ ] Snapshot and API composition membership are fixture-driven and tested.
- [ ] Source-release and API release-set notes are created and published.
- [ ] Reports and representative API requests prove the final target publication.
