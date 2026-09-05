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

Source rows are keyed by `sourceRecordId + versionHash`. Current rows use
`isCurrent = 1`; prior versions are closed with `validToRelease`. Canonical snapshots
are cloned for an incoming release, changed rows create new versions, and rows seen in
the release are marked before final cleanup.

## API support

The registry declares the address endpoints in
`fixtures/meta/apiEndpoints/api-addresses-v0.1.json`:

- `GET /addresses/v0`
- `GET /addresses/v0/{id}`

The SaanSeoi API implements these as JSON:API list and detail resources. The address
composition uses the `official` domain, with an address snapshot as the primary member
and a cohort-compatible Overture division snapshot as a required supporting member. List
requests support catalogue/cohort/release-set selection, profiles and locale projection,
pagination, and country/area/district filters. Address relationships identify all
available canonical containment levels: `country`, `area`, `district`, `town`,
`macrohood`, `neighbourhood`, `microhood`, `village`, and `hamlet`. They do not join
division data by default; `include=hierarchy` returns deduplicated Division resources in
JSON:API `included` using bounded D1 batches.

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
