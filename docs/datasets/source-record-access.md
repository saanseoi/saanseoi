# Source-release schemas and samples

Source release pages expose Schema and Samples tabs for Addresses, Divisions, Places,
Statistics and Streets. The dataset's primary family determines the endpoint; derived
resources such as an address extracted from a Place do not select a different source
collection.

For a published or superseded, non-revoked release:

- `GET /{family}/v0.1/sources?sourceRelease={code}` returns retained publisher records.
  `sample=random&limit=1` selects an example; `include=geometry` includes retained
  geometry. Cursor pagination and NDJSON downloads use the same release selection.
- `GET /{family}/v0.1/source-schema?sourceRelease={code}` inventories the top-level
  `properties` field types across every retained record in all assigned source shards.
  It does not infer required fields or a non-null type from null-only values. Multiple
  observed types are represented as alternatives. Nested objects and array items remain
  open publisher values.

The Schema tab uses the versioned Overture definitions where available, including their
nested publisher annotations. Other sources display the exhaustive retained-field
inventory. The linked upstream specification remains the reference for the publisher's
validation constraints and fields absent from the retained release.

Samples initially show one random record. **Show more** adds up to four distinct
examples, preserving source identifiers and publisher values. Source geometry may use
the publisher's coordinate reference system; map applications use the appropriate
canonical API geometry.

## Release and storage selection

Every source table stores the version component of its owning release in
`validFromRelease` and `validToRelease`, such as `2025-09-24.0` or `2021`. Intervals
include the opening version and exclude the closing version. A null closing version
remains open. The metadata release association supplies dataset identity; validity
values never include dataset prefixes or resource suffixes. Shared C&SD tables are
bounded by their owning dataset's release IDs so equal versions in different datasets
cannot supply one another's samples or schema fields.

All assigned source shards participate in reads. Duplicate record/hash pairs are
collapsed and cursor pages are ordered by source identifier and hash across shards.
Random sampling uses indexed UUID pivots for Overture and random ordering for other
publisher identifiers.

ALS includes both 2D publisher records and 3D occurrences. Street feature tables retain
their native property objects. LandsD PDF baseline and notice records expose their
structured publisher extraction in `properties`, including notice evidence and
diagnostics, without changing source storage or notice-application decisions.

An empty source table or an incorrect shard assignment is an ingestion-data issue. The
source endpoints do not substitute canonical records or records from an unrelated
release. Repair requires the exact retained publisher evidence and correct shard
assignment.

## Retained field names

Non-Street source records use camelCase property keys. Publisher spelling remains in
API-field provenance in a dataset-scoped `publisherFields` mapping. Inputs refer to the
retained `properties.*`, `geometry` or `sourceRecordId` path. Language dictionary keys,
source literals, nulls and array order are preserved; ambiguous key renames fail intake.
HAD records use the publisher `OBJECTID` as their source ID independently of canonical
area identity. Source properties are separate from canonical publisher attribution,
which is wrapped under the publisher key.

Retained locale-bearing labels use `En`, `ZhHant` and `ZhHans` suffixes, for example
`buildingNameEn` and `dcZhHant`. Publisher mappings place these labels after other
properties. Original publisher paths and language dictionary identifiers retain their
spelling; demographic measures about language are not locale-bearing labels.
