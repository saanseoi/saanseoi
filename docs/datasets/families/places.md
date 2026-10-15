# Places dataset family

Source ledgers retain separate occurrences of recurring content under the
[shared source validity contract](source-evidence.md#recurring-source-validity-periods).

Source release statistics include added, changed, removed and unchanged Places against
the preceding published release of the same dataset. Comparisons use retained publisher
properties and geometry across source shards, excluding observation timestamps and
publisher version labels. The first release counts all retained Places as added.

Processing runs, reusable rule mappings and counts-only curation evidence follow the
[shared processing contract](../pipeline.md#processing-stages-and-retained-evidence).

Place construction records its concrete resource releases in `snapshotResourceReleases`,
its effective recipe through `snapshotAssemblies` and `snapshotRecipes`, and exact
Address, Division, DivisionArea and supplementary Address selections in
`snapshotDependencies`. Address analysis must resolve every identity review before
materialising supplementary Addresses or recording the final Place assembly. Source
cohorts come from each selected resource release's parent `sourceReleases` row; lookup
cohorts come from the pinned dependency snapshots.

Automatic Place normalisation and Address matching retain rules and aggregate counts.
Individual audit entries require record-specific fixture decisions; matching additional
records does not create additional audit actions. The completed audit also retains
reviewed decisions for observed Place identities through the incoming source version, so
replay can resolve an earlier explicit instruction. Future and unobserved decisions are
excluded. Retaining these instructions does not add automatic per-record applications;
field lineage matches exact retained instruction content and reports its application
count without inferring field winners.

Historical Address, Division and DivisionArea dependencies are rebuilt in a disposable
SQLite transaction. Missing content rolls back rows and readiness receipts together, so
a retry cannot reuse a partial dependency view. Serving and history databases remain
read-only during this preparation.

Place predecessor and historical Address/Division dependency hydration query exact
record, version and locale keys through composite indexes. Query batches respect the
shared parameter budget; identical hashes on different records do not widen selection.
Places also uses the shared indexed SQL comparison and verified provenance-object reuse
described in [SQL delivery](../sql-delivery.md) and
[processing provenance](../processing-provenance.md). Per-record evidence is checked in
batches of at most 64 objects. Verified matching content is reused; missing objects are
retained before their SQL chunk is imported. Supplementary Address continuity follows
the exact predecessor Place and accepted Address identity with matching text evidence.
Public attribution arrays supply upstream matching evidence without carrying private
identity decisions.

[Minimal initialisation](../minimal-initialisation.md) selects the first two configured
Overture versions and uses a separate completion manifest.

The Overture updater reuses a non-empty Hong Kong Place Parquet export already retained
under `data/overture/<release>/divisions/China/Hong Kong`; it downloads the requested
file only when that local export is absent.

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

Place source hashes exclude attribution observation timestamps (`sources[].updateTime`
and `sources[].update_time`). Publisher record and attribution versions are excluded
too. Confidence and other content metadata remain hash-significant. Stored payloads
retain the timestamps from the observation that created the version; timestamp-only
refreshes do not replace that payload.

Canonical Place hashes also exclude attribution observation timestamps and publisher
version labels. Attribution identity, property pointers, confidence and licences remain
content-significant. Observation-only refreshes inherit the predecessor's history event
and retained attribution payload.

SQL uploads compare incoming publisher hashes with current source assertions in the
prepared local mirrors. New and changed assertions carry full payloads; unchanged
assertions remain untouched, preserving their original release, validity and timestamps.
Source finalisation compares complete incoming membership in disjoint indexed ID ranges
and closes omissions after all chunks have been applied. A shard rollover leaves the
unchanged assertion in its owning shard, while the release is assigned every source
shard containing a retained assertion. New, changed and returning assertions write to
the active shard; changed and omitted assertions close in their owning shard. Canonical
and source candidates share final-difference delivery; only their changed rows are
transmitted.

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
analysis declarations, aggregate counts, matching policies and curated identity
decisions in R2. Places and supplementary Addresses register separate manifests before
publication. Unresolved Address reviews retain their evidence with a null Place link;
they do not select an identity or block ingestion. Publication requires the completed
supplementary snapshot dependency. Completed audit delivery retries reuse retained
objects. See the [processing provenance contract](../processing-provenance.md).

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
locale history inherit independently; unchanged parented reissues create no component or
history rows. SOURCE validity periods record publisher changes and omissions
independently. Changed components append events without updating their ancestors.
Snapshot events assignments identify history shards. The CLI reports reused and computed
record counts for each cache stage.

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

Places has four required reference members:

- the default canonical address snapshot;
- the cohort's Overture Places supplementary address snapshot
  (`address/overture-places`);
- the exact canonical Division snapshot selected by the Address release;
- the exact DivisionArea snapshot pinned by that Address release.

The official Address reference uses `latest_at_or_before_or_earliest_after_cohort`. This
is intentional: Overture releases are monthly, while the authoritative ALS address
dataset is released irregularly. A Places release therefore records the newest published
compatible reference snapshot available at its cohort, falling forward only when no
earlier snapshot exists. The selected snapshot IDs are recorded as lookup provenance and
are used by both publication and replay.

Deferred Places initialisation reconciles the combined Address release sets before the
Places release sets, then publishes documentation and completes its ownership manifest.
Their API field fixtures cover the retained curated Division ingredients, including
Lands Department, Rating and Valuation Department and Protomaps sources.

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
incremental `placeSearchFts` index. Scalar memberships are canonical base content;
`placesCells` are current-only projections and are rebuilt for the active Place
snapshot; they are not copied into history. The division projection uses the Place's
effective coordinates against the pinned DivisionArea polygons, with common canonical
ancestors and separate island membership. A matched Address supplies compatible
references where polygons are missing, including text-resolved village and hamlet
membership. A Place without an Address can still have spatial Division memberships.
Geometry takes precedence over inherited Address references. Shared boundaries and
overlapping peers remain unresolved.

Retained preparation artefacts and processing audits carry Division association
evidence. Rollback restores scalar memberships and exact shared definition sets from
immutable content. Older evidence reconstructs with the ingestion membership function
using historical Place coordinates, the referenced Address and pinned DivisionArea
polygons. It preserves the original Division pointer while the association and its
definition remain unchanged. Missing dependencies fail before replacing serving rows.
Snapshot IDs and geometry content participate in preparation cache invalidation.

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
Historical Division filters read that Place version's retained spatial and inherited
membership, including Places with no Address. They never join a historical Place to the
latest Address or Division projection. Place version hashes include resolved membership
and its evidence as well as source content and Address dependencies.

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

API field provenance pins a processing rule only to selected releases that captured that
rule. This keeps the Place normalisation definition attached to the Place release when
its supporting supplementary Address release shares the same dataset code but captures a
different processing rule. Every referenced rule must still be present in at least one
selected release, and conflicting captured definitions stop publication.

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
family-specific reset command. It owns both `place/overture` and
`address/overture-places`, removes their current and historical rows, and rebuilds
Address search while preserving ALS snapshots. It reports its release-owned rows first
and keeps a dry-run and confirmation boundary:

```sh
./bin/saanseoi reset:places:overture --target local --dry-run
```

`rollback:release` reconstructs the published predecessor from retained base and locale
versions. It rebuilds H3 cells and restores the shared definition sets and their
independent exact logical snapshot pointers. Localised search text retains its own
historical Address identity, including when the Place base has since been linked to a
different Address with identical text. Missing dependency evidence stops preparation.
The shared sealed delivery emits only changed current rows and updates readiness with
the incremental search index; published source/history evidence remains retained.

Subsequent ingestion loads the restored serving predecessor's exact base and locale
events from their owning shards. Retained `isCurrent` flags do not select the comparison
baseline. Reasserting content from a revoked publication can reuse that immutable
content while recording the new accepted snapshot's actual change.

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

A successful full local database reset clears full and minimal family completion
manifests so an empty database cannot be skipped as an already completed run.

## Publisher attribution and field provenance

Spatial-membership release sets include the selected Overture DivisionArea and curated
SaanSeoi Division sources in their API-field mapping signature, alongside ALS, Overture
Divisions and Places. Publication validates this exact source composition and its
publisher schema ranges.

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

Current Places, localisations and spatial cells use one stable scope per snapshot
lineage. `placePublicationState` maps that scope to the logical publication. Address and
Division references retain exact logical revisions. Preparation replays selected
historical Address bases, unit collections and independent localisations into a
disposable dependency view using the Address assembly's recorded Division lookup. Those
lookup rows never enter delivered tables. Missing revision evidence fails preparation.

Final-difference delivery preserves unchanged Place content, cells, localisations and
links without transmitting their candidate SQL. Complete replacement membership removes
absent rows within that scope. The stored `resourceReleaseId` retains the last real
content change. CURRENT has no `lastSeenMonth` column. Current API responses derive
`lastSeenMonth` from the selected complete publication cohort; immutable history retains
its recorded version values.

SQL planning uses disposable database copies with disk-backed rollback journals.
Generation buffers are collected before comparison, and each comparison connection is
closed after its shard passes replay verification. Progress identifies comparison,
normalisation, mutation journalling, payload batching and replay phases. Supplementary
Address delivery plans belong to an exact snapshot revision, preserving earlier sealed
plans when a correction needs a new immutable snapshot. Retained audit delivery caches
also belong to the exact snapshot owner. Place-processing phase boundaries also release
temporary analysis objects before the next stage. After enrichment, preparation discards
its matching history, identity map and dependency view before SQL generation loads the
exact predecessor under the delivery lock.

A newer Address revision with identical relevant base, selected unit and locale content
reuses the Place's earlier reference. Changed dependency content advances that exact
reference. Scalar memberships select a shared immutable definition set containing exact
logical revisions, levels and localisations; unchanged definitions reuse their pointers.
Place localisations retain resolved dependency search text, so both incremental search
and fresh FTS rebuilds use the same definitions. API projections omit the internal
dependency fingerprint and search text fields.

Place delivery checks records, localisations, spatial cells and scalar memberships
before marking its receipt prepared. Supplementary Address delivery resolves final row
differences locally and owns its separate receipt. Required selected projections must be
ready before publication finalises Place search. An interrupted scope remains
unavailable, and a valid empty snapshot still requires completion evidence. Search
reuses unchanged documents across publication advances. Reads, cleanup and
reset/reingest follow the [publication-state contract](../publication-state-plan.md).

### Address review before assembly

Address analysis caches candidate evidence and unresolved identity cases locally in
`.local/harbour-sql/releases/{target}/{releaseCode}/overture-place-address-review.json`.
Any unresolved case blocks supplementary Address materialisation and final Place
assembly, including with `--yes`. Resolve each case through the curation decisions and
retry the release; analysis reuses unchanged computations and checks the current source,
Address dependencies and curation inputs. A retry replaces the review cache, including
when no cases remain. Review state is not stored in META.

A reviewed decision to leave a Place unlinked is resolved. A source address with no
usable match also remains unlinked; it does not represent an ambiguous identity choice.
Published supplementary Addresses must reproduce their materialised rows and
localisations before a retry can proceed.

## Composition member roles

The `overture` Places domain uses `place/overture` as its `primary` member.
`address/hkgov-dpo`, `address/overture-places` and `division/overture` have role
`lookup`: they supply linked resources and matching context. The Address variants retain
the same names when exposed through the Address domain; their role describes how the
selected API collection uses them.

## Processing policy ownership

Overture ingestion retains publisher attributes and geometry in SOURCE. Place snapshot
recipes own canonical normalisation, country selection, reference names and reviewed
address matching. Supplementary Address recipes capture their Place normalisation
prerequisite and address-analysis policy separately from publisher release policy.

See the [processing policy contract](../pipeline.md#define-audit-processing-rules).

## Retained dataset archives

Original publisher inputs are managed assets with role `releaseSourceArchive`, owned by
a source release. Original Parquet and ZIP files retain their bytes; loose GeoJSON and
GML are losslessly packaged as ZIP. Original filenames and packaging details live in the
downloadable manifest.

Resource-specific source downloads use role `resourceSourceArchive`, are Parquet and are
owned by a resource release. The ordinary uploader retains its prepared Parquet input.
Native SQL intake exports its source tables with a `sourceTable` column and JSON strings
for complex source values. Processing scratch files are separate from retained assets;
release metadata does not store their file locations.

## JSON field naming

Canonical API responses use camelCase throughout nested JSON, including inherited source
attribution (`recordId`, `updateTime`) and localised provenance. Dictionary keys such as
locale codes and external identifiers retain their original spelling, as do string
values and source-field paths. Raw Overture source-record responses and retained
archives use the publisher's field names. The shared response projection rejects
field-name collisions.

### Reviewed building-range addresses

Lee On Building at 56–62 Argyle Street is a reviewed supplementary building-level
address. Its bilingual identity covers the full frontage range; it does not select one
of the individual ALS frontages. Publisher floor and unit expressions remain separate
Address3D evidence. The decision is retained in
`fixtures/meta/curations/overture-place-address.jsonl`.

### Deferred address identity investigations

Uncertain Place address identities may be accepted for ingestion under an explicit
`SAANSEOI_PLACES_INVESTIGATION_AUTHORITY` acknowledgement. These cases remain
`needs-further-investigation`, with low priority, in the `ss-evidence` R2 archive.
`fixtures/reviews/manifest.json` catalogues the immutable objects;
`fixtures/reviews/overture-place-address-investigations/` caches their verified bytes
locally. Place provenance references portable `evidence:sha256:{checksum}` identifiers.
Review reports retain the Place source ID, unique candidate Address IDs, a source
fingerprint, the unresolved reason and any previous Address reference. The report pins
the Place resource release and Address snapshot; record details must be loaded from
those DB scopes, rather than the latest API state. Candidate scores, component
breakdowns, parsed addresses, coordinates and copied publisher text are not retained in
the report. The private archive stores compact JSON with an exact SHA-256 digest. Exact
retained reference reports can be replayed without a new acknowledgement; a new report
digest requires explicit acknowledgement. Publisher address text remains in the source
records, but no uncertain canonical Address link or supplementary Address is created.
Assembly audits retain these investigations separately from applied human decisions.
Malformed evidence and concurrent curation changes still block ingestion.

## Canonical Place identity

Place snapshot recipes select `resolve-place-identity` from `rs-place-assembly-v1`. API
identity provenance pins this assembly rule; supplementary Address recipes retain their
own identity operations.

Preparation assigns canonical Place IDs using evidence-based, one-to-one matching
against the exact serving predecessor. Accepted matches reuse an ID; unmatched or
ambiguous observations receive a deterministic SaanSeoi ID. Publisher IDs remain source
identities. Rebrands require unchanged phone and business-type evidence plus further
continuity support, with no known ancillary contradictions. Missing evidence is not
agreement.

The [identity evidence and matching policy](../internal/overture/place-identity.md)
defines scoring, distance limits, ambiguity handling, retained decisions and replay
boundaries. Source-record additions/removals and canonical observation
arrivals/disappearances are separate measures. Neither alone establishes a business
opening or closure.

### Identity curation storage and audit

Place identity preparation writes content-addressed JSONL decision ledgers to ignored
local staging. Complete decision evidence is retained in immutable, partitioned R2 audit
objects. Git contains the matching policy and human-authored curation. Ledgers contain
the scope and observed release, policy and implementation hashes, and each assignment's
before/after evidence, candidates, conflicts, threshold and ambiguity margins. Unchanged
observations preserve their original assignment decision. These are automatic curations,
not human-reviewed approvals.

The Places Source Audit presents these decisions under the assembly identity rule. Each
expandable result shows the canonical ID, old/new publisher IDs, predecessor and
assignment release references, compared names, contacts, category, opening hours,
address and location, plus candidate scores and competing observations. Missing evidence
is shown as unknown. The audit retains partitioned immutable copies and a reference to
the staged ledger hash; retention fails if the ledger and prepared decisions differ.

Publisher SOURCE rows keep their own IDs. Canonical history retains canonical content
and publisher attribution; the retained identity ledger records assignment decisions.
Local staging and caches are disposable. Generated ledgers are not stored in Git;
successful publication retains the complete ledger in its assembly audit. Predecessor
matching restores private identity evidence from the completed audit for each exact
resource release and component snapshot. Missing decisions or mismatched audit owners
block preparation; public attribution is not a substitute for private identity evidence.

## Record attribution and evidence

Canonical `sources` is an array with required `publisher` and `dataset` fields. The
upstream `property` JSON Pointer is preserved; optional record ID, update time, record
version, confidence and licence are retained only when supplied. Native dataset names
resolve through `fixtures/meta/sourceAttributions/overture.json`. Unknown names require
an explicit mapping. No ingestion release is added to the attribution. The retained
Places releases include AllThePlaces (`alltheplaces`) and DAC (`dac`), identified by
[Overture’s attribution catalogue](https://docs.overturemaps.org/attribution/). Their
record references, licences and property pointers remain as supplied by Overture.

Place identity and Division association decisions are retained as immutable R2
record-evidence objects before SQL delivery, with collection and record identity in each
object. Preparation artefacts and processing audits retain their context. Supplementary
Address decisions belong to the Place audit and retained source archives; Address
history retains canonical values and attribution without a separate evidence index.
Public record attribution excludes these processing assertions.

Address preparation follows the matched canonical predecessor across publisher-ID
changes. It carries the predecessor's generated supplementary entry to the new publisher
observation; the Address analyser must still reproduce its address evidence and base
before reusing it. Disposable automatic defaults are recomputed when their expected
previous link or target no longer matches the exact predecessor. Version-controlled
human decisions retain precedence and their previous-link validation.

## Direct and inherited source attribution

Canonical attribution members follow `SourceAttribution` order: `property`, `publisher`,
`upstreamOf`, `dataset`, `recordId`, `updateTime`, `version`, `confidence`, `license`,
omitting absent fields. Preprocessing marks sources inherited through Overture with
`upstreamOf: "overture"`; Overture's own entries and other direct sources omit
`upstreamOf`. For example, OpenStreetMap attribution carried by Overture uses
`publisher: "openstreetmap"` and `upstreamOf: "overture"`. The relationship identifies
the direct publisher, not a dataset or record ID. Prepared archives retain this member
order.

### Snapshot event storage

Canonical HISTORY stores a changed component once, with its introducing `snapshotId`,
`operation`, content hash and payload in the same row. Unchanged components inherit the
selected parent. Deletions append identity-only tombstones, and ancestor rows remain
immutable. Reversions and independent branch changes have distinct introducing events.
The read-only `historyEvents` view stores no additional membership rows. Snapshot reads
resolve ancestry before filtering and use the exact introducing snapshot to fetch
content. SOURCE release validity and interpretation evidence remain separate.

The FTS5 virtual table `placeSearchFts` is created by search finalisation, outside
Drizzle's ordinary table migrations. `placeSearchScopes` records the published snapshots
represented by that index. An empty scope table and absent FTS table indicate that no
Place search selection has been finalised in that database.

Places preparation records the exact official Address, Division and DivisionArea
dependencies before supplementary processing. Supplementary Address lookups use the
`supplementaryAddress` role, preserving the official `address` input when an interrupted
preparation resumes.

An explicit Address retirement remains effective when retrying the same observation
after its generated entry has been revoked. Replay requires the same Place, previous
Address and source release, with no conflicting active or canonical predecessor link.

## Localisation metadata

Locale values carry the shared [localisation metadata](../i18n-metadata.md) contract.
`meta.isLocaleInferred` records language assignment, while `meta.fields` records each
field's origin, optional human verification and optional translator identity. Metadata
participates in canonical content hashes and retained locale revisions.

## Canonical spatial and identifier fields

CURRENT and HISTORY Places store `geometry` as a GeoJSON Point with longitude before
latitude. Canonical `bbox` is `[west, south, east, north]`; SOURCE retains the publisher
bbox struct. Numeric coordinates are transient processing values for membership and H3.

`identifiers.wikidata.brandId` identifies the publisher's brand, rather than the
individual venue. A Place without a brand identifier has null `identifiers`.

`createdAt` and `updatedAt` describe serving materialisation. A changed point, category,
contact, address association or dependency may update a base row. Locale content and
retained search text update independently. Timestamp-only and observation-only changes
do not rewrite serving rows. Immutable history captures content versions with creation
time and its recorded observation month; current observation months derive from the
selected completed publication.

Places carry nullable `countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`,
`macrohoodId`, `neighbourhoodId`, `villageId`, `microhoodId`, `hamletId` and
`landformId`. SAR, city and island-group memberships do not enter Place relationships or
newly prepared Division search text. The shared Address resolver remains unchanged:
Places consume only its unambiguous `references`, including its most-specific landform.
Address-free Places resolve from the pinned polygons. Ambiguous peers remain null.

`divisionDefinitionSetId` selects an immutable content-addressed row in
`placeDivisionDefinitions`. Its definition maps only selected IDs to exact logical
Division revisions, levels and locale names. Each unchanged definition inherits its own
pointer; a set may therefore contain multiple revisions. Two Places with the same
selected definitions share one row. Equivalent releases preserve pointers and cause no
base, locale or FTS mutation. A selected name or level change affects only Places using
that definition. Canonical hashes include supported references and selected definition
content, excluding assembly revision IDs. A new base content version carries its shared
set into its HISTORY shard. Empty sets also have a content address.

CURRENT retains shared sets across serving-scope retirement. Rollback reads and checks
sets across retained HISTORY shards, delivers them before referencing bases, and uses
each locale version's original base definitions to validate its independent search text.
Older immutable evidence is preserved; public replay filters its recorded IDs through
exact historical Division classes, excluding SAR, city and island-group relationships.
`searchDependencyText` supplies both fresh and incremental FTS.

Scalar filters deduplicate matches before counts and pagination. Covering indexes use
`(scopeId, scalarId, id)`: all eleven measured filters otherwise read the whole scope. A
140,000-row synthetic query check reduced selective reads from about 14–16 ms to about
0.03 ms. Geographic codes resolve through supported descendants; `HKSAR` is the existing
region-wide selection. Direct Division-ID filters select supported memberships.

Migration validation uses isolated fresh databases. Populated database conversion,
backfill, reingestion and publication require separate operational authorisation.

## HISTORY ownership

Canonical events derive their producing release from their introducing snapshot's
primary inputs. Inherited events retain that original ownership. See
[HISTORY producer ownership](source-evidence.md#history-producer-ownership) for the
shared contract and dataset discriminators on combined geometry snapshots.
