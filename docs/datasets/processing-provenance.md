# Retained processing provenance

Divisions, Statistics, Addresses and Places retain a `processing-audit` manifest. Other
consumers can use the separate `processing-result` effects contract described below.

## Retained processing audit

Every resource release requires a registered completed audit before publication,
including deferred publication. Missing audits and failed attempts block publication
regardless of publisher or resource type. Producers without audit capture must add it
before their releases can be published.

Division audit operations use an explicit registry of translations, patches, bulk
declarations and normalisation counters. Unknown operations fail retention before any
objects are written; operation-name patterns do not establish audit coverage.

Audit groups automatic Area hierarchy insertion under Rules and independently reviewed
classification corrections under Patches. Reviewed fixture mappings and individual
guard-related decisions appear under Bulk Curations and Custom Curations respectively.
The hierarchy rule's assignment count and the separate Hong Kong hierarchy guard's
checked/failed counts describe different operations.

Bulk code rules retain immutable declarations and execution counts, without affected
record lists, publisher values or canonical output copies. A declaration explains the
transformation and references its implementation; it is not an executable application
copy. The processor and audit producer use the same registered definition and frozen
parameters. CLI retention also records the referenced source file's SHA-256 revision.
Processor substeps can contribute named aggregate counters to that declaration.

Division normalisation, classification, translation, geometry, Planning, synthetic-area,
geography-identity and Statistics declarations are readable JSON under
`fixtures/meta/processing-rules/`. Executors validate and register these fixtures
directly; the retained declaration is the same frozen definition. Storing a declaration
in a fixture does not change its operation basis: algorithmic transformations remain
code rules, while reviewed value selections remain fixture-backed decisions.

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

Bulk fixture curations retain the selected reviewed documents in R2. Individual
curations, translations and QA patches retain their decision, record context and a
pointer to the selected fixture entry. Translation context includes available parent
division names. Unused translation instructions are marked skipped without inventing a
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

`releaseProvenance` records the manifest hash, byte length, individual action count and
`attemptStatus` (`completed` or `failed`). It identifies the registered attempt for the
resource release; published registrations are immutable. These producers do not write
the D1 processing-action summary or evidence-chunk tables.

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

`releaseProvenance` stores one manifest reference and application count per resource
release. Identical registration performs no additional D1 write. Registration verifies
the complete retained graph, byte lengths, hashes, evidence pointers, collection
references and summary counts before a status-guarded D1 write. A published result
cannot be replaced. Unregistered uploads are not published results.

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
at `GET /v1/provenance/schema`. `GET /v1/provenance/releases/{releaseId}` accepts
`view=manifest`, `applications`, `audit`, `curations` or `api-fields`. Supply the
returned manifest hash on subsequent pages to reject a changed staged generation.

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
selected matching policies and entries, and individual reviewed identity decisions.
Places and supplementary Addresses register separate manifests before publication.
Unresolved identity reviews retain failed blocking guards; supplementary dependency
checks also remain required. Completed audit retries transfer the retained graph without
regenerating it. These producers do not write processing-action evidence tables.

This audit does not implement replayable Address effects. Such effects would require an
ALS publisher-occurrence boundary before reconstruction, suppression and deduplication.
Streets is outside this implementation's scope.
