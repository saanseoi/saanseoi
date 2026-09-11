# Meta Schema

The `meta` database is the control plane.

Core groups:

- publisher and licence registry
- dataset and release registry
- snapshot registry
- API contract registry
- provenance registry
- shard registry

## Publisher And Dataset Registry

Tables:

- `publishers`
- `publisherI18n`
- `licenses`
- `datasets`
- `datasetI18n`
- `releases`

Key points:

- `datasets.code` uses:
  - `ds-{region}-{publisherCode}-{resource-slug}[-{product-slug}]`
- `releases.code` uses:
  - `dr-{region}-{publisherCode}-{resource-slug}[-{product-slug}]-{sourceVersion}`
- Saanseoi-owned code segments are lowercase kebab-case; structured fields are never
  recovered by parsing a code.
- Programmatic resource types such as `divisionArea` become `division-area` in codes.
- `datasets.resourceTypes` is a non-null JSON array of distinct supported resource
  types. Registry reads return this array directly; upload validation checks membership
  for the selected dataset.

## Snapshot Registry

Tables:

- `snapshots`
- `snapshotLineages`
- `snapshotSources`

Key points:

- `snapshots.code` should use the snapshot-version format
- `snapshots.parentSnapshotId` records the exact parent in the lineage DAG
- `snapshotSources` records versioned upstream membership

## API Registry

Tables:

- `apiVersions`
- `apiEndpoints`
- `apiReleaseSets`
- `apiReleaseSetSnapshots`
- `apiFieldProvenance`

Key points:

- `apiVersions.code`
  - `api-{family}-v{version}`
- `apiVersions.familyType`
  - stores the API contract family such as `divisions` or `addresses`
- `apiReleaseSets.code`
  - `data-{region}-{family}-{cohort}-{revision}--{domain}`
- `apiFieldProvenance`
  - stores field-level sourcing for one published API release set
  - `resolverCode` names the actual transformation rule
  - `contributionType` distinguishes direct source rows from `resolver-input` rows

## Shard Registry

Tables:

- `dataShards`
- `releaseShardAssignments`
- `snapshotShardAssignments` (history shards containing each snapshot journal delta)

## Metadata contracts

`datasets.kind` identifies the product subdivision, for example `district`, `new-town`
or `pu`. It is independent of the dataset's `resourceTypes`.

`sourceCrs` describes the retained source geometry. Populate it from verified source
formats and decoding contracts. Document-only products may have no CRS; unknown values
remain null. ALS GeoJSON uses EPSG:4326 even though its properties also contain HK80
coordinate evidence. Lands Department native place-name and road-centreline geometries
use EPSG:2326. Overture geometry uses EPSG:4326. HyD street-name plates, sensitive
streets, strategic streets and TD pedestrian streets also retain EPSG:2326 coordinates
from their native FileGDB layers.

`datasets.processingRules` contains the current resolved policy. `sourceReleases` and
`releases` retain the policy at creation for reproducibility. These are intentional
copies: dataset synchronisation must not rewrite historic release policy. Registered
rule declarations supply exact definitions, interfaces, parameters and implementation
references; processing actions retain the decisions and counts actually produced.
Missing historical rules cannot be reconstructed by copying today's registry policy.

`sourceReleases.rawObjectKey` locates the retained publisher artefact or shared prepared
input. `releases.rawObjectKey` locates the resource's ingestion input. A multi-resource
source can own an archive while its resources point to different derived files. Complete
missing staged source keys without replacing an existing archive reference.

`publicationDate` accepts a calendar date. A year or half-year cohort remains in
`cohortKey` and `sourceVersion`; it does not imply a publication day.

Snapshot shard assignments locate journal deltas. A draft snapshot can exist before its
history shard is assigned. Audit missing assignments together with snapshot status and
publication state; table counts alone do not prove a broken published snapshot.
`snapshots.notes` is optional free-text annotation. Validity closure updates `validTo`
and does not automatically populate notes.

`stats.kind` classifies facts as `release`, `processing` or `apiReleaseSet`. Facts
belong to a resource release or an API release set. Presentation calculations can read a
snapshot while retaining ownership on the API release set. There is no snapshot-owned
stats producer or `stats.snapshotId` column.

## Auditing and metadata repair

Run `bun scripts/audit-meta-schema.ts /path/to/META.sqlite /path/to/repair.sql` from the
repository root. The command opens the target read-only, prints JSON findings and
optionally writes reviewable repair SQL. It supports the schema before and after the
`kind` migration. Run it again after repair and check remaining unknown metadata.

The repair plan fills missing source keys only when all child resource keys agree,
copies processing rules only from retained related-release evidence, and normalises
Planning Department release-stat ownership labels. It does not rewrite existing rule
values, guess multi-resource archive keys, assign draft shards or manufacture missing
publication dates. Apply schema changes and metadata repairs with ingestion writers
stopped and a retained database backup. Published source resources may be `superseded`;
that status still satisfies completed historical materialisation.
