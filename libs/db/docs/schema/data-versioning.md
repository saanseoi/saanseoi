# Data Versioning

Saanseoi uses separate version namespaces for contract, published data, canonical
schema, and transformation logic.

They should not be collapsed into one identifier.

## Version Namespaces

`apiVersion`

- format: `api-{family}-v{apiVersion}`
- example: `api-divisions-v0.1`
- `{family}` is the `ApiFamily` derived from `resourceType` by
  `getApiFamilyForResourceType()`
- current mappings:
  - `address` -> `addresses`
  - `division` -> `divisions`
  - `place` -> `places`
  - `street` -> `streets`
- scope: public API contract
- changes when:
  - response fields change
  - response semantics change
  - routing/query behavior changes

`snapshotVersion`

- format: `ss-{region}-{resource-slug}[-{variant}]-{cohort}[-r{revision}]`
- example: `ss-hk-division-2026-06-17.0`
- scope: published snapshot of one canonical resource type
- stored as `snapshots.code`
- changes when:
  - a new upstream snapshot is published
  - a corrected release replaces a previously published snapshot for the same date
  - a historic backfill is published

`schemaVersion`

- format: `sv-{resource-slug}-v{version}`
- example: `sv-division-v1`
- scope: canonical field-definition set for one resource type
- changes when:
  - a canonical field is added
  - a canonical field is removed
  - a canonical field is renamed
  - field semantics change incompatibly
  - a relationship field is added or removed
  - i18n field shape changes
  - provenance-target field paths must change

`rulesetVersion`

- format: `rs-{resource-slug}-{strategy}-v{version}`
- example: `rs-division-merge-v1`
- scope: transformation and merge logic for one resource type and strategy
- changes when:
  - source-priority order changes
  - fallback logic changes
  - normalization logic changes
  - lookup/join logic changes
  - confidence heuristics change
  - source reconciliation rules change

## Naming Notes

Saanseoi-owned code segments use lowercase kebab-case. Programmatic resource types are
converted before being embedded in a code, for example `divisionArea` becomes
`division-area`. Codes are not parsed to recover registry metadata.

`snapshotVersion` is intentionally not tied to a source code.

The published snapshot is the canonical product artifact, not a raw-source artifact.

For Hong Kong phase 1:

- `region` = `hk`
- `resource-slug` = `division`, `division-area`, `division-boundary`, `address`,
  `street`, `place`
- `releaseDate` = `YYYY-MM-DD`
- `increment` starts at `0`

The intended release date source is resource-type-specific.

Current policy:

- divisions
  - use the Overture release date
- addresses
  - use the Overture address release that the canonical address snapshot is based on
- places
  - use the Overture release date

## Fixtures

Fixture directories under `fixtures/meta/` should be treated as version-controlled
source of truth.

Relevant fixture groups:

- `apiVersions/`
- `apiFields/`
- `datasets/`
- `dataShards/`
- `dataLicenses/`
- `dataPublishers/`
- `schemaVersions/`
- `rulesetVersions/`

`apiReleaseSets` are created from real uploaded datasets, not seeded from fixtures.

`apiFields/` fixture files may still carry a representative snapshot code in the
filename:

- `api-divisions-v0.1@ss-hk-division-2026-05-20.0.json`

Applicability is defined by fixture metadata, not only by the filename.

Current selection keys are:

- `apiVersion`
- `schemaVersion`
- `rulesetVersion`
- `sourceSchemas`
- `validFromSnapshotVersion`

These fixtures are resolved at API release publication time to populate
`apiFieldProvenance`.

## Historical membership

Canonical history tables retain content versions keyed by entity identity and semantic
`versionHash`. They do not use snapshot or cohort validity ranges. Exact membership is
defined by the meta `snapshots.parentSnapshotId` graph and the history-shard
`snapshotVersionChanges` journal. Each journal row is an upsert of an exact content hash
or a deletion tombstone relative to the parent snapshot. Meta `snapshotShardAssignments`
locates every snapshot delta; replay follows those recorded assignments across year
shards rather than deriving placement from a cohort string.
