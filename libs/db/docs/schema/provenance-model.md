# Provenance Model

The versioned provenance path is:

1. `apiReleaseSet`
2. `apiReleaseSetSnapshots`
3. `snapshots`
4. `snapshotSources`
5. `apiFieldProvenance`

Saanseoi tracks provenance at two levels.

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

## Contribution Types

`contributionType` describes the role played by a provenance row.

- `primary`
  - the normal source for the API field
- `fallback`
  - only used when higher-precedence candidates are empty or unavailable
- `enrichment`
  - adds data beyond the primary source rather than replacing it
- `merge-input`
  - one input among several fields that are merged directly into the final API field value
- `resolver-input`
  - one input among several fields consumed by a named resolver that derives a canonical API field

Use `resolver-input` when the output field is not copied or merged directly from the listed source field.
Instead, the source field feeds a resolver that performs a rule-based mapping or derivation.

Examples:

- `division.attributes.level`
  - `subtype` and `class` are `resolver-input` rows for `map_division_level`
- `division.attributes.divisionType`
  - `subtype` and `class` are `resolver-input` rows for `map_division_type`

Do not use `merge-input` for those cases because the API field is not produced by "first non-empty wins" merging.
The resolver examines multiple hints together and emits a canonical output.

## Resolver Codes

`resolverCode` should describe the actual transformation behavior, not just the fixture authoring pattern.

Examples:

- `direct_copy`
  - API field is copied straight from one source field
- `merge_first_non_empty`
  - API field is selected from an ordered list of source candidates
- `map_division_level`
  - canonical numeric division level is derived from Overture division hints
- `map_division_type`
  - canonical division type label is derived from Overture division hints
