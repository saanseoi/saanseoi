# Record-level source attribution audit

This is the baseline audit for the publisher codes present in dataset fixtures on 12
October 2026. The 11 requested publishers all resolve to
`fixtures/meta/dataPublishers/{code}.json`; the registered dataset fixtures cover
Divisions, Division Areas and Boundaries, Addresses, Places, Streets and Statistics.
This fixture inventory does not establish that every archived or non-fixture ingestion
path has been inventoried. The writer references below describe current code paths; the
historical record population still needs a retained-shard census before replay.

## Canonical record shape

Public record-level `sources` is an array of source items. `publisherCode` and `dataset`
are required non-empty strings. Optional fields are `property`, `recordId`,
`updateTime`, `version`, `confidence` and `license`. `version` is the upstream record
version; attribution carries no ingestion release IDs or content hashes.

`property` preserves the publisher's RFC 6901 JSON Pointer in its original field
namespace. Absent, null or empty applies to the whole record; a more specific pointer
wins over broader attribution. Record attribution retains this upstream qualification
without introducing internal field contributions or processing decisions.

`fixtures/meta/sourceAttributions/overture.json` maps observed native dataset names to
stable upstream dataset names and publisher codes. These upstream datasets are not
registered as direct ingestion datasets. Publisher descriptions live in
`fixtures/meta/dataPublishers/`; the public publisher directory includes only publishers
that directly own a registered ingestion dataset. Unknown attribution datasets stop
normalisation so their publisher identity can be established explicitly.

## Fixture and writer coverage

The registered dataset fixtures are under `fixtures/meta/datasets/`. The following
grouping maps their publisher/resource combinations to writer families; each individual
fixture remains the authoritative dataset/resource registration.

| Publisher codes  | Registered resource families                                    | Current stored/API source shape and mapping gaps                                                                                                                                                                                                                                                                                                           |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dpang`          | Street                                                          | LandsD street lifecycle and source-update writers retain event/change references. Street source history includes event identity and evidence, not a stable record-level attribution array. Map only a verified upstream street ID and dataset; event rationale remains in street evidence.                                                                 |
| `hkgov-censtatd` | Division Statistics; selected Division identity/geometry inputs | Statistics writers retain source release and feature identity separately, while record `sources` can contain source assertions and measure/geometry provenance. `referenceYear` is domain data, not `updateTime`; confidence is not supplied as a generic record field. Use the selected registered dataset and actual feature key.                        |
| `hkgov-dpo`      | Address                                                         | ALS address writers store provider-specific source envelopes and evidence. Preserve the actual DPO source occurrence ID and source version where present. Curation and component assembly stay in internal evidence.                                                                                                                                       |
| `hkgov-had`      | Division Area                                                   | Geometry preparation can fall back to `{dataset, areaId}` and other paths retain provider-keyed references. Normalize the selected registered dataset and actual area record ID; do not synthesize update time, confidence or licence.                                                                                                                     |
| `hkgov-hyd`      | Street                                                          | Street ingestion and derived source references mix native street IDs, release/event metadata and processing history. Native feature IDs are record IDs; change-event fields stay in street history.                                                                                                                                                        |
| `hkgov-landsd`   | Street, Division, Road Centreline                               | Native street records and lifecycle code retain source references under provider-specific keys; Division derivation uses field lineage and retained native records. Keep record references in attribution and geometry/name selection evidence in their current evidence stores.                                                                           |
| `hkgov-pland`    | Division and Division Area                                      | Planning area references can be provider-keyed and include cell/group or component detail. Map actual Planning feature IDs; cell membership and geometry selection remain field-level or assembly evidence.                                                                                                                                                |
| `hkgov-rvd`      | Division                                                        | Historical list records and selected identities are retained through the Division pipeline. Map only an upstream RVD record key present in retained input; publication cohorts are not per-record update times.                                                                                                                                            |
| `overture`       | Place, Division                                                 | Place API currently exposes a nested `sources: { overture: [...] }` object with Overture attribution data; Division source projection preserves Overture `sources` under publisher context. Source-item fields and registered dataset identity are not consistently lifted to the canonical array. Keep property-level contribution data in field lineage. |
| `protomaps`      | Division Area (island feature)                                  | Protomaps extraction retains native source IDs and source metadata; curation can add construction/partition evidence around them. Only the native feature ID and registered dataset belong in record attribution.                                                                                                                                          |
| `saanseoi`       | Division and curated Division Area                              | Curated record helpers currently return provider-keyed arrays with `dataset`, `recordId` and sometimes `componentIndexes`; authored curations may substitute the owner ID. Remove provider nesting and component indexes from attribution. Authorship and geometry assembly remain lineage/evidence.                                                       |

The above publishers resolve to registry publisher details, including localized name and
description. Dataset fixtures also resolve `licenseCode` through
`fixtures/meta/dataLicenses/`. Those registry facts are not evidence that a specific
source record supplied a licence field. Several publishers expose release version at the
resource-release layer only; that value must not be relabelled as a per-record `version`
without an upstream record field.

## Address assembly evidence and retrieval

Public Address `sources` identifies the publisher, dataset and supporting source record
IDs. Supplementary addresses identify Overture Places; official addresses identify DPO
ALS. Places retain their Address links. Upstream records are retrieved through the
retained source archives using the matching source edition, since records and Address
links can differ between editions. Supplementary Address curation entries and decisions
belong to the Place audit. Address history retains canonical components and attribution
without a separate evidence payload or evidence index.

Place identity and Division association evidence lives in immutable R2 record-evidence
objects. Each object identifies its collection, record ID and schema version. Place
`sourceResolutions` retains entity membership and an evidence locator; readers verify
both bytes and record identity. Upload acknowledgement precedes SQL writes that expose
these references.

## Retained-record migration and replay

1. Inventory every current and historical `sources` value by table, dataset/resource,
   publisher and stored shape. Include archived writers and replay-only paths, not only
   active fixture registrations.
2. Build deterministic, idempotent adapters per writer family. Require a registered
   `publisherCode` and registered `dataset`; map only observed upstream IDs and optional
   fields. Preserve unrepresentable field lineage and assembly evidence in their current
   retained stores or add an R2 manifest link before dropping an embedded field.
3. Rebuild or transactionally rewrite retained snapshots using source-release inputs and
   the same adapters. Keep old rows and hashes available until representative API replay
   proves equivalence of canonical values, record references and evidence retrieval.
4. Verify representative records from every resource family and publisher, including
   historical replay across shard boundaries; then remove legacy readers and old-shape
   fixtures in the same reviewed release.

The initial implementation standardises supplementary Address2D attribution and keeps
its assembly evidence separate. The rest of the matrix is the worklist for
family-by-family adapter and retained-record migration; it is not a claim that all
legacy rows have already been rewritten.

## Local verification and reingestion gates

`bun scripts/audit-source-attributions.ts <sqlite-directory> <report.json>` scans every
populated SQLite file read-only. It groups every stored `sources` shape by
snapshot/source-release scope, inspects native `properties.sources`, reports empty
source columns, and emits a coverage entry for every metadata snapshot. Publication
pointers distinguish logical snapshots from physical scopes. Journal deltas and stored
historical versions do not establish full replay coverage.

Producer adapters cover official Addresses, Overture and curated Divisions, Planning and
C&SD geometry, LandsD Streets and district density statistics. The shared API schema
requires flat attribution arrays. Retained-row conversion still requires snapshot
replay, R2 evidence verification, cache invalidation, rollback receipts and fresh API
reads. Do not reset a scope with a publication in progress. The native dataset “Maps
Entity Variant Names” maps to Overture attribution by explicit policy, preserving its
property pointer, record reference and licence. This policy does not establish the
original publisher’s ownership.
