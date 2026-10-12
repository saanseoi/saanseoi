# Place identity evidence and matching

## Publisher identity

Overture provides GERS IDs for Places. Its
[GERS overview](https://docs.overturemaps.org/gers/) includes `place` in the registry;
registry membership, rather than UUID appearance, establishes the stability commitment.
The [stability policy](https://docs.overturemaps.org/gers/stability/) explains that
names affect matching, sufficiently large moves can lose a match, and split/merge
successor mappings are not published. Both documents were inspected on 12 October 2026.
Stability is a matching commitment, not proof that every disappearing ID represents a
closure.

The local Hong Kong archives already contain different publisher IDs for observations
with identical names and bounding boxes. SaanSeoi normalisation reads those IDs
directly. The inspected Overturist export code contains no UUID-generation step for
Places. This investigation did not independently compare every local record with the
global publisher archive or query registry membership for every observed ID.

## Observed evidence

The 12 local releases cover September 2025 through September 2026, without a November
2025 Places release. The unfiltered September 2025 archive contains 135,226 rows:
111,451 with phones, 129,451 with social URLs, 71,494 with websites and 7,293 with
emails. September 2026 contains 139,541 rows: 107,976 with phones, 133,862 with social
URLs, 71,454 with websites and 54,419 with emails. No inspected release has an
opening-hours column. Email coverage varies substantially; absence is not disagreement.

These are candidate overlaps in the original archives before country selection. The last
two columns overlap and must not be added. They are not confirmed identity labels.

| Transition                 | Added IDs | Removed IDs | Same name and bbox as a removal | Same attribution dataset and record ID as a removal |
| -------------------------- | --------: | ----------: | ------------------------------: | --------------------------------------------------: |
| September–October 2025     |    24,368 |      24,184 |                          13,728 |                                              18,069 |
| October–December 2025      |    32,582 |      32,472 |                          18,699 |                                              24,641 |
| December 2025–January 2026 |       157 |          78 |                               0 |                                                   3 |
| January–February 2026      |       499 |         465 |                             153 |                                                 167 |
| February–March 2026        |    16,377 |      15,901 |                           2,401 |                                               8,165 |
| March–April 2026           |    14,047 |       9,964 |                           3,230 |                                               7,091 |
| April–May 2026             |     7,816 |       7,838 |                             635 |                                               4,413 |
| May–June 2026              |       157 |         472 |                              76 |                                                  38 |
| June–July 2026             |    15,469 |      16,514 |                             582 |                                               3,601 |
| July–August 2026           |     6,716 |      10,737 |                             621 |                                               1,331 |
| August–September 2026      |     6,814 |       2,062 |                             141 |                                                 444 |

## Chronological model replay

The final model replay covers all 12 releases with production normalisation and country
selection. Its October and December source counts reproduce the supplied screenshots.
Accepted new publisher IDs reuse an existing canonical ID. Unsupported unchanged
publisher IDs can receive separate canonical identities too; rejected continuity is not
proof of a new business. The [machine-readable audit](place-identity-audit.json) records
archive paths, SHA-256 digests and complete aggregate results.

| Release      | Source additions | Source removals | New source IDs matched to existing Places | New canonical observations | Unmatched predecessor Places | Ambiguous observations |
| ------------ | ---------------: | --------------: | ----------------------------------------: | -------------------------: | ---------------------------: | ---------------------: |
| 2025-10-22.0 |           24,353 |          24,187 |                                    14,587 |                     10,835 |                       10,669 |                    134 |
| 2025-12-17.0 |           32,534 |          32,465 |                                    20,766 |                     12,995 |                       12,926 |                     57 |
| 2026-01-21.0 |              156 |              79 |                                         1 |                        162 |                           85 |                      0 |
| 2026-02-18.0 |              492 |             461 |                                       154 |                        350 |                          319 |                      6 |
| 2026-03-18.0 |           16,357 |          15,858 |                                     3,455 |                     15,090 |                       14,591 |                     75 |
| 2026-04-15.0 |           14,017 |           9,948 |                                     4,255 |                     10,728 |                        6,659 |                     66 |
| 2026-05-20.0 |            7,808 |           7,821 |                                     1,355 |                      7,434 |                        7,447 |                     50 |
| 2026-06-17.0 |              162 |             405 |                                         1 |                        172 |                          415 |                      1 |
| 2026-07-22.0 |           15,466 |          16,509 |                                     1,212 |                     15,336 |                       16,379 |                     63 |
| 2026-08-19.0 |            6,715 |          10,736 |                                       665 |                      7,407 |                       11,428 |                     17 |
| 2026-09-23.0 |            6,811 |           2,061 |                                       170 |                      7,461 |                        2,711 |                    123 |

The replay accepts 46,621 publisher-ID changes across the 11 transitions. Potential
rebrand acceptance describes name changes supported by ancillary continuity, not
independently confirmed commercial rebrands. Review samples and labelled business
histories are needed to estimate real-world precision and recall.

## Identity policy

The identity is a continuing Place establishment, distinct from its publisher record,
brand, address and building. Preparation matches against the exact serving predecessor's
canonical history, within its snapshot lineage. Historical gaps are not automatically
bridged: an observation without a predecessor candidate receives a separate identity. A
return matcher needs explicit temporal and occupancy evidence to avoid reviving a closed
business at a reused premise.

`place-identity-v1` uses a policy score, not a calibrated probability. The minimum score
is 85, and both directions of assignment need a margin of at least 15. Scores are
additive and can exceed 100. Each family contributes at most once:

| Agreement                         | Score |
| --------------------------------- | ----: |
| Publisher ID                      |    75 |
| Attribution dataset and record ID |    45 |
| Phone                             |    35 |
| Social URL                        |    35 |
| Email                             |    30 |
| Primary/common name               |    25 |
| Website URL                       |    20 |
| Distance at most 30 metres        |    20 |
| Address text                      |    10 |
| Primary business category         |    10 |
| Opening hours, when present       |    10 |

Candidates come from publisher IDs, attribution keys, phones, social URLs and emails. A
name and location alone cannot create a match. The complete release is scored before
allocation. Matches are one-to-one; ambiguous old/new claims abstain rather than using
input order. Brand Wikidata IDs, publisher confidence, record versions and observation
timestamps are not business identity anchors. Attribution and social accounts can
describe the same upstream record: these weights are not independent probabilistic
evidence.

Names use Unicode NFKC, case and whitespace normalisation. Telephone punctuation and
Hong Kong prefixes are normalised. URLs retain paths and meaningful query identifiers;
scheme, `www`, trailing slash and UTM tracking differences are ignored. Website
homepages alone are insufficient. Known contradictory shop/room/unit numbers or floors
veto a match, including an unchanged publisher ID. The premise parser recognises
explicit English unit labels, `n/F`, and numeric Chinese room/floor forms; unparsed text
remains supporting evidence rather than a structured address assertion.

Automatic matches must be within 150 metres. A changed name is treated as a potential
rebrand, requiring identical known phone sets, the same primary business category,
location within 30 metres and at least one further attribution/contact/hours agreement.
Known conflicting phone, category, hours, social, website, email or address evidence
blocks a rebrand. Missing fields neither agree nor contradict; missing phone/category
prevents rebrand acceptance. Changed phone together with changed category also blocks
ordinary continuity. Conservative abstention deliberately leaves some real continuities
unmatched.

Unmatched or ambiguous observations receive an `ss-` UUIDv5 derived from lineage, birth
release and normalised evidence, including publisher ID. Repeating the same input gives
the same ID. Separate source observations have separate seeds; an unmatched return
cannot silently resurrect an earlier ID. Accepted matches reuse the canonical ID rather
than recomputing it from mutable fields.

## Retention and delivery

Publisher staging and Address curations keep publisher IDs. Identity preparation writes
a separate canonical stream; Address resolutions map to canonical IDs for
materialisation. An accepted identity supplies its exact predecessor Address
relationship for analysis. Rejected matches cannot inherit relationships merely because
a publisher ID was reused.

Source rows, validity intervals and source churn retain publisher IDs. Snapshot source
resolutions map publisher assertions to canonical Places and retain matching decisions.
Canonical history retains current identity evidence in `sources.placeIdentity`; the
evidence participates in the base hash for subsequent replay. Unchanged assignments
reuse their retained evidence on retry. Such records retain their original assignment
outcome; that outcome is not a fresh arrival or opening event. The processing audit
freezes the implementation and aggregates outcomes without generating individual
automatic curation audit objects.

Decisions record model, source ID, canonical ID, outcome, reason, normalised evidence
and the selected candidate and highest-ranked alternatives (at most five total), with
scores, distances, agreements and conflicts. The full candidate set participates in
assignment. Publication checks that the predecessor snapshot/token has not changed
during preparation. Source omission uses publisher membership; canonical removal uses
canonical membership, including in batched SQL.

Source Dataset change cards describe publisher-record churn. Canonical history describes
matched Place continuity. Neither an unmatched arrival nor disappearance proves an
opening or closure: coverage, filtering, missing observations and matcher abstention can
cause these events. `firstSeenMonth` and `lastSeenMonth` remain observation fields.

## Reproduction and validation

`bun scripts/audit-place-identities.ts OUTPUT_DIR RELEASE.jsonl.gz ...` replays raw
publisher JSONL exports chronologically with normalisation and country selection. Each
row preserves the publisher fields with Point geometry decoded to GeoJSON. Uncompressed
JSONL and release-nested Parquet paths are also accepted. Reports are compressed
decision JSONL plus a small summary; no database or publication is modified.

Tests cover churn, rebrands, contradictory/missing evidence, phone-set changes, chain
branches, ambiguity, input-order independence, premise conflicts, deterministic IDs,
source/canonical SQL separation and retry evidence. Full replay measures coverage, not
precision: this investigation has no independently labelled business-lifecycle truth
set. Do not lower thresholds simply to minimise additions/removals. Withheld matches are
uncertainty, not confirmed new businesses.

Published history requires a deliberate chronological rebuild to use these decisions.
Producer changes and read-only audits do not rewrite published snapshots.
