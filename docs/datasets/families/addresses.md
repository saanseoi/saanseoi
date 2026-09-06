# Addresses dataset family

The default Address API domain is `saanseoi`, SaanSeoi's curated Hong Kong address
collection. It requires the authoritative ALS `address/default` member and includes the
accepted Overture Places `address/overture-places` member when available. Supplementary
snapshots use the latest applicable cohort reference, falling forward only when no
earlier snapshot exists. ALS ingestion can therefore complete before Places ingestion.

The `ds-hk-overture-place` dataset supplies both Place and supplementary Address
resource releases under one publisher source release. Places ingestion publishes the
curated Address release set with its recorded ALS and Division references, and finalises
the shared source only after both outputs succeed. Direct ALS matches reuse the ALS
identity; curated supplementary rows retain distinct deterministic identities.

Address list and search requests query the selected members as one collection.
`filter[dataset]=ds-hk-hkgov-dpo-address` selects ALS records;
`filter[dataset]=ds-hk-overture-place` selects supplementary records. Omitting the
filter includes both. Counts and pagination apply to the filtered collection, and
`attributes.datasetCode` identifies each record's dataset in every profile. An unknown
or unselected dataset returns an empty collection. Detail requests can resolve an
Address ID from either selected member.

See the [Address resource contract](../resourceType/address.md),
[ALS processing](../internal/hkgov/address.md) and
[supplementary curation policy](../sources/overture/places.md).
