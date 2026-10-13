# Retained processing provenance

Processing-result and audit manifests identify their processed output with
`resourceReleaseId`, matching `resourceReleases.id`. The publisher input is identified
separately by `resourceReleases.sourceReleaseId`. Manifest fields are part of the
content-addressed contract: SQL schema migrations do not rewrite R2 objects or retained
local checkpoints. Artefacts must satisfy the producer and reader contract before reuse.

## Captured processing policies

Dataset and source/resource release policies describe publisher-to-SOURCE ingestion.
Canonical assembly rules are retained on the snapshot's content-addressed recipe.
Assembly hashes include exact declarations, parameters, dependencies and field
references. Draft snapshots can acquire a revised recipe; published snapshots retain the
recipe that produced them. SQL replay emits the immutable policy definition before its
recipe and assembly rows. Missing historical policies remain unknown.

API field provenance pins ingestion rules with `resourceReleaseId` and assembly rules
with `snapshotRecipeId`, together with ruleset and definition hashes. It reads captured
policies, never current dataset fixtures. Bulk audit summaries identify their source
release or snapshot as appropriate. The existing audit manifests retain run evidence
under their resource-release identifier; that evidence does not assign assembly policy
ownership to the publisher dataset.

Policy rules share a schema and use `kind: bulk | record` to group scope. Interfaces are
arrays of identifiers; optional column references use `origin`, `collection` and one
programmatic `path`. Localised descriptions explain processing but cannot act as paths.

## Reuse and reset controls

R2 provenance reuse is automatic. Objects use their canonical JSON SHA-256 as the
storage key; matching bytes are retained once across releases and runs. Deterministic
release IDs do not establish matching audit contents: changes to declarations, fixtures,
counts or API field metadata can produce different object hashes under the same release
ID. Delivery verifies existing objects before reusing them, uploads missing objects, and
rejects conflicting bytes before registration.

A clean local database can register regenerated matching audits against populated
production R2 without rewriting those R2 objects. This saves remote writes, but does not
skip producer computation. A completed local `audit.json` checkpoint additionally skips
audit generation when its input identity matches. Keep the checkpoint and its object
directory together. R2 alone has no producer-input lookup that restores this checkpoint
after its local directory is removed.

| Artefact or state                                                       | Reuse and reset control                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publisher downloads and raw R2 source assets                            | Source preparation uses retained inputs; immutable R2 delivery verifies matching contents. These are separate from derived release artefacts.                                                                                                        |
| ALS prepared Parquet and Address3D, seal, membership and audit sidecars | Automatic reuse requires matching source, code, fixtures, runtime, identity history and Division dependencies, with checksums for every output. `--no-cache-artefacts` disables this preparation reuse.                                              |
| Normalised artefacts                                                    | Content and processing-contract keys under `.local/harbour-sql/normalised-cache`; no independent general CLI reset switch.                                                                                                                           |
| Places staged source, enriched output and per-record computation caches | Automatic input/contract checks, including Address3D dependencies and review state. These caches have no independent general CLI reuse switch.                                                                                                       |
| Address current-row lookup cache                                        | Reused only for the exact parent snapshot; a baseline without a parent bypasses it.                                                                                                                                                                  |
| Local processed release objects                                         | Init retains them by default. `--no-cache-artefacts` discards `objects/processed` after successful upload. Direct upload retention uses `--cacheArtefacts` or `--cache-artefacts`. This is not a universal cache purge.                              |
| Local provenance checkpoint and objects                                 | Completed matching `audit.json` resumes the retained graph. The processed-object cleanup does not delete provenance.                                                                                                                                 |
| R2 provenance objects and derived audit search indexes                  | Content-addressed retention is automatic; there is no force-overwrite or purge toggle in init. Registered evidence must remain available.                                                                                                            |
| SQL plans, delivery receipts and pending ownership                      | Resume through `--continue`; stale generations are invalidated on reset even with `--keep-cache`. They are recovery state, not freely reusable computation caches.                                                                                   |
| Local mirrors of remote D1                                              | `cache:rebuild` refreshes them; `cache:seed-reset` seeds after a remote reset. Invalidation triggers rebuilding before reuse.                                                                                                                        |
| GERS lookup cache                                                       | `cache:gers --refresh` rebuilds it; `--cache-file` selects its location.                                                                                                                                                                             |
| Completed-release and family run state                                  | `--continue` resumes/skips completed work. Family reset commands remove the selected family state and normally its release/delivery caches; `--keep-cache` retains those files. The official Address reset also clears prepared outputs unless kept. |
| Full local initialisation reset                                         | `init:local` invokes `db:reset:local`, which clears local release/delivery directories and local R2 storage. It does not delete production R2 objects. There is no `--keep-cache` option on this full reset.                                         |

`--target` selects database execution; `--r2` selects asset storage. A populated local
database pins its R2 selection. Neither option is a cache invalidation switch.

Deleting an audit by size requires tracing its complete graph and retaining objects
shared with every surviving audit, including derived search indexes. Removing only local
copies does not reduce R2 storage. Removing registered R2 evidence leaves its release
audit unavailable until a complete replacement is generated and registered.

## Delivery

CLI provenance transfer checks batches of up to 64 object references through the private
`POST /v1/provenance/objects/check` endpoint. The destination verifies retained lengths,
checksums and canonical JSON before acknowledging reuse; missing objects are uploaded.
Local source objects remain validated, the manifest follows its dependencies, and
release registration validates the complete graph. Retries query current destination
contents. Local D1 ingestion with a separate R2 target independently confirms that
destination.

R2 delivery uses four concurrent requests through the persistent Node adapter. Existing
objects are confirmed in bounded batches; new objects use conditional writes and SHA-256
checksums. A checksum-bearing successful PUT confirms the committed bytes;
conditional-write races and responses without checksums require readback verification.
The manifest follows all dependencies, and database registration runs only after the
complete transfer succeeds. Failed transfers leave locally retained evidence available
for retry without registering an incomplete graph.

Individual action chunks use version-2 column dictionaries: each field stores its unique
values once, with row indices preserving action order and absent optional fields. Chunks
contain at most 256 actions and remain bounded to 1 MiB. Audit readers expand these
columns into complete actions for search, pagination and evidence views. Hashes and byte
lengths describe the compact stored JSON. Registered version-1 evidence is read in its
immutable representation; delivery never rewrites an existing audit.

Divisions, Statistics, Addresses and Places retain a `processing-audit` manifest. Other
consumers can use the separate `processing-result` effects contract described below.

## Retained processing audit

Every resource release requires a registered completed audit before publication,
including deferred publication. Missing audits and failed attempts block publication
regardless of publisher or resource type. Producers without audit capture must add it
before their releases can be published.

Audit registration also retains a versioned search index under
`provenance/search/v1/<audit-sha256>.json`. This pointer identifies bounded,
content-addressed search objects containing action categories, normalised search text,
fixture pointers, deduplicated fixture counts and ALS decision summaries. ALS decision
evidence is retained in small pages. The pointer is written only after all referenced
objects are verified. Search requests read these artefacts; they do not reconstruct an
index from evidence. Complete datasets already loaded in the browser are filtered
locally, and searches requiring another page keep existing content visible.

Division audit operations use an explicit registry of translations, patches, bulk
declarations and normalisation counters. Unknown operations fail retention before any
objects are written; operation-name patterns do not establish audit coverage.

Audit groups automatic Area hierarchy insertion under Rules and independently reviewed
classification corrections under Patches. Reviewed fixture mappings and individual
guard-related decisions appear under Bulk Curations and Custom Curations respectively.
The hierarchy rule's assignment count and the separate Hong Kong hierarchy guard's
checked/failed counts describe different operations.

Bulk code rules retain immutable declarations and execution counts, without affected
record lists, publisher values or canonical output copies. The shared audit validator
rejects individual code-rule actions and record-evidence fixtures on code rules.
Declared identity-mapping inputs are retained once as reusable matching policies.
Individual entries require a retained fixture decision and a fixture-based declaration.
ALS automatic actions are grouped by operation into stable declarations and aggregate
counts; publisher and canonical row evidence is not copied into the audit. Each
operation must have one stable description, independent of the number of affected
records. A declaration explains the transformation and references its implementation; it
is not an executable application copy. The processor and audit producer use the same
registered definition and frozen parameters. CLI retention also records the referenced
source file's SHA-256 revision. Processor substeps can contribute named aggregate
counters to that declaration.

Division normalisation, classification, translation, geometry, Planning, synthetic-area,
geography-identity and Statistics declarations are readable JSON under
`fixtures/meta/processing-rules/assembly/`. Executors validate and register these
fixtures directly; the retained declaration is the same frozen definition. Storing a
declaration in a fixture does not change its operation basis: algorithmic
transformations remain code rules, while reviewed value selections remain fixture-backed
decisions.

Taxonomy mappings, ordered level matching, area-name recognition, API locale priorities,
geometry exclusions and population scaling factors are consumed from those definitions.
Algorithms remain in the referenced TypeScript implementations. Empty parameters mean
the rule has no static policy parameters; reviewed input fixtures are separate inputs,
not embedded dataset values.

Merge rulesets reference shared declarations by fixture basename. Resolution includes
the exact definitions and derives descriptions, input/output paths and execution scope
from them. A ruleset's resolved hash covers the referenced content, so a policy edit
changes its identity even when its reference names are unchanged. The source ruleset
file's own hash is validated separately.

Curations declare `review.kind: curation` and a related guard definition. Patches
declare `review.kind: patch` and apply independently of a review guard triggering.
Expected-source checks remain mandatory application preconditions for classification
patches; a mismatch blocks ingestion. The retained individual action carries the same
review origin as its definition. This linkage identifies the review requirement, not an
invented historical failed-guard event.

Patch instructions, including Lok Ma Chau Loop classification and Kowloon restoration,
live in `fixtures/meta/patches/`. Shared rule dependencies retain their complete
definitions, and CLI retention hashes their implementation sources recursively.

API field-lineage release bindings pin the registered completed processing manifest by
hash and byte length. The lineage audit reader checks that the manifest belongs to the
bound resource release, and returns its bulk counts, guards and reviewed instruction
references. It creates no additional retained audit rows. An application count describes
uses of an instruction; it does not establish which conditional candidate supplied an
individual API field or turn audit evidence into replayable output effects.

Bulk fixture curations retain the selected reviewed documents in R2. Individual
curations, translations and QA patches retain their decision, record context and a
pointer to the selected fixture entry. Translation context includes available parent
division names. Unused translation instructions contribute an aggregate
unused-instruction count; they do not generate individual skipped actions or imply a
matching record. Statistics localisations with no recorded origin remain
origin-unrecorded; verification alone does not prove translation.

Guards expose passed, failed, not-applicable and not-run states, counts, reasons and
their blocking or reporting consequence. A failed blocking guard is retained before the
ingestion phase is marked failed and prevents publication. A failed delivery keeps the
audit locally and reports that registration is still required.

The source and API release Audit views initially load manifests and summaries.
Individual pages, declarations and readable fixtures load on demand. Free-text search
examines individual indexes and bulk fixture indexes; only matching individual chunks
are read. Individual pages are limited to 50 entries. Retained chunks contain at most
256 actions; objects are limited to 1 MiB. Large translation fixtures use ordered
partitions which preserve every entry and the document's root metadata.

`processingAudits` records the manifest hash, byte length, individual action count and
`attemptStatus` (`completed` or `failed`). It identifies the registered attempt by
resource release, lifecycle stage and output owner; published registrations are
immutable. Audit declarations, counts and reviewed fixture references are retained in
R2.

## Recorded effects contract

The `processing-result` contract supports two capabilities:

1. Explain a recorded result using retained decisions, effects and evidence.
2. Reapply recorded effects to the exact guarded inputs.

It does not promise to recompute a result using historic code or software versions.
Producer code is not an executable dependency of a retained result.

## Data boundary

Publisher assertions belong in source storage. Curation and normalisation produce
canonical payloads without changing those assertions. Release selection and snapshot
assembly remain explicit metadata, separate from record-level effects.

An application records an operation and version, a human-readable summary and reason,
its decision identity and frozen definition, outcome, guarded inputs, ordered effects,
evidence and field lineage. Human and model decisions require approval before they can
be applied. Automatic rules retain their definition too.

Each effect names a canonical collection and record. Its `before` digest guards the
existing value; `null` requires absence. Its `after` reference contains the entire
resulting payload; `null` removes the output. Multiple inputs and effects represent
merges and splits. Excluding an input from a new snapshot can be an applied decision
with no output. An unapplied or deferred decision cannot carry effects.

## Storage and verification

R2 stores canonical JSON under `provenance/v1/sha256/<digest>.json`. Object identity
includes exact canonical bytes: ordered arrays, explicit nulls and deterministic object
keys. New provenance records start with `kind`, `schemaVersion`, and identifying context
such as an ID, release, dataset, operation and source field; remaining keys are sorted.
Previously retained lexicographic objects remain readable. Undefined, sparse arrays,
class instances and non-finite numbers are rejected.

The implementation bounds each object at 1 MiB and each application chunk at 256
applications. Value packs share an object across guarded inputs, pre-change values,
supporting evidence and complete outputs. JSON Pointers address individual values.
Applications contain their own dependency references; the root manifest lists chunks and
summaries, not a reference for every record. Oversized individual applications must be
partitioned before retention.

Recorded effects are standalone R2 objects addressed by their manifest reference. They
have no D1 release registration. Reapplication verifies the retained graph and input
guards before returning the resulting record state.

Provenance objects are release evidence, not disposable processing caches. A future
garbage collector must traverse all retained manifest roots before removing shared
objects; age alone is insufficient.

## Programmatic interface

The `@repo/core/provenance` package provides `recordApplications`,
`retainProcessingResult`, `transferProcessingResult`, `reapplyProcessingResult`, and the
`auditView`, `curationView` and `apiFieldView` projections. Reapplication verifies the
whole graph, checks guards and returns a new state without invoking producer code.

The authenticated Harbour API exposes object upload/read, release registration and
paginated release views under `/v1/provenance`. The version-1 JSON Schema is available
at `GET /v1/provenance/schema`. `POST /v1/provenance/releases/{resourceReleaseId}`
registers `processing-audit` manifests only. `GET` on the same path requires
`manifestHash` to select the exact registered lifecycle audit and accepts
`view=manifest`, `applications`, `audit`, `curations` or `api-fields`.

## Producer integration

The canonical Division, geometry, Planning, general C&SD Statistics and district C&SD
Statistics SQL upload paths capture and register audits before publication. Statistics
audits retain normalisation and population-scaling declarations, dictionary counts,
reviewed field/measure/identity fixtures and selected API-field declarations. They do
not retain publisher or canonical value packs. Statistics publication requires a
registered result. Delivery retries transfer the retained graph.

ALS preparation seals audit inputs to its Parquet digest, including the registered
preparation declarations and reviewed fixture documents. Address normalisation retains
its declaration and output counts; individual identity-continuity decisions retain their
selected entries. Automatic transformations retain aggregate counts rather than
per-record copies. The source, current and history storage contracts remain separate
from this audit.

Places retains normalisation, country selection and Address-analysis declarations,
selected matching policies and entries, and individual curated identity decisions.
Places and supplementary Addresses register separate manifests before publication.
Unresolved identity reviews retain failed blocking guards; supplementary dependency
checks also remain required. Completed audit retries transfer the retained graph without
regenerating it. These producers do not write processing-action evidence tables.

This audit does not implement replayable Address effects. Such effects would require an
ALS publisher-occurrence boundary before reconstruction, suppression and deduplication.
Streets is outside this implementation's scope.
