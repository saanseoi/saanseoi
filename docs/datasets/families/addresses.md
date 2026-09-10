# Addresses dataset family

ALS prepared uploads retain publisher provenance in the nullable UTF-8 `publisherSource`
envelope. Schema validation permits adding this envelope only when every other field
retains its name, type and nullability. Native null and JSON null both denote an absent
envelope and create no publisher provenance; malformed non-null envelopes are rejected.

Address preparation verifies geographic prerequisite rows in the target database.
Missing retained divisions and translations are restored before address delivery;
presence in a local cache alone does not establish production readiness.

Remote history finalisation uses delivery batches of at most 4,096 staged addresses.
Previous versions are retired before replacement ranges are applied, and staging is
removed only after all ranges complete. Each delivery retains its own receipt.

Address3D delivers its independent source, history and current projections concurrently
after Address2D prerequisites complete. Writes within each database remain ordered.

[Minimal initialisation](../minimal-initialisation.md) selects the earliest two retained
ALS versions and keeps its completion manifest separate from full runs.

Every published Address API release calculates added, changed, removed and unchanged
records against the preceding compatible API release in its domain and region. Immutable
snapshot membership and content version hashes determine churn across all assigned
history shards. Address2D supplies the overview totals; Address3D has a separate table
breakdown. The first release compares against an empty baseline.
`saanseoi stats:backfill-addresses --target local` rebuilds retained release statistics,
preparing all replacements before writing them. `--dry-run` calculates without writing.

API release samples seek from a random UUID using `page[after]` and wrap to the start
when the seek has no result. This provides varied examples, not a uniform statistical
sample. The selected release set and profile apply to every request. ID seeks omit
totals and replay only candidate windows for historical releases; `page[offset]` skips
records after the supplied ID when both parameters are used.

ALS audit curations are presented by the condition they resolve, with address context
inside each instance and structured input/output fields. Release-scoped decision counts
are distinct from confirmed applications. Source guard outcomes come from counters at
the executed checks; missing historical counters are reported as unavailable.

ALS 2D and 3D source rows use `(sourceRecordId, versionHash)` identity and retain
`validFromRelease`, `validToRelease` and `isCurrent`. An unchanged source version is
reused across releases; changed and removed assertions close their validity range.
Snapshot collections and their source-release journals are materialised separately.

ALS chronological preflight prepares each release in a separate child process.
Successful results are atomically cached under `.local/hkgov-dpo/preflight-cache`,
including identity records, drift candidates, curation applications and division
quality. Reuse requires matching source contents, processing code, curation fixtures,
arguments, incoming identity history and the selected division lookup. The local lookup
uses configured metadata, current and history database bindings. Failed children do not
create checkpoints. Cache hits still participate in chronological identity and curation
review; they do not represent completed ingestion.

ALS preparation and preflight fingerprints replay the selected division snapshot's
immutable history across its assigned shards. Parent membership, changed translations
and deletions determine the lookup, independently of current-snapshot cleanup.

Source-row `sources` is nullable. ALS ingestion retains supplied publisher or ingestion
references and stores `null` when none are supplied; it does not manufacture a reference
to the row's own synthetic identifier.

Address lookup caches are scoped to the exact parent snapshot. A baseline without a
parent never uses a retained lookup; cached unchanged-row decisions cannot substitute
for materialising its complete 2D address set.

Non-blocking ALS 3D preparation emits `ALS_MANUAL_REVIEW` JSON log lines for unreviewed
section inventories, ambiguous block parents and shared-building owner conflicts. These
preserve source locations and candidate address IDs without approving an identity or
implying that the issue list is complete.

Skipped alias, coordinate, approved-batch and inventory-suppression assertion guards
also emit structured issues with the release, curation fixture, decision or source
assertion hash, and failure message. These log entries do not approve a correction.

On Yam coordinate backfills apply to the retained individual houses. The suppressed
combined Yiu Yam / Tak Yam assertion retains its raw point as provenance and is not a
separate coordinate-backfill target.

Tsz Lok Phase 3's redundant unnamed 633-expression inventory is suppressed from 3D
collections with exact source guards. Raw provenance and every named building inventory
remain intact; repeated floor/flat labels do not imply shared flats.

Tung Tau (II) Estate multi-storey car park persists as a separate address until revoked.
Oi Hei House retains its CSU while its latest reviewed GeoAddress and point are
backfilled throughout retained history, preserving publisher evidence.

Tung Tau (II) Estate Refuse Collection Point is retained at 183 Tung Tau Tsuen Road
throughout retained releases until revoked. Its facility label does not promote it to
estate granularity, and publisher assertions remain provenance.

Shek Kip Mei Phase 2 retains separate 779-unit inventories for Mei Leong and Mei Wui.
Its reviewed unnamed 780-unit assertion is suppressed from collections, not deleted from
raw source evidence or added to the residential total.

Reviewed ALS complex promotions retain residential 3D inventories on their explicit
building owner. Duplicate source assertions must agree on inventory and retain both
source references.

Source tables retain complete raw payloads with identity, release history and
provenance. Extracted identifiers, coordinate projections and bilingual address
components belong to canonical history/current snapshots, not duplicated source columns.

ALS history matches prepared canonical premise IDs exactly. Reviewed aliases resolve
during preparation; a shared district, street and building number does not merge
distinct premises or replace Address3D owner identities.

A fresh `saanseoi init:addresses` run automatically replaces the official-address
manifest after verifying that the address database is empty. Existing address state with
a running manifest resumes automatically: retained SQL delivery and its owning release
finish before ingestion plans subsequent releases. Recovery preserves the manifest and
processing-action records. State without a running manifest still requires an explicit
reset.

Reviewed named/block-only ALS aliases validate the owner's bilingual source building
names and the alias's bilingual structured block references separately. Shared estate,
street and point guards apply to both records, and suppressed assertions remain in
provenance.

ALS preflight validates both Address2D parents and Address3D inventories before
ingestion. Output-free review applies the same ownership, block enrichment, inventory
and row-size checks as artefact preparation, without writing 3D sidecars.
Descriptor-only source blocks remain block-bearing parents even when their block number
is absent; matching Address3D inventories use the existing parent.

For reference and testing imports, `saanseoi init --skip-curation-checks` and
`saanseoi init:addresses --skip-curation-checks` omit the upfront all-release review.
Source and integrity validation still run during preparation of each ingested release.
These commands propagate acceptance of pending address curation checks to ALS ingestion.
Existing corrections retain unverified provenance where applicable; unresolved identity
changes receive generated IDs. Automatic acceptance does not write reviewed decisions to
curation fixtures. Shared ALS 3D buildings may retain separate owners and inventories in
this mode without a reviewed ownership merge. Block enrichment and duplicate suppression
are omitted in this mode; inventories use exact parents or unique block-free matches,
retaining publisher 2D components. Section inventories may retain their existing parent
without reviewed ownership. Alias curations whose source guards no longer match are
omitted in skip mode; both publisher records retain their identities, geometry and
source assertions. Coordinate backfills with missing, ambiguous or changed source
targets are omitted in skip mode, leaving publisher geometry unchanged.

ALS coordinate-backfill estate guards use retained publisher names when supplied,
independently of curated display names. Exact source-point and release bounds remain
required, and replaced geometry is retained in curation provenance.

Address ingestion records the effective assembly recipe, selected source releases and
lookup dependencies under the
[assembly provenance contract](../pipeline.md#snapshot-assembly-provenance). Draft
enrichment refreshes the run; SQL replay includes recipe, input and run records.

Processing uses retained `processing-audit` manifests in R2. Bulk preparation and
normalisation retain registered declarations and counts; reviewed ALS fixtures and
individual identity decisions retain their selected evidence. Preparation seals these
inputs to the Parquet digest in an `.audit.json` sidecar. Publication requires
registered provenance, and delivery retries transfer the completed retained graph. See
the [processing provenance contract](../processing-provenance.md).

Local 2D and grouped 3D ingestion retain native SQL plans and transactional receipts.
Restarting a local 2D workflow reuses its retained generation message; 3D plans preserve
bound values and collection transaction boundaries. Publication follows both deliveries.

Local and remote grouped Address3D delivery batch independent database targets
separately, retaining per-database statement order and whole-collection transaction
boundaries. See [SQL delivery](../sql-delivery.md) for receipts and recovery.

SQL ingestion uses the local D1 mirror to resolve identities, versions and snapshot
relationships before remote delivery. History and current stages each generate their own
SQL artefact. Insert statements are bounded by escaped UTF-8 bytes, with oversized
individual rows rejected during generation. Remote delivery and local cache replay apply
the generated artefacts in their required dependency order.

Address 2D SQL and grouped Address3D bound batches use sealed
[delivery plans and receipts](../sql-delivery.md), with independent remote delivery and
local replay checkpoints. Recovery uses the original payloads and prepared timestamps.

Address3D owner and unresolved-section validation streams bounded lookups against the
selected Address2D snapshot before any Address3D writes. Each query reserves one bound
parameter for the snapshot and checks up to 99 references. Every owner must exist once;
each section must retain exactly one match to its reviewed parent.

The default Address API domain is `saanseoi`, SaanSeoi's curated Hong Kong address
collection. It requires the authoritative ALS `address/default` member and, once the
initial Overture Places release exists, the accepted Overture Places
`address/overture-places` member. Supplementary snapshots use the latest applicable
cohort reference, falling forward only when no earlier snapshot exists. ALS ingestion
can therefore complete before Places ingestion.

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

Uncurated ALS and supplementary materialisation initialise this field to null. An ALS
derivation base, shared estate name, coordinate or building-number range does not
establish a parent. Guarded estate curation can establish complex/building/section
relationships and create explicitly reviewed building parents, without generating
missing numbered addresses. See the
[ALS hierarchy review](../sources/hkgov-dpo/address3d-review.md).

## Grouped unit inventories

ALS estate review starts from the earliest retained release and proceeds through
chronological changes. Its cohort is estate names present in any retained ALS
public-rental-housing 3D file, including empty inventories, not all ALS 2D estate names.
Private/other 2D-only names are retained in a separate inventory. Review decisions are
release-bounded; current Housing Authority name corroboration cannot approve historical
ownership by itself.

Reviewed inventory corrections can backfill publisher omissions into explicitly selected
historical releases. Their guarded fixtures retain the decision and later corroborating
source; collection source references carry correction provenance while original
publisher assertions remain intact. Historical curated inventory can therefore differ
from the raw delivery without claiming the publisher supplied those units at that time.
Explicitly reviewed stale reversions may likewise use guarded removals and additions:
Heng Tsui retains its initial split inventory, then the merged unit from 31 July 2024,
correcting only three later reversions. This is not a general reverse-split policy.

An explicitly approved forward-fill can restore a building that remains extant after a
later source omission. Ching Ho House carries its named Address2D premise and
hash-guarded 851-unit inventory from the September 2025 omission until revoked.
Provenance records the evidence source, target release and whether each active
application was verified; later unreviewed releases are never presented as silently
verified publisher data.

CSU identifies a publisher premise in conjunction with its supplied components; it is
not a universal address deduplication key. Separate buildings retain separate unit IDs
even when their floor/unit designs are identical. Reviewed High and Low Blocks can be
`section` children of one building, sharing unresolved coverage of its combined
inventory.

One `address3d` collection belongs to one Address2D owner per snapshot. Its shared
`units` JSON contains stable unit IDs and compact unit/floor codes; `address3dI18n`
stores locale-specific expressions keyed by those IDs. Full expressions are retained;
`formattedAddressPart` is only an optional formatting override. Access instructions
belong to Place localisation (`accessHint`), not the address inventory.

Ordinary address responses expose `address3dCoverage`, without loading unit arrays.
`GET /addresses/v0.1/{id}?include=units` includes the selected `address3d` collection in
the JSON:API `included` array. It can be combined with `include=hierarchy`; unit
inclusion is deliberately detail-only, so list and search requests cannot expand one
page into every unit of many buildings. `GET /addresses/v0.1/{id}/units` remains the
direct collection endpoint. Direct coverage has established owner membership. An
explicitly listed section can expose ancestor coverage with unresolved membership: the
units belong to the parent building, not necessarily that section. Containment alone
never supplies residential coverage.

A Place retains its precise `address2dId` and selected `addressSnapshotId`; an optional
unit reference includes `address3dId`, `address3dUnitId`, and `address3dMembership`.
Resolve all references within that snapshot. Never display unresolved section membership
as a verified entrance or partition of the parent's units.

## Granularity

A user-confirmed erroneous removal can be restored as a dated premise reconstruction.
Chun Shek Estate's car park retains its separate identity through seven source
omissions, with the February 2026 evidence date explicit and no inferred residential
coverage.

Chuk Yuen (North) Estate retains HA's estate-specific parentheses in canonical naming;
the original ALS spelling and identities remain source evidence.

Commercial containment can have multiple levels: Choi Yuen Food Court → Choi Yuen Plaza
→ Choi Yuen Estate. These parent-address links do not imply shared identity or
residential-unit coverage. An omitted raw estate component remains source evidence even
when reviewed containment establishes the ancestry.

The reviewed food-court location and ancestry apply from the first retained release. Its
newer source representation is backfilled through the two July 2026 gaps, with original
dated assertions preserved and one normalised food-court identity.

Explicit premise consolidation can suppress a reviewed underspecified duplicate and
retain a stable SaanSeoi-issued `ss-<uuid-v5>` address identity. The `ss-` prefix
denotes SaanSeoi identity ownership, not instability or GERS backing. Named-premise
retentions and derived hierarchy parents use the same prefix. Consolidation can also
backfill a corrected display name while preserving every raw assertion. Choi Ying Place
uses one reviewed identity across its temporary publisher CSU change; this does not
assign residential units to the shopping centre or authorise other same-point merges.

Reviewed closures preserve the premises in earlier source releases and accept their
dated removal without reconstructing them in later releases. This applies to Pak Tin
Catholic Primary School, Pak Tin Commercial Centre and Sam Shing's Lau Ng Ying School;
source delivery dates do not establish the exact physical closure date.

Explicitly reviewed Housing Authority estate names can supply canonical display
components while retaining ALS spellings in raw evidence. Choi Wan (I) Estate uses HA's
Roman numeral without changing its source identity or conflating it with Choi Wan (2).
Hing Wah (I) Estate retains the explicitly reviewed Roman numeral and uses HA's Chinese
name `興華一邨`; the supporting HA profile spells the English numeral `(1)`. This is an
estate-specific display decision, with raw ALS spellings and identities retained.

Hing Wah (II)'s reviewed current coordinates apply over the exact earlier publisher
coordinate epochs, including Chin Hing House's movement above the automatic 50-metre
threshold. Original geometries remain provenance and inventory changes remain dated.

Structured bilingual tower records retain their publisher estate relationship without
inventing building names. High Prosperity Terrace's two towers link to its separate
estate-level address. The review audit recognises a block-only record only when a unique
2D publisher record corroborates its structured identity and 3D inventory evidence.

A reviewed missing inventory can be backfilled without changing the dated Address2D.
Ching Sum House's June 2025 correction restores 949 units from matching bracketing
inventories, retaining explicit cross-release provenance and unchanged publisher files.
This approval is specific to the reviewed omission, not a general backfill policy.

Ching Tin Estate also has explicit approval to reconstruct four missing named buildings
and 4,234 units from the first retained release, 25 July 2024. Housing Authority intake
evidence dates these buildings to 2022. The reconstructed addresses participate in
normal identity and division resolution, with June 2025 Address2D evidence and August
2025 inventory evidence labelled separately. Unnamed publisher premises sharing a CSU
remain distinct; they are not silently renamed or assigned the reconstructed inventory.

Cheung Wah Estate retains ten named buildings and 5,120 units. Their verified block
numbers are materialised on the canonical HA house names across the reviewed historic
range, while block-labelled duplicate assertions remain source evidence only. A block
number does not imply a separate section. Matching block numbers across buildings do not
establish equivalence. This differs from identified High/Low sections, which retain
separate section records.

Verified Chinese block-labelled duplicates accept an optional ordinal `第` inside ASCII
or full-width parentheses, such as `麗榮樓(第3座)`. The canonical building name remains
`麗榮樓`, with block reference `3` and descriptor `座`; `第` is retained only in the
original source assertion recorded as provenance.

Reviewed estate-component restorations fill bounded source omissions in derived fields
without rewriting original assertions or changing identity. Fortune Estate Carpark
retains its estate attribution across the five-release gap, separately from the unnamed
estate premise.

The automatic estate-gap policy requires same-CSU, full non-estate component equality,
one occurrence in every release and matching bilingual attribution on both sides of the
gap. It cannot merge sections or alternative addresses just because a CSU coincides.

`--skip-curation-checks` retains bounded Address3D inventory suppression decisions so
removed address owners cannot acquire orphaned collections.

Approved issue-batch decisions whose evidence does not match emit a warning under
`--skip-curation-checks` and leave their records unchanged; matching decisions still
apply.

Named-premise retentions are similarly explicit. Cheung Hong Commercial Centre No. 2
keeps the reviewed named record and preserves its unnamed cross-reference as provenance,
but does not backfill beyond the date both publisher records disappear.

Reviewed locality backfills carry later publisher evidence into bounded earlier derived
addresses while retaining original assertions and evidence dates. Fai Ming Estate's
Fanling locality detail changes neither address identity nor administrative divisions.

Kwong Yan House retains its reviewed pre-25-April-2026 point until revoked. Its rejected
later publisher point is preserved in provenance, and any further point change requires
review rather than silently extending that exact-point guard.

Reviewed coordinate backfills can carry a later confirmed point into selected earlier
derived Address2D snapshots. The automatic coordinate policy accepts only named,
coordinate-only source events where every geodesic shift is strictly below 50 metres. It
bounds each correction to its immediately preceding continuous publisher-coordinate
epoch and guards release, CSU, estate, building and prior geometry; the historical
publisher point is retained as provenance rather than overwritten in the source record.

A reviewed unnamed premise can be suppressed when its complete components identify a
duplicate of a named owner. Lei Moon House's temporary zero-unit record is retained in
owner provenance, while the Housing Authority Low Block remains a derived section; this
does not suppress distinct later section records merely because they share an estate.

Reviewed block components can identify a building without a separate building-name
field. Easeful Court's two towers retain those publisher components; the guarded review
mapping does not create names, merge identities or alter historical inventories.

Reviewed unit mergers preserve historical membership: predecessor units remain in
earlier snapshots and the merged successor has its own unit ID. The ALS review can
automatically accept the user-approved same-floor A/B-, A/B/C- or A/B/C/D-to-base
pattern with bilingual agreement; this does not imply permission to backfill, split
units or infer other transformations.

Kui Wo House has an explicit historical correction: flat 213 on 2/F replaces the
213A/B/C/D family across earlier retained releases, with raw inventories preserved. This
backfill is separate from automatic acceptance of other dated four-way mergers.

Hing Wai House uses its approved current coordinates throughout retained history. Fook
Wo House retains its reviewed earlier point and Block 11 identity. Tai Ping's Ping Ching
and Ping Yee remain separate houses sharing 8 Po Ping Road; their exact empty alias
epochs are suppressed independently.

Tai Wo Hau Shopping Centre and Tai Wo Hau Shopping Centre (2) retain separate identities
and locations until revoked. Each uses its latest retained CSU throughout the reviewed
history; the second centre is reconstructed across its publisher omission. Original
names, identifiers and address assertions remain provenance.

Lei Fook and Lei Moon Low Blocks are separately identified sections of their respective
buildings. Their distinct publisher premise IDs must not be merged because one appears
in the delivery where the other disappears.

A reviewed source premise can represent a named section even when the publisher omits
its building label. Preserve the source identity and point, record identification
evidence, and avoid creating a duplicate derived section. Section identification alone
does not establish membership of individual units in a combined building inventory.

`attributes.granularity` describes address scope in every API profile, independently of
validity, verification and Place category. It has no score or universal ordering.

| Value       | Scope                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `unknown`   | The scope is not established.                                                                                                       |
| `site`      | Whole premises or grounds without an established internal complex structure, such as a standalone yard, work site or sports ground. |
| `complex`   | An organised development or facility containing constituent premises: an estate, shopping complex, airport or station campus.       |
| `phase`     | A named development phase.                                                                                                          |
| `building`  | An individual building or block.                                                                                                    |
| `section`   | A wing, zone or other named subdivision whose level depends on context.                                                             |
| `floor`     | A floor or level.                                                                                                                   |
| `unit`      | A shop, flat, suite, office, stall or other separately identified unit.                                                             |
| `room`      | An individual room.                                                                                                                 |
| `room_part` | An identified part of a room.                                                                                                       |

`site` requires positive evidence that the address identifies the whole premises; it is
not a fallback for an unexplained number. A school with two established constituent
buildings can be a `complex`, with `building` addresses underneath it. A school name can
also identify just one building. Countries and districts belong to Division context.

Ingestion classifies corrected components. Recognised building/block descriptors and
unambiguous building labels suggest `building`; phase components suggest `phase`; an
estate component without a more specific component suggests `complex`. These are
heuristics, even when their input components have been reviewed. Facility names such as
schools or airports in `buildingName`, ambiguous block descriptors and conflicting
locale classifications produce `unknown` with a reason for review.

Neither a number nor its inclusion in another address's range establishes granularity or
containment. Addresses 134, 136 and 138 may be shops within a building addressed
134–138; addresses 60 and 62 may be separate school buildings within a campus addressed
60–62. Review the actual premises before classifying or linking these records.

Only the resulting `granularity` is stored, versioned and served by the Address API.
Operational review metadata belongs in codebase curations. The classifier can produce
transient review details (method, policy version, fingerprint, rule, evidence and review
reason) for a reviewer; these are not included in database rows, canonical hashes or API
responses. Changes to review notes alone do not create Address versions. Unknown records
can be ingested; no unit, room, parent or missing address is fabricated.

Reviewed ALS omissions retain their original assertions alongside reconstructed output.
Hoi Tat's Hoi Wah House remains available with 780 units until its retention is revoked;
Hoi Shing House uses the reviewed current coordinates across its historical omissions.
Hoi Ying's Ying Fai House includes flat 108 on 1/F from the earliest retained release,
with the publisher's original inventory preserved.

Queens Hill retains its seven named houses and their reviewed inventories across
publisher omissions, including the four prolonged omissions, until explicitly revoked.
Shek Yam's Lai Shek House retains its richer address, 340 flats and original point; Yung
Shek retains 813 flats at its original point. Complete source assertions guard
coalescing and remain provenance. Later unverified deliveries are marked explicitly.

ALS alias-coalescence guard failures in strict preflight produce unresolved JSON items
in `.local/hkgov-dpo/review-queue/`. Each item identifies the release, curation
decision, failed assertion and both sets of source rows so a curator can investigate
before approving a coordinate or identity correction.

Grandeur Terrace Block 1 retains the reviewed northern alias coordinate for the five
retained releases from `2026-04-25.0` to `2026-08-19.0`. The exact source-point pair
guards the selection, and coalescence provenance preserves both original geometries.

Grandeur Terrace Block 4 uses fixed point B `[114.00141, 22.46971]` for all historical
and future releases. Its named address absorbs the separate alias, preserving both
publisher points in provenance. Identity guards remain mandatory; this coordinate
decision has no release bounds and does not depend on publisher point equality.

Grandeur Terrace Blocks 5–11 retain the fixed B points approved on the coordinate review
map from `2026-04-25.0` until revoked. Later publisher movement does not replace these
points. Bilingual identity guards still apply, both original geometries remain in
provenance, and future releases beyond verified history are marked unverified.

Reviewed duplicate inventories at On Yam and Shek Kip Mei do not create additional house
owners. Ping Tin and Sau King empty aliases are suppressed in their reviewed history,
and the reviewed Shek Mun estate assertion is suppressed. Pok Hong Community Hall uses
street number 6H throughout; Sha Kok's school extension retains its specific label
separately from the main school and campus. Sau King retains its 799 flats with the
user-reviewed 101 Sau Mau Ping Road address and the publisher address as evidence.

Yung Shing retains two valid building-level street addresses with a shared physical
identity and one 138-unit inventory; alternate addresses do not imply subordinate
sections. Hin Fat's full 872-unit inventory covers the reviewed releases from
January 2025. Yip Wong's four houses retain their separate 3,288-unit total from the
dataset baseline until revoked, with original assertions and actual evidence dates
preserved.

Yau Lai, Yau Oi and Yue Wan retain their reviewed street-bearing estate complexes. Yau
Lai's estate membership supplies parent links without resolving or merging Fung Lai and
Ying Lai. Yue Wan's separately reviewed unnamed pump-vicinity assertion is removed with
exact source guards and retained provenance. Yiu Cheong's three approved flat-merger
families are backfilled throughout retained history; such explicit approvals do not
broaden the general dated-merger policy.

Reviewed street-bearing estate identities use `complex` granularity independently of
house inventories. Upper Ngau Tau Kok's 15 On Tak Road complex remains distinct from the
publisher car-park premise; Upper Wong Tai Sin's approved 8 Wong Tai Sin Road complex
retains the source's 9 Wong Tai Sin Road assertion as provenance. Both persist until
revoked. Tsui Heng's explicitly approved incomplete-suffix mergers are backfilled; Youth
College's campus-label change remains dated to 19 August 2026, without backfill.

Reviewed street-bearing estate identities use `complex` granularity independently of
house identities and inventories. Tai Yuen Estate uses 10 Ting Kok Road and its
user-reviewed marker; Tin Wan Estate uses 26 Tin Wan Street across retained gaps and
until revoked. Derived SaanSeoi identities leave publisher GeoAddress and CSU null,
retaining exact source assertions as provenance. Tsz Fai House's `418` merger and new
flat `419` begin on 13 August 2025, without historical backfill of `419`. Sun Yee House
uses its reviewed earlier point throughout retained history.

The same guarded estate-level promotion applies to Tsui Lam's blockless Pik Lam House
assertion: it is a complex at 11 Tsui Lam Road using the latest reviewed point across
retained history. Pik Lam Block 1 remains a separate building assertion. Its numbered
Address2D parent is retained from 22 July 2026 until revoked across the reviewed August
rename and future omissions, preserving the publisher point and bilingual evidence so
the supplied 3D inventory retains its building owner. A returning identical source
prevents duplicate insertion; changed numbered assertions require review. Exact Ho Chak
Wan Primary School assertions at 3 Tsing Luk Street are instead reconciled as one
bilingual school identity; the estate-only source assertion remains provenance and is
not interpreted as a closure.

Reviewed estate corrections preserve address granularity and building ownership. Long
Shin's `11–12 Yau Shin Street` address belongs to the estate, while each named house
retains its specific street number and inventory; Shin Leung's missing 313-flat
inventory is restored for the three affected deliveries. Lin Tsui uses one reviewed
inventory-bearing identity and named address across historical identifier variants. Lai
Kok's three affected houses retain separate pre-collapse points until revoked. Discarded
coordinate and identity assertions remain source provenance.

Shun Lee's estate complex uses 15 Lee On Road and contains the separately located Shun
Lee Commercial Centre (Phase II) at 6 Shun King Street. Both source points remain
distinct. Sun Tin Wai's reviewed estate record is reconstructed across retained
omissions only when no other estate identity exists; its granularity is `complex` and
the shopping centre remains separate. Raw names and street assertions remain evidence.

So Uk's Camellia House uses one reviewed identity and retains its 374-flat inventory
until revoked. Sun Fong House uses its approved current point throughout retained
history. Empty aliases at Sheung Lok, Sheung Tak, Shui Pin Wai and Tai Hang Tung are
suppressed under exact owner and source guards. Sheung Tak's houses remain separate, and
Tung Wong retains the discarded 83–88 street-range assertion as provenance.

Ko Yee's reviewed publisher address at 28 Ko Chiu Road is the estate complex parent of
its four houses, with no unit collection of its own. Hung Hom Phase 2 retains one named
record per house at 28 Tai Wan Road; its invalid Dyer Avenue and unnamed variants remain
provenance only. Distinct houses retain their source inventories and coordinates even
when their street addresses or publisher CSUs coincide.

Kwai Hin's retained 2D address continues until revoked without an inferred flat
inventory. The Plaza, Lung Hang school and Koon Ma House use their explicitly reviewed
CSUs throughout retained history. Source-signature guards preserve identifier evidence;
empty aliases cannot acquire units silently. Model Housing inventories belong to their
house parents across all retained releases, not separately to each street-number
section.

## Granularity curation

ALS pure bilingual flat additions are backfilled under the reviewed omission policy,
with exact before/after inventory hashes and retained source evidence. Numbered blocks
qualify without invented building names. Unrelated mergers and replacements remain
dated. Specific flat-label and CSU corrections likewise preserve publisher assertions.
Duplicate source records can share one physical inventory without increasing the
distinct unit count; ambiguous address ownership remains a separate review.

[`address-granularity.json`](../../../fixtures/meta/curations/address-granularity.json)
provides explicit overrides for ALS and supplementary Addresses. Use the canonical
Address ID and run `establishAddressGranularity` from
`libs/core/src/pipeline/services/addressPipeline/granularity.ts` against the corrected
localised components. Its transient `review.inputFingerprint` identifies that input;
`addressGranularityFingerprint` computes the same fingerprint directly. Retain the
reviewed decision, reason and evidence in the fixture's `overrides` array:

```json
{
  "id": "review-example-premises",
  "revision": 1,
  "addressId": "<canonical Address ID>",
  "inputFingerprint": "<fingerprint from the classification>",
  "granularity": "site",
  "reason": "The address identifies the whole yard.",
  "evidence": ["Reviewed site plan and its source reference."],
  "sourceVersionFrom": "2026-09-06.0",
  "sourceVersionTo": null
}
```

An override requires a unique decision ID, positive revision, granularity, reason and
nonempty evidence. Optional source-version bounds are inclusive; omit them for all
source versions with that input. Only one override is allowed per Address ID. Every enum
value, including `unknown`, can be selected explicitly. A changed fingerprint, invalid
decision or duplicate override stops affected ingestion with `requires review`,
including unattended runs. Review the evidence before updating its fingerprint and
revision. Ingestion reports per-chunk classification counts under `addressGranularity`.
Overrides classify addresses; they do not assign parent links or modify components.

See the [Address resource contract](../resourceType/address.md),
[ALS processing](../internal/hkgov/address.md) and
[supplementary curation policy](../sources/overture/places.md).

Source-release record statistics report Address2D rows and translations, plus Address3D
collections and collection translations when a validated 3D sidecar is present.
Collection counts do not count the units stored within each collection. Missing 3D
statistics are unknown rather than zero. These facts are recorded during source
ingestion; `stats:backfill-addresses` rebuilds API release-set statistics only.

## Publisher source boundary

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`rawProperties`.
