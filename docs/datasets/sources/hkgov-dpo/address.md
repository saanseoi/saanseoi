# HKGov DPO ALS addresses

ALS Address2D and Address3D source tables retain their complete `rawProperties` payload
with source identity, release tracking and provenance. Source identifiers, coordinates
and bilingual components remain in that payload; canonical history/current tables own
the extracted and normalised projections.

History resolution preserves prepared ALS canonical premise IDs, including reviewed
aliases. `CsuId` (or `GeoAddress`) and premise components establish source identity;
district, street and building number cannot override it. Distinct premises sharing a
street address retain separate Address2D records and Address3D ownership.

Fresh official-address initialisation replaces a stale target manifest only after the
clean address baseline checks pass and new before-images are captured. A running
manifest resumes automatically. Before ingestion, retained official-address SQL
deliveries are replayed and their owning release finishes from its sealed prepared
files, including Address3D and publication. Completed source releases are skipped.
Failed baseline checks preserve the manifest and its reset ownership information.

ALS preflight includes both passes of 3D preparation for each release: source-parent
ownership resolution followed by corrected bilingual inventory validation. Shared-owner
ambiguity, conflicting inventories and row-size violations stop preflight before
ingestion. `writeOutput: false` suppresses artefact writes, while retaining 3D
validation and its parent block enrichment and duplicate suppression.

`--skip-curation-checks` accepts pending correction verification and identity drift
checks during ingestion, including with `--yes`, without running the upfront all-release
review. Source and integrity validation run during preparation of each ingested release.
Grouped initialisers broadcast the flag to address ingestion; direct `hkgov-dpo:ingest`
also accepts it. Corrections retain their existing verification provenance. Unresolved
identity changes use generated IDs for the run, without writing human-reviewed decisions
or verification dates to fixtures. This mode supports pre-curation reference and testing
imports; source validation and database integrity checks still apply. The
shared-building ownership curation check is skipped: each resolved owner keeps its own
inventory and source occurrences. Ambiguous parent matches and conflicting inventories
for the same owner still stop preparation. Skip mode omits parent block enrichment and
duplicate suppression, retaining publisher 2D components and separate assertions. It
uses exact parents or unique block-free matches and accepts section inventories without
a reviewed ownership mapping. Alias coalescences apply only when their source guards
match. In skip mode, a guard mismatch omits that coalescence and retains both publisher
records unchanged. Coordinate backfills whose source targets are missing, ambiguous or
changed are omitted in skip mode; matching backfills still apply with their provenance.

ALS ingestion retains the effective Address assembly recipe and exact source selections,
including enrichment and lookup inputs, following the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance).

ALS processing evidence retains every canonical selection and reviewed source variant in
compressed D1 audit chunks. Action/mode summaries provide counts; reports decode
individual decisions. Metadata replay carries both under the
[pipeline contract](../../pipeline.md#release-presentation-metadata).

Local ALS delivery retains separate 2D SQL and grouped 3D bound plans. Owner validation
precedes initial 3D mutation capture, and replay uses the sealed parameters without
regenerating committed collections. Local publication follows successful delivery of
both outputs; the release retains database ownership until lookup-cache finalisation.

ALS Address3D delivery groups independent history, current and source writes into
bounded requests. Each database retains generation order and each collection stays
within one transaction. The local mirror replays the same retained statements after
remote confirmation.

ALS supplies bilingual premise addresses. The
[import specification](../../internal/hkgov/address.md) describes source preparation,
identity curation and ingestion. The [Addresses family](../../families/addresses.md)
describes their canonical role.

Uncurated `parentAddressId` is initialised to null. ALS component names and number
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

## SQL delivery

Grouped Address3D ingestion validates all owners and unresolved sections against the
selected 2D snapshot before clearing or writing collections. Lookups stream in groups of
at most 99 references, reserving the remaining D1 parameter for the snapshot. Missing
owners and sections without exactly one reviewed parent match block ingestion; batching
does not infer or change parent relationships.

ALS retains separate sealed delivery plans for Address 2D SQL and grouped Address3D
bound batches. Source checksums bind these plans to their preparation; local replay uses
the exact remote payloads and timestamps. Database receipts allow recovery after a lost
acknowledgement. See [resumable SQL delivery](../../sql-delivery.md).

The local D1 mirror supplies the identity and version context for ALS SQL preparation.
Source, history and current artefacts retain that resolved context for remote import and
local replay. Each history/current stage builds only its target's SQL. Insert batching
counts escaped UTF-8 bytes incrementally, including punctuation and statement
terminators, and rejects an individual row that cannot fit within the statement limit.

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
`rawProperties` and source-content hashes retain the publisher classification. Canonical
`sources.hkgovAlsComponentCorrections` records the fixture version and applied
correction IDs/revisions; this provenance participates in canonical content versioning.
Canonical IDs, street numbers and geometry are not overridden.

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

## Reviewed estate, building and section hierarchy

The reviewed Chun Shek car-park omission uses the premise-reconstruction fixture to
restore its February 2026 assertion in all seven retained releases from April onward.
Actual evidence dates and source absence remain explicit. The car park retains its
identity and stays distinct from the shopping centre, with no inferred unit inventory.

Chuk Yuen North Estate's reviewed preferred name is `Chuk Yuen (North) Estate` /
`竹園北邨`, following HA's estate-specific parentheses. The estate-name fixture
preserves ALS spellings and identity while updating canonical components and display
addresses.

Reviewed nested commercial premises use `hkgov-dpo-address-nested-premises.json`. Choi
Yuen Food Court links to Choi Yuen Plaza, which links to Choi Yuen Estate, across all
retained releases. `hkgov-dpo-address-premise-reconstructions.json` backfills the July
22 location into twenty-six older representations and both July gaps, retaining the
actual evidence date and original publisher assertions. The food court has one
normalised identity. Containment neither merges the unnamed same-CSU record nor assigns
residential inventory to the food court.

`hkgov-dpo-address-premise-consolidations.json` guards Choi Ying Place's reviewed
cross-CSU consolidation. Reviewed consolidation, named-premise retention and derived
hierarchy parents assign stable SaanSeoi-issued `ss-<uuid-v5>` address IDs; these are
not GERS identifiers. One named `CHOI YING PLACE / 彩盈坊` record is retained in each
release; the underspecified duplicate is suppressed wherever present and the corrected
Chinese name is backfilled. Original components and discarded assertions are preserved
as evidence. A reviewed identity spans the publisher's temporary CSU change; the rule
does not generalise shared points or CSU values into permission to merge.

`--skip-curation-checks` applies reviewed Address3D suppressions when their evidence
guards match. An unresolved guard mismatch does not fail preparation or apply the
suppression. Rejected Hung Hom Phase 2 inventories remain raw source evidence and do not
emit collections referencing removed address owners.

Approved issue-batch evidence mismatches warn instead of stopping under
`--skip-curation-checks`. The unresolved decision leaves its records unchanged, and
other matching decisions continue to apply.

Reviewed Housing Authority estate names are stored in
`hkgov-dpo-address-estate-names.json`. Choi Wan uses the preferred `Choi Wan (I) Estate`
/ `彩雲一邨` names in canonical components and display addresses, preserving ALS `(1)` /
`(一)` spellings in raw evidence. Naming preferences do not change identity keys or unit
ownership. Numeral style follows the particular HA name rather than a universal Roman
numeral rule.

Explicit whole-inventory omissions use `hkgov-dpo-address-3d-backfills.json`. Ching Sum
House's June 2025 gap receives 949 units corroborated by identical May and August
inventories. The June bilingual parent must match the evidence premise, and the source
CSU must be absent from that 3D delivery. Cross-release evidence retains its actual date
and separate curation provenance; raw deliveries remain unchanged.

Reviewed closures remain dated source removals. Pak Tin Catholic Primary School is
absent from 25 February 2025, Pak Tin Commercial Centre from 26 April 2025, and the
Salvation Army Sam Shing Chuen Lau Ng Ying School from 18 October 2024. These are
delivery dates, not asserted closure dates. Historical assertions remain available;
these premises are not forward-filled. Pak Tin Shopping Centre remains a separate
premise. Exact chronology fingerprints in `hkgov-dpo-address-history-decisions.json`
guard the accepted removal events.

`hkgov-dpo-address-house-retentions.json` records the reviewed Queens Hill and Shek Yam
house assertions. Queens Hill's Wong Ching, Wong Lok, Wong Wui and Wong Yi Houses retain
their named addresses and last inventories across the prolonged publisher omission; Wong
Sheng, Wong Shun and Wong Yet receive their temporary inventory gaps. Exact source
assertions guard empty replacements. Lai Shek retains its richer 120 Lei Muk Road
address, 340 flats and original coordinates; Yung Shek retains its original coordinates
and 813 flats without its empty duplicate. Active retention continues until revoked,
with verification status recorded separately from the evidence release.

`hkgov-dpo-address-approved-issue-batch.json` holds exact bilingual, geometry and
inventory evidence for reviewed duplicate and component decisions. On Yam's combined Yiu
Yam/Tak Yam assertion and Shek Kip Mei's combined Mei Shan/Mei Hung assertion do not
emit additional collections; inventories belong to the separately named houses. Ping
Tin's empty alias, Sau King's empty alias and the reviewed Shek Mun estate assertion are
suppressed. Pok Hong Community Hall uses 6H Sha Kok Street across its equivalent
assertions. Sha Kok's extension label is backfilled without merging the main-school or
campus records. Sau King uses the user-reviewed 101 Sau Mau Ping Road / 秀茂坪道 address
while retaining the raw 101 Sau Ming Road / 秀明道 assertion and its 799-flat inventory.

The same issue fixture suppresses Sheung Lok's empty assertion throughout retained
history, Sheung Tak's separate Sheung Nim and Sheung Yee alias epochs, and the Bik Shui
and Tung Wong aliases from 22 July 2026. The named houses retain their inventories; Tung
Wong's discarded 83–88 Tai Hang Tung Road assertion is recorded in provenance.

`hkgov-dpo-address-estate-complex-decisions.json` distinguishes Shun Lee Estate at 15
Lee On Road from Shun Lee Commercial Centre (Phase II) at 6 Shun King Street. The centre
references the estate as its parent, with separate coordinates and unchanged raw ALS
names. The fixture also restores Sun Tin Wai's inventory-free estate premise at 29 Sha
Tin Tau Road across retained omissions, guarded against another estate-level identity.
The existing shopping centre is not merged into the estate. These decisions are bounded
to the retained releases and preserve their source evidence dates.

Camellia House at So Uk retains its last 374-flat inventory and one reviewed identity
across the source omission, continuing until revoked with explicit verification status.
Sun Fong House's approved current coordinates are backfilled across retained history;
its inventory remains intact. Sun Yee House retains its reviewed earlier point,
`[114.18144, 22.36961]`, throughout retained history with its 720 flats.

`hkgov-dpo-address-street-estate-complexes.json` derives separate `complex` identities
for Tai Yuen Estate at 10 Ting Kok Road and Tin Wan Estate at 26 Tin Wan Street. Tai
Yuen uses the user-supplied marker `[114.1667207, 22.4555134]` across the 30 reviewed
releases; Tin Wan is backfilled and retained until revoked. Deterministic SaanSeoi
`ss-UUID` identifiers do not claim publisher GeoAddress or CSU values: those fields
remain null, and exact publisher assertions remain provenance. House inventories are not
assigned to these estate identities.

Tsz Fai House's exact `418A/B/C` to `418` merger is dated 13 August 2025. Flat `419`
starts on that same date as a new flat and is not backfilled into earlier releases.

Ching Ho House / 青荷樓 at Cheung Ching Estate is forward-filled from its September 2025
omission, together with its verified 851-unit inventory. The compact 4/F–40/F, 01–23
template is guarded by the exact August 2025 bilingual inventory hash. The paired 2D and
3D curations apply until revoked: releases through 19 August 2026 are verified; later
releases retain an explicit unverified status until reviewed. The removed ALS assertions
and evidence source remain provenance rather than being overwritten.

For Ching Lok, Ching Hay, Ching Sin and Ching Shun Houses, the paired
`hkgov-dpo-address-2d-backfills.json` fixture reconstructs named Address2D records
across the sixteen retained releases before June 2025. The inventory fixture supplies
their 4,234 units across seventeen releases before August 2025. Both start at 25 July
2024, after the Housing Authority's corroborated 2022 intake year. Reconstruction enters
the ordinary identity and division pipeline; later publisher assertions retain the same
normalised identities. Existing unnamed same-CSU premises remain separate source
records.

When a uniquely matching bilingual ALS 2D parent lacks a block while its ALS 3D parent
supplies matching `BLK n` and `n座` components, SaanSeoi enriches the canonical
Address2D with the existing building and block fields. The rule requires the same CSU,
estate, building name, street and number components in both languages. It records the
exact 3D source feature in Address2D provenance and as a release processing action.
Missing, ambiguous or non-standard components stop Address3D preparation for review
rather than creating another Address2D record.

Fortune Estate Carpark's reviewed estate-component restoration fills the five-release
April–July 2026 gap in derived fields and formatted addresses. Exact versions, CSU and
bilingual building/street components guard the correction. Raw assertions and identities
remain intact; the unnamed estate premise is not merged into the car park.

Bounded bilingual estate-component gaps are restored throughout the retained source
range only where a single unchanged premise has identical bilingual estate components on
both adjacent source releases. The generated fixture and verification retain the exact
target and bracketing versions. This restores derived fields rather than raw publisher
JSON, and never generalises from a CSU alone.

Estate-component restorations may also be active until revoked. Their application starts
after the fixture's reviewed source version and only when the complete bilingual source
target still matches. A later application is recorded as unverified in release
provenance until the ALS preflight explicitly verifies it; the same review can retain it
provisionally or revoke it. Historical bounded repairs remain bounded.

The unnamed zero-unit CSU `3370111759T20150127` is suppressed only across its reviewed
February 2025–July 2026 appearances as a duplicate of the named Lei Moon House. Its
estate, bilingual blank-premise structure, route, point and named owner are all guarded;
the full publisher assertion is retained in owner provenance. The HA Low Block remains a
derived section, and the later distinct Lei Fook Low Block source premise is unaffected.

`hkgov-dpo-address-coordinate-backfills.json` applies a current point to its preceding
continuous publisher-coordinate epoch only when the audited event is named,
coordinate-only and every shift is strictly below 50 metres. Each generated rule is
bounded by release, CSU, estate, English building name and the exact earlier point. The
estate guard uses the retained publisher estate name when supplied, independently of HA
display-name curation, and otherwise uses the prepared estate component. The replaced
publisher point is retained in the row's curation provenance; no later record or
unreviewed premise is altered.

Cheung Hong Commercial Centre No. 2 uses a bounded named-premise retention: preserve the
named premise, suppress the reviewed unnamed cross-reference only while both source
records occur, and reconstruct the name only for its five-release absence. The later
removal of both source records remains dated. The rule guards complete components and
coordinates, not CSU alone.

The Fai Ming Estate locality fixture backfills FANLING / 粉嶺 into the derived locality
provenance and formatted addresses for both reviewed buildings. Exact bilingual source
components and dates guard the decision. Raw source JSON, identities, divisions, block
details and inventories remain unchanged.

Easeful Court retains ALS Tower 1 and Tower 2 block components, matching the reviewed
360-unit and 150-unit buildings respectively. The block-identity review fixture guards
both source layers across retained releases; no building-name backfill or merge is
needed.

The historical review policy automatically accepts exact same-floor A/B-, A/B/C- or
A/B/C/D-to-base unit mergers when both languages and unchanged premise components agree.
Accepted events retain dated publisher inventories and distinct successor IDs; they do
not backfill earlier snapshots. Policy and authority are stored in
`hkgov-dpo-address-history-decisions.json`; generated decisions retain exact source
hashes in the estate audit. Mixed or ambiguous changes remain pending.

Kui Wo House's separately approved correction backfills the 2/F 213A/B/C/D merger to 213
across earlier retained inventories. Exact bilingual publisher and corrected hashes
guard this exception; automatic four-way merger acceptance alone preserves dated
history.

Hing Wai House uses the approved current point across retained releases. Fook Wo House
uses its reviewed earlier point with Block 11 components. Tai Ping's empty aliases are
suppressed against their respective Ping Ching and Ping Yee owners, preserving both
house inventories and their shared 8 Po Ping Road address.

Tai Wo Hau Shopping Centre retains CSU `3079225467T20050430`; the separate Tai Wo Hau
Shopping Centre (2) retains its latest available CSU `3071925270P20050725`. Both remain
available until revoked, guarded by reviewed source assertions and explicit verification
status. The second centre's missing releases are restored from retained evidence,
without an inferred unit inventory or a merge into the main centre.

User satellite-map review identifies CSU `3363111709T20141201` as Lei Fook Low Block in
the July and August 2026 deliveries. Its publisher identity and point represent the
section, with unresolved coverage of Lei Fook's combined 404-unit inventory. The raw
unnamed source remains intact. This is distinct from the Lei Moon Low Block premise.

The user-identified Lei Moon Low Block premise, CSU `3370111759T20150127`, supplies the
section's source identity and point in its February 2025–10 July 2026 deliveries. It
replaces the derived Low Block child in those releases and has unresolved coverage of
Lei Moon's building inventory. Raw unnamed components remain unchanged; section
identification is curation evidence. A nonempty inventory on this section requires
review.

Inventory corrections are stored in
[`hkgov-dpo-address-3d-corrections.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json).
Each rule specifies source versions, CSU, expected building components, original and
corrected bilingual inventory hashes, exact floor/unit removals and additions, evidence
and review authority. Preparation corrects a copy and records the decision in source
provenance; raw publisher assertions remain intact. Changed evidence fails with a review
error. Lei Tim's reviewed omission adds flats 207, 217 and 219 on 2/F to nine
July–October 2024 inventories, yielding 720 units in each, matching the November 2024
evidence. Heng Tsui House's three reviewed August–September 2024 stale reversions
replace 1/F 118A/B/C with 118, matching the first merged July 31 inventory. The initial
July 25 split inventory stays unchanged; removal requires exactly one matching unit in
each language.

Lei Fook and Lei Moon in Ap Lei Chau Estate retain distinct building owners and 404
units each. Each owner has reviewed High and Low `section` children with unresolved unit
membership. The rule checks CSU and bilingual premise components across the 30 retained
releases, from July 2024 through August 2026. The derived sections retain curation
provenance and their parent's location; no separate section position or unit partition
is asserted. Identical floor/unit arrays never merge these two buildings. Other Ap Lei
Chau historical changes remain pending in the
[review report](./address3d-review.md#ap-lei-chau-estate).

[`hkgov-dpo-address-hierarchies.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json)
records source-backed hierarchy observations separately from component corrections. A
complex such as `MODEL HOUSING ESTATE / 模範邨` contains named buildings, while official
street-number records can identify sections or entrances within a continuous building.
The fixture records the finest level supported by ALS and does not infer missing
numbers.

For example, ALS identifies `MAN NING HSE / 民寧樓` as the `750-758 KING'S ROAD` range,
whereas `MAN HONG HSE / 民康樓` has separate records for 762, 764, 766, 768, 770 and 774
King's Road. The 3D entries contain floor and unit references only; they do not identify
an entrance or street number. A repeated unit payload can therefore be shared across
section records, but it must not be presented as section-specific unit attribution.

## Grouped inventories and estate hierarchy

The estate review cohort consists of names present in any retained ALS
public-rental-housing 3D delivery, not every development named in 2D addresses. Review
the earliest baseline followed by chronological deltas; preserve exact release presence
and explicit curation bounds. See the report for the separate 2D-only inventory and
one-estate-at-a-time review queue.

ALS 3D inventories use one collection per reviewed Address2D owner. The
[hierarchy review report](address3d-review.md) records guarded estate relationships,
official corroborating evidence, source-release coverage and outstanding decisions.
Repeated source features remain independently traceable even when their identical unit
inventories share one curated building owner. Source names are retained, not translated.
