# Addresses dataset family

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
`GET /addresses/v0.1/{id}/units` explicitly fetches the selected collection. Direct
coverage has established owner membership. An explicitly listed section can expose
ancestor coverage with unresolved membership: the units belong to the parent building,
not necessarily that section. Containment alone never supplies residential coverage.

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
backfill a corrected display name while preserving every raw assertion. Choi Ying Place
uses one reviewed identity across its temporary publisher CSU change; this does not
assign residential units to the shopping centre or authorise other same-point merges.

Explicitly reviewed Housing Authority estate names can supply canonical display
components while retaining ALS spellings in raw evidence. Choi Wan (I) Estate uses HA's
Roman numeral without changing its source identity or conflating it with Choi Wan (2).

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

Cheung Wah Estate retains ten named buildings and 5,120 units, suppressing their ten
reviewed block-number duplicates while preserving source evidence. A block-number alias
does not imply a separate section. Matching block numbers across buildings do not
establish equivalence. This differs from identified High/Low sections, which retain
separate section records.

Reviewed estate-component restorations fill bounded source omissions in derived fields
without rewriting original assertions or changing identity. Fortune Estate Carpark
retains its estate attribution across the five-release gap, separately from the unnamed
estate premise.

The automatic estate-gap policy requires same-CSU, full non-estate component equality,
one occurrence in every release and matching bilingual attribution on both sides of the
gap. It cannot merge sections or alternative addresses just because a CSU coincides.

Named-premise retentions are similarly explicit. Cheung Hong Commercial Centre No. 2
keeps the reviewed named record and preserves its unnamed cross-reference as provenance,
but does not backfill beyond the date both publisher records disappear.

Reviewed locality backfills carry later publisher evidence into bounded earlier derived
addresses while retaining original assertions and evidence dates. Fai Ming Estate's
Fanling locality detail changes neither address identity nor administrative divisions.

Reviewed coordinate backfills can carry a later confirmed point into selected earlier
derived Address2D snapshots. Cheung Hong Estate's thirteen April 2026 points are guarded
by release, CSU, estate, building and prior geometry; the historical publisher point is
retained as provenance rather than overwritten in the source record.

A reviewed unnamed premise can be suppressed when its complete components identify a
duplicate of a named owner. Lei Moon House's temporary zero-unit record is retained in
owner provenance, while the Housing Authority Low Block remains a derived section; this
does not suppress distinct later section records merely because they share an estate.

Reviewed block components can identify a building without a separate building-name
field. Easeful Court's two towers retain those publisher components; the guarded review
mapping does not create names, merge identities or alter historical inventories.

Reviewed unit mergers preserve historical membership: predecessor units remain in
earlier snapshots and the merged successor has its own unit ID. The ALS review can
automatically accept the user-approved same-floor A/B- or A/B/C-to-base pattern with
bilingual agreement; this does not imply permission to backfill, split units or infer
other transformations.

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

## Granularity curation

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
