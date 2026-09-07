# Identity lookups

`GET /v0.1/identityBridge` provides distinct source identifier-to-canonical resource
mappings from a published API release set. It reads immutable snapshot membership and
record content; it does not require a materialised bridge table or a fixture containing
every deterministic mapping. Ordinary public API authentication and usage limits apply.

Required selectors are `releaseSet` and `domain`. `resourceType` is `division` (default)
or `address2d`; `region` is `hk` (default) or `mo`. Supply `catalogRevision` to select
the publication catalogue explicitly. A release absent from that publication scope
returns 404.

```text
/v0.1/identityBridge?releaseSet=<release-set-code>&domain=hkgov-pland-pu&namespace=PLAND:TPU&identifier=351
```

Each `data` entry contains `namespace`, `identifier` and `canonicalId`. Nested
identifier paths use dots, such as `hkgovCsuId` or `hkgovCenstatd.code`. Strings and
numbers are returned as strings. Optional `namespace`, `identifier` and `canonicalId`
filters use exact matching. An empty result is a successful lookup, not a missing
release.

`limit` controls the returned mapping count, defaults to 100 and is at most 200. Pass
the returned `nextCursor` as `cursor`, retaining every selector and filter, until
`nextCursor` is null. Results are ordered by the namespace, identifier and canonical ID
tuple's serialised key. Multiple records can share an identifier; all distinct mappings
are retained. In particular, an ALS CSU value alone does not prove address equivalence.

Divisions include identifiers from their selected Division Area companions, targeting
the area's recorded `divisionId`. Planning parent identifiers are excluded from child
identities. `PLAND:SUBUNIT` values include the TPU, for example `351-30`. C&SD regional
area IDs encode source codes as `CENSTATD:area:HK`, `CENSTATD:area:KLN` and
`CENSTATD:area:NT`; these yield `hkgovCenstatd.code` mappings. Curation and correction
metadata are not identity mappings. Places and Streets do not expose a canonical
`identifiers` field and are not supported by this endpoint.

Reviewed mappings required to interpret publisher records are version-controlled in
`fixtures/meta/curations/identity/`. Ingestion validates their hashes and reviewed
status and refuses missing or ambiguous curation scopes. These files are ingestion
evidence, not the data source of the public endpoint.
