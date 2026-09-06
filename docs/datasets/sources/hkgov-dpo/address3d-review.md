# ALS estate hierarchy and Address3D review

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

`reviewQueue` contains 138 estate candidates with source ambiguity, current-profile
mismatches, unresolved 2D hierarchy checks or non-coordinate historical changes. This is
not a list of 138 incorrect estates. Coordinate-only updates remain in the ledger but do
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
the February 2025 empty unnamed assertion, April 2026 component changes, and July 2026
empty-assertion replacement.

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

Current profile/estate naming or building coverage needs review for Ap Lei Chau, Choi
Wan (1), Chuk Yuen North, Hing Wah (I), Hing Wah (II), Hoi Tat, Lower Wong Tai Sin (I),
Lower Wong Tai Sin (II), On Yam, Po Tat, Queens Hill, Sau Mau Ping, Shek Kip Mei Phase
6, Shek Lei, Tin Wah, Tin Wan, Tsui Ping (North), Tsz Ching, Yat Tung, Yau Oi and Yung
Shing. Name mismatches are not evidence that the ALS name is wrong.

Missing building identifiers, sometimes combined with profile mismatches, need review
for Easeful Court, Grandeur Terrace, High Prosperity Terrace, Hung Hom Phase 2, Kwai
Shing West, Lei Muk Shue, Po Tin, Shek Kip Mei, Shek Kip Mei Phase 2 and Upper Ngau Tau
Kok. Sai Wan additionally requires the explicit ownership decision above.

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
