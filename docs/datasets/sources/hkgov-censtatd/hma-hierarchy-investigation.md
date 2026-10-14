# Housing Market Area hierarchy investigation

## Source evidence

Housing Market Area (HMA) is a C&SD statistical geography. The
[official CSDI schema](https://static.csdi.gov.hk/csdi-webpage/view/common/59db8193e184a4188049df9af8b5fdacab11411382f0caca323d6962d968ae6a)
describes `HMA_21C` and `BG_21C`. `HMA_21C` supplies `hma`, `hma_eng`, `hma_chi`,
geometry and statistical measures. It supplies no district or area parent identifier.
The fields `s_dc` and `wp_dc` are percentages studying or working in the same district,
not parent district codes. `BG_21C.hma` explicitly identifies a Building Group's HMA; it
does not identify the HMA's district.

The schema and all 173 HMA records in the locally archived 2021 release were checked on
13 October 2026. This establishes the absence of a parent field in this release, not the
absence of spatial relationships or the impossibility of another published crosswalk.

## Canonical administrative ancestry

The native HMA transport supplies no parent identifier. Canonical assembly fills
`hierarchies.full` and `hierarchies.administrative` with separate
`HKSAR → Area → District` paths using `createNativeAdministrativeHierarchy`. It runs
before canonical hashing and leaves the publisher properties, source geometry and source
attribution intact.

The reference fixture is
`fixtures/meta/datasetInputs/native-division-administrative-hierarchy.json`. It retains
canonical identities, names and paths from the pinned SaanSeoi edition, together with
hash-pinned Overture territorial geometry. Area polygons are unions of their constituent
district territories, matching SaanSeoi administrative assembly. Preparation reads exact
retained archives rather than CURRENT or the latest published release.

Polygon branch selection uses the inclusive 5% covered-area policy below. Assembly
retains an individual decision fixture with input pins, source and ancestor geometry
hashes, overlap areas, denominators, uncovered area, selected/rejected districts and
strict containment results. `apiField` provenance describes this SaanSeoi inference;
C&SD remains the upstream attribution for the native HMA record.

## Geometry audit

The reproducible audit is `scripts/audit-hma-hierarchy.py`. It compares native
`HMA_21C.gml` and `DC_21C_SDU.gml` from the 2026-Q2 archive slots, both describing 2021
geography, in their published EPSG:2326 coordinates. Areas are measured in square
metres, not longitude/latitude degrees. Inputs are pinned by archive and member hashes:

| Input    | Archive SHA-256                                                    |
| -------- | ------------------------------------------------------------------ |
| HMA      | `5cfeb8faf65c9170f8e488037ce5e4790567010e81e4ec9c0e7f5cec9a708a34` |
| District | `fbb07f6e7341392472293ea3c78997d7abb6765c410087bfdc1d8936ab0996a2` |

The audit retains all positive-area intersections, excludes boundary-only touches, and
records strict `covers` results independently of overlap ratios. It repairs the invalid
Islands district polygon with `buffer(0)` on an analysis copy only. The area change is
approximately −0.000000209 m²; the original geometry hash and repair are retained.
Source files are never changed.

| Measurement                                                   | HMAs |
| ------------------------------------------------------------- | ---: |
| Examined                                                      |  173 |
| At least one district intersection                            |  173 |
| Fully covered by one district, using strict geometry coverage |   34 |
| Positive-area intersections with multiple districts           |   93 |
| At least 1% of the HMA in a second district                   |   49 |
| At least 95% of the HMA in its largest-overlap district       |  135 |
| More than 1% outside the union of these district polygons     |   41 |

The percentages below use the entire HMA polygon as denominator. Uncovered area is not
redistributed among districts.

| HMA                           | Measured district coverage                                     |
| ----------------------------- | -------------------------------------------------------------- |
| Peak (`HMA025`)               | Central and Western 60.243%; Wan Chai 36.698%; Southern 3.059% |
| Mid-Levels Central (`HMA026`) | Central and Western 70.866%; Wan Chai 29.134%                  |
| Jardine's (`HMA126`)          | Eastern 53.388%; Wan Chai 46.608%; Southern 0.005%             |
| Pok Fu Lam (`HMA155`)         | Southern 72.686%; Central and Western 27.308%                  |
| Kowloon Station (`HMA003`)    | Yau Tsim Mong 68.617%; uncovered 31.383%                       |

## Suggested full hierarchies

The adopted suggestion cutoff is **5%, inclusive**, measured against the portion of an
HMA inside the union of district polygons. Uncovered territory is excluded from this
denominator. Selection uses unrounded fractions and does not renormalise again after
rejecting smaller overlaps.

Each qualifying district contributes a separate `HKSAR → Area → District` path in
`suggestedHierarchies.full`. The owning HMA is the final conceptual node and is not
included in its own ancestor array. These audit proposals contain ancestor labels;
canonical references must be resolved before publication. The result is **156 HMAs with
one suggested path and 17 with two**, with no unmatched HMAs. Peak's Southern branch and
Lung Ping's Kowloon City branch fall below the cutoff.

Every positive-area intersection remains in the audit, including rejected branches.
`hierarchyDecisions` records the covered-area fraction, selection outcome and strict
geometry coverage separately. Selection never implies `full_containment: true`:
uncovered geometry and other district intersections still count against containment. The
local-review map shows each proposed full path and its covered-area percentage, while
its overlap bars retain percentages of the entire HMA polygon.

## Assembly requirements

An inferred hierarchy belongs in the assembly audit, with C&SD retained as the upstream
source attribution. It requires:

- Exact HMA and district source-release/geometry pins and a reproducible inference rule.
- Selection of district branches using the inclusive 5% covered-area cutoff.
- Stable canonical district IDs and the matching HKSAR/Area ancestors, resolved through
  the retained identity mapping and a pinned canonical geographic snapshot.
- Per-HMA overlap areas, denominators, uncovered area, selected and rejected branches,
  geometry hashes and any analysis repairs.
- `full_containment: true` only when the ancestor covers the complete canonical HMA
  geometry; membership or a dominant-overlap choice alone cannot establish it.
- An explicit remainder policy. A district-union gap does not itself prove coverage by
  an Area or HKSAR polygon.

The investigation is candidate evidence, not a publication receipt. Canonical assembly
uses the adopted policy against its pinned administrative reference. A complete local
comparison of all 173 HMAs selects exactly the same district branches as this review:
156 single-path and 17 two-path HMAs. Existing published releases require ordinary
re-ingestion and publication of a snapshot revision to expose the materialised ancestry.

## Reproduction

Run from the repository root with Python and Shapely installed:

```fish
python scripts/audit-hma-hierarchy.py \
    --hma-archive data/hkgov/csdi/archive/censtatd_rcd_1728978338390_76872/2026-Q2/source.zip \
    --district-archive data/hkgov/csdi/archive/censtatd_rcd_1635933617052_68946/2026-Q2/source.zip \
    --output .local/hma-hierarchy-audit-20261013/audit.json
python scripts/audit-hma-hierarchy.test.py
```

The full per-HMA ledger stays outside Git. The local audit contains input hashes, source
property inventories, analysis parameters, repair evidence, summary counts and all 173
candidate ancestry records. It can be retained with assembly evidence once the hierarchy
policy is adopted; it is not a publication receipt.
