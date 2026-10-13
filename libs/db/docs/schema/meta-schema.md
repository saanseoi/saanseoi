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
- `licenses`
- `datasets`
- `sourceReleases`
- `resourceReleases`

Key points:

- `sourceReleases` identifies one publisher dataset version, unique by dataset and
  source version. `resourceReleases` identifies each processed resource, unique by
  dataset, resource type and source version. Each resource references its parent through
  `resourceReleases.sourceReleaseId`; resource foreign keys use `resourceReleaseId`.

- `datasets.code` uses:
  - `ds-{region}-{publisherCode}-{resource-slug}[-{product-slug}]`
- `resourceReleases.code` uses:
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
- `snapshotResourceReleases`
- `snapshotRecipes`
- `snapshotRecipeInputs`
- `snapshotAssemblies`
- `snapshotDependencies`

Key points:

- `snapshots.code` should use the snapshot-version format
- `snapshots.parentSnapshotId` records the exact parent in the lineage DAG
- `snapshotResourceReleases` records concrete upstream release membership
- `snapshotRecipes` and `snapshotRecipeInputs` describe effective dataset/role selection
  policies; processing implementations live in the codebase
- `snapshotAssemblies` links each snapshot to one recipe and records its construction
  anchor. Local preparation caches retain review cases and block assembly until
  resolved.
- `snapshotDependencies` pins exact input snapshots by role, with one selection per
  snapshot and role

## API Registry

Tables:

- `apiVersions`
- `apiEndpoints`
- `apiReleaseSets`
- `apiReleaseSetSnapshots`
- `apiFieldProvenanceGroups`
- `apiFieldProvenance`

Key points:

- `apiVersions.code`
  - `api-{family}-v{version}`
- `apiVersions.familyType`
  - stores the API contract family such as `divisions` or `addresses`
- `apiReleaseSets.code`
  - `data-{region}-{family}-{cohort}-{revision}--{domain}`
- `apiFieldProvenanceGroups`
  - stores changed field provenance groups for one published API release set
- `apiFieldProvenance`
  - stores the member contributions of a changed group
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

`datasets.processingRules` contains a plain-text SHA-256 reference to the current
resolved ingestion policy, with `stage: "ingestion"`. Registry synchronisation stores
the full resolved policy once in `processingRuleDefinitions` and updates the dataset
reference. `sourceReleases.processingRules` and `resourceReleases.processingRules`
capture that same reference at creation. Later dataset synchronisation does not rewrite
captured release references.

Release and recipe references store the hash directly, for example
`sha256:d43257fbc7629972d11e2ffc357176649e9469480dd40ab1ced1bb95317e52f3`. Readers
resolve it with `processingRuleDefinitions.id = processingRules`. The full policy in
`processingRuleDefinitions.definition` remains JSON.

`snapshotRecipes.processingRules` retains a plain-text SHA-256 reference for the
resolved `stage: "assembly"` policy. The effective recipe hash includes those rules as
well as its selected input policies. `snapshotAssemblies.snapshotRecipeId` pins the
recipe used by a snapshot; draft revisions can select another content-addressed recipe,
while published snapshots keep their existing recipe. Null historical references remain
unknown rather than acquiring today's rules.

Registered declarations supply exact definitions, interfaces, parameters and
implementation references. Rule `kind` groups bulk and record scope within one schema.
Structured field references identify an origin, collection and programmatic field path.
API field rule pins identify either an ingestion resource release or an assembly recipe;
shared lineage definitions retain both ingestion and assembly definition hashes.

Release tables retain version, processing policy and lifecycle metadata. Durable files
are registered in `assets`; processing inputs use transient locations outside the
release tables. Original filenames and packaging details live in manifests.

`publicationDate` accepts a calendar date. A year or half-year cohort remains in
`cohortKey` and `sourceVersion`; it does not imply a publication day.

Snapshot shard assignments locate journal deltas. A draft snapshot can exist before its
history shard is assigned. Audit missing assignments together with snapshot status and
publication state; table counts alone do not prove a broken published snapshot. Validity
closure updates `validTo`.

Statistics have exactly one owner: `resourceReleaseId` or `apiReleaseSetId`. The owner
is independent of `metric`, which describes the measurement. Processing-action counts
use `metric: processing`; replacing ordinary release measurements preserves those
counts. There is no `stats.kind` or snapshot-owned statistics producer.

## Auditing and metadata repair

`bun run db:migration:run:local` applies generated migrations directly to the configured
local D1 SQLite files. Each database's pending migrations and migration receipts commit
atomically. Foreign-key enforcement is disabled before the transaction so parent-table
rebuilds preserve dependent rows; a foreign-key check must pass before commit. Backups
include committed WAL contents and live under `.local/d1/migration-backups/`.

The remote migration commands use Wrangler. D1's implicit transactions cannot disable
foreign-key enforcement, so the local runner does not establish that a generated
parent-table rebuild can run against a populated remote database.

Run `bun scripts/audit-meta-schema.ts /path/to/META.sqlite /path/to/repair.sql` from the
repository root. The command opens the target read-only, prints JSON findings and
optionally writes reviewable repair SQL. It audits the current schema. Run it again
after repair and check remaining unknown metadata.

The repair plan copies processing rules only from retained related-release evidence, and
normalises Planning Department release-stat ownership labels. It does not rewrite
existing rule values, guess multi-resource archive keys, assign draft shards or
manufacture missing publication dates. Apply schema changes and metadata repairs with
ingestion writers stopped and a retained database backup. Published source resources may
be `archived`; that status still satisfies completed historical materialisation.

## Asset ownership

`releaseSourceArchive` retains original publisher bytes as Parquet or ZIP and links
through `assets.sourceReleaseId`. Loose GeoJSON and GML are packaged losslessly.
Acquired archives may remain unlinked until registration. Sibling resources share their
publisher archive.

`resourceSourceArchive` retains a resource-specific source dataset as Parquet and links
through `assets.resourceReleaseId`. Native multi-table exports include `sourceTable`;
complex values use JSON strings in Parquet columns. Each resource owns its export.

Manifest assets use `sourceAssetId` and inherit the source object's release ownership.
Hash, size, media type and private object key remain in `assets`. Source-release
deletion detaches retained originals for replay. Resource exports are removed before
deleting their owner. Public delivery resolves attribution through either ownership
path.

## Localised metadata

`publishers.i18n`, `datasets.i18n` and `units.i18n` store JSON arrays of locale values,
such as `[{"locale":"en","name":"Example"}]`. Optional descriptions and short names live
in the same entries. Parent IDs and timestamps belong to the owning row.

`apiCompositionMembers.i18n` stores the domain's locale values directly. Members with
the same `apiCompositionId` and `domainCode` share identical translations. The member's
`domainCode` identifies the domain; the JSON has no domain-code wrapper.

Metadata migrations and registry synchronisation form one maintenance operation: run the
meta migration, then `bun run db:sync:meta` for a local database before starting
readers. Use the corresponding environment-specific registry sync for a remote database.
Registry fixtures populate these columns, including rows whose fixture version hashes
already match.
