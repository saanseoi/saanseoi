# HKGov DPO ALS addresses

ALS supplies bilingual premise addresses. The
[import specification](../../internal/hkgov/address.md) describes source preparation,
identity curation and ingestion. The [Addresses family](../../families/addresses.md)
describes their canonical role.

Canonical `parentAddressId` is initialised to null. ALS component names and number
ranges alone do not establish a containing Address or justify creating missing numbers.

The shared normalisation stage classifies `granularity` after guarded component
corrections, for both SQL and Worker ingestion. The corrected Ngong Ping tourist-complex
estate component yields `complex`. Supporting decisions and evidence are retained in the
codebase component and granularity curation fixtures. Only the resulting granularity is
materialised; classification does not alter publisher source records. Number-only
addresses, conflicting locale components and ambiguous facility labels remain `unknown`;
a building-number range never turns its individual numbers into units. See
[granularity curation](../../families/addresses.md#granularity-curation) for guarded
manual overrides and how changed evidence reopens review.

## Component correction fixture

[`hkgov-dpo-address-components.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-components.json)
stores reviewed building-to-estate classifications separately from ALS identity
decisions. Each correction records its ID and revision, inclusive source-version range,
CSU ID and accepted GeoAddresses, expected bilingual fields, component overrides,
excluded names and evidence. A null upper version bound allows subsequent releases only
while their identity and expected components still match.

The shared Address normalisation stage applies the fixture to a copy of the prepared row
for both local SQL and Worker ingestion. A targeted record with an unexpected identity,
component or missing source version raises a `requires review` error. Earlier releases
and unrelated source records receive no correction. Review the retained source before
updating expectations, accepted identifiers or the applicable range; increment the
correction revision when changing a reviewed decision.

The correction moves the existing bilingual building labels into `estateName` and clears
`buildingName`. It preserves publisher spelling and formatted address text. Source
`rawProperties`, paired source addresses and source-content hashes retain the publisher
classification. Canonical `sources.hkgovAlsComponentCorrections` records the fixture
version and applied correction IDs/revisions; this provenance participates in canonical
content versioning. Canonical IDs, street numbers and geometry are not overridden.

## Ngong Ping tourist complex

The fixture classifies `NGONG PING THEME VILLAGE / 昂平市集` as an estate at **111 NGONG
PING ROAD / 昂平路111號**. These spellings are retained from ALS. Eleven retained
Islands district deliveries from September 2025 through August 2026 substantiate the
expected components and stable CSU ID. The GeoAddress changes between the 22 and 25
April 2026 deliveries; both verified identifiers are recorded in the fixture.

`NGONG PING TSUEN / 昂坪村` is explicitly excluded. No tourist branding aliases are
introduced. Shop numbers such as `9B` must not replace street number `111`. This rule
creates only the corrected parent Address2D projection; sub-premise identification and
Address3D matching are outside its scope.

The fixture is bundled with ingestion code. Editing it requires an updated ingestion
build and a new snapshot generation; it does not rewrite prepared source files, resume
already-normalised chunks with new results, or mutate published releases.
