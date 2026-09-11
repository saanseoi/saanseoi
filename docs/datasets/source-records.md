# Source record storage

Within a source lineage and physical shard, a matching open content version remains
included until it is explicitly closed. Observing it in a new release does not update
its assertion release ID, first-seen validity, timestamps or indexes. Complete incoming
membership, rather than the last-written release ID, identifies omissions. Changed, new
and reopened versions require writes; a new shard also requires its own retained copy.
Snapshot-specific materialisation and provenance are recorded separately.

This contract covers Addresses, Divisions, Places and Statistics. Streets retains its
separate source contract.

## Publisher assertions

Source tables retain a publisher assertion under `(sourceRecordId, versionHash)`.
`sourceRecordId` identifies the publisher record or occurrence independently of the
canonical entity to which it resolves.

| Column                                            | Content                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sourceRecordId`                                  | Publisher record or deterministic occurrence identity.                                                      |
| `versionHash`                                     | Publisher content fingerprint, independent of acquisition bookkeeping and canonical resolutions.            |
| `properties`                                      | Upstream attribute values with documented field mappings.                                                   |
| `sourceGeometry`                                  | Original publisher geometry, retained once outside the properties. Non-spatial assertions use null.         |
| `sourceLocator`                                   | Optional private acquisition locator (asset, file, layer or feature position); never publisher attribution. |
| `releaseId`                                       | Release association.                                                                                        |
| `validFromRelease`, `validToRelease`, `isCurrent` | Source-version validity.                                                                                    |
| `createdAt`, `updatedAt`                          | Storage bookkeeping.                                                                                        |

A mapping may rename and flatten upstream attributes. It must preserve their values,
including leading zeroes, whitespace, explicit nulls and arrays. Formatted addresses,
corrected names, canonical identifiers, matching keys and inferred geography are not
publisher attributes. Do not retain both flattened attributes and a second nested copy.

Source-specific siblings may preserve native relationships such as LandsD `placeNames`
or collection identity such as the C&SD census cohort. Materialised geometry repairs and
transforms are explicitly named derivative evidence; they are not substituted for
`sourceGeometry`. C&SD's native geometry retains its existing compressed representation.

Overture's publisher `id` and `geometry` map to source identity and native geometry.
Publisher-authored `sources` remains inside `properties`, including its property
pointers and attribution entries. It participates in source content versioning.
`sourceLocator` contains only acquisition coordinates such as `sourceFile`,
`featureIndexOneBased`, `assetId`, `layer`, `layerName` or `sourceFeatureRef`. Dataset,
release, archive and publisher metadata belongs to the release and its assets, rather
than being repeated in every record. Acquisition metadata does not participate in native
source content hashes.

## Public record envelope

Addresses, Divisions, Places and Statistics return `sourceRecordId`, `properties` and
optional `geometry`. LandsD also retains its distinct native `placeNames` relationship.
`properties` exposes the stored object under the same name. The shared source endpoint
also uses `properties` for Streets. The response pin identifies the dataset and source
release. Resource types and variants describe contributions and canonical outputs, not
publisher rows; they are absent from this public record envelope. The private
`sourceLocator` is not returned as publisher data. Streets retains its separate envelope
and source storage.

`include=geometry` returns the retained native geometry, never a GeoJSON Feature or
FeatureCollection generated from the canonical entity. Coordinate values and the
publisher CRS are preserved. Native GeoJSON inputs can retain their original geometry
object; decoded SHP/FileGDB coordinates keep their original CRS and are not promised to
follow RFC 7946. Parsed GML retains its source-specific geometry structure. Binary
Overture WKB is represented as `{ "encoding": "wkb-base64", "data": "…" }`, preserving
the exact bytes, including byte order and extra dimensions. The publisher specification
and collection documentation define the native CRS and axis order. Storage compression
is decoded for transport; it is not a spatial transformation.

Do not substitute repaired, projected, simplified, centroid or display geometries.
Multiple publisher geometry fields must retain their identities and meanings; a
collection adapter must document its mapping rather than silently select one or merge
them into an invented GeometryCollection.

## Prepared rollout

`prepare-source-contract-rewrite.ts` reads an offline source database and produces
guarded conversion SQL, exact rollback SQL and a JSON report. It restores Overture
attribution to `properties` and compacts acquisition references before the generated
`sources` to `sourceLocator` column-renaming migration. It excludes Streets tables.
Unknown provenance shapes, supplemental assertions and enriched/nested ALS payloads are
reported for upstream replay. HAD and LandsD Place Names geometry retained as
longitude/latitude requires native FileGDB replay; inverse projection is not a
substitute for the original evidence.

Review and resolve every replay report before releasing the contract. Verify retained
source assertions, version history and canonical resolution links; apply the reviewed
data conversion before the generated schema migration. Roll back the column rename
before using the data rollback SQL. Deploy ingestion and API readers against the same
schema, then publish the app schema presentation. No runtime compatibility path masks an
incomplete data conversion. A data relocation alone cannot recover original WKB from a
decoded coordinate object; replay the upstream record when that encoding is required.

Supplemental Overture division fixtures belong to canonical snapshots. They do not
create publisher assertions or advance the validity of an absent publisher record.

## ALS acquisition and field mappings

Capture the original 2D collection before corrections, reconstruction, consolidation,
identity matching or coordinate backfill. The sealed ALS preparation sidecar retains
every original occurrence, including assertions which do not produce an independent
canonical address. An occurrence key uses the original source file, CSU ID, GeoAddress
and occurrence ordinal. Equal publisher content in different occurrences may share a
content hash while retaining distinct source identities.

The ledger is sealed for 2D-only deliveries too. Address3D source rows retain the actual
uploaded occurrences, including occurrences combined or replaced by house retention.
Reconstructed inventories create canonical collections with compact curation and
historical-evidence references; they do not create source rows for features absent from
the upload. Original assertions are not embedded again inside processing provenance.

`alsSourcePropertyNames` in
`libs/core/src/pipeline/services/sources/alsSourcePayload.ts` defines the field mapping
for both ALS dimensions. For example, `BuildingCsuInformation.CsuId` becomes
`hkgovCsuId`, `GeoAddress` becomes `geoAddress`, and bilingual address components use
`en` and `zhHant` prefixes. Village name and village location remain separate
attributes. Nested estate phases map to the locale phase name and number; street
location names remain distinct from street names. Bilingual 3D address arrays use
`en3dAddress` and `zhHant3dAddress`. Unmapped paths use camel-case names formed from
their path segments; ambiguous name collisions stop processing rather than overwrite a
publisher value. Arrays and empty objects remain literal values.

The prepared canonical rows carry an explicit publisher envelope. Source persistence
reads only that envelope; missing preparation envelopes require preparation from the
upstream artefacts. The normalisation stage verifies the captured publisher hash.
Synthetic canonical rows have no publisher assertion of their own.

## Resolutions

The history database's `sourceResolutions` relation records interpretations without
mutating publisher assertions:

| Column                                | Content                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `scopeId`                             | `snapshot:<snapshotId>` or `release:<sourceReleaseId>`.                            |
| `snapshotId`                          | Interpreting snapshot; null for release-versioned Statistics.                      |
| `sourceReleaseId`                     | Source release being interpreted.                                                  |
| `sourceRecordId`, `sourceVersionHash` | Exact retained publisher assertion.                                                |
| `resolutions`                         | JSON with resolved entity references, processing methods and applicable decisions. |

The key is `(scopeId, sourceReleaseId, sourceRecordId, sourceVersionHash)`. `entities`
contains arrays of canonical IDs, allowing one assertion to support several entities.
Different snapshots retain independent interpretations of the same source version.
Canonical attributes and geometry remain in canonical records; they are not copied into
this relation. Statistics resolve observations under their release scope and retain
resolution rows in the corresponding observation history shard.

LandsD division resolutions select the retained native Place Name assertion by its
publisher ID and source-version validity. The canonical upload shape does not supply the
source fingerprint. Native publisher names preserve whitespace and empty strings.

## Verification

Prepare an offline copy of each affected source shard:

```sh
bun scripts/prepare-source-contract-rewrite.ts --database source.sqlite --output review.sql
```

The conditional updates preserve source identities, version hashes and release-validity
intervals. Review the JSON report and its replay requirements before applying any SQL.
The input database is never modified. The report measures JSON-column bytes, not
physical database space recovered. Use the generated rollback SQL with the pre-migration
column names; revert the schema rename first if it has already been applied.

Rebuild assertions requiring upstream replay from retained publisher artefacts and
verify occurrence counts, publisher values, native geometry and resolution links.
Filtering enriched ALS JSON cannot establish original publisher values. Published
release recovery retains its normal publication and immutable-evidence checks.

`scripts/remap-als-source-properties.ts` prepares guarded field-name updates and exact
rollback SQL for retained ALS assertions. Its optional `--apply-local` mode is
restricted to development databases under `.local/d1`. This mapping preserves publisher
values, record identities, history links and stored version hashes.
