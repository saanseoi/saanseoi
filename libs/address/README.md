# @saanseoi/address

Shared address content validation, the Harbour address matcher/parser, and floor/unit
formatting. `parseAddressContent` proposes components while preserving each original
localized display. Unrecognised text and conflicting unit evidence remain explicit. No
network access, database access, canonical identity assignment or publication.

Build with `bun run build`; create a versioned artifact with `bun pm pack`. Consumers
pin a version. Updating the parser never rewrites accepted records by itself. The
package is not yet published to a public registry.

## Address scope

`AddressContentSchema` requires `scope`: `unknown`, `premises`, `phase`, `building`,
`section`, `floor`, `unit` or `unit_portion`. Localised names, expressions and component
designators belong in `i18n`. `premisesName` is address text; premises organisation,
purpose and physical containment belong to the building/place model. Address content
rejects `parentAddressId`, `premisesType` and `premisesKind`.

## HYPE integration

HYPE pins the packaged artifact in `vendor/saanseoi-address-0.2.2.tgz`; registry
publication is deferred. Build and pack from this directory, copy the artifact, and
update HYPE's dependency and lockfile together. Verify the tarball SHA-512 against the
lockfile before committing. Increment the version for future changes.

Without injected dictionaries, premises and street text remains unresolved. Parsing
proposes components and preserves the original multilingual source. Conflicting units
retain their original visible text for human review.
