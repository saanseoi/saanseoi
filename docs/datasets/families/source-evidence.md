# Canonical source evidence

## GeoJSON serialisation

Ingestion writes GeoJSON geometry members in the order `type`, optional `bbox`, then
`coordinates`. Geometry collections use `geometries` instead of `coordinates`, with the
same ordering applied to their children. Foreign members follow these members. This
applies to source and canonical JSON, compressed geometry and prepared SaanSeoi archives
across datasets. Coordinates and existing bounds retain their values; no bounds are
inferred. Deterministic content hashing remains independent of this presentation order.

Addresses, Divisions and Statistics separate canonical values, source references and
processing evidence. Canonical `sources` contains record references, not copied
publisher properties, curation explanations, normalisation flags or prepared alias rows.

Snapshot source selections and immutable resource/source releases hold dataset identity,
source version, cohort, archive filename and source schema version. The retained native
assertion holds its exact file/feature locator. Canonical district membership is not a
substitute for that locator. Statistics retains the selected source release and feature
reference for each field independently.

Canonical `sources` is an array of publisher attribution entries, including dataset and
applicable publisher record IDs. Full API responses expose these entries directly.
Snapshot selections pin the source editions. Planning geometry references native New
Town IDs or contributing cell IDs; Statistics retains field-specific feature references.
Processing evidence remains in retained archives and audit objects.

ALS Address2D references identify the captured publisher occurrence and its version
hash. Curated premises additionally identify their canonical record in the selected
release's retained processing audit. Component corrections reference reviewed entry IDs
and revisions. Address3D collections retain source occurrence IDs and compact audit
references; inventory processing decisions remain in the interpretation/audit stores.

Only `profile=full` expands source references. The full document's
`meta.sourceSpecifications` is keyed by resource release ID and describes the exact
resource/source release codes, dataset, cohort, source version, source schema version
and archive filename. Native source locators and audit evidence remain in their
respective stores. Reconstruction batches records by snapshot and resource type rather
than issuing one database read per result. Places and Streets provenance implementation
is deferred.

Address3D current materialisation removes only omitted collections and writes only
changed inventories or localisations. Publisher source validity is independent of
canonical membership.

## HISTORY producer ownership

A HISTORY row is an event introduced by its `snapshotId`. META
`snapshotResourceReleases` identifies the snapshot's primary producing inputs and their
exact resource releases. Each dataset and resource type has at most one producing
release within a snapshot. Registration checks this in the insertion statement; assembly
and replay reject ambiguous ownership. Enrichment and lookup roles describe input
relationships, rather than permanent roles on canonical records.

HISTORY payloads and the `historyEvents` view omit `sourceReleaseId`. Replay derives the
producing release from the introducing snapshot, including for inherited rows. CURRENT
projections and API provenance retain their required release references. Field-specific
source references and publisher attribution remain independent of producing ownership.
Deletion events need record identity and snapshot membership, without a release owner.

C&SD companion geometry can combine primary inputs from several datasets. Its HISTORY
`divisionAreas` and `divisionBoundaries` rows retain `producerDatasetCode` to
distinguish those inputs. Other geometry producers leave this discriminator null. A
mixed snapshot requires a recognised dataset on every content event; replay never
selects an arbitrary input. The discriminator belongs to HISTORY ownership, rather than
CURRENT geometry or public identifiers. Statistics reuses its existing `datasetCode`
keys for the same ownership resolution, without an additional stored discriminator.

Before applying the ownership migration to a populated shard, verify the retained
introducing-snapshot/input mapping. Mixed snapshots need their dataset discriminators
retained from the existing ownership evidence before removing release columns. Apply all
preceding schema and data prerequisites before this migration.

## Managed source manifests

Retained source objects and their manifests are separate immutable R2 objects registered
in META `assets`. Each manifest has `role=manifest` and `sourceAssetId` referencing the
source asset it describes. The indexed relationship supports several provenance
manifests for the same byte-identical archive, including distinct CSDI archive slots.
Manifest JSON is stored only in the sidecar, not copied into the database.

Both objects use their own SHA-256 content hash in the object key and have independently
downloadable asset IDs. Register the source object before its manifest. Retries verify
retained bytes, reuse existing IDs and retain the source relationship. A manifest cannot
describe another manifest or be reassigned to a different source object.

Source-release retention creates sidecars for publisher ZIPs, Parquet and losslessly
packaged GML or GeoJSON. CSDI sidecars retain the publisher filename, archive members,
source URL and archive slot; inspected layers and semantic fingerprints are included
when available. Retrieval timestamps belong to asset metadata and do not alter the
source-release sidecar's immutable content.

The generated META schema migration removes inline manifest JSON. Populated stores must
retain those bodies as managed sidecars and establish their source links before applying
the migration, or use a separately authorised rebuild. Schema migration alone does not
copy database JSON into R2.

## Shared Statistics definition selections

`statsRecords.definitionSetId` references the immutable field-definition map in
`statsDefinitionSets`. Current and history each retain the sets they require.
Publication and rollback copy referenced sets together with their field and measure
definitions; missing sets fail closed. Repeated records share a set, including across
releases when the selected field meanings match. Readers expand the map without storing
a copy on every observation pack.

The generated current/history schema migrations target a rebuilt database. Populated
stores require an isolated rebuild retaining their existing field-definition selections
before publication; adding the required reference column alone is not a data conversion.

## Native acquisition coordinates

The native SQL importer resolves the retained archive through `resourceReleaseId`. It
omits a repeated archive object key and a `sourceFeatureRef` equal to `sourceRecordId`.
Locator coordinates common to every row of an imported table are stored once as
`tables[].locatorDefaults` in the META processing run results. Only row-specific
coordinates remain in `sourceLocator`. Reconstruct a complete acquisition address using
the release archive, the table defaults and the row locator, in that order. This
supports multiple archive members and layers without duplicating a constant file or
layer on every record. Publisher properties and payload hashes do not include these
acquisition coordinates.

`sourceLocator` is explicit on ALS address, Planning cell and C&SD statistic tables.
HAD, Overture, SaanSeoi, C&SD district geometry, Planning New Town, LandsD place name,
Protomaps island and RVD area tables omit it: their retained archive, publisher identity
and table receipt supply the acquisition address. SQL writers omit absent locators.

A completed canonical publication does not prove native SOURCE rows are present.
Explicit local native recovery replays the source archive even when the canonical
snapshot receipt is already complete; it preserves that completed snapshot.

Local family resets remove publication-owned processing runs and CURRENT delivery
receipts along with the selected resources. Source archives remain available for replay.
Reingestion explicitly relinks retained archives to the recreated release; an existing
asset registration alone does not prove that release linkage survived a reset.

## Processing policy ownership

Dataset processing policies cover extraction and SOURCE retention, with explicit
prepared-record inputs where archive preparation precedes intake. Snapshot recipes own
canonical processing. Each stage captures its exact immutable definition; a field
reference identifies its origin, collection and programmatic path, while descriptions
remain separate localised prose.

See the [processing policy contract](../pipeline.md#define-audit-processing-rules).

## Recurring source validity periods

A source assertion with release-validity bounds is identified by
`(sourceRecordId, versionHash, validFromRelease)`. The hash identifies content; the
start release identifies one continuous occurrence. A return to earlier content creates
a new period, including after a removal. Only an open occurrence can continue into the
next release. Closed occurrences retain their original start, end and release owner.
Retries address the same complete period key, including SQL replay and large-payload
updates. A source ledger explicitly keyed by resource release records membership per
release instead. Canonical history uses snapshot membership and retains its content
keys.

## Persisted record change counts

Source releases store aggregate `changes` rows with no dimension: `count`,
`added_count`, `changed_count`, `removed_count` and `unchanged_count`. The first release
counts its retained records as added. Comparisons use the preceding published,
non-revoked release of the same dataset and resource type, across all required yearly
SOURCE shards. Types and statistical structures have separate breakdowns; they do not
substitute for these record totals.

C&SD compares exact release-owned publisher assertions, including all retained reference
periods, properties and content-addressed native geometry. Native Street sources compare
publisher assertions at their source-version validity intervals. LandsD Street
assertions include both baseline PDF rows and extracted notices. Missing or ambiguous
retained comparison evidence must not produce invented totals.

API release sets store the same aggregate measures for their primary public records.
Statistics counts geography packs, Addresses counts Address2D records, Divisions counts
Divisions, Places counts Places and Streets counts Streets. Comparisons follow the
preceding publication within the API version, domain and region; Statistics also matches
period granularity. Places and Streets replay exact HISTORY branches, including
independent translations and Street geometry. An unchanged reissue counts inherited
records as unchanged, even across yearly shards. The Changes and Stats pages read
persisted totals; opening a page does not backfill missing summaries.
