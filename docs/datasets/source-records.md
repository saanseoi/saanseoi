# Source record storage

This contract covers Addresses, Divisions, Places and Statistics. Streets retains its
separate source contract.

## Publisher assertions

Source tables retain a publisher assertion under `(sourceRecordId, versionHash)`.
`sourceRecordId` identifies the publisher record or occurrence independently of the
canonical entity to which it resolves.

| Column                                            | Content                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `sourceRecordId`                                  | Publisher record or deterministic occurrence identity.                                              |
| `versionHash`                                     | Publisher content fingerprint, independent of acquisition bookkeeping and canonical resolutions.    |
| `rawProperties`                                   | Upstream attribute values with documented field mappings.                                           |
| `sourceGeometry`                                  | Original publisher geometry, retained once outside the properties. Non-spatial assertions use null. |
| `sources`                                         | Publisher attribution or references locating the acquisition evidence.                              |
| `releaseId`                                       | Release association.                                                                                |
| `validFromRelease`, `validToRelease`, `isCurrent` | Source-version validity.                                                                            |
| `createdAt`, `updatedAt`                          | Storage bookkeeping.                                                                                |

A mapping may rename and flatten upstream attributes. It must preserve their values,
including leading zeroes, whitespace, explicit nulls and arrays. Formatted addresses,
corrected names, canonical identifiers, matching keys and inferred geography are not
publisher attributes. Do not retain both flattened attributes and a second nested copy.

Source-specific siblings may preserve native relationships such as LandsD `placeNames`
or collection identity such as the C&SD census cohort. Materialised geometry repairs and
transforms are explicitly named derivative evidence; they are not substituted for
`sourceGeometry`. C&SD's native geometry retains its existing compressed representation.

Overture's publisher `id`, `geometry` and `sources` map to the source identity, geometry
and attribution siblings. Other publisher fields remain in `rawProperties`. Publisher
attribution participates in Overture source versioning; ingestion acquisition metadata
does not participate in native source content hashes.

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

`alsSourcePropertyNames` in `libs/core/src/pipeline/services/alsSourcePayload.ts`
defines the field mapping for both ALS dimensions. For example,
`BuildingCsuInformation.CsuId` becomes `hkgovCsuId`, `GeoAddress` becomes `geoAddress`,
and bilingual address components use `en` and `zhHant` prefixes. Village name and
village location remain separate attributes. Unmapped attributes use escaped
JSON-pointer keys, preserving newly supplied fields without guessing their meaning.
Arrays and empty objects remain literal values.

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

## API envelope and verification

Non-Streets source responses expose `rawProperties` and sibling `sources`. Original
geometry is returned as `geometry` only when requested, without a second copy inside
`rawProperties`. Native LandsD names are exposed as the `placeNames` sibling.

Generate source and history schema migrations with the repository migration commands.
Validate retained payloads before exposing a source shard under this contract. The
read-only preparation command

```sh
bun scripts/prepare-source-payload-rewrite.ts --database source.sqlite --output review.sql
```

produces conditional Overture relocation statements and a JSON report. It preserves
source identities, version hashes and release-validity intervals, refuses conflicting
siblings, and does not modify the input database. Relocation recognises an equivalent
`overture` attribution wrapper and guards against changes to either sibling after
preparation. Supplemental division rows are counted for upstream replay and excluded
from relocation SQL. Apply the generated schema migrations before executing a reviewed
relocation. The report measures property bytes and total JSON-column bytes; neither
measures physical database space recovered.

ALS assertions requiring upstream replay are counted separately. Rebuild those from
retained upstream artefacts and verify source occurrence counts, publisher values,
geometry and resolution links. Filtering enriched ALS JSON cannot establish the original
publisher values. Published release recovery retains its normal publication and
immutable-evidence checks.
