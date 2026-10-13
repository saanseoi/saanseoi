# Dataset pipeline

## Source metadata ownership

`sourceReleases` owns `datasetId` and the publisher artefact's `sourceVersion`,
`sourceSchemaVersion`, `publicationDate`, `cohortKey`, and `releaseNotesUrl`. Each
`resourceReleases` row references one source release and retains its resource identity,
geometry status, processing evidence, and independent lifecycle state. The
`resourceReleaseDetails` view joins resource state to authoritative source metadata
without storing another copy.

Resource releases reference their source release, and snapshot memberships reference
their resource release. Dataset ownership follows these foreign keys; neither table
stores another `datasetId`. The `snapshotResourceReleaseDetails` view exposes the
derived dataset for membership queries. A source release has at most one materialisation
per resource type. Registration and retry may fill missing source metadata; conflicting
supplied values are rejected before a resource is registered or reset. Omitted optional
metadata does not clear a retained value.

## Source and resource release states

Source and resource releases use `uploading`, `staged`, `processing`, `current`,
`archived`, `revoked`, and `failed`. `current` means successfully published and not
replaced within the dataset/resource lifecycle. `archived` retains a completed release
after replacement; `revoked` withdraws a release. API catalogue selection separately
controls which releases serve requests. Snapshot publication uses `draft`, `published`,
and `archived`.

## Processing stages and retained evidence

| Stage                | Input               | Output                                | Retained definition                                       |
| -------------------- | ------------------- | ------------------------------------- | --------------------------------------------------------- |
| Ingestion            | Original datasets   | SOURCE records                        | Release-pinned processing rules and publisher field paths |
| Snapshot assembly    | SOURCE records      | HISTORY / CURRENT canonical snapshots | Assembly recipe, rules and reviewed curations             |
| API composition      | Canonical snapshots | API release set                       | Composition and exact snapshot membership                 |
| API response shaping | API release set     | Request response                      | General canonical-to-API field mappings                   |

`processingRuns` records the current state of each processing task. A task belongs to
one resource release, snapshot or API release set and has a `stage`, `phase`, `status`,
`attempt`, `results` and optional `checkpoint`. Retries reuse the task row. Identical
terminal reports do not write again; unchanged running reports refresh at most once per
minute. Results contain current progress and review information. Failures retain
progress. Checkpoints reference delivery plans and validate input and target identity;
delivery owns its existing receipts. Local CLI delivery checkpoints live in its metadata
context, while control callbacks report release progress to Harbour. Response shaping
runs per request and does not create a processing task.

`GET /v1/reports/processing` reads tasks across all three processing stages. The
release-focused ingestion report remains available separately.

Dataset `processingRules` describes SOURCE ingestion only. Source and resource releases
capture that ingestion policy through content-addressed `processingRuleDefinitions`.
Snapshot recipes capture assembly policies through the same definition store. General
field lineage lives in `fieldLineageDefinitions`; `apiFieldProvenance` pins one
definition and its concrete release binding at the API release root. Reusable
definitions retain preparation, ingestion, assembly and composition nodes,
output-resolution groups, role-labelled inputs and captured processing definitions.
Source schemas qualify input scopes: two releases of one dataset may bind different
schema versions. The graph hash includes these schema qualifications and excludes
concrete release and snapshot IDs.

Each source binding can also pin the registered processing manifest's hash and byte
length. The audit reader uses that exact retained root to resolve counts, guards and
reviewed instruction references. Aggregate counts do not prove a field winner, and an
audit manifest does not imply replayable effects.

The universal precedence order is baseline, conditional rule, curation, patch. Lower
priority wins within a layer; applicable ties in the winning layer fail. Automatic rules
retain aggregate audit counts. Reviewed mappings retain their documents; specific
curations and patches retain decisions linked by record identity and output selector.
Dynamic Statistics fields expand through the selected record's retained field-definition
hashes and source references. Closed-schema and mapping adapters validate retained
content and pointers; missing evidence cannot fall back to current fixtures.

Registry readers expand per-field stage arrays from shared nodes. Unresolved operations
remain explicit, and cannot be labelled complete. Record values and per-record automatic
rule traces do not belong in these definitions. The
[field-lineage review workflow](field-lineage.md#artefacts-and-regeneration) tracks
remaining field-specific implementation and evidence gaps.

Response dependencies are shared by API version and canonical schema version in
`fixtures/meta/apiResponseFields/`, independently of source mappings and composition
rulesets. Ordinary `id` and `attributes.X` fields project `resource.id` and `resource.X`
implicitly, including locale-keyed paths. The shared fixture declares only exceptions,
joins and computed dependencies: a string for one canonical input, an array for multiple
inputs. Relationships require explicit mappings. For example,
`place.relationships.address` uses `place.addressId`, while Division areas depend on
`division.id`, `divisionArea.divisionId` and `divisionArea.id`.

API-field fixture expansion resolves the shared mapping, pins its content hash and
supplies canonical inputs to field lineage. These declarations describe provenance;
response serializers execute the projection. Rehash both edited source-mapping fixtures
and shared response fixtures with `bun scripts/rehash-fixture.ts <fixture-path>`.

Reviewed patches, curations and translations retain their authored definition once.
Application evidence contains the definition reference, original fixture pointer and
application count. Standalone decisions use their own content hash; large fixture
documents use bounded partitions. The audit tab resolves these originals at read time.
Automatic processing retains aggregate counts, without per-record actions, expanded
curation copies or persisted search indexes. Release processing action summaries do not
duplicate the same metrics into separate stats rows.

Canonical corrections belong to assembly. Ingestion normalisation and selection, API
composition and response projection use general versioned rules. Audit presentation can
require following several references; minimising retained writes takes precedence over
precomputing a second representation of the evidence.

## Snapshot assembly provenance

Each snapshot assembly records its effective recipe in `snapshotRecipes` and its
dataset/role inputs in `snapshotRecipeInputs`. Each input has a typed
`selectionPolicyJson` containing selection rule identifiers and modes. These
descriptions explain how datasets contribute; transformation implementations live in the
codebase. The recipe hash covers the resource type, recording format, sorted input
policies and resolved assembly rules, so different snapshots can share a recipe without
sharing release IDs or cohorts. `isRequired` describes participation in that effective
recipe.

Recipe codes use `sa-<resourceType>-v1-<versionHash>`, where `versionHash` includes its
`sha256:` prefix. The code determines the recipe's UUID. This recording format does not
represent a processing ruleset version.

`snapshotResourceReleases` records concrete resource releases, roles, selection rules,
modes and anchors. The source cohort belongs to `sourceReleases`, reached through
`resourceReleases.sourceReleaseId`; the assembled cohort belongs to `snapshots`. Lookup
cohorts come from the exact snapshots pinned by `snapshotDependencies`.
`snapshotAssemblies` links each snapshot to its recipe and anchor. Each snapshot has one
assembly, updated during draft preparation and retained when published.
`snapshots.status` owns the publication lifecycle. Address review runs before the final
assembly is recorded. Missing source-selection rules fail ingestion. A later release
verifying identical published geometry can retain a separate source association without
replacing the published assembly.

`snapshotDependencies` pins exact logical snapshot inputs by role, including `division`,
`divisionArea`, `street`, `address` and `supplementaryAddress`. Each role selects one
snapshot. Foreign keys protect referenced snapshots; reset and rollback inspect these
relationships directly. Assembly input selection and dependency identity remain
relational.

Assembly records link a snapshot to its effective recipe and anchor. Review evidence
belongs to local preparation caches. Unresolved Address cases block materialisation and
assembly before delivery; retries must validate the cache against source, dependencies
and curation inputs. Places publication requires its exact supplementary Address
dependency. Published supplementary rows and localisations must remain reproducible.

SQL delivery includes recipe and input rows before assembly rows, and delivers exact
snapshot dependencies once their referenced snapshots exist. Assembly records describe
the construction of one snapshot; API composition records describe snapshots belonging
to a release set.

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
  -> source, history and current data
  -> snapshots and API release set
  -> SaanSeoi API and release documentation
```

`saanseoi update` sits beside the first two arrows: it checks an upstream source,
retains archive evidence where applicable, and invokes the source's approved intake
path. It is not a generic importer.

## Statistics source/history replay

Statistics datasets keep publisher delivery time separate from observation time. A
remote processor applies raw source records to the source shard selected by the release
year, groups canonical records by `referencePeriodEndYear`, and replays each group to
its history shard. Years before 2025 resolve to the `BEFORE` shard. The current shard
holds the latest dataset-scoped measure and localised value dictionaries, and each
touched history shard holds the source-release dictionary version used by its records.
History dictionary identity and current-state closure are scoped by `sourceReleaseId`,
so identical semantic metadata remains available to every release that uses it.

The required order is: stage processing, load the minimal cache profile, resolve any
reviewed identifier bridges, build deterministic source and history SQL, apply it to the
local cache, import those exact batches into remote D1, mark the processing stage
complete, materialise one dataset snapshot for every distinct exact reference period,
then publish the source release. Each period snapshot is eligible for its own exact-ref
Statistics release-set revision. On failure, mark the stage failed and leave the release
retryable. Do not publish a statistics release merely because its local cache mutations
succeeded.

Current records use a stable identity that includes the exact reference-period code.
Consequently, a later compilation replaces the current row independently for each period
it reports. Periods omitted from that compilation remain current; omission is not a
deletion signal. Multi-year periods route by their end year.

Each statistics processor should use the shared replay helper rather than directly
mutating Drizzle tables. Its cache profile must include release metadata, source
assertions, the current statistic tables, and every history shard touched by the
reference periods; it must also report cache, normalisation, local replay, remote replay
and publication progress.

## Local pipeline initialisation

Initialise one API family and composition domain at a time. For a clean local Divisions,
Addresses, Places and Statistics rebuild, use `./bin/saanseoi init:local`. It resets
local databases, runs the initialisers in dependency order, and prints one final
initialisation summary. Places run after the official Addresses initialiser because its
address member is resolved from the latest compatible reference snapshot.

## Production pipeline initialisation

For a clean production baseline, use `./bin/saanseoi init:production`. This
destructively resets every production D1 database, reapplies its migrations and metadata
registry, re-exports the production D1 cache, then runs the same Geographic Divisions,
LandsD Divisions, official Addresses, Overture Places and official Statistics
initialisers as `init:local`.

To reset local databases before a focused run, then use the command for the domain under
review:

```sh
bun run db:reset:local
./bin/saanseoi init:divisions
./bin/saanseoi init:streets
./bin/saanseoi init:addresses
./bin/saanseoi init:places
./bin/saanseoi init:stats
```

The focused LandsD Streets initialiser publishes the current gazetted register and its
canonical street IDs. It does not enter historical Government Notice curation. The
historical evidence stages remain explicit preparation for a later reviewed release
revision:

```sh
bun run --silent dataops -- hkgov-landsd-streets:landsd-notices --target local
bun run --silent dataops -- hkgov-landsd-streets:official-egazette --target local
./bin/saanseoi update --target local \
  --dataset ds-hk-hkgov-landsd-road-centreline --check-now --yes
```

The notice and e-Gazette stages may require reviewed lifecycle decisions before a
revision can be assembled. Road Centreline is optional and matches source segments to
the already-published LandsD street identities.

The four focused division initialisers also accept a remote target. They process the
same checked-in source cohorts in dependency order and publish to the selected Harbour
environment:

```sh
./bin/saanseoi init:divisions:geographic --target preview
./bin/saanseoi init:divisions:hkgov-pland-pu --target preview
./bin/saanseoi init:divisions:hkgov-pland-new-town --target preview
./bin/saanseoi init:divisions:hkgov-landsd --target preview
```

`init:divisions:geographic` also replays the retained 2023-H2 C&SD Permanent Living
Quarters archive as the required `divisionArea` `hkgov-censtatd-area` companion. This
remains part of Geographic Divisions initialisation even when the corresponding
Statistics release is already current.

Use `--target production` for the production database after authenticating Wrangler and
Harbour. Remote initialisers are safe to rerun after a failed cache refresh: they allow
an existing staged release to be registered again, but never replace a published one.
The umbrella `init` command remains local-only because its street and address steps
include local-only preparation workflows.

The Overture division initialiser includes its HAD and C&SD geometry dependencies,
including both the `2016` and `2021` C&SD district variants and the Permanent Living
Quarters geometry. It processes that source after the Overture canonical divisions and
before draft release-set reconciliation. Re-run an interrupted Overture or Planning
Department backfill with `--continue`; it ignores release codes already marked `current`
or `archived`, then passes every other release to `upload --continue`. That retry
accepts an existing staged release and ordinary failed-release retries, but never
repairs a published release; unsupported states fail rather than being silently ignored.
`saanseoi init [--continue]` runs all the focused initialisers in the same order.

Initialisers defer `docs:publish --scope all` until all their uploads have succeeded.
This avoids rescanning and publishing the same release documentation after every cohort
release. A failed initialiser therefore leaves documentation publication until its
successful continuation.

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
`sourceVariant` identifies a provider source record in an API composition. Do not merge
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
- `curations/identity/`, `curations/` and other source evidence fixtures when identity
  or curated decisions require them;
- `schemaVersions/`, `rulesetVersions/`, `apiCompositions/`, `apiFields/`,
  `apiEndpoints/` and `apiVersions/` when the source changes a public data or API
  contract.

Dataset fixtures are source-discovery metadata. They must declare at least one
`resourceTypes` value. API composition fixtures own materialisation dependencies, member
roles, required variants and cohort matching; do not put those dependencies in a dataset
fixture.

### Define audit processing rules

Every source that normalises, maps, corrects or otherwise changes a publisher source
record must declare its audit rules before its processor is written.

1. Add a registered executable declaration in
   `fixtures/meta/processing-rules/ingestion/` or
   `fixtures/meta/processing-rules/assembly/`, according to its processing stage. It
   names the input/output interfaces, static parameters, implementation and descriptions
   in English, Traditional Chinese and Simplified Chinese. Shared dependencies retain
   their complete definitions.
2. Reference the declaration with `ruleFixture` in a staged `rulesetVersions/` fixture.
   Resolved declarations use `kind: "bulk"` or `kind: "record"`: these share a schema
   and group execution scope. Reserve `type` for structurally different schemas.
3. Select ingestion operations in the dataset fixture's `processingRules`. These cover
   publisher extraction and SOURCE retention, validation, identity, hashes and validity.
   Canonical normalisation, matching, curation, translation and geometry selection
   belong to the resource-specific selections in
   `fixtures/meta/snapshotProcessingRules.json`.
4. Keep `inputs` and `outputs` as arrays of interface identifiers. Where column lineage
   is useful, use `sourceFields` and `targetFields` containing `origin`, `collection`
   and `path`. A path is one field selector, such as `properties.names`, `names[]` or
   `*`; descriptions and comma-separated lists are not paths. SOURCE and canonical
   references must identify existing tables and root columns. Ingestion cannot target
   canonical fields.
5. Call the registered executor from the real processing path. Declarations document
   code; they are not an executable transformation language. Keep archive preparation
   contracts distinct from prepared-row retention, and do not declare an importer that
   has no implementation.

Ruleset versions are linear processing-policy revisions. Make a new ruleset version
whenever observable normalisation, mapping, precedence or fallback behaviour changes;
never rewrite the definition of a version already captured by a release.

Define a `versionPolicy` and a three-phase `releasePolicy` (`newReleases`, `revisions`,
and `archives`) deliberately. A release's source version and cohort belong in its
release manifest, while the dataset fixture maps the publisher's live releases to that
series. See [dataset update checks](update.md) for the policy semantics.

After changing versioned JSON fixtures, run `bun run rehash:fixture` for the changed
fixtures and `saanseoi version:doctor` before registry publication. Do not hand-write a
`versionHash`.

API release publication supplies explicit schema and composition ruleset codes through
`apps/harbour-api/src/lib/services/releaseSetVersions.ts`. Every supported domain's
publication must select registered descriptors. These pins belong to the immutable API
release set, independently of the API composition version. Draft creation and final
publication reject missing, unknown or incompatible pins; source and snapshot processing
policies retain their own stage-specific rulesets.

## 3. Define source schemas and database storage

There are three distinct schema concerns:

1. The publisher schema is documented in the provider profile and mapped by the
   source-intake adapter.
2. The source-retention schema preserves the provider source record and its provenance
   in `libs/db/src/schema/source/`.
3. The canonical schema materialises the resource in `libs/db/src/schema/history/` and
   `libs/db/src/schema/current/`. Registry, release, snapshot and stats metadata lives
   in `libs/db/src/schema/meta/`.

Reuse an existing canonical resource schema when the source is a variant of an existing
resource. Add source-specific source tables for the original source record, including
the source record identifier, version hash, current/validity columns, source release and
raw properties where needed. Add canonical current/history tables only when the logical
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
  --resource-type <resource-type> --theme <theme> --release-notes-url <url>
```

`apps/harbour-cli/src/lib/commands/upload.ts` is the central dispatch point. A new
source/resource combination needs all of the following, as applicable:

- source preparation and format detection before source intake;
- a processing-strategy branch in `resolveUploadProcessingStrategy`;
- a local SQL processor under `apps/harbour-cli/src/lib/`, normally grouped by resource
  type, that writes source, history and current SQL artefacts;
- source, canonicalisation, full-snapshot/deletion, snapshot and rollback behaviour;
- release, quality/churn and processing-action stats; and
- cache and shard handling for local and remote targets.

The retained publisher artefact is source evidence, not a processing intermediate.
`upload` retains a supplied ZIP archive or source Parquet as an immutable managed R2
asset. A direct GML or GeoJSON input remains available to its local preparer, but its
retained copy is losslessly wrapped in a ZIP; the asset manifest records the original
filename, MIME type, byte length and SHA-256. Generated Parquet, SQL and disposable
normalisation intermediates remain local processing artefacts. Complete values selected
as effects or evidence in a verified
[processing provenance result](processing-provenance.md) are retained in R2 under the
separate provenance namespace.

### Release presentation metadata

The source-release page presents pipeline metadata in two data-driven tabs. Persist this
metadata in the meta database as part of the local processor; the page reads it through
the registry and does not derive it from terminal output or release notes.

- **Stats** reads release-scoped rows from `stats`. Emit the measurements that are
  meaningful for the resource, including record totals and, where applicable, churn,
  quality, locale coverage, component completeness or geographic distribution. Use the
  release-level stats replacement helper so a re-run replaces the release's previous
  values atomically.
- **Audit** reads registered content-addressed manifests and retained fixtures from R2.
  Bulk rules retain declarations and aggregate counts; reviewed record decisions retain
  fixture references and selected context. `processingAudits` pins each manifest by
  resource release, lifecycle stage and output owner. See the
  [processing provenance contract](processing-provenance.md).

At source-release creation, the processor captures the selected ingestion policy. At
snapshot assembly, it captures canonical policies on the content-addressed recipe. Audit
and API field lineage read those exact captured definitions. Published recipes remain
immutable; missing historical policies cannot be inferred from current fixtures. Audit
entries identify their declared operation codes. Automatic rules use bulk counts rather
than per-record evidence. Published registrations are immutable.

The Stats tab renders available release statistics. The Audit tab reads retained
provenance and selected bulk rules.

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

For audit coverage, test at least one selected bulk rule, one emitted record rule whose
action code matches its `operationCode`, and a current/archived release to confirm that
its audit projection does not change when later rules or source releases change.

Run `bun run format:markdown` after editing this or any other Markdown documentation.

## Delivery checklist

Use this as the review checklist for a source addition:

- [ ] Provider profile, family/resource contract and normative spec are updated.
- [ ] Dataset/source/variant identity, cohort and bridges are explicit.
- [ ] Publisher, licence, dataset, release and any composition/API/bridge fixtures are
      present and rehashed.
- [ ] Merge-rule definitions include stable operation codes, `bulk`/`record` kind,
      localised descriptions, mappings or bridge references, and are selected by each
      applicable dataset fixture.
- [ ] Publisher, source-retention and canonical schemas are correct; migrations and
      reset drops are generated/updated.
- [ ] Source-schema version mapping is registered.
- [ ] DataOps preparation/backfill is defined and registered when required.
- [ ] `saanseoi upload` dispatches to a tested local processor.
- [ ] `saanseoi update` is deliberately automated or documented as manual.
- [ ] Source/history/current/meta results, snapshots, stats, rollback and API release
      assembly are tested.
- [ ] Bulk and record audit rules, matching processing-action codes and
      published-release audit immutability are tested.
- [ ] Source, family, resource and release documentation is complete.

## Storage timestamp ownership

| Storage role                                  | Tables                                                                                            | Timestamps                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Mutable serving projections                   | CURRENT Address, Division, Place, Street, geometry, crosswalk and Statistics value rows           | `createdAt` and `updatedAt`; replacements preserve creation time and advance the update time when content changes |
| Immutable Statistics definitions              | CURRENT `statsFields`, `statsFieldsI18n`, `statsMeasures`, `statsMeasuresI18n`, `statsValuesI18n` | `createdAt` only; the primary key includes `versionHash`                                                          |
| Immutable canonical change events             | All 24 canonical HISTORY event tables and the `historyEvents` view                                | `createdAt` only; logical membership follows snapshot ancestry                                                    |
| Mutable delivery and serving receipts         | CURRENT family publication-state tables                                                           | `createdAt`, `updatedAt` and the explicit preparation/publication fields                                          |
| Mutable registry and publisher validity state | META records and SOURCE validity periods                                                          | Their operational timestamps remain independent of canonical events                                               |

HISTORY retries preserve existing events. CURRENT projection restoration derives its
update time from the selected event's creation time, rather than requiring a duplicate
HISTORY clock. Structural relationship, search-scope and immutable definition-set tables
have no update timestamp unless they carry mutable content.
