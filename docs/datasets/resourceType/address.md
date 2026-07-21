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

Processing requires a published, same-cohort division snapshot. The API composition
selects that snapshot as a required supporting member with exact cohort matching.

The local SQL workflow processes parquet in chunks through `normalise`, `sql-source`,
`sql-history`, and `sql-current` stages. It stages source data in `stagingAddresses2d`
and `stagingAddresses2dI18n`, then imports generated source, history, current, and meta
SQL into their respective D1 databases.

## Stored data

Canonical current and history tables are `address2d` and `address2dI18n`. The source
database retains versioned ALS rows in `hkgovAlsAddresses2d` and
`hkgovAlsAddress2dI18n`.

Source rows are keyed by `sourceRecordId + versionHash`. Current rows use
`isCurrent = 1`; prior versions are closed with `validToRelease`. Canonical snapshots
are cloned for an incoming release, changed rows create new versions, and rows seen in
the release are marked before final cleanup.

## API support

The registry declares the address endpoint aliases in
`fixtures/meta/apiEndpoints/api-addresses-v0.1.json`. Addresses also support place
search through the `places.addressSnapshotId` and `places.address2dId` relationships.
