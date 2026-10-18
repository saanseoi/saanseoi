# Places monthly churn audit

Read-only audit of the local clean initialisation on 18 October 2026, covering twelve
Overture releases from 24 September 2025 to 23 September 2026 (eleven transitions).
November 2025 is not present. Counts describe retained records, not verified changes in
real-world businesses.

## Findings

The large monthly totals principally reflect changes in retained publisher content,
including confidence and attribution, schema evolution and coordinate precision. They
are not evidence that nearly every business changed each month.

The source-directory churn calculation compares publisher payloads directly via
`buildSourceChurnCounts`; it does not compare stored hash strings. Both that comparison
and source hashing exclude recursive bookkeeping versions and timestamps through
`recordContent`. Object key order is ignored. Arrays remain ordered.

The independent interval reconstruction across all three source shards exactly
reproduced the persisted added, changed, removed and unchanged counts in every month.
There were **954,350 changed-record events**, of which **217,195 (22.8%)** changed only
confidence and/or attribution. These are events across months, not unique Places. Only
**23 events (0.0024%)**, all in July 2026, became equal when all arrays were recursively
treated as unordered. That deliberately permissive diagnostic is an upper bound:
geometry coordinate order and taxonomy hierarchy order remain meaningful. Sorting every
array would therefore be unsafe and would not address the large spikes.

| Release    | Changed | Confidence/attribution only | Added publisher IDs | Removed publisher IDs |
| ---------- | ------: | --------------------------: | ------------------: | --------------------: |
| 2025-10-22 | 110,994 |                           0 |              24,353 |                24,187 |
| 2025-12-17 | 102,882 |                           0 |              32,534 |                32,465 |
| 2026-01-21 |      99 |                          26 |                 156 |                    79 |
| 2026-02-18 |     434 |                         234 |                 492 |                   461 |
| 2026-03-18 | 109,411 |                          94 |              16,357 |                15,858 |
| 2026-04-15 | 122,314 |                      86,632 |              14,017 |                 9,948 |
| 2026-05-20 | 132,271 |                          16 |               7,808 |                 7,821 |
| 2026-06-17 |   2,995 |                         237 |                 162 |                   405 |
| 2026-07-22 | 113,168 |                      71,717 |              15,466 |                16,509 |
| 2026-08-19 | 128,057 |                      55,062 |               6,715 |                10,736 |
| 2026-09-23 | 131,725 |                       3,177 |               6,811 |                 2,061 |

## What drives the spikes

- October 2025: all 110,994 continuing changed records acquire/change `basicCategory`;
  51,420 differ only in that field, confidence and attribution.
- December 2025: all 102,882 changed records acquire/change `taxonomy`; 70,221 differ
  only in taxonomy, confidence and attribution.
- March 2026: 103,673 records change `brand` representation, and 94,418 change
  coordinates. Of those coordinate changes, 82,769 are under one metre. An example is
  `[114.1495542, 22.3395667]` becoming `[114.14955424, 22.33956667]`, alongside other
  content changes. These counts overlap and do not imply all such changes are harmless.
- April 2026: 86,632 of 122,314 changes (70.8%) affect only confidence/attribution.
- May 2026: 132,254 records change `operatingStatus`; 42,153 change only that field.
  Retained input Parquet confirms the widespread transition from `open` to null. Loss of
  a status assertion is not evidence that those businesses closed.
- July 2026: 71,717 of 113,168 changes (63.4%) affect only confidence/attribution.
- August 2026: all 128,057 changed records change attribution. Examples add `provider`
  and `resource` fields. Another 55,731 change addresses; metadata-only changes do not
  explain the whole month.
- September 2026: 127,733 records lose/change `categories`; 23,721 change only that
  field. The retained input Parquet no longer contains the `categories` column, while
  `taxonomy` and `basic_category` remain. Canonical history records 98,127 changes to
  `taxonomyAlternates`, so this source schema change also affects the public projection.

These observations establish what differs in retained input, not the publisher's intent
or an independent survey of business changes. Parquet counts include a few records
outside the final accepted Place set; the table uses only retained source intervals. No
precision tolerance or semantic normalisation was applied to the main counts. Sub-metre
distances use a local equirectangular approximation.

## Canonical history and identity

Canonical IDs and publisher IDs have different lifecycles. In October 2025 the source
adds/removes 24,353/24,187 IDs, whereas canonical history adds/removes 10,835/10,669.
Identity reconciliation preserves many Places across publisher ID changes. Neither set
of counts should be labelled business openings/closures.

Derived links also legitimately create canonical versions. January 2026 has 99 source
content changes but 701 canonical updates, including 606 address-dependency changes. The
base hash includes address dependencies, resolved divisions and identity evidence; it
excludes observation months and snapshot IDs. Locale versions are independent.

There are **1,743 canonical update events with identical stored base content** after
excluding bookkeeping timestamps. These are candidates for separating identity/
provenance versioning from public material-change reporting, not proof of hash bugs. In
a checked February example, canonical Place `ss-00c20abc-cf1f-5689-b012-e9edbb9f1116`
(Pandora, YOHO MALL I) retains all its business details while its Overture ID changes
from `ffc1a218-46c5-4c23-906f-fd9f4e53443d` to `5f521b04-63cf-4922-83fd-5f40d015e1e3`.
The identity evidence includes that publisher ID, so the base hash changes even though
the public base fields do not. The remaining 1,742 events have not individually been
attributed to identity versus locale evidence; this audit does not classify them all as
unnecessary versions.

The canonical audit compares successive stored base rows per canonical ID across all
history shards, omitting release/snapshot identifiers, observation months and storage
bookkeeping. It does not reconstruct independent locale history or prove that every
publisher assertion is accurate.

## Recommendation

Keep complete source versions and provenance, including confidence and attribution. The
current evidence does not justify weakening the shared content hash or rewriting
history. A useful product improvement is to distinguish business-detail, confidence/
attribution, source-schema and derived-relationship changes in the churn display.

If a separate material-change indicator is introduced, define it independently of the
provenance hash. Review coordinate tolerances, empty/null structures, category schema
transitions and explicitly unordered contact/attribution collections field by field. Do
not round retained source geometry, drop confidence, treat null as open, or sort ordered
geometry/taxonomy arrays to reduce a headline count.

## Reproduction and validation

Local audit scripts and full results are retained at:

- `.local/audit-place-churn-20261018.py`
- `.local/places-churn-audit-20261018.json`
- `.local/audit-place-canonical-20261018.py`
- `.local/places-canonical-churn-audit-20261018.json`

The scripts open the databases read-only using `.local/init-continuation-db-paths.json`.
The source audit reconstructs half-open release intervals and compares continuing
publisher IDs, preserving missing/null distinctions and recursive array order. Existing
focused content/hash/churn tests pass: 23 tests, 76 assertions.
