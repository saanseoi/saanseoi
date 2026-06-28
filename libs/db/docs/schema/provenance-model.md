# Provenance Model

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

The versioned provenance path is now:

1. `apiReleaseSet`
2. `apiReleaseSetSnapshots`
3. `snapshots`
4. `snapshotSources`
5. `apiFieldProvenance`
