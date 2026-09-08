# Retained processing provenance

Processing provenance supports two capabilities:

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
includes exact canonical bytes: sorted object keys, ordered arrays and explicit nulls.
Undefined, sparse arrays, class instances and non-finite numbers are rejected.

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

The general and district C&SD Statistics SQL upload paths capture and register a result
before publication. Their manifests retain publisher properties, canonical record
splits, reviewed field definitions, dictionary payloads, resolved geography inputs and
selected API-field declarations. Statistics publication requires a registered result.
Delivery retries upload the retained graph rather than regenerating decisions.

The existing audit report/UI and release-set API-field materialisation are separate
consumers that still require conversion to these projections. ALS, Places, Divisions,
geometry and planning producer capture are not yet integrated. In particular, ALS source
preservation requires a publisher-occurrence boundary before reconstruction, suppression
and deduplication; removing three derived properties is not sufficient. Streets is
outside this implementation's scope.
