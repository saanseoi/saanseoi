# Retained processing provenance

Divisions and Statistics retain a `processing-audit` manifest. Other consumers can use
the separate `processing-result` effects contract described below.

## Divisions and Statistics audit

Bulk code rules retain immutable declarations and execution counts, without affected
record lists, publisher values or canonical output copies. A declaration explains the
transformation and references its implementation; it is not an executable application
copy. The processor and audit producer use the same registered definition and frozen
parameters. CLI retention also records the referenced source file's SHA-256 revision.
Processor substeps can contribute named aggregate counters to that declaration.

The population scaling, area/boundary geometry and Statistics field/localisation
declarations are readable JSON under `fixtures/meta/processing-rules/`. Executors
validate and register these fixtures directly; the retained declaration is the same
frozen definition. Storing a declaration in a fixture does not change its operation
basis: algorithmic transformations remain code rules, while reviewed value selections
remain fixture-backed decisions.

Bulk fixture curations retain the selected reviewed documents in R2. Individual
curations, including translations and guarded classification corrections, retain their
decision, record context and a pointer to the selected fixture entry. Translation
context includes available parent division names. Unused translation instructions are
marked skipped without inventing a matching record. Statistics localisations with no
recorded origin remain origin-unrecorded; verification alone does not prove translation.

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

ALS and Places producer capture are not integrated with this audit contract. ALS source
preservation requires a publisher-occurrence boundary before reconstruction, suppression
and deduplication; removing three derived properties is not sufficient. Streets is
outside this implementation's scope.
