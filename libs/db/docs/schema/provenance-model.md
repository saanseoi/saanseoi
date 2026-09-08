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

Source paths can identify prepared inputs as well as publisher fields. For Statistics,
`raw_properties` supplies the dataset-specific geography, period and measure inputs;
`fieldMetadata` identifies the reviewed field definitions used for dimensions, labels,
units and comparability. `normalise_statistics` records this interpretation. Public
record IDs use `derive_statistics_record_id` over dimensions, reference period and
source feature reference; `compose_source_feature_ref` records construction of the
publisher/dataset/version/layer/feature reference.

Address granularity uses `derive_address_granularity` over premise components and
reviewed overrides. Parent identity resolution uses `join_lookup`. Street and village
number inputs are conditional on the presence of a street name. Phase inputs include
both prepared top-level fields and the nested estate representation.

Resolver codes are seeded from the shared `resolverCodes` vocabulary. Regression checks
validate fixture hashes, resolver membership, exact-signature source coverage, duplicate
contribution identities and public contract paths. Release and request metadata, such as
snapshot IDs, timestamps and pagination, is outside source-field coverage.

Stored fields:

- `apiField`
  - canonical contract field identifier such as `division.attributes.level`
- `sourceDatasetId`
  - upstream dataset that may contribute to the API field
- `sourceFieldPath`
  - source-side field path or logical input path consumed by the resolver
- `resolverCode`
  - stable code for the transformation rule, direct copy, lookup, or derivation
- `contributionType`
  - how this provenance row participates in the resolver
- `priority`
  - precedence order within the same API field and contribution group
- `confidence`
  - optional human-maintained confidence score for the mapping

Why these fields are stored this way:

- `sourceFieldPath`
  - provenance must identify which upstream field or hint participates in the mapping,
    including resolver-driven fields that are not copied directly
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
- `division.attributes.divisionType`
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
