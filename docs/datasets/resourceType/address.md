# Address ResourceType

Hong Kong addresses are sourced from the Digital Policy Office Address Lookup Service
(ALS): `publisherCode: hkgov-dpo`, `code: ds-hk-hkgov-dpo-address`.

Related documentation:

- [HKGov ALS address](../internal/hkgov/address.md)
- [Common resource processing](common.md)

## Processing

ALS preparation assigns each premise a stable `ss-<uuid-v5>` identity and writes a
prepared parquet file. The address pipeline uses that identity for both the source
record and canonical address unless a reviewed ALS identity-drift decision retains an
earlier ID.

Processing requires a published, cohort-compatible division snapshot. The API
composition selects that snapshot as a required supporting member using its configured
cohort-matching rule.

The local SQL workflow processes parquet in chunks through `normalise`, `sql-source`,
`sql-history`, and `sql-current` stages. For a remote upload, `sql-source` compares each
normalised source payload with the persistent local mirror of the source D1 shard. It
imports full staging rows only for changed assertions; unchanged assertions are sent as
compact source-record IDs in `stagingAddresses2dReleaseRows` so their release lifecycle
can still advance. The source record hash excludes release and ingestion bookkeeping
(including the source version and file, resolved identity metadata, and division
snapshot) with the publisher address source record. History, current, and meta SQL are
then imported into their respective D1 databases.

## Stored data

Canonical current and history tables are `address2d`, `address2dI18n`, and the
exact-token `address2dBuildingNumberLookup`. The source database retains versioned ALS
assertions in `hkgovAlsAddresses2d`, including paired `addressEn` and `addressZhHant`
publisher values. Locale-keyed rows are materialised only for canonical address
snapshots and API use.

`address2d.parentAddressId` records an explicitly established containing Address ID or
null. It is included in canonical version hashes, history replay and snapshot copying,
and exposed as `attributes.parentAddressId` in every Address API profile. It is not a
same-snapshot foreign key: the parent can come from another Address member of the
selected release set. Parent existence, self-references and cycles must be checked when
assigning links. The separate `address3d.address2dId` reference identifies the premise
for a 3D address.

`address2d.granularity` uses the
[Address family vocabulary](../families/addresses.md#granularity) and defaults to
`unknown`. Ingestion derives it after component correction, honours guarded overrides,
and versions the resulting value with the canonical address. SQL and Worker
current/history paths retain this value, which appears in all Address API profiles.
Operational classification metadata and review evidence belong in codebase curations,
not database columns or public responses. Scope is independent of 2D/3D storage: an
explicitly reviewed street-level shop can be a `unit` without creating a 3D subpremise
record.

Source rows are keyed by `sourceRecordId + versionHash`. Current rows use
`isCurrent = 1`; prior versions are closed with `validToRelease`. Canonical snapshots
are cloned for an incoming release, changed rows create new versions, and rows seen in
the release are marked before final cleanup.

## Canonical component projection

ALS supplies bilingual premise components rather than the public canonical field names.
The importer projects each locale's block descriptor and block number to `blockType`,
textual `blockRef`, `blockExpression`, and `blockTypeBeforeNumber`. Recognised English
descriptor variants use canonical short forms (`BLK`, `BLDG`, `TWR`, `HSE`, and `APT`),
while Traditional Chinese puts the reference before its descriptor. Phase name and
number become `phaseName`, `phaseRef`, and `phaseExpression`; street or village number
endpoints become `buildingNumberFrom`, `buildingNumberTo`, and
`buildingNumberExpression`. A duplicated Arabic or Roman suffix is removed from
`phaseName` before the expression is built. Where an English estate phase series has a
numeric member, an unambiguous Roman suffix is normalised to that Arabic style and
recorded in a release processing action. `buildingNumberConnector` is `null` because ALS
supplies no range connector, and `bbox` is derived from the retained geometry.
`blockRef` is text, so alphanumeric and Roman values are preserved exactly. The original
bilingual ALS object remains available in `rawProperties` as the evidence for these
projections.

## API support

The registry declares the address endpoints in
`fixtures/meta/apiEndpoints/api-addresses-v0.1.json`:

- `GET /addresses/v0`
- `GET /addresses/v0/{id}`
- `GET /addresses/v0/search`

The SaanSeoi API implements these as JSON:API list and detail resources. The address
composition uses the default `saanseoi` domain: the required ALS address member and any
selected Overture Places supplementary member form one curated collection. A
cohort-compatible Overture division snapshot is required. List requests support
catalogue/cohort/release-set selection, profiles and locale projection, pagination, and
dataset/country/area/district filters. Address relationships identify all available
canonical containment levels: `country`, `area`, `district`, `town`, `macrohood`,
`neighbourhood`, `microhood`, `village`, and `hamlet`. They do not join division data by
default; `include=hierarchy` returns deduplicated Division resources in JSON:API
`included` using bounded D1 batches.

List and search requests accept `filter[dataset]=ds-hk-hkgov-dpo-address` for ALS or
`filter[dataset]=ds-hk-overture-place` for supplementary addresses. Omitting the filter
queries all selected Address members. A dataset outside the selected release set returns
an empty collection. Filtering precedes global counting and pagination, and links retain
the filter. Every profile exposes `attributes.datasetCode`; `full` also exposes the
record's detailed source evidence. Detail requests resolve IDs across both members.
Direct ALS matches create no duplicate supplementary Address.

`GET /addresses/v0/search` requires a declared `match` mode, so callers can make the
precision/recall trade-off visible in their request. `exact` searches only published
building-number aliases; `range` also accepts the importer’s auditable derived range
members. A bare numeric stem therefore does not match a suffixed range. `prefix` and
`full-text` search the rebuilt bilingual address index, while `component` requires one
of `formatted`, `building`, `number`, `block`, `phase`, `estate`, or `street` and
searches only that indexed component. Search treats canonical block abbreviations and
their English long forms as equivalent: `BLK`/block, `BLDG`/building, `TWR`/tower,
`HSE`/house, and `APT`/apartment (including plurals). The response records the query and
mode in document metadata. The index is rebuilt whenever the address snapshot changes
and is not an independent source of canonical data.

The `compact` and `default` profiles return localised formatted addresses, `map` adds
point geometry and bounding boxes, and `full` adds identifiers, source attribution, and
all stored localised address components. The public address API is two-dimensional; ALS
public-rental-housing floor and unit data remains outside this resource.

Building-number lookup retains exact endpoints and parser-derived range members; its
numeric stem is available only for deliberate partial matching. See
[3D address edge cases](../../../spec/3dAddressEdgeCases.md) for range and future
unit-address handling.

Addresses also support place search through the `places.addressSnapshotId` and
`places.address2dId` relationships.
