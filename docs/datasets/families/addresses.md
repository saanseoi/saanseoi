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

`attributes.parentAddressId` is the nullable canonical ID of a containing Address,
available in every API profile. It records explicit containment and is versioned with
the address. A parent can belong to another selected Address dataset; resolve it within
the same API release set. A dataset filter can omit the parent from a list response.
Null means no parent has been established, not that the address has no possible parent.

ALS and supplementary materialisation initialise this field to null. An ALS derivation
base, shared estate name, coordinate or building-number range does not establish a
parent. Parent assignment requires evidence and validation of the selected parent and
its ancestor chain; this storage foundation does not assign links or generate missing
numbered addresses.

See the [Address resource contract](../resourceType/address.md),
[ALS processing](../internal/hkgov/address.md) and
[supplementary curation policy](../sources/overture/places.md).
