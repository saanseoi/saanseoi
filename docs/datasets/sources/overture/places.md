# Overture Places

Open source assertions with matching hashes require no release-membership update.
Finalisation compares complete incoming IDs in bounded, disjoint indexed ranges.
Same-release replay leaves open source assertions untouched; a year-shard rollover
materialises the new shard copy and closes the old shard assertion.

Unchanged records also reuse local normalisation, Address analysis and enrichment across
releases. The cache checks source content, official reference data, applicable curation
and processing implementations; changed dependencies require fresh work. Observation
dates and snapshot ownership are assigned to the incoming release. Address reviews and
ledger operations remain mandatory. H3 cells and localisation hashes are reused when
their inputs match, and snapshot projection inserts are batched within the statement
byte limit. See
[incremental Place preparation](../../families/places.md#incremental-place-preparation)
for cache ownership, invalidation and the isolated benchmark.

[Minimal initialisation](../../minimal-initialisation.md) processes 2025-09-24.0 and
2025-10-22.0 in full, with a separate completion manifest for the bounded sample.

The full remote mirror includes the Places current, history and source tables, including
Street–Address links. Decision analysis uses an exact Place-ID, address-fingerprint and
source-release index over the retained ledger. Review appends and ledger replacement
refresh that index while retaining first-match decision precedence. Historical decision
lookups use a Place-ID index, then apply the same release and fingerprint filters within
that Place's decisions; unrelated ledger rows are not scanned for each observation.

The source table stores publisher attributes in `rawProperties`, with publisher
identity, original `sourceGeometry`, private acquisition locators and version/release
tracking alongside it. Each publisher value is retained once. Normalised names,
coordinates, categories, brand, contacts and addresses are projected only into canonical
history/current tables. The publisher's integer record version is retained only in
`rawProperties.version`; `versionHash` identifies the stored payload.

Places SQL delivery reads current `overturePlaces` IDs and publisher hashes from every
prepared source shard. Unchanged records already in the active shard update release
membership through bounded ID batches without resending `rawProperties`. New, changed,
returning and shard-rollover records send full payloads to the active shard so each
release remains readable from its assigned source shard; changed assertions are closed
in their original shard. After all input chunks, finalisation closes current assertions
not marked with the incoming release ID, including source-only removals and empty
releases. The generated SQL is retained for identical remote delivery and local replay.

Places and supplementary Address assembly runs preserve analysis and finalisation
evidence, alongside exact source and lookup selections. Metadata replay includes their
recipe and input rows under the
[assembly provenance contract](../../pipeline.md#snapshot-assembly-provenance).

Enriched Place JSONL is published locally only after complete writes and a file sync. An
enrichment failure cannot replace completed staging, and resolution streams close on
failure. Supplementary review and same-snapshot Address edits remain inputs to each
enrichment attempt. A checksummed enrichment cache retains JSONL and release statistics
only with matching source/resolution digests, Address/Division links, supplementary rows
and revalidated Address3D lookup contents. Missing collections are dependencies too, so
adding units within a snapshot invalidates affected enrichment.

Local Place and supplementary Address SQL use native delivery plans. The supplementary
materialisation is verified after receipt-backed replay. Published search finalises
after the complete upload sequence. Review decisions are not skipped by SQL recovery.

The dataset stores its supported outputs in the `datasets.resourceTypes` JSON array.
Supplementary Address registration atomically appends `address` only when absent,
preserving the other declared outputs during local processing and metadata delivery.

Source staging retains normalised JSONL and country/locale review actions together with
source-file, source-version and processing-contract identities. The output is flushed
before its checksummed manifest is committed. Retries verify the staged file and reuse
its counts and actions without decoding Parquet again; mismatched or corrupted staging
stops processing. Address and supplementary review still run independently.

Address3D enrichment deduplicates concurrent collection reads for Places in the same
building. A bounded invocation-local cache includes the Address snapshot in each key and
is discarded between runs. It retains no failed database reads and does not freeze
Address data across retries.

Places search uses `placeSearchFts` with stable region/domain/lineage scopes mapped to
the latest published snapshots in `placeSearchScopes`. Finalisation compares names,
brands, taxonomy and linked Address, unit, Street and Division text. Unchanged documents
cause no FTS writes, including across snapshot promotion. Division names are ordered
deterministically before aggregation.

Standalone publication finalises Place and supplementary Address indexes together.
Deferred upload sequences finalise once during release-set reconciliation after every
release is ready. Failed finalisation can be retried through reconciliation; search
returns `503 fts_not_ready` until the latest snapshot mapping is ready. Planning mirrors
omit these derived indexes.

Places metadata and supplementary Address SQL are retained as receipt-backed
[delivery phases](../../sql-delivery.md). Supplementary SQL capture excludes policy
review and row verification. Search derives unit text from the linked `address3dUnitId`
within the localised collection, using a formatting override when present.

Supplementary Address materialisation initialises `parentAddressId` to null. The
selected ALS derivation base supplies evidence and Division context; it is not an
assertion that the supplementary Address is contained by that ALS Address.

Supplementary Addresses receive `granularity` from the shared classifier over accepted
structured components. Operational review evidence is retained in codebase curations,
not materialised database rows or public responses. Guarded overrides in
`address-granularity.json` use the shared canonical Address ID and component
fingerprint. A curated match does not itself verify the granularity heuristic. Publisher
unit/floor text excluded from the shared 2D identity does not reclassify that shared
Address as a unit or floor. Granularity review does not create subpremise addresses or
infer parent links from overlapping numbers.

Overture Places are ingested from the monthly `place` reference-data parquet layer. The
accepted source contract is versioned in `libs/core/src/sourceRecordSchemas.ts` and
includes the publisher geometry, multilingual names, categories, contact fields, brand
data, source references, and operating status. The release windows reflect the upstream
additions: `basic_category` is added in 2025-10-22.0 and `taxonomy` in 2025-12-17.0. The
upload validator accepts these known additive transitions while continuing to reject
unrelated drift.

The normaliser requires a Point geometry and preserves the raw publisher payload in
`overturePlaces`. It converts the multilingual `names`, `brand.names`, and address
`freeform` values into PlaceI18n rows using script-aware locale resolution. Locale-less
values are marked as inferred. Retained normalisation audits count conflicting explicit
labels; their original values remain in publisher source storage. Source values and
variants are not replaced with AI translations.

Overture `id` values are validated against the Overture GERS Registry rather than being
classified from their UUID shape. Harbour caches the registry evidence for the Division
and Place IDs in `.local/harbour-sql/gers-registry/cache.json`. The cache stores the
registry history and release path for each match, and records unmatched IDs explicitly.
Refresh it and print the coverage report with:

```sh
./bin/saanseoi cache:gers --require-gers
```

The complete publisher `addresses` value is included in the source record. A localised
`freeformAddress` is materialised on the matching PlaceI18n row; the public Place object
does not expose an `addresses` field. The structured `address.freeform`,
`address.locality`, `address.country`, `address.region`, and `address.postcode` values
remain in `rawProperties`; they are observational source values and are not
authoritative inputs to any parsed canonical field or relationship.

Overture address identifiers are not treated as SaanSeoi ALS identifiers and are ignored
for Place-to-address matching. Place ingestion parses the address `freeform` value
against the English and Traditional Chinese definitions in the selected ALS snapshot.
The matcher indexes exact canonical building, estate, block, and phase components as
well as streets and adjacent building-number expressions. It accepts a link only when
the combined evidence selects one canonical address. Common English suffix abbreviations
are expanded into the full reference name for comparison, and Arabic and common Chinese
number forms are understood. The publisher spelling remains unchanged.

The parse result includes recognised canonical components, street evidence,
building-number expression and members, residual 2D text, and a premise-candidate,
street-only, or unrecognised disposition. Street-only evidence and a street with a
contradictory number remain delayed; only a matching premise component can promote a
partial match into identity review. Shop, unit, room, floor, stall, and similar
address3d fragments are removed from the 2D candidate and retained as typed unit/floor
expressions, references, and types for future address3d matching. They do not affect
today's canonical relationship or create address3d records. A tied match remains
unresolved. Locality, country, region, and postcode are not used for that match.

The parser accepts a separate English and Traditional Chinese canonical Streets
vocabulary. The LandsD baseline provides that vocabulary once it has been assembled and
published, but the current Places composition has no Streets member. Publication
therefore uses street names from the selected ALS definitions and never reads the local
LandsD staging artefact. The selected ALS snapshot is the compatible reference dataset
recorded in the Places snapshot provenance. A later release does not silently replace
that historical selection with today's latest address snapshot. The selected ALS address
relationship remains separate and authoritative.

`premise-candidate` is parser evidence, not an official ALS acceptance decision. An
unmatched observation such as `19B Ap Lei Chau Praya Road` remains unlinked even when
its street and building number parse cleanly. The Overture Places supplementary Address
source accepts policy-governed candidates only. Each generated entry retains the Place,
source release, compact selected evidence, and confidence; deterministic high-confidence
candidates can be added to the local entry ledger, weaker candidates must enter the
address-identity review workflow, and unsupported candidates remain for later
processing. The `ds-hk-overture-place` dataset declares both `place` and `address`
resources. Both resource releases share the original publisher source release; the
Address output has its own `address/overture-places` snapshot and resource release. The
default Address API domain, `saanseoi`, combines this member with ALS addresses.
Consumers can select either dataset with `filter[dataset]` on list and search requests.

## SQL delivery

Places data batches are sealed in a [delivery manifest](../../sql-delivery.md) before
remote data writes. Recovery verifies checksums and database receipts, then resumes
remote delivery or local mirror replay without rebuilding SQL. The manifest records the
enriched input checksum and selected reference snapshots.

Places ingestion prepares SQL from the local D1 mirror and staged enriched records. Each
generated batch contains up to 512 Place records. Remote delivery combines its
statements into uploads of up to 64 MiB per target group without changing statement
order. The 90,000-byte statement ceiling is independent of the upload limit. Source and
historical shard groups complete before current projection and version-change writes;
publication follows successful imports. Local cache replay retains the same statement
sequence and commits each payload with its receipt in one transaction.

## Supplementary address materialisation

The Places-ingest extension creates Overture Places supplementary Address rows. It is
deliberately a two-phase part of Places ingestion: analyse the Place source release
first, then materialise accepted supplementary Address rows before finalising the Place
snapshot. That ordering lets a final Place row point to an Address row with ordinary
source provenance and, where justified, division IDs.

### Inputs and durable outputs

- Read only the Place release's retained publisher address, parsed 2D/3D evidence, Place
  geometry, and the Places release's selected ALS snapshot. Do not read an unrecorded
  current snapshot.
- Store policies, reviewed aliases, and explicit human decisions in
  `fixtures/meta/curations/overture-place-address.json`. This compact identity-policy
  document is version controlled and must never contain generated entries.
- Store automatically accepted entries in the target-specific generated ledger at
  `.local/overture-places/address-entries/{target}.json`. An entry identifies the stable
  Overture Place ID, supplementary Address identity key and ID, normalised publisher
  address, selected ALS base candidate when one exists, structured supplementary 2D
  values, compact selected evidence, acceptance mode, and first accepted source release.
  It is derived from retained source records, the cohort-selected ALS snapshot, and the
  checked-in policy. A clean initialisation or family reset removes it; `--continue`
  retains it across cohorts in the same initialisation.
- Write weaker candidates to a release-owned review artefact under `.local/`; include
  every candidate, score breakdown, residual text, geometry distance, and the reason it
  was not accepted. Its shape and stop/retry behaviour follow the ALS identity-drift
  review workflow.
- Retain Address-analysis audit declarations with separate counts for direct ALS links,
  accepted supplementary candidates, review-required candidates, and candidates with no
  useful partial match.

Places and supplementary Address releases register separate `processing-audit` manifests
before publication. The manifests retain matching policies, selected accepted entries
and individual reviewed decisions with fixture pointers. Unresolved identities retain a
failed blocking guard before the review stop. SQL metadata delivery does not write
processing-action evidence tables. Failed registration leaves a local retained graph for
exact delivery retry.

### Matching and carry-forward order

Before scoring a new candidate, first test the last resolved Place relationship. Reuse
that Address ID when the stable Overture Place ID and normalised publisher-address
fingerprint agree with the previous Place version and the Address ID materialises in the
currently selected official or supplementary Address member. This applies to a prior
direct ALS link as well as a supplementary link.

Then look up an accepted, non-retired generated entry by the stable Overture Place ID.
Reuse its supplementary Address ID when the supplementary identity key still agrees with
the retained publisher address evidence and the Address ID materialises in the selected
supplementary snapshot. This is the ordinary subsequent-release path: a Place whose GERS
ID is unchanged does not acquire a different Address merely because the candidate list
or a score ordering changed.

If the prior entry cannot be reproduced—for example, its Address identity changes, its
selected ALS base no longer exists, or the publisher address changes incompatibly—write
an identity-drift review item. Historical Place versions retain their recorded Address
snapshot and Address ID; a later current Place version must never rewrite that history.
An exact new ALS match can replace a supplementary link only through a recorded,
deterministic replacement policy or an explicit curation decision.

### Four matching tiers

The English-language Clack review defers source addresses containing Chinese characters,
including mixed-language source values. These items remain unresolved in the review
artefact and continue to block publication; skipping them records no identity decision
or retirement. The review reports how many such items it deferred.

Automatic Address selection, including exact-text, canonical-component and supplementary
matches, requires known coordinates within 50 metres and a lead of at least 20 points
over the next candidate before conflicting or distant rivals are excluded. Stricter
configured distance and separation limits apply. Every supplied building, block and
phase component must match the selected candidate; missing candidate values and extra
conflicting names prevent automatic acceptance. Estate evidence is optional, but
conflicting supplied estate values prevent acceptance. Explicit curation is separate.

Interactive terminal uploads open a Clack review for unresolved Place Address
identities. Each item shows source evidence, its previous link, candidate scores and
conflicts. Inspect a candidate to see labelled, colour-coded components: cyan building,
magenta estate, yellow block/phase, green number and blue street. Confirm an ALS
selection or explicitly leave the Place unlinked and supply a reason. Skip retains an
unresolved item; save and exit preserves every confirmed decision. Continue
initialisation to apply saved decisions. Non-interactive runs retain the review-file
stop; `--yes` never chooses an identity.

Free-text component recognition excludes bare numeric or single-letter references and
country-only labels (`HONG KONG`, `HK`, `香港`). These values remain in canonical source
records but cannot supply premise evidence or contradictions. Qualified names such as
`PHASE 1` and `HONG KONG CULTURAL CENTRE` remain recognisable.

1. **Direct canonical Address match.** Parse against the selected ALS snapshot. Exact
   formatted-address evidence, or an unambiguous combination of canonical building,
   estate, block or phase evidence with street/number evidence, links the Place directly
   to the existing ALS Address. It creates no supplementary row.
2. **Automatic supplementary candidate.** Only inspect this tier when tier 1 cannot
   select an ALS Address. Score partial evidence against selected ALS candidates: exact
   canonical components, recognised street and number, reviewed aliases, and optional
   Place-to-candidate geometry distance. Except for an explicit reviewed alias, a named
   premise component and canonical street must support the same candidate. An exact
   building name and exact street may score high enough without a building number when
   the ALS row represents a building range or its shops. A locality-shaped component
   match attached to another street is not premise evidence. Geometry may disambiguate
   named candidates; it must never create a candidate from a bare number or be the only
   positive evidence. If one candidate clears the configured deterministic automatic
   threshold and separation from the next candidate, append an accepted generated entry.
   Citygate Outlets is the intended shape: it can be a supplementary building name with
   Citygate/20 Tat Tung Road as evidenced context, while retaining Overture rather than
   ALS provenance.
3. **Review candidate.** A candidate which independently clears the automatic score but
   is tied, insufficiently separated, or carries contradictory component evidence must
   stop for review; `--yes` may not choose an identity. Multiple source localisations
   and identity drift also require review. The review artefact must show the previous
   accepted link, when present, so a reviewer can keep, retire, or replace it
   explicitly.
4. **No usable match.** A result below the automatic threshold, including no candidate
   at all, is recorded as delayed and ignored for current Address matching. Weak name
   fragments and locality-shaped tokens are not actionable identity choices. Do not
   manufacture a nearest Address or a generated entry. Retain the Place source value and
   release action so a later matcher policy or address release can reconsider it.

The thresholds, score weights, alias rules, candidate-distance margin, and replacement
policy belong in the checked-in curation policy or its referenced policy version. They
are not implicit matcher constants, so a released result remains explainable and
replayable.

### Curation and row materialisation

An accepted generated entry is the reproducible input used to create a supplementary
Address record. It must contain enough structured, locale-specific 2D content to
reproduce the row; never derive a public Address field from a future re-parse of mutable
source text. Typed Place unit/floor fragments remain source evidence until an Address3D
materialisation policy is introduced.

Materialise the row under the original Overture Places dataset/source, distinct from
`hkgov-dpo` and the official `address/default` member. Its provenance must name the
Overture Place ID, Place source release, original address value or hash, generated
entry, policy version, score, and selected ALS base candidate. The supplementary Address
ID is deterministic from that durable identity key; any incompatible change follows the
same identity-drift review process as other Address sources.

An accepted ALS base candidate may supply division IDs only as recorded derivation
evidence on the supplementary row. A supplementary row without that base has no division
IDs. Place geometry must not fill those fields. The final Places materialisation then
selects the recorded Address row, sets `addressSnapshotId` and `address2dId`, and
creates `placesDivision` rows from that Address row's recorded division IDs. A Place
with neither an ALS nor an accepted supplementary Address remains division-unlinked but
continues to be indexed in H3 cells and returned by cell and search queries.

### Required ingestion order

1. Load the cohort-selected ALS Address and Division snapshots and build the canonical
   matcher indexes.
2. Parse and run the four tiers for every retained publisher address; write the review
   artefact before any Place rows are finalised.
3. When no reviews remain, atomically update the target's generated entry ledger,
   validate and carry forward its accepted entries, then materialise the accepted
   Overture Places supplementary Address source snapshot and record it as a Places
   release dependency.
4. Resolve each Place against the union of the selected official and supplementary
   Address members, then materialise Place, PlaceI18n, H3, and `placesDivision` rows.
5. Refuse publication if a review-required candidate lacks a curation decision, if the
   supplementary source snapshot is missing, or if a Place/Address link cannot be
   reproduced from the recorded source release, checked-in decisions, generated entry
   ledger, and dependency snapshots.

### Matching policy and review operation

`supplementary-v1` assigns 55 points for a canonical building name or reviewed alias, 45
for an estate, 20 each for a block or phase, 30 for a street, and 15 for a building
number. The automatic threshold is 85, the review threshold is 30, and the required lead
over the second candidate is 20. Geometry adds 25 points only to a named candidate
within 50 metres, with a 100-metre distance lead over the next named candidate. Aliases
are explicit locale/address-ID entries; the initial list is empty. Street and number
evidence alone cannot reach the automatic threshold. Replacement of an accepted
supplementary link with ALS requires an explicit decision.

The version-controlled fixture keeps policies by version, reviewed aliases, and explicit
`decisions`. The target-specific `.local` ledger keeps generated per-Place `entries`. An
entry's `values` contains the public 2D localisations. Its identity key includes those
normalised 2D values and excludes Place IDs, source release, unit and floor fragments.
Places with the same identity share the `opa-` Address ID and retain separate generated
entries. Conflicting ALS derivations for a shared identity stop materialisation.

Interactive review displays source text, readable parsing reasons, present components
from small to large, and a previous address only when one exists. Candidates show their
English ALS address with coloured components and dim `(score @ distance !conflicts)`
evidence; conflicts are omitted when absent. `multiple_close_matches` displays as
“Several candidates have similar scores”.

Selecting a candidate or **New Address** opens an English component menu for building,
estate, block, phase, street, and building number start/end, followed by **Save**,
**Save & Override Lat/Lng**, and **Back**. Saving unchanged candidate components links
ALS. Editing them saves a supplementary address with the ALS derivation reference.
**Save & Override Lat/Lng** is available only for an existing ALS candidate with
geometry and copies that Address point onto the public Place and its H3 cells; the
original publisher point remains in the source `overturePlaces` record. New Address
starts from parsed components with no ALS base or inherited divisions. The selected
action supplies the reason automatically; no justification or extra confirmation is
required.

The decision stores `address.values`, nullable `address.baseAddressId`, and, when
selected, the finite `placeGeometryOverride` longitude/latitude pair. Chinese components
preserve existing names where English is unchanged, carry edited numbers, translate
controlled block/tower and phase expressions, and retain changed proper names as
entered. Per-language `provenance` in the curation values records verified English
fields and generated, unverified Chinese fields. Materialisation retains this metadata
in each Address source record's `localisationProvenance`; Address localisation rows do
not have a dedicated provenance column.

**Skip as Unresolved** leaves the item for a later run. **Skip as Unlinked** records a
durable retirement and the parsed `address2dFingerprint`: unit/floor-only changes remain
unlinked, while changed 2D source text requires review. **Save & Exit** retains all
decisions already saved.

Every analysis writes `overture-place-address-review.json` inside the target's
`.local/harbour-sql/releases/{target}/{releaseCode}/` directory. It includes the
selected ALS snapshot, parsed source evidence, candidate score breakdowns, distances,
previous link and disposition for review-required rows only. The source parse is stored
once per result rather than repeated inside every candidate. Accepted entries are saved
only when the cohort has no unresolved review, so a review stop leaves both the
checked-in policy and generated ledger unchanged. Record reviewed aliases or decisions
in the fixture and retry the same upload; `--yes` cannot bypass review. A decision
records `placeId`, `fingerprint`, `sourceRelease`, `previousAddressId`, `resolution`,
`addressId` and a non-empty `reason`. `link_existing` links an ALS address;
`create_supplementary` creates and links the address described by `address.values`;
`keep_existing` retains the previous ID; and `leave_unlinked` records no address link.
Only `create_supplementary` includes `address` values and their optional ALS base.
Generated entries record `firstSeen` and, when the Place is absent from a later complete
release or is explicitly left unlinked, `revokedAt`. A withdrawal writes an `address2d`
delete tombstone to that supplementary snapshot's version changes, so historical replay
does not carry the Address into later releases. Published history remains the durable
replay source. Artefacts use unique temporary files and replace their destination only
after a complete write; interrupted writes remove their temporary files.

The Overture Places family reset owns both `place/default` and `address/overture-places`
snapshots and their resource releases. It removes supplementary Address current and
historical rows, rebuilds Address search, and preserves the ALS snapshots used as
derivation evidence.

Supplementary snapshots are complete, including when there are no accepted rows. Their
assembly records retain a materialisation hash, combined policy/entry-ledger hash and
policy versions. Address history and `snapshotVersionChanges` reproduce each snapshot
independently. An existing published supplementary snapshot must reproduce its recorded
materialisation; an incompatible fixture edit requires a source-release revision. The
initializer does not discover or upload the supplementary dataset separately.

Places with `CN` or `MO` address country codes are excluded from the Hong Kong
projection. Places with a missing country code remain included. Both cases are recorded
as one `overture_place_country_review_required` action per Place in the release Audit.
Ingestion stops with a warning if any Place contains more than one publisher address.
The warning requires reconsideration of the Place-to-address implementation before the
release can be materialised.

Machine translation of Place names and free-form addresses is disabled. Publisher
localisations are preserved as supplied or inferred from their script; Harbour does not
fill a missing PlaceI18n value through Azure. Known non-premise address observations
remain unlinked, while the Place name, source record ID, and free-form value remain in
the source record.

`referenceName` is a deterministic response projection over PlaceI18n rows. It is not
stored as a synthetic locale and is not counted as locale coverage.

Each canonical place receives H3 cells at resolutions 5, 7, and 9. The H3 index supports
the Places `by-cell` API and is rebuilt with the current place snapshot. The
`placesDivision` projection is likewise current-only and is derived from the selected
address row's division snapshot and IDs. The full-text index is rebuilt after the
snapshot and its address, division, and street joins have been materialised.

## ZH-HANT

補充地址使用獨立的 `address/overture-places`
快照，並在地點資料實體化之前完成。相同的正規化二維地址共用 Address
ID，但每個地點保留獨立的策展決定。自動接受門檻為 85 分，審核門檻為 30 分，候選領先差距為 20 分；不明確的配對及身分變更必須審核，`--yes`
不會略過。分區只可來自記錄中的 ALS 基礎地址，沒有基礎地址的補充地址不會連結分區。單位及樓層片段保留為來源證據。

Overture Places 的 `names`、`brand.names` 及地址 `freeform`
會按腳本獨立解析並保留來源值。未標記漢字在香港資料中通常推斷為
`zh-hant`；這代表繁體中文腳本，不代表粵語。衝突的語言標籤及來源值會記錄在發布審核動作中，混合腳本不會自行拆分。公開 Place 不再提供
`addresses`，自由格式地址會放在 PlaceI18n 的
`freeformAddress`；選定的 ALS 關係仍然獨立且具權威性。地點名稱、品牌及自由格式地址均不使用機器翻譯。

## ZH-HANS

补充地址使用独立的 `address/overture-places`
快照，并在地点数据实体化之前完成。相同的规范化二维地址共用 Address
ID，但每个地点保留独立的策展决定。自动接受门槛为 85 分，审核门槛为 30 分，候选领先差距为 20 分；不明确的匹配及身份变更必须审核，`--yes`
不会跳过。分区只可来自记录中的 ALS 基础地址，没有基础地址的补充地址不会链接分区。单位及楼层片段保留为来源证据。

Overture Places 的 `names`、`brand.names` 及地址 `freeform`
会按脚本独立解析并保留源值。未标记汉字在香港资料中通常推断为
`zh-hant`；这代表繁体中文脚本，不代表粤语。冲突的语言标签及源值会记录在发布审核动作中，混合脚本不会自行拆分。公开 Place 不再提供
`addresses`，自由格式地址会放在 PlaceI18n 的
`freeformAddress`；选定的 ALS 关系仍然独立且具权威性。地点名称、品牌及自由格式地址均不使用机器翻译。

## Publisher source boundary

### Trial imports with incomplete ALS coverage

`SAANSEOI_TRIAL_DEFER_PLACE_ADDRESS_REVIEWS` accepts exact comma-separated
`environment:sourceVersion` scopes for explicitly authorised trials. Unresolved Address
reviews retain their source text, candidates and original reason in the release-owned
review file and provenance fixtures, but publish no Address link. Reviewed identity
decisions remain unchanged and are not reported as applied to deferred rows. This option
does not change existing ALS snapshots or backfill later premises into earlier history.
Without the scoped option, identity review blocks publication.

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`rawProperties`.

## Publisher record envelope

Follow the [source record contract](../../source-records.md). The response contains
publisher attributes and source identity; internal resource types, variants and
acquisition locators are excluded. Optional geometry preserves native coordinates and
CRS, independently of canonical geometry processing.

Publisher `sources` stays in `rawProperties`; WKB geometry is retained as a lossless
base64 value with an explicit `wkb-base64` encoding.

## Artefact destination

Fresh local initialisation supports `--target local --r2 production`: immutable source
and provenance objects are retained in production R2, with registrations kept in local
D1. Follow the
[storage-target workflow](../../d1-bootstrap.md#ingest-locally-with-production-r2) when
selecting or continuing this mode.

Local Places continuation reuses retained inputs and completed source releases.
Official-address matching reads English and Traditional Chinese definitions from the
selected ALS snapshot. Local ownership-manifest completion opens only metadata.

## Registry metadata

Overture Places dataset metadata declares EPSG:4326 for source geometry.

## Retained fields and attribution

Retained publisher properties use camelCase names, including nested attribution fields,
while language dictionary keys and source values remain intact. API field provenance
pairs original Overture paths with retained locations. Canonical Places attribution is
wrapped as `{ "overture": [...] }`; the full profile exposes this publisher object.
Localisation and reviewed address decisions are processing inputs rather than direct
copies of publisher objects.

Public source records expose retained attributes under `properties`; `rawProperties` is
the internal storage column. API-field inputs reference the public path through the
shared dataset-scoped `publisherFields` mapping. Processing-rule definitions remain in
their registered fixtures and are pinned by the selected release.
