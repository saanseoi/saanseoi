# Provenance Model

The versioned provenance path is:

1. `apiReleaseSet`
2. `apiReleaseSetSnapshots`
3. `snapshots`
4. `snapshotSources`
5. `apiFieldProvenance`

SaanSeoi tracks provenance at two levels.

## Retained Processing Audits

Table: `releaseProvenance`

Divisions, Statistics, Addresses and Places retain content-addressed `processing-audit`
manifests in R2. D1 stores the manifest hash, byte length, individual action count and
attempt status. Bulk transformations retain declarations and aggregate counts; reviewed
decisions retain fixture references and selected context. Addresses and Places require
registered provenance before publication, including the supplementary Address release
produced by Places. See the
[processing provenance contract](../../../../docs/datasets/processing-provenance.md).

## Processing Action Storage

Tables: `releaseProcessingActions`, `releaseProcessingActionChunks`

This release-scoped audit trail records automatic normalisations and human-reviewed
decisions made while ingesting a dataset. Each summary row represents one release,
action code and `automatic` or `manual` mode, with a content generation, decision count
and affected-record count. Evidence identifies the canonical record and relevant source
variants in versioned, gzip-compressed JSON chunks. Summary strings are dictionary
encoded; release metadata is inherited from the summary. Aggregate counts are also
written to `stats` with `type` and `metric` set to `processing`.

Chunks stop at 256 decisions, 256 KiB decoded bytes or 32 KiB compressed bytes.
Oversized individual decisions use ordered fragments. Checksums cover decoded bytes;
missing fragments or corruption fail the read instead of returning partial evidence. The
`(actionId, generation, firstOrdinal, part)` index supports bounded audit pages. Full
exports iterate pages; evidence is decoded in the application rather than searched with
SQL JSON predicates. Publication checks use summary counts.

The generated schema migration requires an empty action table. For a populated database,
prepare a converted **offline copy** before restoring through the database snapshot
workflow:

```fish
bun scripts/prepare-processing-action-migration.ts /path/to/offline-meta.sqlite /path/to/new-meta.sqlite
```

The command leaves the input file intact, applies the generated migration and compressed
records together in a transaction on the copy, and preserves original decision IDs,
timestamps, evidence, release status and statistics. It records the migration in an
existing `d1_migrations` ledger. Do not apply the schema-only migration directly to a
populated action table. Review the converted snapshot and its migration manifest before
restoring it; the command performs no deployment or live database mutation.

## Snapshot-Level Provenance

Tables:

- `snapshots`
- `snapshotSources`

This answers:

- which source releases fed this canonical snapshot

## API Field-Level Provenance

Table:

- `apiFieldProvenance`

This answers:

- which source dataset and field path contributed to an API field
- what resolver logic was used
- what precedence order applied

Scope:

- per published API release set
- per API field
- NOT per entity row

Bundled mappings in `fixtures/meta/apiFields/` use the public resource field names and
may cover several exact source-schema signatures. Resolution selects an explicit lineage
anchor and retains only contributions from datasets in the selected release set. The
resolved mapping has its own content hash. A fixture match does not imply that every
mapped source contributes to every entity.

Each fixture declares `publisherFields` once per source dataset. Keys are paths in the
public source record, such as `properties.hkgovCsuId`, `sourceRecordId` or `geometry`;
values are original publisher paths. An array lists alternative publisher locations for
a retained key. Selection and merge behaviour belongs exclusively to processing rules;
this mapping does not duplicate their definitions.

Contributions use a separate `resourceType` and a resource-relative `apiField`, such as
`attributes.identifiers.hkgovCsuId`. Each input consists of `origin` and `fieldPath`;
source inputs must resolve in the contribution dataset's publisher mapping. Registry,
curation and intermediate origins identify their own field paths. Constants carry
`value`. The previous address snapshot ID is registry context; records read from that
snapshot are a separate intermediate dependency.

Publication stores the shared mapping once on `apiReleaseSets.publisherFields` and
includes the fixture hash in contribution hashes. Resource type participates in
provenance identity and uniqueness.

Statistics period inputs are dataset-specific: `year`, `PERIOD`, `YEAR` and `QUARTER`,
or release context. Value contributions identify individual publisher fields and their
reviewed curation entries. Dimensions, labels and comparability are attributed to
curation; parsed value kinds are intermediate normalisation results.

A resolver is either a generic operation or an existing processing-rule ID. Publication
resolves non-generic resolvers and supporting `processingRuleIds` exclusively against
definitions captured by the selected resource releases. `resolverRules` pins the
release, rule ID, ruleset version/hash and definition hash. A missing definition blocks
publication; current dataset metadata cannot substitute for the captured release policy.

Checks cover shared mappings and resource-relative locations, fixture hashes, selected
source signatures, rule pins, duplicate contribution identities and public contract
paths. Places resource attributes include registry timestamps and snapshot IDs;
document-level pagination is separate.

Stored fields:

- `apiField`
  - resource-relative contract path such as `attributes.level`
- `resourceType`
  - resource discriminator, stored separately from the field path
- `sourceDatasetId`
  - upstream dataset that may contribute to the API field
- `inputs`
  - ordered publisher, registry, curation, intermediate or constant inputs
- `resolverRules`
  - immutable processing-rule references captured for this publication
- `resolverCode`
  - stable code for the transformation rule, direct copy, lookup, or derivation
- `contributionType`
  - how this provenance row participates in the resolver
- `priority`
  - precedence order within the same API field and contribution group
- `confidence`
  - optional human-maintained confidence score for the mapping

Why these fields are stored this way:

- `inputs`
  - source paths refer to the shared publisher mapping; other origins identify their own
    field paths
- `resolverCode`
  - provenance needs to explain whether the contract field is copied, merged, looked up,
    or derived by a named rule
- `contributionType`
  - a resolver name alone is not enough because the same rule can consume inputs with
    different roles such as `primary`, `fallback`, or `resolver-input`
- `priority`
  - precedence is part of the published behaviour, so it must be visible in provenance
    rather than hidden inside implementation code

## Contribution Types

`contributionType` describes the role played by a provenance row.

- `primary`
  - the normal source for the API field
- `fallback`
  - only used when higher-precedence candidates are empty or unavailable
- `enrichment`
  - adds data beyond the primary source rather than replacing it
- `merge-input`
  - one input among several fields that are merged directly into the final API field
    value
- `resolver-input`
  - one input among several fields consumed by a named resolver that derives a canonical
    API field

Use `resolver-input` when the output field is not copied or merged directly from the
listed source field. Instead, the source field feeds a resolver that performs a
rule-based mapping or derivation.

Examples:

- `division.attributes.level`
  - `subtype` and `class` are `resolver-input` rows for `map_division_level`
- `division.attributes.class`
  - `subtype` and `class` are `resolver-input` rows for `map_division_type`

Do not use `merge-input` for those cases because the API field is not produced by "first
non-empty wins" merging. The resolver examines multiple hints together and emits a
canonical output.

## Resolver Codes

`resolverCode` should describe the actual transformation behaviour, not just the fixture
authoring pattern.

Examples:

- `direct_copy`
  - API field is copied straight from one source field
- `merge_first_non_empty`
  - API field is selected from an ordered list of source candidates
- `map_division_level`
  - canonical numeric division level is derived from Overture division hints
- `map_division_type`
  - canonical division type label is derived from Overture division hints

## Generic operations and retained storage

`lookup_registry` assigns a value from the selected registry context; `constant_value`
assigns a declared literal, including null. `wrap_publisher_sources` places attribution
under its publisher key (`overture` for Overture). `merge_first_non_null` preserves
empty arrays and strings, while `merge_first_non_empty` selects a non-empty candidate.
`derive_release_month` extracts the year-month from a dated release version.
`compose_identifier` concatenates the declared literal and identifier inputs in order.

Retained source properties use collision-checked camelCase names. Publisher values,
nulls, array order and language dictionary keys remain intact. Publisher mapping values
use the publisher spelling; source inputs use retained public paths. A change to
retained naming requires rebuilding retained source assertions and their dependent
materialisations; publishing a fixture alone does not rewrite them.

The provenance schema migrations target an empty provenance table in a rebuilt
pre-release database. They intentionally do not manufacture provenance from the removed
ambiguous path strings. Existing populated databases require a planned rebuild before
applying these migrations; immutable published releases are not rewritten in place.
