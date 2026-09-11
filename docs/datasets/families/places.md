# Places dataset family

[Minimal initialisation](../minimal-initialisation.md) selects the first two configured
Overture versions and uses a separate completion manifest.

Address decision lookup indexes both exact observations and per-Place decision history.
Historical replay retains release ordering, fingerprint checks and first-match
precedence without scanning unrelated decisions. Appending or replacing the ledger
refreshes both indexes.

Canonical list requests use SQL pagination for materialised snapshots. Historical lists
replay bounded batches until the requested page and one further match are found. Their
`meta.page` provides `hasMore` instead of an exact `total`; clients follow `links.next`
until it is absent. Filters apply before selecting page members.

Source Place records retain publisher attributes in `properties`, alongside source
identity, original `sourceGeometry`, `sources` and release history. Normalised
coordinates, names, taxonomy, contact details and addresses belong to canonical
history/current tables; source tables do not duplicate those fields. Publisher record
versions remain in `properties.version`; source history uses content hashes and release
validity.

SQL uploads compare incoming publisher hashes with current source assertions in the
prepared local mirrors. New and changed assertions carry full payloads; unchanged
assertions remain untouched, preserving their original release, validity and timestamps.
Source finalisation compares complete incoming membership in disjoint indexed ID ranges
and closes omissions after all chunks have been applied. A shard rollover writes the
required copy to the new shard and closes the preceding shard's current assertion.
Canonical and source candidates share final-difference delivery; only their changed rows
are transmitted.

The Places API exposes contributing releases at `/places/v0.1/source-releases`, with
optional `releaseSet`, `snapshot`, `cohort` and `dataset` selectors. Read retained
Overture records at `/places/v0.1/sources?sourceRelease=<source-release-code>`. JSON
responses contain `records`, an exact source-release `pin` and `nextCursor`; pass that
cursor with the same source release to continue. `sample=random` selects a sample,
`include=geometry` exposes source geometry, and `format=ndjson&download=1` streams a
download. Both endpoints also support the `/places/v0` alias and the shared public API
authentication and region contract.

Place and supplementary Address snapshots retain source-selection recipes and run
evidence under the
[assembly provenance contract](../pipeline.md#snapshot-assembly-provenance). Planning
and finalisation share a draft run, preserving review and materialisation hashes.

Processing audits retain registered normalisation, country-selection and Address
analysis declarations, aggregate counts, matching policies and reviewed identity
decisions in R2. Places and supplementary Addresses register separate manifests before
publication. Unresolved Address reviews retain a failed guard, and publication also
requires the completed supplementary snapshot dependency. Completed audit delivery
retries reuse retained objects. See the
[processing provenance contract](../processing-provenance.md).

Enrichment staging writes complete JSONL rows and syncs the temporary output before
replacement. Failed enrichment preserves the completed output, and interrupted or
misaligned resolution streams are closed. Snapshot IDs alone are not enrichment cache
identities: Address division links, parent IDs and unit collections can change within a
snapshot. Enrichment reuse hashes staged source and reviewed resolution files, selected
Address links, Division IDs and supplementary rows. It records exact Address3D lookup
dependencies, including missing owners, and revalidates their collection contents on
retry. Changed dependencies regenerate enrichment; corrupted retained outputs stop
reuse. Review and supplementary analysis run before this cache is consulted.

Cold enrichment rechecks observed Address3D dependencies before replacing the staged
output; a detected concurrent edit leaves the completed file intact.

### Incremental Place preparation

Harbour retains a disposable per-record SQLite cache under
`.local/harbour-sql/releases/{target}/place-record-cache/{datasetCode}.sqlite`. It is
shared across releases of that dataset and target. Source records with identical
payloads reuse normalisation, while first-seen and last-seen observation months are
assigned for the release being processed. Reading and hashing the incoming source is
still required to establish membership, changes and removals.

Address parsing is keyed by publisher text and official definitions. Address resolution
also includes coordinates, official IDs and geometry, matching policies, the previous
relationship and applicable curation entries and decisions. Resolved records retain
compact cache values; review records retain candidate evidence. Same-release decisions
and supplementary identity creation execute their ledger operations on every attempt.
Review guards, audit delivery and supplementary snapshot materialisation remain active.

Per-record enrichment includes the selected Address and Division references, Address
parent and division links, curated coordinates and the normalised source. Address3D
collection dependencies, including missing collections, are checked before reuse.
Reusable projections include H3 cells and localisation version hashes. Implementation,
processing-rule and dependency-lock changes invalidate cached computations, including
same-release normalisation staging. Cached values carry checksums and writes are atomic;
retained computations from an interrupted attempt must still match the next attempt's
inputs and references.

Each snapshot asserts complete Place membership. The local compiler validates the
candidate and emits only final current, source and history differences. Base and each
locale history inherit independently; unchanged reissues create no component versions,
journal entries or source-resolution rows. Sparse source resolutions inherit along
snapshot ancestry, while changed interpretations and explicit source omissions remain
recorded. Superseded components close in their owning history shard. Snapshot journal
assignments identify history shards. The CLI reports reused and computed record counts
for each cache stage.

`bun run scripts/benchmark-place-incremental.ts` compares direct, cold-cache and warm
record-cache preparation for 1,000 synthetic Places and official definitions. It checks
identical resolution and enrichment digests and reports projection statement counts and
bytes in `.cache/preparation-benchmarks/place-incremental.json`. Reference reads use an
in-memory fixture; timings exclude Parquet reading, database mirroring and remote
delivery. The first run populates the record cache and incurs cache-write overhead.

`bun run scripts/benchmark-place-enrichment.ts` compares direct, cold-cache and
warm-cache enrichment on 2,000 synthetic unlinked Places using migrated local SQLite
tables. It includes staged source parsing and cache verification, checks identical JSONL
digests and statistics, and retains its report under `.cache/preparation-benchmarks`.
`--linked` uses 100 real Address2D/Address3D collections with 20 units each in the
isolated SQLite fixture. It includes collection dependency revalidation, verifies every
selected unit and checks invalidation after a same-snapshot unit edit. Neither mode is a
full-release benchmark. `--quick` uses 100 Places.

Native local delivery retains Place data and supplementary Address SQL with
transactional receipts. Review gates remain part of the workflow; a retry replays the
retained payloads before verification and publication.

Source normalisation retains its JSONL output and source-review actions in a checksummed
staging manifest. Local and remote retries verify the prepared source and staged-file
identities before reuse, avoiding repeated Parquet decoding and normalisation. Address
matching, supplementary-address review and enrichment remain outside this source-only
cache.

Enrichment shares concurrent Address3D collection lookups within one invocation. Its
least-recently-used cache retains at most 128 owners and 16 MiB of serialised collection
data, including missing-owner results. Each invocation starts fresh, so a retry reads
same-snapshot Address edits; failed reads are not retained.

Places search indexes only the latest published catalogue selection in `placeSearchFts`.
A stable scope identifies each region, domain and snapshot lineage; `placeSearchScopes`
maps that scope to its published snapshot. Finalisation compares the complete localised
text projection, including linked addresses, the selected Address3D unit, streets and
division names. Only removed or changed documents are deleted, and only new or changed
documents are inserted. Identical snapshot promotion updates the scope mapping alone.

Publication finalises Place and supplementary Address search together in one atomic
current-database batch. Deferred uploads finalise once through release-set
reconciliation after the sequence completes; pending release sets prevent finalisation.
Reconciliation also retries failed finalisation when no new release sets need
publication. Until the latest selection is ready, search returns `503 fts_not_ready`.
Metadata publication and current-database finalisation are separate transactions.

Metadata and supplementary Address SQL use [sealed delivery phases](../sql-delivery.md)
alongside Places data. Review and publication remain separate lifecycle steps. Planning
mirrors omit derived search indexes. The repair SQL synchronises only the existing scope
selection. Place search text selects the linked unit from the Address3D collection; it
does not index neighbouring units.

The Places API family publishes Overture `place` records for the selected region. Each
Overture release is processed as a complete replacement snapshot and includes the raw
publisher source record in the source database.

SQL generation uses the local D1 mirror as its planning context. Remote imports combine
statements into payloads of up to 64 MiB within each generated row batch, while each
statement retains a 90,000-byte ceiling. Source, history, current and version-change
writes retain their dependency order. Oversized individual statements stop delivery.
Sealed [delivery plans and receipts](../sql-delivery.md) let remote delivery and local
replay recover independently. Local replay commits each payload and receipt in one
transaction.

Places has three required reference members:

- the default canonical address snapshot;
- the cohort's Overture Places supplementary address snapshot
  (`address/overture-places`);
- the Overture canonical division snapshot.

The official reference members use `latest_at_or_before_or_earliest_after_cohort`. This
is intentional: Overture releases are monthly, while the authoritative ALS address
dataset is released irregularly. A Places release therefore records the newest published
compatible reference snapshot available at its cohort, falling forward only when no
earlier snapshot exists. The selected snapshot IDs are recorded as lookup provenance and
are used by both publication and replay.

The supplementary member uses `exact_ref` and is produced within Places ingestion. The
Overture Places dataset declares `place` and `address` in its `datasets.resourceTypes`
JSON array and retains one publisher source release for the Place and Address resource
releases. Address output includes its number lookup and full-text index. Once the data
imports succeed, ingestion publishes an Address release set in the `saanseoi` domain
with the selected ALS and supplementary snapshots; the shared source release is
finalised only after both outputs succeed. The Address list and search endpoints expose
`filter[dataset]` while preserving the combined default. Address analysis and curation
finish before supplementary Address rows, then Place rows, are materialised. Canonical
ALS matches create no supplementary rows. Accepted partial matches retain Overture
provenance and may derive division IDs from a recorded ALS base; curated rows without a
base have no division IDs. Shared normalised 2D identities share an Address ID across
Places. Unit and floor observations remain source evidence. Review-required candidates
stop ingestion before Place writes, including with `--yes`. Unmatched Places remain
available through H3 cells and search. See the
[source policy](../sources/overture/places.md#matching-policy-and-review-operation) for
thresholds, identity decisions and retry behaviour.

The normal upload lifecycle is shared with the other API families:

```sh
./bin/saanseoi upload <place-parquet> --resource-type place --theme places \
  --source overture --source-version YYYY-MM-DD.0 --cohort-key YYYY-MM-DD.0
```

`update --api-family places` discovers and uploads new Overture releases using the same
staged, resumable release lifecycle. The Places initialiser replays the stored Overture
release list in cohort order, defers each API release set, and reconciles the completed
family at the end:

```sh
./bin/saanseoi init:places:overture --target local
```

The initialiser uses the upstream Places schema at each release boundary. The
2025-09-24.0 payload predates `basic_category` and `taxonomy`; `basic_category` is
present from 2025-10-22.0, and `taxonomy` is present from 2025-12-17.0. These are
source-schema transitions only; the canonical Places shape remains stable.

Publisher address data is included in the source record. Public Places expose localised
`freeformAddress` through PlaceI18n rather than an `addresses` field; the Overture
source record exposes `address.freeform`, `address.locality`, `address.country`,
`address.region`, and `address.postcode` as observational values. They must not be used
as authoritative inputs for canonical address or division relationships. Street-only
evidence, including a contradictory building number without matching premise evidence,
remains unlinked and is delayed rather than entering identity review. Places with `CN`
or `MO` address country codes are excluded from the Hong Kong projection;
missing-country Places remain included. Both are recorded as review actions in the
release audit. Ingestion stops with a warning when a Place has more than one publisher
address, pending a reconsideration of the Place-to-address implementation.

Overture Division and Place IDs are checked against the Overture GERS Registry by the
local cache command. The command reports the exact GERS-backed and unmatched cohorts
used by the source files; UUID format alone is not accepted as evidence of GERS
membership.

Canonical place rows are indexed at H3 resolutions 5, 7, and 9. Search uses the
incremental `placeSearchFts` index. `placesDivision` and `placesCells` are current-only
projections and are rebuilt for the active Place snapshot; they are not copied into
history. The division projection is derived from the selected address snapshot's
`divisionSnapshotId` and division IDs.

The Places collection endpoint is `GET /places/v0.1`. All API families accept the
optional `region` query parameter: `hk` (default), `mo`, or `gba`. GBA currently selects
Hong Kong data. Macao collections are empty while no data is published; individual
records return 404. Places uses the shared JSON:API list shape with release-set
selection, `page[limit]` and `page[offset]`, permalinks, and `basicCategory`,
`taxonomyPrimary`, `operatingStatus`, and Division filters. The `compact`, `default`,
`map`, and `full` profiles progressively add ordinary place details, point geometry, and
audit/provenance fields. H3 cell memberships remain current indexing projections rather
than canonical Place attributes; use `by-cell` for that map lookup.

Place history records the address snapshot and address ID selected for each version.
Historical reads must follow that recorded address snapshot into historical addresses
and then use the address entry's division IDs. They must not join a historical Place to
the latest address or division projection. Place history uses the source payload plus
the resolved address reference as its version boundary; unchanged places do not create a
new history version.

Place localisation resolves explicit language and script evidence independently for
names, brand names, and free-form addresses. Missing locale information is inferred;
script conflicts are audited through release actions, and mixed-script source values
remain intact. Machine translation of Place names and free-form addresses is disabled;
missing PlaceI18n values remain missing.

Place-to-address matching uses the selected ALS snapshot's English and Traditional
Chinese address definitions as per-snapshot indexes. Exact canonical building, estate,
block, and phase components are recognised alongside a street and its adjacent
building-number expression. A match is accepted only when that evidence selects one
canonical address. English suffix abbreviations are expanded only into the full-name
matching form used by the reference definition; this does not rewrite the publisher text
or establish a separate canonical spelling policy. Common Chinese number forms are also
normalised.

The parser reports recognised canonical components, the street, building-number
expression, residual 2D text, and whether the observation is a premise candidate,
street-only, or unrecognised. Shop, unit, room, floor, and similar fragments are
stripped from the 2D candidate and retained as typed prospective address3d parts using
the canonical unit/floor expression, reference, and type vocabulary. They do not create
address3d rows yet. Ambiguous ALS matches remain unresolved. Locality, venue, and
street-only source values remain unlinked and are retained in the source Place record.

The parser can accept bilingual canonical Streets definitions as a separate reference
vocabulary. Places ingestion currently derives its street vocabulary from the selected
ALS definitions because the Places composition does not declare a Streets member. A
staged LandsD baseline is not a published lookup dependency and must not be read
directly during publication.

Bare numeric or single-letter components and country-only labels cannot supply free-text
premise evidence; their canonical source values are retained.

The English-language interactive review skips Chinese and mixed-language source
addresses, retaining them as unresolved review items without recording decisions.

Automatic Address links require known coordinates within 50 metres, a minimum 20-point
lead and agreement on every supplied building, block and phase component. Missing
candidate components cannot silently pass. Estate evidence is optional but cannot
contradict the candidate; explicit curation remains a separate decision.

A parsed premise candidate which has no ALS match is not promoted into the official ALS
source. Interactive Place Address curation uses a Clack step-through review with
labelled, colour-coded components and immediately saved, reasoned decisions. Skipped
items remain unresolved; continuing initialisation applies saved decisions. The Overture
Places supplementary Address source retains its Overture Place, source-release, selected
candidate evidence, and confidence provenance. Policies, reviewed aliases, and human
identity decisions are version controlled; deterministic accepted entries are
regenerated into a target-specific `.local` ledger. Weak partial matches remain for
later processing rather than becoming identity-curation work. A partial canonical name
is premise evidence only when the same candidate also matches the canonical street,
unless an explicit reviewed alias applies. Only a candidate which independently clears
the automatic threshold can require review for contradictory or insufficiently separated
evidence. Review artefacts retain one source parse plus compact candidate score evidence
instead of repeating the parse for every candidate. The required matcher tiers, curation
artefacts, provenance, materialisation order, and publication stops are specified in the
[Overture Places source instructions](../sources/overture/places.md#supplementary-address-materialisation).

Decision lookup is indexed by Place ID, address fingerprint and source release. The
index retains first-match precedence and refreshes when review appends decisions or
replaces the ledger. Scoring and acceptance thresholds follow the declared policy.

Interactive review opens candidates and **New Address** in the same English component
editor, including building number start and end, with **Save**, **Save & Override
Lat/Lng**, and **Back**. The override is available only for an existing ALS candidate
with geometry; it copies that Address point to the public Place and H3 cells while
retaining the original publisher point in `overturePlaces`. Unchanged candidates link
ALS; edited candidates create a supplementary address with an ALS derivation reference.
New addresses start from parsed components without inherited divisions. Chinese numbers
and controlled expressions follow English edits; unchanged Chinese names are preserved
and generated fields remain unverified in source provenance. Decisions use
`link_existing`, `create_supplementary`, `keep_existing`, or `leave_unlinked` to
distinguish the selected action and regenerate local entries. **Skip as Unresolved**
defers review, while **Skip as Unlinked** remains effective until the source's 2D
address changes.

To remove the bounded Overture Places initialisation from a target, use the
family-specific reset command. It owns both `place/default` and
`address/overture-places`, removes their current and historical rows, and rebuilds
Address search while preserving ALS snapshots. It reports its release-owned rows first
and keeps a dry-run and confirmation boundary:

```sh
./bin/saanseoi reset:places:overture --target local --dry-run
```

`rollback:release` reconstructs the published predecessor from retained base and locale
versions. It rebuilds H3 cells and replays Place ancestry to recover each Division
link's exact definition and original logical snapshot pointer. Localised search text
retains its own historical Address identity, including when the Place base has since
been linked to a different Address with identical text. Missing dependency evidence
stops preparation. The shared sealed delivery emits only changed current rows and
updates readiness with the incremental search index; published source/history evidence
remains retained.

Subsequent ingestion loads the restored serving predecessor's exact base and locale
journals from their owning shards. Retained `isCurrent` flags do not select the
comparison baseline. Reasserting content from a revoked publication can reuse that
immutable content while recording the new accepted snapshot's actual change.

## ZH-HANT

Places 的本地化會獨立處理名稱、品牌名稱及自由格式地址，並保留來源值及腳本衝突證據。公開 Place 使用 PlaceI18n 的
`freeformAddress`，不提供
`addresses`。地點名稱、品牌及自由格式地址均不使用機器翻譯；`referenceName`
是不計入語言覆蓋率的衍生投影。

Places collection endpoint 為
`GET /places/v0.1`，使用共用 JSON:API 清單格式、release-set 選擇、`page[limit]`、`page[offset]`、permalink，以及
`basicCategory`、 `taxonomyPrimary`、`operatingStatus`
和 Division 篩選。`compact`、`default`、`map` 和 `full`
profile 依序加入一般地點資料、點幾何和審核／來源欄位。H3 儲存格成員仍是 current 索引投影，不是 canonical
Place 屬性；地圖查詢請使用 `by-cell`。

## ZH-HANS

Places 的本地化会独立处理名称、品牌名称及自由格式地址，并保留源值及脚本冲突证据。公开 Place 使用 PlaceI18n 的
`freeformAddress`，不提供
`addresses`。地点名称、品牌及自由格式地址均不使用机器翻译；`referenceName`
是不计入语言覆盖率的派生投影。

Places collection endpoint 为
`GET /places/v0.1`，使用共用 JSON:API 列表格式、release-set 选择、`page[limit]`、`page[offset]`、permalink，以及
`basicCategory`、 `taxonomyPrimary`、`operatingStatus`
和 Division 筛选。`compact`、`default`、`map` 和 `full`
profile 依次加入一般地点资料、点几何和审核／来源字段。H3 单元格成员仍是 current 索引投影，不是 canonical
Place 属性；地图查询请使用 `by-cell`。

## Publisher source boundary

### Release-scoped trial Address deferral

An explicitly authorised trial may set `SAANSEOI_TRIAL_DEFER_PLACE_ADDRESS_REVIEWS` to
comma-separated exact `environment:sourceVersion` values. Only otherwise review-required
Place links are deferred: their Address IDs remain null, source values and review
evidence are retained, and no durable curation decision is created or applied for those
rows. The processing audit retains the deferred observations separately from applied
decisions. Ordinary imports and `--yes` retain the review gate. Published trial releases
are immutable; fuller ALS coverage requires a subsequent release or revision, not an
in-place relink.

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`properties`.

## Source record response

The [source record contract](../source-records.md) exposes publisher attributes in
`properties`, including publisher-authored attribution. Records expose source identity
and optional native geometry. Resource types, variants and internal acquisition locators
are not publisher-record fields. Geometry retains the source coordinates and CRS;
canonical geometry is available through the family’s canonical API.

## Local D1 with production artefacts

For a fresh local initialisation, `--target local --r2 production` keeps processing and
registrations in local D1 while retaining source and provenance objects in production
R2. See the
[storage-target workflow](../d1-bootstrap.md#ingest-locally-with-production-r2) for
immutable uploads and continuation requirements.

Local Places continuation reuses retained inputs and completed source releases.
Official-address matching reads English and Traditional Chinese definitions from the
selected ALS snapshot. Local ownership-manifest completion opens only metadata.

## Publisher attribution and field provenance

The full Places profile returns publisher attribution as `sources: { overture: [...] }`.
Retained source properties use camelCase keys while field provenance pairs those keys
with original publisher paths. Localisation alternatives, access hints, trust metadata,
first/last-seen months and full-profile snapshot/address references have explicit
inputs. Processing rules resolve against the definitions captured by the selected
releases.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

## Publication readiness

Current Places, localisations, spatial cells and Division links use one stable scope per
snapshot lineage. `placePublicationState` maps that scope to the logical publication.
Address and Division references retain exact logical revisions. Preparation replays
selected historical Address bases, unit collections and independent localisations into a
disposable dependency view using the Address assembly's recorded Division lookup. Those
lookup rows never enter delivered tables. Missing revision evidence fails preparation.

Final-difference delivery preserves unchanged Place content, cells, localisations and
links without transmitting their candidate SQL. Complete replacement membership removes
absent rows within that scope. The stored `releaseId` and `lastSeenMonth` retain the
last real content change. Current API responses derive `lastSeenMonth` from the selected
complete publication cohort; immutable history retains its recorded version values.

A newer Address revision with identical relevant base, selected unit and locale content
reuses the Place's earlier reference. Changed dependency content advances that exact
reference. Division links retain their selected logical revision and a small definition
containing level and localisations; unchanged definitions reuse the preceding link.
Place localisations retain resolved dependency search text, so both incremental search
and fresh FTS rebuilds use the same definitions. API projections omit the internal
dependency fingerprint and search text fields.

Place delivery checks records, localisations, spatial cells and Division links before
marking its receipt prepared. Supplementary Address delivery resolves final row
differences locally and owns its separate receipt. Required selected projections must be
ready before publication finalises Place search. An interrupted scope remains
unavailable, and a valid empty snapshot still requires completion evidence. Search
reuses unchanged documents across publication advances. Reads, cleanup and
reset/reingest follow the [publication-state contract](../publication-state-plan.md).
