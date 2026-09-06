# ALS estate hierarchy and Address3D review

## Scope and evidence

The retained audit covers 30 ALS releases and 3,888 distinct estate names. The latest
delivery, `2026-08-19.0`, contains 239 estates with nonempty unit inventories. The
[hierarchy fixture](../../../../fixtures/meta/curations/hkgov-dpo-address-hierarchies.json)
contains 201 estate relationships and 1,281 building rules, guarded to that release.
Historical deliveries are inventoried, not automatically authorised by current Housing
Authority profiles. The remaining 38 latest estates require hierarchy review.

The
[all-estate inventory](../../../../fixtures/meta/curations/hkgov-dpo-address-estate-audit.json)
records release presence, source ambiguities, historical 3D presence, current Housing
Authority corroboration and review reasons. Its 3,649 names without a latest nonempty
inventory are not a claim of externally verified hierarchy. Machine corroboration is not
itself an approval: only guarded fixture relationships affect preparation.

Official evidence:

- [Housing Authority estate directory](https://www.housingauthority.gov.hk/json/property-location/estate-locator-access.json).
- [Model Estate profile](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/17.json):
  “Block C and C2 belong to same block (Man Hong House).”
- [Sai Wan profile](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/15.json).
- [Mei Tung profile](https://www.housingauthority.gov.hk/json/property-location/detail/PRH/12.json).
- [Model Estate accessibility sheet](https://www.housingauthority.gov.hk/en/common/pdf/global-elements/estate-locator/ModelHousingEstate-barrier-free-en.pdf):
  March 2020 accessibility photographs, not an entrance/floor plan and not evidence of
  unit-to-section membership.

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
