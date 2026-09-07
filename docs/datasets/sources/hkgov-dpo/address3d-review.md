# ALS estate hierarchy and Address3D review

Local and remote Address3D SQL delivery group independent history/current target writes
without splitting a collection. Native plans bound pending groups and commit each
payload with its receipt; retries reuse the exact bound statements. Review decisions and
owner validation remain prerequisites to preparation.

## Scope and evidence

The review runs earliest to latest across 30 retained ALS releases, starting with
`20240725-1048-ALS-GeoJSON`. Its inclusion rule is a named estate appearing in any
retained ALS public-rental-housing 3D file. This gives 241 names, including empty
inventories and estates absent from the latest delivery. Source-file membership is not a
claim about current housing tenure. The latest delivery, `2026-08-19.0`, contains 239
estates with nonempty unit inventories. The
[hierarchy fixture](../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json)
contains 201 complete latest-release estate relationships and 1,281 building rules, plus
a partial relationship for Ap Lei Chau's Lei Fook and Lei Moon across all 30 releases.
Each estate has an earliest observed baseline followed by chronological deltas. Existing
latest-release curation bounds remain explicit and do not approve an earlier baseline.
The remaining 38 latest estates require hierarchy review independently of the historical
changes.

The
[chronological review ledger](../../../../fixtures/meta/curations/hkgov-dpo-address-estate-audit.json)
records exact release presence, baseline assertions and added/removed/changed comparison
groups. Change fields distinguish coordinates, street components, inventory hashes and
occurrence counts. Feature order is ignored; repeated source assertions are preserved.
Names are not automatically linked across renames. The retained 2D audit supplies
record/building-name counts, not a complete per-address 2D component diff.

The
[separate 2D-only inventory](../../../../fixtures/meta/curations/hkgov-dpo-address-2d-estate-inventory.json)
contains 3,647 other names, including private developments such as 21 Borrett Road. They
never appear in the retained 3D files and are outside this unit-inventory review.
Unnamed 3D premises remain in a separate per-release list rather than being discarded.

`reviewQueue` contains 135 estate candidates with source ambiguity, current-profile
mismatches, unresolved 2D hierarchy checks or non-coordinate historical changes. This is
not a list of 135 incorrect estates. Coordinate-only updates remain in the ledger but do
not alone create an ownership-review case. Current-profile name checks are
corroboration, not historical fact. Top-level `status` and `buildingReviews` describe
the latest assessment; chronological event decisions are separately pending.

Review one estate at a time in first-3D-appearance order, alphabetically within a
release: establish its earliest baseline, then work through its deltas. Retain the
user's decisions as source- and release-bounded curation, and only carry them forwards
through matching evidence. Do not infer unit partitions from shared names or repeated
inventories. `bun scripts/build-als-estate-review.ts` rebuilds the ledger; latest-only
automatic hierarchy generation refuses this chronological format without changing
existing relationships.

Official evidence:

- [Housing Authority estate directory](https://www.housingauthority.gov.hk/json/property-location/estate-locator-access.json).
- [Model Estate profile](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/17.json):
  “Block C and C2 belong to same block (Man Hong House).”
- [Sai Wan profile](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/15.json).
- [Mei Tung profile](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/12.json).
- [Model Estate accessibility sheet](https://www.housingauthority.gov.hk/en/common/pdf/global-elements/estate-locator/ModelHousingEstate-barrier-free-en.pdf):
  March 2020 accessibility photographs, not an entrance/floor plan and not evidence of
  unit-to-section membership.

## Ap Lei Chau Estate

User satellite-map review identifies CSU `3363111709T20141201` as Lei Fook House Low
Block. The July and August 2026 deliveries supply its source identity and actual point,
replacing the derived Low Block child in those releases. It has unresolved coverage of
Lei Fook's 404-unit inventory. Its appearance alongside the disappearance of Lei Moon
Low Block's CSU does not make the two premises equivalent.

CSU `3370111759T20150127` is an unnamed, zero-unit duplicate of Lei Moon House rather
than evidence for its Low Block. It is suppressed from derived Address2D releases from
February 2025 through 10 July 2026, with its complete source assertion retained in Lei
Moon House provenance. The Housing Authority Low Block child remains derived from the
named building; its empty source arrays do not partition Lei Moon's 404-unit inventory.

The reviewed Lei Fook and Lei Moon rule covers July 2024 through August 2026. They are
distinct buildings with different CSUs, each owning 404 units despite identical
floor/unit designs. Each has High and Low `section` children exposing its parent
inventory with unresolved membership. These children are curation-derived addresses;
their inherited building point does not locate a particular section. Publisher combined
names and source assertions are retained.

All 30 retained Southern district files have identical bilingual premise components for
these two CSUs. Their 3D inventory counts and hashes remain unchanged; coordinate
updates do not establish a unit partition. `bun scripts/verify-ap-lei-chau-address3d.ts`
checks all release guards and prepares the earliest and latest real inventories,
requiring two collections, 808 distinct unit IDs and two unresolved children per owner.

The ledger's `reviewedHierarchyDecisions` retains this limited approval when rebuilt.
Lei Tim's three missing second-floor flats (207, 217 and 219) are reviewed as a
publisher omission. The inventory-correction fixture backfills them into the nine
retained releases from July through October 2024, giving 720 curated units in each. The
original bilingual 717-unit assertions remain unchanged and the collection's source
reference also records the correction decision. November 2024 supplies the corroborating
720-unit inventory. This is a user-reviewed historical correction, not a publisher claim
about the earlier dates.

Heng Tsui House / 亨翠樓, Fu Heng Estate, retains 1/F flats 118A/B/C in the initial 25
July 2024 inventory (822 units). The first merged inventory on 31 July supplies flat 118
(820 units). The user-reviewed correction treats the exact initial inventory reappearing
on 21 August, 28 August and 2 September as stale reversions: remove only those three
suffixed flats and add 118 on the same floor. Original and corrected bilingual hashes
guard every change. Raw assertions remain intact; the merged unit retains its distinct
successor ID. This does not authorise automatic correction of other reverse splits.
`bun scripts/verify-heng-tsui-unit-118.ts` checks the initial, first merged, three
corrected and latest inventories, including source preservation and stable successor
identity.

Decisions live in
[`hkgov-dpo-address-hierarchies.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json)
for containment and
[`hkgov-dpo-address-3d-corrections.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json)
for inventory corrections. The generated ledger includes `reviewedInventoryCorrections`
and preserves its raw publisher timeline. `bun scripts/verify-lei-tim-address3d.ts`
checks the nine corrected deliveries against November, including raw-source preservation
and persisted correction provenance. Rules affect preparation; existing published
snapshots are not rewritten by editing a fixture.

The estate remains pending for its other baseline premises and chronological changes:
other April 2026 component changes. Both unnamed Low Block premises are identified;
their source appearance and disappearance remain recorded in the publisher timeline.

## Block components from exact 3D parents

A canonical named Address2D receives verified bilingual block components when one
block-free ALS 2D parent exactly matches one ALS 3D parent by CSU, estate, building,
street and number components in both languages. The 3D parent must supply the matching
`BLK n` and `n座` pair. The address remains one Address2D and its sole inventory owner;
the exact 3D feature is retained in provenance and the release audit. Missing, ambiguous
or non-standard components require review rather than creating another public address.

The rule covers the stable public-housing cohort in Cheung Wah, Fu Shin, Lai On, Long
Ping and Tsui Lam Estates. Cheung Yue House / 祥裕樓 carries Block 2 / 2座 and Cheung
Lai House / 祥禮樓 carries Block 6 / 6座.

Cheung Wah's other enriched parents are Cheung Fung (Block 2, 404 units), Cheung Wo
(Block 1, 404), Cheung Tak (Block 4, 792), Cheung Chi (Block 5, 816), Cheung King (Block
3, 384), Cheung Lok (Block 1, 374), Cheung Shun (Block 3, 420) and Cheung Chung (Block
7, 592). All ten houses retain distinct ownership of 5,120 units.

`bun scripts/verify-cheung-lai-address3d.ts cheung-wah` checks all thirty release guards
and earliest/latest combined preparation, including distinct owners and preserved source
records. Existing published snapshots are not rewritten.

## Reviewed historical changes

Chun Yeung Shopping Centre's April 2026 change retains publisher history: both 20 Kwei
Tei Street and 28 Wong Chuk Yeung Street are retained before the change, but only the
Kwei Tei Street address remains afterwards. The shared CSU does not justify erasing the
distinct earlier supplied addresses. No backfill is applied, and the removal is not
interpreted as closure of the centre. Residential inventories are unchanged.

Chun Shek Estate Multi-storey Car Park / 秦石邨多層停車場, CSU `3725526030T20050430`, is
restored in the seven retained releases from April 2026 onward. The user confirmed it
still exists. The premise-reconstruction fixture retains the February 2026 feature, its
actual source date and the expected later absence. One normalised car-park identity
spans all thirty releases; it remains separate from Chun Shek Shopping Centre and
receives no residential inventory. The shopping-centre CSU is only a scope check, not a
parent or consolidation target. `bun scripts/verify-chun-shek-car-park.ts` verifies
source preservation, identity and all seven restored omissions across the thirty-release
history.

Chuk Yuen North Estate uses HA's preferred `Chuk Yuen (North) Estate` / `竹園北邨` name
under `hkgov-dpo-address-estate-names.json`. All eight building names are corroborated
and their 6,736-unit inventories are unchanged across thirty releases. Only canonical
estate naming and display addresses change; raw spellings, identities and inventories
remain intact. Chuk Yuen South Estate is distinct.

Choi Yuen Food Court retains the reviewed July 22 point across all thirty releases and
links through Choi Yuen Plaza to Choi Yuen Estate. The explicit relationship lives in
`hkgov-dpo-address-nested-premises.json`. Match the named food court by CSU and both
names, preserving the separate unnamed record with the same CSU. Reuse the curated
estate complex where available, otherwise the guarded publisher estate-address record.
No residential coverage is inferred. `hkgov-dpo-address-premise-reconstructions.json`
backfills the newer source representation into twenty-six earlier named records and the
two July gaps. The exact original assertions are guarded and retained as provenance; the
July 22 evidence is labelled with its actual date. Ordinary normalisation preserves one
food-court identity through all thirty releases. The location correction neither
overwrites source files nor removes unnamed same-CSU records.
`bun scripts/verify-choi-yuen-food-court.ts` verifies all retained releases.

Choi Ying Place retains one named shopping centre across all thirty releases under
`hkgov-dpo-address-premise-consolidations.json`. Suppress the unnamed duplicate in its
twenty-eight occurrences; retain the sole named record in December 2024 and
January 2025. Backfill `彩盈坊` over the ten early `彩盈商場` canonical names. Both
publisher CSUs and all suppressed raw components remain provenance, while one explicit
reviewed identity spans the temporary CSU change. Exact per-release bilingual
components, GeoAddress and geometry are guarded before identity resolution. The five
residential buildings and their 3,995 units are untouched; no shopping-centre units are
inferred.

Choi Wan (1) Estate is corroborated against Housing Authority's Choi Wan (I) Estate: all
sixteen building names match and all thirty retained inventories contain the same 5,927
units. `hkgov-dpo-address-estate-names.json` records the preferred names
`Choi Wan (I) Estate` / `彩雲一邨`. Canonical estate components and formatted addresses
use those names after identity and inventory ownership resolution; ALS raw names and IDs
remain intact. HA's mix of Arabic and Roman numerals is preserved estate by estate, not
normalised by a blanket conversion rule. Choi Wan (2) Estate remains distinct.

Hing Wah (I) Estate uses the reviewed display names `Hing Wah (I) Estate` / `興華一邨`
over the retained July 2024–August 2026 releases. HA's profile corroborates the estate
under `Hing Wah (1) Estate`; the Roman numeral is the explicit review decision. Exact
ALS bilingual names guard the curation, and raw names, IDs and inventories remain
intact.

Hing Wah (II)'s Chin Hing, Lok Hing, Ning Hing and Wo Hing houses use their April 2026
current points over both preceding publisher-coordinate epochs. The explicit approval
includes Chin Hing's 52.7-metre movement. Exact release, estate, CSU, building name and
prior point guard each correction. Replaced geometry remains provenance; Wo Hing's April
2025 inventory increase from 1,102 to 1,104 remains dated source history.

Choi Fook Estate's July 2026 unnamed premise change retains publisher history. CSU
`4037020934T20090625` is replaced by `4046820907T20090625`; both carry zero units. The
replacement's point coincides with Choi Foon House, but its supplied components name
only the estate and street. The reviewed decision does not merge it into the house,
assign it residential units or backfill either record. All five building inventories
remain unchanged. The history-decision fixture guards the exact event fingerprint.

Ching Lok / 菁樂樓 (819 units), Ching Hay / 菁喜樓 (1,279), Ching Sin / 菁善樓 (1,279)
and Ching Shun / 菁信樓 (857) have user approval to backfill from the first retained
release, `2024-07-25.0`. The
[Housing Authority intake record](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/4.json)
lists 2022, corroborated by the user's evidence. No exact delivery day is inferred and
no pre-baseline snapshots are fabricated. The Address2D fixture retains June 2025 source
features; the inventory fixture retains August 2025 features. Their actual evidence
dates remain explicit in reconstructed records. Sixteen releases receive four named
parents, seventeen receive 4,234 units, and the estate totals five buildings and 5,183
units throughout retained history when combined with the Ching Sum decision below.
Unnamed same-CSU records remain distinct. `bun scripts/verify-ching-tin-address3d.ts`
checks every affected release and the August evidence, source preservation, normalised
identity continuity and collection ownership. Rejection guards are covered by
`hkgovAlsBackfills.test.ts`. Other estates and published snapshots are unaffected.

Ching Sum House / 菁心樓, Ching Tin Estate, retains its June 2025 Address2D and receives
a reviewed 949-unit backfill for `2025-06-20.0` only. The May and August bilingual
inventories have identical publisher inventory hashes; the June delivery has no 3D
assertion for this CSU. `hkgov-dpo-address-3d-backfills.json` records the user's
explicit approval and the complete August evidence feature. Preparation labels that
evidence with its actual August source version and separate backfill provenance, not as
a June source assertion. Missing or changed bilingual parents, an unexpectedly present
source CSU, or altered evidence fail validation.
`bun scripts/verify-ching-sum-address3d.ts` runs the estate-wide verification above.
This does not authorise backfilling other buildings or rewriting published snapshots.

The estate-review audit records the observed arrivals, removals and replacements of
unnamed, zero-unit Ching Tin source premises as reviewed, release-by-release and
fingerprint-guarded. They remain raw source provenance only: they neither create a
building nor an alias, and cannot suppress review signals for other estates. The August
2025 named inventory arrival is likewise recorded as corroboration of the existing
baseline reconstruction and June Ching Sum backfill, rather than a new review item.

Fu Shin Estate's August 2026 block-labelled 2D variants are handled by the same
automatic parent-block enrichment. Each of its six variants has the same CSU and point
as one unique, block-free parent and a matching unchanged 3D inventory. The canonical
address receives the verified BLK/座 components; the variant remains source provenance,
not an alias or a second address. The release-audit decision is fingerprint-guarded.

Fu Tip Estate treats estate-prefixed house strings as aliases, not repeated canonical
building names: `FU TIP ESTATE BAN TIP HOUSE` resolves to `BAN TIP HOUSE`. The exact
November 2024 `FU TIP ESTATES BLOCK 7` expression remains provenance for HIN TIP HOUSE
/ 蜆蝶樓, whose verified BLK/座 7 is carried by the parent-block enrichment. From 8 July
2026 ALS blanked the street components of Hei Tip, Hin Tip, Tsz Tip and Wong Tip Houses
without changing their CSUs, points or inventories. Their derived addresses retain 11
Choi Tip Street / 彩蝶街11號 until a non-empty conflicting source revokes the repair;
raw ALS payloads remain unchanged. The component fixture and release audit both record
the verification boundary.

Fu Tung Market / 富東街市 retains the two anonymous December 2024–January 2025 2D
assertions in its provenance only. They have the market's CSU, bilingual estate and
street components, and exact point, but no building or block name; they are therefore
suppressed as duplicates, not exposed as a second address. The February 2025 removal is
accepted as the disappearance of that suppressed source assertion, with no backfill.

Wing Ka House / 永嘉樓, Fuk Loi Estate, has its July 2026 publisher repair backfilled
over every earlier retained inventory: 8/F flats 817 and 819 raise the count from 507
to 509. The correction is guarded by the exact earlier and repaired bilingual
inventories; it preserves the original 507-unit source assertion and correction
provenance rather than rewriting ALS history.

Hong Shun House (Cheung Hong Estate) retains flat A1614 on 16/F in earlier inventories
and honours its publisher-recorded removal from January 2025 (1,138 to 1,137 units). The
user chose no backfill. The physical cause and exact physical change date are unknown.

The user-approved `same-floor-ab-or-abc-unit-merger` policy (revision 2) automatically
accepts numeric units ending A/B or A/B/C becoming their single unsuffixed unit on the
same floor. It requires unchanged bilingual premise components, one source occurrence on
each side, matching English and Traditional Chinese inventories, and unchanged
expressions for all retained units. Multiple exact mergers, including a mixture of A/B
and A/B/C sets in one building, are supported. Retained C/D siblings, reverse splits,
partial suffix sets, different floors, unrelated additions/deletions and ambiguous
occurrences remain pending.

Fortune Estate Carpark / 幸福邨停車場 (CSU `3392321845T20050430`) retains its reviewed
Fortune Estate / 幸福邨 component in the five releases from 3 April to 10 July 2026
where ALS omits it. The car park itself remains present. The fixture
`hkgov-dpo-address-estate-components.json` records the surrounding February and July
evidence and exact target versions. Restoration changes derived estate fields and
formatted addresses only, after source identity and 3D ownership resolution. Raw source
JSON, geometry and residential inventories remain intact. Verification covers all 30
releases and preserves the distinct unnamed estate premise (`3385421875T20050430`).

The user-approved bounded bilingual estate-component-gap policy extends that correction
to a source premise that remains present, has the same CSU and complete matching
non-estate components, loses its estate component for a continuous interval, and has the
same complete bilingual estate component immediately before and after it. The generated
fixture identifies 57 such gaps across 31 estates (279 release records), including Fu
Shin Estate's LP-gas substation. It rejects repeated occurrences, an absent premise,
changed components, one-language-only loss, changed return attribution, and unbounded
gaps. Only derived estate fields, formatted addresses and provenance change; original
source assertions, identities, geometry, sections and alternate addresses remain intact.
The ledger fully reviews the 24 events for which the restored components account for the
whole audited change; mixed events remain pending.

Cheung Hong Commercial Centre No. 2 retains one named derived premise. It suppresses the
unnamed, cross-referenced publisher duplicate in the 14 releases where both occur and
reconstructs the named February 2026 representation for the five-release April–July 2026
omission. Both source records then disappear on 22 July, which is retained as a dated
publisher removal rather than backfilled. The retention fixture guards the two observed
named component sets, the unnamed components, both recorded points and every source
occurrence. It assigns one reviewed identity and embeds discarded source evidence in
provenance; no CSU-only merge rule is introduced.

Fai Ming Estate's reviewed locality decision backfills FANLING / 粉嶺 for Sing Fai House
and Tai Fai House from the April 2025 source evidence into the 14 earlier retained
releases. `hkgov-dpo-address-localities.json` guards the bilingual building, estate and
street components. Derived locality provenance and formatted addresses carry the detail;
raw assertions, resolved identities, geometry, divisions, block components and 952 units
are unchanged. Verification covers 60 building records across 30 releases, including 28
backfills. The dated 3D locality event is accepted; the ledger is not an exhaustive 2D
component audit, and later supplied block numbers are not backfilled by this decision.

Kwong Fuk Estate's Kwong Yan House retains `[114.17515, 22.44896]`, the original point
shown in its review card, until revoked. The rejected 25 April 2026 point
`[114.17485, 22.44949]` remains raw provenance. The earlier under-50-metre historical
backfill remains approved; the forward correction has an exact source-point guard and
requires review if the publisher supplies another point.

Lai Kok Estate's Lai Ho, Lai Kwai and Lai Lan houses retain their separate pre-collapse
points until revoked. The shared point published from 25 April 2026 is preserved as
source evidence, not used to merge the buildings or their inventories.

Lin Tsui House uses the latest inventory-bearing CSU `4238313558T20180523` and its
reviewed named address throughout retained history. The superseded named identity and
the reviewed unnamed or street-only alternatives do not create additional canonical
addresses. Their publisher identifiers, components and inventories remain provenance.

Long Shin Estate retains `11–12 Yau Shin Street` at estate granularity. Shin Leung and
Shin Oi houses retain their individual `11 Yau Shin Street` addresses, and Shin Yung
House retains `12 Yau Shin Street`, including the house names and their own inventories.
The estate address does not own or duplicate those building inventories. Shin Leung's
unchanged 313-flat inventory is restored only for its three missing April 2026
deliveries.

The automatic coordinate-backfill policy reviews coordinate-only events only where every
changed assertion is a single named occurrence and every geodesic shift is strictly
below 50 metres. It backfills the current point over the immediately preceding
continuous publisher-coordinate epoch, with exact release, CSU, estate, building and
earlier-point guards. A later source move therefore never applies to an earlier
coordinate epoch for the same CSU. The raw 3D delivery remains historical evidence;
every derived Address2D row records both publisher and replacement geometries in
curation provenance. This does not authorise anonymous records, Low Blocks or any
premise merger.

The reviewed estate batch in `hkgov-dpo-address-approved-estate-batch.json` stabilises
the Lower Ngau Tau Kok Estate Plaza CSU as `4027420245P20120920`, the Lung Hang school
as `3639525221T20050430`, and Ma Hang's Koon Ma House as `3934509146T20050430` across
all retained releases. Exact bilingual premise/geometry signatures and inventory hashes
guard the original assertions; the source CSU remains provenance. The school, Kam Tai
House and Chun Tat House discard only reviewed blank-name aliases which add no address
detail to their named owners. Empty-inventory guards prevent an alias acquiring units
without review.

Kwai Hin House is forward-filled from its January 2025 evidence until revoked, with no
invented Address3D collection. Kwai Yuet's 879-flat inventory is not evidence of Kwai
Hin's exact floor/unit labels merely because their designs match. Lok Sam House uses
`[114.177, 22.36708]` throughout retained history; On Tai Shopping Centre uses
`[114.22913, 22.327]`. Replaced points remain provenance. Model Housing's reviewed
house-parent inventories and street-number sections cover every retained release, using
guarded historical bilingual component variants rather than duplicating units on each
section.

Easeful Court's supplied block components identify Tower 1 / 第一座 (CSU
`2873924582T20050430`, 360 units) and Tower 2 / 第二座 (CSU `2873024523T20050430`, 150
units). The user confirmed that Tower 1 is the larger building. The mapping is stored in
`hkgov-dpo-address-block-identities.json`. The rebuild verifies bilingual tower, estate
and street components in both source layers and inventory counts for every retained
release before clearing only `missing_building`. No name backfill or merge is needed;
raw components, identities and geometry remain intact.

The ledger rebuild reads the exact source inventories and verifies their audit hashes.
`automaticMergerReview` records the policy revision, source releases, hashes, buildings,
floors and predecessor/successor tokens. An entire event is reviewed automatically only
when all its substantive changes are covered; mixed events retain their pending issues.
Accepted changes preserve publisher history and distinct successor IDs, with no
backfill. This covers the April 2025 Hang Chi 601A/B/C → 601 and Hang Yip 1021A/B/C →
1021 decisions, the April 2025 Chung Tak 307A/B → 307 merger, and subsequent matching
cases.

Across the 30 retained releases, the policy accepts 135 mergers (36 A/B and 99 A/B/C) in
113 estate/release events. It fully reviews 111 events; two mixed events retain other
pending changes.

[`hkgov-dpo-address-history-decisions.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-history-decisions.json)
records accepted publisher chronology separately from inventory corrections. Rebuilding
the ledger verifies each event fingerprint before marking that event reviewed; other
events in the estate remain pending.

Ching Ho House (Cheung Ching Estate) retains its November 2024 first 2D appearance and
January 2025 first 851-unit inventory without pre-construction backfill. Its later
September 2025 omission is forward-filled with the verified named premise and 851-unit
inventory until revoked. The August 2025 bilingual inventory hash guards the compact
4/F–40/F, 01–23 template; source releases through 19 August 2026 are verified and later
releases are explicitly unverified pending review. Raw ALS removals remain provenance.

Hang Chi House (Cheung Hang Estate) merges 1/F units 121A, 121B and 121C into 121 in the
January 2025 delivery, reducing 718 units to 716. Preserve the three predecessor units
in earlier snapshots and the distinct successor ID afterwards. This is a reviewed
merger, not an omission correction; the physical conversion date is not established.

## Model Housing Estate

Real-source preparation retains 13 source occurrences and produces six collections with
667 units. Man Hong has one curated 762–774 building owner, 422 units, and six numbered
section children with unresolved parent-level coverage. No. 772/post office is excluded.
Man King similarly retains 25 units once, with three unresolved sections. The other
collections contain 60, 30, 80 and 50 units. Full bilingual expressions and all repeated
source occurrences remain traceable.

`bun scripts/verify-model-address3d.ts` reproduces the check against retained source and
prepared Parquet; its report is
`.local/hkgov-dpo/model-address3d-verification/result.json`. No section partition is
inferred from numbering, shared coordinates or repeated arrays.

## Blocking ownership decision: Sai Wan East Terrace

Two source occurrences share CSU `3104715804T20050430`, coordinates
`[114.12621, 22.2811]`, and the same 186-unit inventory. One identifies 52–60 Cadogan
Street; the other has no street components. Their 2D identities are respectively
`ss-bd8219aa-8921-5ad0-8ef1-2d3aab46787e` and `ss-dba30b2f-2ed7-5666-b194-69ba4d21dc9f`.

Preparation stops instead of assigning one physical inventory to two owners. Review
whether these are equivalent assertions of one building and select its canonical owner;
do not turn the blank-address record into an invented section. A full latest release
import is not verified complete while this gate remains.

Empty inventories are different: 34 latest features have empty paired arrays, including
unnamed Mei Tung occurrences and Wo Tin's inventory. Retain them as source evidence, but
create no residential collection and do not treat empty arrays as duplicate flats.

## Manual-review shortlist

Exact bilingual additions on the same named or structured-block premise are reviewed
publisher omissions. `hkgovAlsFlatOmissions.ts` detects strict inventory supersets;
materialised corrections guard every targeted publisher inventory and its corrected
hash. Earlier variants retain unrelated merger history. The retained-release review
includes Kai Shun's flat 219, Kwong Yan's 14-flat stack, Lai Fu's 11 additions and Lei
Muk Shue Block 6's flats 302 and 304. Ambiguous ownership and mixed
removals/replacements are not pure additions and remain separate decisions.

Kwai Ching's 2/F `211F` and Kwai Ming's 1/F `101F` are corrected to `211` and `101` in
the guarded earlier releases. These specific label corrections preserve raw labels and
do not authorise blanket suffix removal. Luen Yan House uses the corrected CSU across
its historical publisher identifier replacement; 2D identity and 3D ownership use the
same correction while raw records keep the supplied CSU.

Ko Shing's proven empty duplicate is retained as provenance on the named owner, whose
historical coordinates use the reviewed current point. The third unnamed Ko Yee address
has a different GeoAddress and point and is the reviewed estate-level address at 28 Ko
Chiu Road. Its publisher record is the complex parent of the four named houses; it does
not own a flat inventory or merge with Ko Shing despite their shared CSU. Bik Tsui's
precedence variants resolve to one 456-flat collection with both source assertions; Kwai
Tsui's distinct inventory totals 866 flats.

Hung Hom's conflicting unnamed 780-flat inventories are suppressed from materialisation
while all raw source records remain. Phase 2 uses only 28 Tai Wan Road. Its unnamed CSU
3752018776T20110715 belongs to Hung Yat's address provenance; the unnamed Tai Wan Road
and invalid 9 Dyer Avenue variants do not create additional canonical addresses. Hung
Yat, Hung Yan and Hung Yiu retain their individual named records and publisher points,
with 456, 702 and 780 flats respectively. The approximate spacing supplied during review
does not replace publisher geometry, and the stated 780 flats for Hung Yan does not
override its verified 702-unit inventory. These exact ownership guards are recorded in
`hkgov-dpo-address-reviewed-estate-ownership.json` across all 30 retained deliveries.
The current collection has one canonical 2D owner; a separately selectable equivalent
address requires an explicit alias relationship, not an unresolved section.

Hoi Tat Estate retains Hoi Wah House and its 780-unit inventory across the omission
beginning in April 2025 until the explicit curation is revoked. Hoi Shing House's three
April 2026 omissions are backfilled with its 1,040-unit inventory at the current point.
Its earlier retained points are corrected to that same reviewed location. Publisher
features, geometry and inventory assertions remain provenance.

Hoi Ying Estate's Ying Fai House has a guarded flat 108 on 1/F backfill across the
eleven retained releases from July to December 2024. The corrected collection contains
560 units; the original 559-unit bilingual inventories remain source evidence.

Current profile/estate naming or building coverage needs review for Ap Lei Chau, Choi
Wan (1), Chuk Yuen North, Hing Wah (I), Hing Wah (II), Hoi Tat, Lower Wong Tai Sin (I),
Lower Wong Tai Sin (II), On Yam, Po Tat, Queens Hill, Sau Mau Ping, Shek Kip Mei Phase
6, Shek Lei, Tin Wah, Tin Wan, Tsui Ping (North), Tsz Ching, Yat Tung, Yau Oi and Yung
Shing. Name mismatches are not evidence that the ALS name is wrong.

Grandeur Terrace has a reviewed source-expression repair: nine named/block-only
cross-CSU pairs are coalesced into their existing `BLK`/`座` references, while Blocks 2
and 3 retain their directly supplied structured components. Every suppressed assertion
and its 3D source record stays attached to the canonical block as provenance. The named
owner's raw bilingual building names identify the block without separate publisher block
fields. The block-only alias must supply the reviewed `BLK`/`座` descriptor and block
number in both languages. Both records must match the reviewed estate, street and point.

Missing building identifiers, sometimes combined with profile mismatches, need review
for Hung Hom Phase 2, Kwai Shing West, Lei Muk Shue, Po Tin, Shek Kip Mei, Shek Kip Mei
Phase 2 and Upper Ngau Tau Kok. Sai Wan additionally requires the explicit ownership
decision above.

High Prosperity Terrace's `TOWER`/`座` 1 and 2 records identify their separate estate
parent through the publisher's bilingual estate and street components. A unique matching
2D structured block and unchanged 3D inventory evidence allow the review audit to clear
only the missing-building-name flag. Conflicting components, multiple parent candidates
and other review reasons remain unresolved. No estate curation or backfill is required.

Cheung Wah, Fu Shin, Lai On, Long Ping, Lung Tin and Tsui Lam have current name
corroboration but still need 2D hierarchy/component review. They have no enabled fixture
relationship; a favourable machine-audit status must not bypass this stop.

Before extending any relationship to historical releases, check source identities,
components, ownership and counts in those exact releases and record bounded evidence.
Current official profiles do not approve historical building membership.

## Import and verification boundaries

Bound JSON writes keep SQL text small. The retained preview D1 probe verified inserts,
retry, UTF-8/hash readback and update/readback for approximately 185 kB shared and 136
kB/135 kB localised payloads. Its isolated temporary table was removed; no application
release was published. The local report is `.local/hkgov-dpo/address3d-d1-probe.json`.

The Harbour CLI validates the sidecar, source version and Parquet seal, writes source,
history and current collections before publication, and rejects unsupported queued SQL
import. Database reset scripts replay generated migration files; generation does not
apply them. These schema artefacts target a fresh reset, not preservation of an existing
per-unit dataset. Do not publish until remaining source ownership gates have been
resolved and a full release preparation/import succeeds.
