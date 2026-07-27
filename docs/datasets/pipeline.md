# Dataset pipeline

This is the working guide for adding a source dataset to SaanSeoi. Follow the stages in
order. A source is not complete merely because a local import works: its public
metadata, repeatable intake, storage, release assembly and verification must agree.

The guide describes where each decision and implementation belongs. Source-specific
facts belong in the provider profile; this page records the common pipeline rather than
duplicating those facts.

## Pipeline at a glance

```text
provider artefact
  -> source profile, resource/family contract and identity decision
  -> source preparation or backfill
  -> source intake and normalisation
  -> saanseoi upload
  -> source, history, current and meta data
  -> snapshots and API release set
  -> SaanSeoi API and release documentation
```

`saanseoi update` sits beside the first two arrows: it checks an upstream source,
retains archive evidence where applicable, and invokes the source's approved intake
path. It is not a generic importer.

## Local pipeline initialisation

Initialise one API family and composition domain at a time. Reset local databases before
starting a fresh run, then use the focused command for the domain under review:

```sh
bun run db:reset:local
./bin/saanseoi init:divisions:overture
./bin/saanseoi init:divisions:hkgov-pland-pu
./bin/saanseoi init:divisions:hkgov-pland-new-town
./bin/saanseoi init:streets:hkgov-landsd
./bin/saanseoi init:addresses:default
```

The Overture division initialiser includes its HAD and C&SD geometry dependencies,
including both the `2016` and `2021` C&SD variants. Re-run an interrupted Overture or
Planning Department backfill with `--continue`; it skips completed source releases.
`saanseoi init [--continue]` runs all the focused initialisers in the same order.

## 1. Start with the contract and source evidence

Before writing code, decide whether the provider publishes a new logical resource or a
variant of an existing resource. Read and update the relevant documents:

| Decision                                                                    | Authoritative location                        |
| --------------------------------------------------------------------------- | --------------------------------------------- |
| Provider URLs, licence, CRS, fields, quality findings and release semantics | `docs/datasets/sources/<provider>/`           |
| Meaning, ownership and required fields of a resource                        | `docs/datasets/resourceType/<resource>.md`    |
| Required snapshots, variants and release-set policy                         | `docs/datasets/families/<family>.md`          |
| Public/API, identity, geometry and other normative rules                    | `spec/`                                       |
| Common local processing and snapshot behaviour                              | [resource processing](resourceType/common.md) |

Record the publisher's artefact rather than an interpretation of it: catalogue and
direct URLs, licence and attribution, native format/layer, CRS, fields, feature counts,
release/revision/effective dates and observed defects. State whether it is a complete
snapshot or a delta. Keep reproducible inspection queries and source-specific
accept/reject/repair rules in the provider profile.

Choose stable dataset, source and variant codes before processing data. `datasetCode`
identifies the publisher product; `source` identifies the importer lineage; and
`sourceVariant` identifies a provider assertion in an API composition. Do not merge
provider variants implicitly.

Where an upstream identifier is not canonical, define a reviewed, versioned identifier
bridge. It must carry the authority, external ID, domain, cohort, source release,
mapping method and review status. Do not encode a provider-to-canonical decision only in
an importer.

## 2. Define metadata and fixtures first

Fixtures describe the public registry and release policy. They are also how
`saanseoi update` discovers its dataset list.

Create or update the applicable fixtures under `fixtures/meta/`:

- `dataPublishers/` and `dataLicenses/` for a new publisher or licence;
- `datasets/` for every publisher dataset: code, publisher, region, resource types,
  source variant, source CRS, attribution, URLs, localisation, version policy, update
  policy and release policy;
- `releases/<dataset-code>/` for every published SaanSeoi release, including source
  version, release version, cohort, source schema version and localised release notes;
- `identifierBridges/`, `curations/` and other source evidence fixtures when identity or
  curated decisions require them;
- `schemaVersions/`, `rulesetVersions/`, `apiCompositions/`, `apiFields/`,
  `apiEndpoints/` and `apiVersions/` when the source changes a public data or API
  contract.

Dataset fixtures are source-discovery metadata. They must declare at least one
`resourceTypes` value. API composition fixtures own materialisation dependencies, member
roles, required variants and cohort matching; do not put those dependencies in a dataset
fixture.

Define a `versionPolicy` and a three-phase `releasePolicy` (`newReleases`, `revisions`,
and `archives`) deliberately. A release's source version and cohort belong in its
release manifest, while the dataset fixture maps the publisher's live releases to that
series. See [dataset update checks](update.md) for the policy semantics.

After changing versioned JSON fixtures, run `bun run rehash:fixture` for the changed
fixtures and `saanseoi version:doctor` before registry publication. Do not hand-write a
`versionHash`.

## 3. Define source schemas and database storage

There are three distinct schema concerns:

1. The publisher schema is documented in the provider profile and mapped by the
   source-intake adapter.
2. The source-retention schema preserves the provider assertion and its provenance in
   `libs/db/src/schema/source/`.
3. The canonical schema materialises the resource in `libs/db/src/schema/history/` and
   `libs/db/src/schema/current/`. Registry, release, snapshot and stats metadata lives
   in `libs/db/src/schema/meta/`.

Reuse an existing canonical resource schema when the source is a variant of an existing
resource. Add source-specific source tables for the original assertion, including the
source record identifier, version hash, current/validity columns, source release and raw
properties where needed. Add canonical current/history tables only when the logical
resource requires them. Export new tables from the corresponding schema `index.ts` and
update the local processor, rollback support, cache profile and tests that depend on
them.

Register each supported source-version-to-schema-version mapping in
`libs/core/src/sourceSchemas.ts`, unless the source has a deliberate stable default. The
upload pipeline records this value against every release and rejects an unmapped source
that has no declared default.

Generate migrations for every changed database family:

```sh
bun run db:migration:generate:meta
bun run db:migration:generate:current
bun run db:migration:generate:history
bun run db:migration:generate:source
```

Run only the commands for families that changed. Do not handcraft Drizzle snapshots. If
generation needs interactive rename/drop resolution, obtain the generated artefacts
before continuing. Add every new table to its relevant local reset script under
`libs/db/scripts/sql/`, including `drop-all-db.sql`.

## 4. Build preparation and backfill work in DataOps

Use `apps/harbour-dataops` for source-specific work that precedes normal upload: native
archive extraction, reconstruction, OCR, review, historical backfill or multi-stage
assembly. A backfill is defined in `apps/harbour-dataops/src/commands/<source>.ts`. That
module owns the explicit historical release list, source locations, ordering,
continuation rules and the deterministic source-intake work. It should hand the result
to the normal upload command for publication rather than write target tables directly.

Register every DataOps command in both places in `apps/harbour-dataops/src/cli.ts`:

1. add its invocation to `printUsage()`;
2. add a `switch` case that dynamically imports and runs the command module.

Keep preparation deterministic and target-neutral where possible. Target-specific
decisions, such as a selected dependency snapshot or publication, must use the supplied
`local`, `preview` or `production` target. A staged pipeline should make the stage
boundaries and their evidence artefacts explicit; only the final assembly/publish stage
may create a dataset release.

Examples in the current codebase are the Planning Department backfill in
`apps/harbour-dataops/src/commands/backfillHkgovPland.ts` and the staged LandsD street
commands in `apps/harbour-dataops/src/commands/ingestLandsdStreets.ts`.

Add command tests for release selection, preparation, continuation/idempotency and all
review or rejection conditions. Provider-specific source adapters and their fixtures
belong beside related code in `apps/harbour-cli/src/lib/sources/`.

## 5. Connect source intake to `saanseoi upload`

The standard hand-off is the source artefact and its resolved release metadata passed
to:

```sh
saanseoi upload <file> --target local|preview|production \
  --source <source> --source-version <version> --cohort-key <cohort> \
  --type <resource-type> --theme <theme> --release-notes-url <url>
```

`apps/harbour-cli/src/lib/commands/upload.ts` is the central dispatch point. A new
source/resource combination needs all of the following, as applicable:

- source preparation and format detection before source intake;
- a processing-strategy branch in `resolveUploadProcessingStrategy`;
- a local SQL processor under `apps/harbour-cli/src/lib/`, normally grouped by resource
  type, that writes source, history, current and meta SQL artefacts;
- source, canonicalisation, full-snapshot/deletion, snapshot and rollback behaviour;
- release, quality/churn and processing-action stats; and
- cache and shard handling for local and remote targets.

The shared stages are `normalise`, `sql-source`, `sql-history`, `sql-current`, meta
updates and publication. See [resource processing](resourceType/common.md) for the
required ordering, snapshot semantics and local/remote D1 behaviour. Local processing
artefacts are implementation details: they are not public source archives or retained
release artefacts.

Preflight must fail with the source record and reason when it finds schema drift,
missing required values, invalid geometry, invalid CRS/axis order, duplicate keys,
unresolved bridges, unsupported relationships or missing dependencies. Test first,
unchanged, changed and deleted releases; history closure; snapshot cloning; rollback;
and all intended diagnostics and stats.

## 6. Integrate with `saanseoi update`

Automatic updates are opt-in. Without a registered lookup adapter, `saanseoi update`
reports the dataset as manual; a dataset fixture alone does not create an importer.

The integration point is `apps/harbour-cli/src/lib/sources/sourceUpdates.ts`:

1. Ensure the dataset fixture has a source URL, resource types and appropriate update,
   version and release policies.
2. Implement a lookup adapter that discovers the publisher's releases and returns
   `DatasetUpdate` records with stable source keys, versions, release metadata and a
   download path/action.
3. Register the adapter in `resolveLookupAdapter`. Reuse the generic CSDI path only when
   its native archived-source assumptions apply.
4. For a directly ingestible release, provide `ingest(target)`. For a CSDI archive,
   provide the source-specific `postArchiveIngest(target, prepared)` path after
   immutable source evidence has been mirrored.
5. Have that hand-off invoke DataOps or the normal uploader with the discovered source
   version, release-notes URL, target and source-archive provenance. It must not bypass
   the upload pipeline.
6. Add tests for discovery, unchanged/redelivery/revision decisions, state cursors,
   archive handling, target-specific baselines and the exact child command or upload
   request.

The updater stores check times and source cursors in the ignored
`.local/harbour/update-state.json`. This is operational state, not checked-in dataset
metadata. For CSDI, the publisher archive is immutable evidence and is mirrored before
ingestion; it is not itself a SaanSeoi release. The full operational behaviour is in
[dataset update checks](update.md).

## 7. Assemble snapshots and expose the API

After a release is ingested, verify the family-level outcome rather than only the source
tables. Update the API composition when the source adds or changes a member, variant,
dependency, role, priority or cohort-matching rule. Update API field and endpoint
fixtures, response schemas, query planning and serialisers when it changes what clients
can request or receive.

Verify the intended release set: required source snapshots must be eligible for the same
API family/domain and cohort rule. Exercise default responses, each relevant
include/relationship or variant selector, combined includes, unavailable/unknown
variants, pagination/filtering and included-resource de-duplication. Keep provider facts
and API semantics in their respective source and `spec/` documents.

## 8. Finish and verify

Before considering a new source complete:

- run focused unit tests for preparation, update discovery, upload dispatch and local
  processing, then the affected package checks;
- perform a local end-to-end first import and an unchanged re-run; test changed and
  deleted records when the source is a full snapshot;
- run the relevant migration lint/run and confirm the local reset scripts cover new
  tables;
- inspect the release, ingestion and stats reports with `saanseoi reports:*`;
- verify release notes, provider/family/resource documentation, fixture hashes and
  source-schema mappings; and
- validate the target API/release-set result when the source is published there.

Run `bun run format:markdown` after editing this or any other Markdown documentation.

## Delivery checklist

Use this as the review checklist for a source addition:

- [ ] Provider profile, family/resource contract and normative spec are updated.
- [ ] Dataset/source/variant identity, cohort and bridges are explicit.
- [ ] Publisher, licence, dataset, release and any composition/API/bridge fixtures are
      present and rehashed.
- [ ] Publisher, source-retention and canonical schemas are correct; migrations and
      reset drops are generated/updated.
- [ ] Source-schema version mapping is registered.
- [ ] DataOps preparation/backfill is defined and registered when required.
- [ ] `saanseoi upload` dispatches to a tested local processor.
- [ ] `saanseoi update` is deliberately automated or documented as manual.
- [ ] Source/history/current/meta results, snapshots, stats, rollback and API release
      assembly are tested.
- [ ] Source, family, resource and release documentation is complete.
