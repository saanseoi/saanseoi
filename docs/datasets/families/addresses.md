# Addresses dataset family

Canonical identifiers use publisher → camelCase identifier type → unchanged value,
including `hkgov-dpo.csuId`, `hkgov-dpo.geoAddress` and `saanseoi.curationId`. The
Address and Division APIs share the identifier schema.

Source ledgers retain separate occurrences of recurring content under the
[shared source validity contract](source-evidence.md#recurring-source-validity-periods).

Processing runs, reusable rule mappings and counts-only curation evidence follow the
[shared processing contract](../pipeline.md#processing-stages-and-retained-evidence).

ALS Division membership accepts publisher Point geometries without coordinates and uses
the available district and bilingual locality evidence. Missing coordinates do not
prevent address preparation or create an inferred point.

Automatic ALS audit operations retain one declaration and aggregate count per operation.
Per-record publisher and canonical evidence is excluded from automatic audit entries;
curated identity decisions retain individual fixture references.

Canonical provenance follows the [source evidence contract](source-evidence.md).

Canonical Address2D and Address3D collection IDs use the `ss-` prefix. ALS premise
identities use deterministic UUIDv5 inputs; Places-derived supplementary addresses
retain their deterministic `opa-` hash inside that prefix. Collection IDs use a fixed
UUIDv5 namespace and the prefixed parent identity, so bare and prefixed forms of the
same parent produce the same collection ID. Source assertion IDs are independent
evidence keys.

ALS premise structure and Roman-numeral normalisation decisions belong to the release
processing audit. Canonical `sources` omit these processing flags and their unchanged
defaults.

Record-content hashes exclude observation timestamps and publisher version labels,
including nested attribution metadata. Effective dates, statistical periods and content
dependency hashes remain significant. Retained source payloads preserve the original
metadata. File checksums and processing-cache identities retain their complete inputs.

The [versioned geocoding contract](../../geocoding.md) returns canonical structured
addresses, explicit point-match distances, and optional division membership composed
through an exact shared division snapshot.

Address SQL preparation processes one chunk of at most 4,096 rows at a time through
normalisation, history and current generation. Intermediate JSON stays in memory for the
active chunk and is collected before the next window; generated SQL and sealed delivery
files remain durable. Combined Address2D/Address3D preparation uses the complete
publisher ledger as its sole source writer. The normaliser reads one Parquet window per
SQL chunk. Historical comparison loads exact address, version and locale keys in
parameter-bounded batches using the existing composite indexes. Preparation releases the
original parsed 2D feature containers after normalisation and publisher-evidence
capture, before constructing the combined 3D inventory.

Chronological ALS ingestion runs each source release in a fresh process to bound
retained preparation and replay memory. Each process completes publication and saves
identity history before the coordinator advances. A failed release stops the sequence;
completed releases remain available for continuation.

Snapshot replay groups parent withdrawals by dependent record type and clears inherited
locales and lookup rows in one pass per snapshot. Explicit events are then applied, so
restoring a parent does not revive its withdrawn components.

ALS prepared uploads retain publisher provenance in the nullable UTF-8 `publisherSource`
envelope. Schema validation permits adding this envelope only when every other field
retains its name, type and nullability. Native null and JSON null both denote an absent
envelope and create no publisher provenance; malformed non-null envelopes are rejected.

Address ingestion uses one acknowledged local mirror for every source and target. A
release is resolved and validated in an isolated local candidate, including Address2D,
Address3D, source validity and provenance. Remote D1 receives the sealed difference
between the acknowledged mirror and that candidate. Intermediate staging and resolution
queries remain local. Geographic prerequisite projections must already be present in the
mirror; the Address mutation plan does not restore missing Division rows or
translations. Search finalisation follows publication through its own workflow.

Current Address tables hold one serving projection per snapshot lineage. Their `scopeId`
key stores the stable scope ID; `addressPublicationState` maps that scope to its logical
snapshot and publication readiness. Before the first delivered current mutation, the
scope is claimed with a unique publication token and `publishing` status. Every current
batch verifies that token in the same transaction as its mutations. Delivery records
`preparedAt` after validating the complete Address2D and Address3D projection,
localisations, building-number lookups and references. Local validation compares exact
canonical IDs, parents, levels, inventory owners, sections and unit IDs with the
reviewed membership, and rejects addresses or unit translations with no display content.
Publication alone changes the matching prepared scope to `current`, including valid
empty snapshots. Unchanged addresses, translations and building-number lookups retain
their rows and timestamps. Changed content updates only its affected rows. Inline
canonical events supply historical API reads, including retired records and omitted
translations.

History components are compared independently. An Address2D component change does not
rewrite identical base, translation or building-number content in another component.
Unchanged components retain their original content hash and owning history shard.
Address3D inventory and locale payloads have independent version hashes; historical
locale reads follow their own events and shards. ALS snapshot events contain only actual
component changes and explicit retirements.

Supplementary Overture Address snapshots hash the canonical base, each locale and each
building-number lookup independently. The deterministic ID is generated from accepted
bilingual 2D values; its identity-generation inputs remain in Place curation, not
canonical `identifiers`. The record-level `address2d.sources` array contains the
Overture publisher, registered Places dataset and supporting Place record IDs and is
part of the canonical base version. It excludes match scores, candidate addresses,
curation decisions, fingerprints, selected ALS dependencies and localisation reasoning.
Curation entries and decisions are retained in the Place audit; upstream records are
retrieved through the Place source archives using the matching source edition. Places
retain their Address links. Address history stores canonical components without a
separate evidence payload or evidence index. Historical API replay keeps `sources` from
the canonical Address version. Parented revisions inherit repeated components from their
owning history shards, including across year boundaries. Each snapshot records every
shard needed for replay.

Supplementary snapshots are deliberately parentless to bound replay ancestry. Each root
stores its complete accepted base, locale and building-number components as inline
HISTORY events, including explicit withdrawals. Independent roots therefore cost full
component writes; parented revisions inherit unchanged components. Published events and
retained Place audits are immutable; changed accepted materialisation requires a release
revision.

ALS publisher assertions retain their SOURCE validity periods independently of canonical
Address history. A publisher omission can coexist with a curated canonical retention.
Publisher references remain in canonical `sources`; processing decisions remain in the
retained preparation and audit artefacts.

The API returns a readiness response while a selected scope is being updated. Complete
initial uploads prepare the retained history locally and deliver the final contents of
each D1 shard, including one current projection per scope. Incremental delivery sends
resolved inserts, updates and retirements. Batches respect statement bytes, bound
parameters, row size and affected-row budgets; a short SQL statement is not evidence of
bounded work. Checksums, remote receipts and local acknowledgement make the sealed
delivery resumable.

Omission from a complete source release retires that source assertion. Canonical
membership is resolved after curations and remaining eligible source evidence; a
provider omission is not permission to remove another source's address. The implemented
ALS adapter limits current retirements to its Address lineage; general arbitration
between overlapping providers is not implemented by the shared SQL planner. Reviewed
curations can retain a canonical address while preserving the publisher omission and the
evidence for the retention. Invalid or incomplete preparation cannot retire the last
accepted state.

All ALS forward-fill and retention fallbacks are omission-only. House, commercial
premise, estate-premise and inventory fallbacks use dated evidence only while the
corresponding publisher record is absent. A returning record bypasses the fallback, even
when its names, coordinates or identity components differ from retained evidence. Empty
unnamed aliases remain separate assertions and do not establish the presence of the
missing named premise. Present records retain their publisher identities and payloads;
normal validation still checks duplicates, ownership and conflicting inventories.
Explicit corrections and derived estate classifications are independent of omission
retention.

Deletion preflight compares the complete, prepared membership of consecutive releases
and emits JSON grouped by address level. Building and complex removals, whole inventory
loss and substantial deletion spikes require explicit review. Ordinary flat removals
remain visible in the report and can retire automatically. Missing owners, unresolved
parent references and inconsistent inventories fail validation independently of review.

Before presenting suspected building demolitions for review, search Google by building
name and address and attach the supporting sources. Record permanent closure separately
from confirmed demolition. Order browser review cases by approximately 1 km × 1 km
latitude/longitude cells so nearby premises appear together, preserving case numbers and
identity keys in exported decisions.

Current Address, Place and Street references identify stable storage scopes. Metadata,
normalised preparation artefacts and history retain the selected logical snapshots;
current writers resolve those selections through completed publication receipts. API
responses map physical references back to logical snapshot IDs.

All CLI families deliver final row differences through the shared compiler, with
family-specific membership and dependency validation under the
[publication-state contract](../publication-state-plan.md).

Published rollback reconstructs the exact predecessor from retained history and the
reviewed ALS membership sidecar, including Address3D inventories and building-number
lookups. A composed rollback restores Division and Street prerequisites before Address
and validates all current references before sealing. Retained source assertions and
history remain available; only the serving projection and publication selection change.

Forward comparison follows the selected predecessor's exact component events and owning
shards. Derived building-number lookup comparison follows the serving lookup content, so
retained versions from a revoked publication do not suppress new changes.

Historical Address API reads replay immutable history. Preparation requires the exact
selected dependency to have a completed local receipt; it rejects an advanced current
scope instead of silently using newer content. Automatic hydration of an older Address
parent into the preparation mirror is not implemented. Rebuild those dependencies in
chronological order.

[Minimal initialisation](../minimal-initialisation.md) selects the earliest two retained
ALS versions and keeps its completion manifest separate from full runs.

Every published Address API release calculates added, changed, removed and unchanged
records against the preceding compatible API release in its domain and region. Immutable
snapshot membership and content version hashes determine churn across all assigned
history shards, including each independently retained locale. Translation additions,
changes and removals count as address changes. Address2D supplies the overview totals;
Address3D has a separate table breakdown. The first release compares against an empty
baseline. `saanseoi stats:backfill-addresses --target local` rebuilds retained release
statistics, preparing all replacements before writing them. `--dry-run` calculates
without writing.

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
reused across releases without updating its release ID, timestamps or indexes. Changed
and removed assertions close their validity range. The complete publisher membership,
not the last-written release ID, determines omissions. Reappearance of a closed
assertion requires a write. Canonical inline events record the changes needed to
reconstruct each snapshot; SOURCE retains publisher validity independently.

ALS ingestion prepares each pending release and retains its unresolved cases locally.
Assembly and upload wait until those cases are resolved before advancing
chronologically. Delivery validates checksums and compares membership with the
acknowledged predecessor. Review evidence does not indicate that an upload has
completed.

ALS preparation and preflight fingerprints replay the selected division snapshot's
immutable history across its assigned shards. Parent membership, changed translations
and deletions determine the lookup, independently of current-snapshot cleanup.

Source-row `sourceLocator` is nullable. ALS retains the original file and feature
position when needed for acquisition traceability. It does not repeat dataset/release
metadata or manufacture references to canonical identifiers.

Address lookup caches are scoped to the exact parent snapshot. A baseline without a
parent never uses a retained lookup; cached unchanged-row decisions cannot substitute
for materialising its complete 2D address set.

ALS 3D preparation caches and emits `ALS_MANUAL_REVIEW` JSON log lines for unreviewed
section inventories, ambiguous block parents and shared-building owner conflicts. These
preserve source locations and candidate address IDs and block assembly until resolved.

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

The Tsui Lam promoted inventory selects its unique numbered owner by CSU, estate and
block number. Publisher building-name detail such as `PIK LAM HOUSE (BLK 1)` remains
unchanged and does not prevent inventory attachment; missing or ambiguous owners stop
preparation.

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
`saanseoi init:addresses --skip-curation-checks` accept pending address curation checks.
The upfront chronological preflight still runs when releases remain to ingest; deletion
review, source validation and integrity checks remain required. These commands propagate
the curation-check setting to ALS ingestion. Existing corrections retain unverified
provenance where applicable; unresolved identity changes receive generated IDs.
Automatic acceptance does not write reviewed decisions to curation fixtures. Shared ALS
3D buildings may retain separate owners and inventories in this mode without a reviewed
ownership merge. Block enrichment and duplicate suppression are omitted in this mode;
inventories use exact parents or unique block-free matches, retaining publisher 2D
components. Section inventories may retain their existing parent without reviewed
ownership. Alias curations whose source guards no longer match are omitted in skip mode;
both publisher records retain their identities, geometry and source assertions.
Coordinate backfills with missing, ambiguous or changed source targets are omitted in
skip mode, leaving publisher geometry unchanged.

ALS coordinate-backfill estate guards use retained publisher names when supplied,
independently of curated display names. Exact source-point and release bounds remain
required, and replaced geometry is retained in curation provenance.

Address ingestion records the effective assembly recipe, selected source releases and
lookup dependencies under the
[assembly provenance contract](../pipeline.md#snapshot-assembly-provenance). Draft
enrichment refreshes the assembly; SQL replay includes recipes, inputs, assemblies and
dependencies. `snapshotDependencies` records the exact logical Division lookup with the
`division` role. Dependent Places preparation uses that revision when replaying
historical Address definitions, including independently versioned locales; a newer
current Division selection cannot replace the recorded lookup.

Processing uses retained `processing-audit` manifests in R2. Bulk preparation and
normalisation retain registered declarations and counts; reviewed ALS fixtures and
individual identity decisions retain their selected evidence. Preparation seals these
inputs to the Parquet digest in an `.audit.json` sidecar. Publication requires
registered provenance, and delivery retries transfer the completed retained graph. See
the [processing provenance contract](../processing-provenance.md).

Local and remote Address ingestion use one `sql-delivery-address` plan for Address2D,
Address3D and publisher assertions. The isolated candidate resolves identities,
versions, omissions and snapshot relationships before the compiler seals their final
keyed mutations. Source retirement scans and staging writes remain local; only changed,
new, reopened and omitted source assertions produce remote mutations.

Each database retains its statement order, and each current Address3D collection stays
within one bounded transaction. Statements and batches respect the resolved compiler's
parameter, SQL-byte, row-size and payload limits. Oversized rows or atomic collections
fail preparation before delivery starts.

The sealed [delivery plan and receipts](../sql-delivery.md) preserve the generation
message, bound values, prepared timestamps and separate remote/local checkpoints.
Recovery reconciles receipts before advancing and reuses the original payloads.
Publication follows successful delivery of the complete Address result.

Address3D owner and unresolved-section validation streams bounded lookups against the
selected Address2D snapshot before any Address3D writes. Each query reserves one bound
parameter for the snapshot and checks up to 99 references. Every owner must exist once;
each section must retain exactly one match to its reviewed parent.

The default Address API domain is `saanseoi`, SaanSeoi's curated Hong Kong address
collection. It requires the authoritative ALS `address/hkgov-dpo` member and, once the
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

### Latest-release search index

Search supports only the latest published Address release for each region. Explicit
selectors resolving to an older release return `400 historical_search_unavailable`.
Historical list and detail requests remain available.

`addressSearchScopes` maps each region/domain/lineage scope to its selected snapshot.
`addressSearchFts` holds one document per scope, Address ID and locale. Snapshot
promotion updates the small scope mapping; unchanged search text keeps its existing FTS
row. Synchronisation inserts new documents, replaces changed documents and deletes
documents absent from the final selection. Retained historical snapshots are excluded.

Dataset SQL delivery does not build the search index. Standalone publication refreshes
it after publication; deferred upload sequences refresh it once after successful
release-set reconciliation. A failed sequence does not refresh search. Re-running
reconciliation retries finalisation even when no draft release remains.

FTS changes and scope promotion run in one D1 transaction. A failure rolls back the
index update. Because catalogue publication is in a separate database, search can return
`503` between catalogue publication and successful index finalisation. Run
`release-sets:reconcile` again to finish an interrupted finalisation.

The current-database migration must precede deployment of the search reader and
finaliser. Canonical content resolves through `addressPublicationState`, and the search
selection retains logical snapshot IDs. Identical finalisations write no search
documents. Both canonical and search storage reuse unchanged rows across releases.

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
the JSON:API `included` array. It can be combined with `include=divisions`; unit
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
uses one curated identity across its temporary publisher CSU change; this does not
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

The reviewed 21 August 2024 omission cohort retains 15 buildings and five complexes
under `hkgov-dpo-address-august-deletion-retentions.json`. Decisions preserve the
acknowledged July canonical IDs from 21 August onwards and restore missing premises from
dated publisher evidence. Terra keeps its bilingual building name. James’ Garden and The
Nascent retain their reviewed transitional-housing premises. Fu Tip Estate and Lingnan
University keep complexes distinct from their buildings; the Lingnan campus is a
complex. Returning publisher assertions must match the reviewed per-release hashes; new
evidence or ambiguous matches require review. Retained premises carry curation
provenance without inventing publisher rows or approving deletion reports.

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

The October 2024 deletion triage is recorded in
[`hkgov-dpo-address-october-deletion-retentions.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json).
It records the user's 54 retained identities and one approved retirement from the
55-entry review. The rules apply from `2024-10-18.0`; complete publisher CSU groups and
selected premise hashes guard every inspected delivery through `2026-08-19.0`. Changed
or uninspected publisher evidence stops processing.

Exact bilingual labels, address numbers, source points and structured components support
continuity, name omissions and renames. FTLIFE Tower becomes CTF LIFE Tower; SML Tower
becomes Upper Living. Hoi Pa Building at number 8 and Texwood Plaza at number 6 retain
their identities independently of other frontage numbers. Parent complexes and phases
remain distinct from Crestmont Block 9, Bella Vista blocks, Wellness Lodge Substation,
Hilltop Villa Block A, 2Gether South Wing and the 14 source-backed towers of The Reach.
Source IDs that move between these levels do not transfer a building identity to its
parent.

The three Cameron Lodge houses, Kowloon International Baptist Church, Wo Hop Shek House
B, Personage Hotel and 2Gether North Wing are retained with their genuine predecessor
evidence. North Wing and South Wing have separate building identities beneath the
retained 2Gether complex; a sub-premise never takes the complex identity. Personage
Hotel remains distinct from the already coexisting unnamed Cumberland Road address. The
user approved retirement of entry 28, Ngong Wan Road temporary substation; the approval
requires its exact predecessor membership and does not retire the nearby unnamed address
at number 129. A suffix match from number 5 to number 15 is invalid.

ALS preparation and isolated-review caches fingerprint Bun's emitted JavaScript for
TypeScript code. Erased type declarations and test edits do not invalidate prepared
artefacts. Executable changes, runtime version, source files, processing metadata,
selected division lookups and every output digest remain part of the cache contract.
Invalid TypeScript stops fingerprinting; changed runtime inputs during preparation still
prevent sealing the checkpoint. A consistency failure identifies the changed dependency
group so that source, processing, code and division-lookup changes can be investigated
without weakening the seal. Preparation constructs Parquet columns in groups of 5,000
premises and retains 3D backfill inventories only for the applicable building IDs. Local
release-set reconciliation retries Harbour `control_unavailable` responses with a
bounded delay; other structured failures stop ingestion.

The November 2024 ALS triage is recorded in
[`hkgov-dpo-address-november-deletion-retentions.json`](../../../../fixtures/meta/curations/hkgov-dpo-address-november-deletion-retentions.json).
It contains 59 user-reviewed retentions from the 62-entry deletion review and one
supporting rule for the existing Chinese Recreation Club complex. Complete CSU groups
and selected premise hashes guard all inspected deliveries through `2026-08-19.0`. The
fixture records reasons and confidence alongside the user decision authority.

Fu Tip Estate houses retain their IDs when Chung Nga Road is corrected to Choi Tip
Street. Regency Centre becomes Metro South; St James Concourse becomes 1 Cheong San;
Kerry Warehouse becomes China Resources Logistics Fanling Warehouse. Palm Springs houses
retain their estate, phase and house qualifiers when the publisher moves their numbers
into village fields; the village number is cleared from curated structure to avoid
repeating the house number. Raw publisher JSON remains unchanged.

Wong Teck Building and Wai Tak Building retain genuinely recorded frontage addresses
independently of surviving frontages. Bella Vista Block 12A remains a building beneath
the reviewed complex; its broadened parent assertion joins that complex's existing
publisher variants. Chinese Recreation Club's named building remains distinct from its
complex and the already coexisting unnamed address. The Chinese Women's Club College
complex retains its identity across a replacement CSU and point correction.

The user retains Bamboo Vista, Gun Club Hill Barracks Block K2, Wo Hop Shek number 331
Block B and Loong Fung Terrace despite publisher withdrawal. Their identities and
specific premises remain separate from neighbouring or broader assertions. Entry 39
keeps its building name. Only entries 24, 38 and 41 retire: Yip Fat Factory Building,
Rose Court at Rose Street and Good Year Industrial Building, which the user confirms
were demolished. Retirement approvals require exact predecessor membership evidence.

The February 2025 ALS review uses `hkgov-dpo-address-february-deletion-retentions.json`.
Exact bilingual premise and frontage assertions retain their canonical identity.
Withdrawn building qualifiers, names and frontages remain separate from broadened
complex or phase assertions; qualified successors remain separate from retained parents.
Village numbers and phase assertions participate in premise selection, so a shared
publisher group cannot collapse independently recorded addresses. Complete
publisher-group hashes bound every inference to the inspected deliveries through
August 2026. Unsupported withdrawals remain behind the deletion-review gate.

Beaulieu Peninsula retains its broad parent above 40 separately identified houses, and
Celestial Heights retains its parent above 34 constituent buildings. Cho Yiu Centre
preserves blocks A and B independently of its Lim Cho Street parent and King Cho Road
frontage. St. Mark's School retains its identity when its bilingual name moves from
estate to building fields and Oi Tung Estate is added as context. The complete
constituent source groups are included in the evidence guards.

The user review covers all 387 February entries: 374 retain/reconcile decisions and 13
exact predecessor retirements. House C PT and ZONE S H.A.N.D.S are distinct sections
beneath House C and Oi Yung House. La Serene, the St. Luke's pastoral centre, Lai Chi
Kok Bay Garden and Tui Min Hoi Chuen retain their constituent buildings. Diocesan Boys'
School retains its campus and named components. Broad Fontana Gardens, Tai Po Plaza,
Stanley Plaza, Tai Tong Holiday Camp, Choi Kai Yau School and Conway Mansion assertions
are deduplicated without collapsing qualified buildings or separate frontages. Wings at
Sea towers, Coral Villa and Yuen Long Building remain retained. Human authority and the
earlier automatic confidence are recorded separately; browser reviews display confidence
alongside automatic matches.

Hin Fat House retains its reviewed owner identity, bilingual estate membership and
872-unit inventory when the raw named publisher assertion appears in February. The
predecessor unit identities must survive; matching counts alone do not prove inventory
continuity.

The January 2025 ALS review is recorded in
`fixtures/meta/curations/hkgov-dpo-address-january-deletion-retentions.json`. Thirty
supported reconciliations retain named buildings, independent Siu King frontages, and
constituent buildings beneath broadened complexes. Alberose retains its 132, 132A, 132B,
134 and 136 frontages independently of the 132–136 complex. YOHO West retains its broad
address assertions separately from newly qualified towers. Harbour East retains its
identity through the Hong Kong Li-Ning Building rename; the January named replacement
and unnamed predecessor assertions are consolidated. Complete publisher groups and each
selected assertion are guarded across the inspected releases through August 2026.
Changed or uninspected source evidence fails closed.

The reviewed demolition of Pine Court & Pine Grove at 23 Sha Wan Drive also applies to
their separately recorded named complexes, with exact predecessor guards in
`fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json`. Ten reviewed
entries are approved to retire. The Convenience Foods building assertion at 7 Dai Fu
Street retires while its independently recorded unnamed street address remains. The
retained Silicon Hill Greenwood Towers 1, 2, 5 and 6 preserve their individual
identities and the supplied names and coordinates, including coincident points for
Towers 1, 5 and 6. Gee Luen Hing keeps both street frontages; the Silverstrand podium,
Black Point Power Station and Tam Gardens remain distinct premises. The original January
review has no undecided entries.

The December 2024 ALS review is recorded in
`fixtures/meta/curations/hkgov-dpo-address-december-deletion-retentions.json`. Seventeen
retained identities and the existing recreation-ground complex have complete CSU and
premise-assertion guards through `2026-08-19.0`. W Mega's 250–254 and 252 frontages
remain separate; Capitol Centre's 5–17 frontage remains distinct from its coexisting
5–19 frontage. Wo Hop Shek columbarium Blocks A and B keep their identities when their
street numbers are exchanged. Linda Vista and Kai Fat House retain their withdrawn
names. Seasons Monarch Houses 71 and 72 retain their house, estate and Kam Tin Road
components when the publisher moves the houses into village fields; raw JSON stays
unchanged. The Fu Tung market remains distinct from its plaza and estate. The university
complex assertions at 8 and 8–12 Wai Tsui Crescent remain independent, with the
residential building beneath the number 8 complex.

Fu Tip Block 7 and Hin Tip House have the same publisher CSU and matching 465-flat
inventories. The existing named-house identity and its existing unit IDs are canonical.
The withdrawn duplicate building ID is recorded as an alias, with the complete unit-ID
correspondence retained in source provenance. A duplicate inventory is reconciled only
when an explicit owner alias exists, both predecessor inventories match completely, and
all canonical unit IDs and bilingual floor/flat labels remain unchanged in the current
inventory. Partial matches, duplicate tokens, missing predecessor inventories and
regenerated canonical unit IDs still require deletion review. The report records each
unit alias replacement separately from physical retirement.

The reviewed Department of Health Institute of Immunology at 800 Victoria Road retains
its named building identity separately from the coexisting unnamed address. Pine Court &
Pine Grove at 23 Sha Wan Drive and Wang Cheong Factory Estate at 781 Lai Chi Kok Road
are approved demolished premises. Their exact predecessor records are guarded in
`fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json`.

The reviewed September 2024 ALS cohort keeps Wing Fai's street-number entrances as
`section` children of its building owner. The reviewed Wong's Building and New Lucky
House shop addresses are `unit` children, with independent building parents. Wong's
building address spans the reviewed 84–90 Tam Kung Road range. These relationships are
explicit curation decisions; numeric overlap alone does not establish containment, and
the source street numbers do not imply a shop-number or floor inventory.

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

So Uk's Camellia House uses one curated identity and retains its 374-flat inventory
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
`libs/core/src/pipeline/services/addresses/granularity.ts` against the corrected
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
`properties`.

## Source record response

The [source record contract](../source-records.md) exposes publisher attributes in
`properties`, including publisher-authored attribution. Records expose source identity
and optional native geometry. Resource types, variants and internal acquisition locators
are not publisher-record fields. Geometry retains the source coordinates and CRS;
canonical geometry is available through the family’s canonical API.

ALS Address2D source field mappings include nested estate phases and street location
names. Address3D source properties contain only `address3dEn` and `address3dZhHant`;
their flat rows use `floorNum`, `floorDescription`, `unitNo` and `unitDescriptor`. The
array key supplies the locale, while the matching Address2D source record retains the
shared premises fields. Source schemas report fields present in every retained row as
required; optional presence and explicit nullability are separate properties.

## Local D1 with production artefacts

For a fresh local initialisation, `--target local --r2 production` keeps processing and
registrations in local D1 while retaining source and provenance objects in production
R2. See the
[storage-target workflow](../d1-bootstrap.md#ingest-locally-with-production-r2) for
immutable uploads and continuation requirements.

Official-address initialisation stores the identity-history before-image in a separate
file beside its manifest. Keep both files for reset recovery. Completion queries release
metadata and distinct current division snapshot IDs; it does not export source or
history shards. A missing before-image blocks reset before mutations.

A successful full local database reset clears full and minimal family completion
manifests. Failed resets and focused family resets retain their ownership state. The
full reset also clears the generated ALS identity-history ledger so chronological
ingestion starts from the earliest source cohort. Authored identity decisions remain in
their fixtures.

Audit registration verifies evidence partitions individually and derives bounded search
text without concatenating the complete ALS preparation evidence. Large non-tabular
fixture catalogues retain bounded search text; their complete evidence remains in the
immutable audit objects.

## Registry metadata

ALS dataset processing metadata resolves the registered preparation, normalisation and
curation rules. Each source and resource release retains its creation-time policy; ALS
source GeoJSON geometry uses EPSG:4326.

## Field provenance

The v1 Address field mapping declares exact source signatures for ALS with Overture
Divisions, ALS with supplementary Places, and the combined curated Division lookup. All
use the retained ALS lineage anchor. Places address contributions retain the
`addresses[]` publisher path and the `resolve-place-addresses` rule, including direct
Division relationships. Publication selects only fields contributed by sources in the
chosen signature and checks their bounded publisher schema ranges.

ALS publisher leaf paths are paired with retained camelCase keys. Address identity,
geometry, components, granularity and parent relationships include preparation and
reviewed curation inputs. Supplementary Place addresses reference the captured
`resolve-place-addresses` rule and the retained address decisions. The supplementary
snapshot's exact Place release anchor participates in field-rule pinning alongside the
derived Address release, so the immutable normalisation and resolution definitions that
generated those rows remain available during deferred release-set publication.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

Retained locale-bearing labels use `En`, `ZhHant` and `ZhHans` suffixes, for example
`buildingNameEn` and `dcZhHant`. Publisher mappings place these labels after other
properties. Original publisher paths and language dictionary identifiers retain their
spelling; demographic measures about language are not locale-bearing labels.

Ho Sin Hang Building (何善衡樓), Lingnan University, has omission-only 2D retention from
25 July 2024 until revoked. Its reviewed named building and point are restored only when
absent; returning named publisher premises bypass the fallback. The unnamed CAMPUS
assertion sharing its CSU remains separate. No unit inventory is inferred.

The reviewed unnamed CAMPUS assertion is the Lingnan University (嶺南大學) complex. Its
canonical address omits the CAMPUS block label while retaining the raw bilingual source
assertion and publisher point. Ho Sin Hang Building remains a separate building even
where the two assertions share a CSU.

Dash Living on Prat (一尚酒店香港尖沙咀店), 21–23 Prat Avenue, uses its reviewed 2023
rename throughout retained ALS releases. The two named publisher CSUs share one
canonical hotel identity; the unnamed street address remains separate. Raw Butterfly on
Prat and Dash Living on Prat assertions remain in provenance. This is an explicit name
correction, not an omission-only retention.

China Resources Logistics East Asia Industrial Building (華潤物流東亞工業大廈), 2 Ho Tin
Street, uses the reviewed name across the 30 retained releases. Its original canonical
building ID is retained. Release-specific hashes guard the bilingual publisher assertion
and geometry; raw East Asia names and publisher coordinates remain in provenance. This
approved rename does not authorise retirement or imply omission retention.

The reviewed Redhill Peninsula House 20 identity has house/block number 20 and building
street address 20 Palm Drive (棕櫚徑20號). Its parent complex is The Redhill Peninsula
(紅山半島), at 18 Pak Pat Shan Road. These are separate address fields and levels; this
explicit mapping does not equate house numbers with street numbers generally. Raw
release addresses and house coordinates are preserved. The derived complex uses the
dated estate-address assertion point and does not inherit the house CSU.

The approved Redhill mapping includes Palm Drive houses 10, 14, 18, 20 and 22, and Cedar
Drive houses 80, 86, 92, 94, 96, 102, 106, 108, 112, 126, 128, 148, 152 and 176. Each
mapping has independent dated ALS evidence.

The retained `redhill-peninsula-centaline-evidence.json` records the four Centaline
building tables with source URLs and response hashes: Site A (Phase IV) has 10 towers
and 248 units; B has 58 houses, C has 42, and D has 146. The totals are 256 buildings
and 494 residential units. Building labels, occupation-permit years, publisher
coordinates, floor-plan links and dated sale/rent counts remain supplementary source
evidence. These counts do not supply individual flat identities, and coordinate
candidates require review before canonical matching.

The two House 24 addresses are distinct: ALS CSU `4151310224T20050430` identifies 24
Palm Drive and retains its publisher coordinates. The reviewed Centaline point
`[114.226669, 22.230345]` identifies 24 Cedar Drive; it is not a replacement point for
the Palm Drive ALS record. The supplementary evidence records this explicit separation
and the approved Cedar Drive point.

Bay View Villa at 39 South Bay Road is reviewed as redeveloped. Houses 1, 2, 3 and 8 may
retire on publisher omissions within the retained release range. The scoped retirement
fixture matches the exact prior address evidence and permits no descendant loss. Reports
retain these four removals as reviewed; unrelated retirements, changed evidence and
deletion spikes still require review.

Ban Tip House at 11 Chung Nga Road retains one reviewed canonical identity across the 30
retained releases. Its BLK 1 / 座1 component is backfilled only in the four releases
that omit it; publisher-present block detail is preserved. Exact release hashes guard
the source assertion and geometry. Raw bilingual names and coordinates are preserved.
This component completion is separate from the approved omission-only house retention.

Golden Wheel Plaza (金輪天地), 68 Electric Road, retains the named complex identity when
its three reviewed bilingual estate-name omissions are restored. The identity decision
is scoped to those restorations and preserves the raw unnamed source assertions.

The reviewed redevelopment retirements cover Kam Cheung Building at 470 Hennessy Road,
Kam Fai Commercial Building, the three Kam Po Building addresses, and the 13 Ta Lung
House entries: 18 exact canonical records. Approval is scoped to their retained
membership evidence; unrelated removals and dependent inventories remain gated.

Kawada Plaza II (川田工貿廣場2期), 5 Lok Yip Road, retains its building identity across
the 30 retained releases. Its reviewed building representation overrides the On Lok
Tsuen complex assertion while preserving raw bilingual source evidence and coordinates.

Shun Ting Terraced Home uses the canonical bilingual identity Transitional Housing -
Shun Ting Terraced Home (過渡性房屋 - 順庭居) across retained releases. The name
backfill preserves the unnamed ALS payloads and their source coordinates. Tai Hang Fire
Dragon Heritage Centre (大坑火龍文化館) similarly retains its earlier building name.

Ta Lung House is covered by the reviewed redevelopment retirements. Union Square is
forward-filled as a complex when its estate component is omitted; its component is not
treated as a phase. Bougainvilea Gardens is represented as the estate
`BOUGAINVILEA GARDENS` with numbered blocks 1–4, including the reviewed Block 2
component, without adding a building name. Raw ALS names and coordinates remain in
source provenance.

The reviewed premise-retention fixture preserves the baseline El Futuro tower and house
IDs and bilingual names. Its 22 houses use individually matched Centaline points from
<https://hk.centanet.com/estate/en/El-Futuro/2-DBAPWPPEPA>, retrieved on 12 September
2026; the fixture retains Centaline building codes, coordinates and floor-plan links.
Existing ALS house records are patched without duplicating buildings. Tower names
`TOWER 1` / `第１座` and `TOWER 2` / `第２座` remain available when ALS supplies only
numbered block components. Raw ALS premises and geometry remain source evidence.

One Soho and The Harmonie retain their reviewed building names on existing unnamed
address records. Kai Chuen Court backfills Kai Chi, Kai Tao and Kai Wu from their first
retained evidence on 3 September 2024 to the July baseline, alongside the existing Kai
Wang and Kai Chun retention decisions. These address-only reconstructions do not create
historical flat inventories.

Tin Wang Court retains a complex and three separate building children from the baseline:
Wang King House / 宏景閣 (A) at `[114.187272, 22.344419]`, Wang Yuen House / 宏遠閣 (B)
at `[114.186855, 22.344509]`, and Wang Mei House / 宏美閣 (C) at
`[114.186602, 22.344148]`. Named Wang Yuen and unnamed complex assertions are
distinguished even when ALS reuses the complex CSU for the house. The complex is
restored on omission; church and car-park records remain independent premises.

Victoria Garden uses blocks A and B throughout, including releases with I/II source
labels. Releases named Victoria Coast keep that publisher estate name and the same
reviewed building identities; this decision does not override estate names.

These premise rules are active until revoked. Historical release assertions guard the
full bilingual premise and point, including expected presence or omission. Future
applications accept only recognised source evidence and are labelled unverified; changed
assertions fail for review. Revocation stops future application while retaining
scheduled historical repairs. Restoration is scoped to the input district, and retained
source evidence is not represented as a current publisher assertion.

Hankow Apartments is reviewed as redeveloped. Retirement approval covers the five
baseline addresses and the later 45 Hankow Road identity, bounded to retained releases
and matched against exact membership evidence. It permits no descendant inventory loss.

The reviewed continuity decisions preserve the original ID for 28 Kwai Wing Road while
removing the obsolete cooked-food-market name, and for Lingnan University's renamed
Wofoo Joseph Lee Student Activity Centre (和富李宗德學生活動中心). Union Square remains
a complex with its reviewed ID, separate from the car-park assertion sharing its CSU.
Kai Wang and Kai Chun carry blocks 1 and 2. El Futuro uses the newer Chinese tower
labels座1 and 座2. These explicit component decisions preserve raw publisher evidence.
Ming Yiu Villa, the three Nam Tak Mansion addresses and Sheng Kung Hiu Kindergarten have
exact-record retirement approval. Hankow Apartments has redevelopment approval.

Proposed identity policy: assign a persistent ID using source reference, structured
route and number, and distinct block, phase or unit components. Use the building name
only when it is required to separate otherwise indistinguishable premises across
retained history. Once assigned, preserve the ID through name omissions, renames and
classification changes. A release-local uniqueness check alone is insufficient: an
omitted neighbour must not change the surviving record's identity. This general policy
remains a proposal; reviewed continuity rules currently resolve the approved cases.

University Hill retains its ten reviewed Marina and Scenic towers on omissions from 31
July 2024 until revoked. Returning publisher towers bypass replay, including separate
section-name and tower-number fields and changed CSUs. Marina Towers 1 and 2 remain
distinct even when they share a CSU. Exact release evidence guards each tower; returned
source attributes and coordinates are preserved. Centaline Phases 2A and 2B corroborate
the inventory, without replacing the publisher points. No earlier existence is inferred.

### Local review before assembly

ALS preparation retains unresolved identity drift, curation verification, division
linkage and 3D inventory cases in `{preparedFile}.review.json`. The preparation seal
binds this cache to the exact Parquet and 3D sidecar checksums. Ingestion rejects a
missing, changed or mismatched cache and stops before assembly when any issue remains.
Resolve the underlying evidence or curation decisions and prepare the release again;
editing or deleting the issue list does not establish readiness. `--yes` and
`--skip-curation-checks` cannot bypass this gate.

ALS prepares and ingests releases chronologically. Local deletion reports compare the
prepared membership with the acknowledged predecessor and block assembly until every
required report has its exact digest approval. Stale approvals do not authorise changed
membership. `.local/hkgov-dpo/review-backlog/` links the per-release review evidence;
review state does not belong to META. File-integrity, parent-reference and ID-collision
checks also apply.

Historical Address releases retain their exact published Division selection in
provenance and history. Current Address foreign keys use that Division lineage's
persistent scope, validated against its complete publication receipt. A newer Division
projection does not invalidate the older selection; missing receipts and lineage
mismatches remain ingestion errors.

Address metadata replay writes release statistics using `category`, `measure`, `unit`,
`dimension`, and `dimensionValue`, while retaining processing statistics owned by their
separate stage.

Building-number history compares the retained versions for each exact address and number
before selecting matching baseline content. Multiple lookups can reuse the same prepared
query safely within one release.

Address3D validation compares canonical unit IDs and localisation keys as sets. Counts
and content checks remain mandatory; a missing key fails validation even when an
unrelated extra translation keeps the total count unchanged.

Retirement dependency planning scans baseline parents before indexed deletion lookups.
Surviving children and deferred descendant deletions retain their dependency ordering
without repeating a full parent-table scan for each retirement.

Historical Address replay selects each event by record ID, introducing snapshot and
content hash, plus locale for translated rows. Bounded queries use the existing
composite identity indexes and remain within D1 parameter limits. SQL planning uses the
configured `TMPDIR`; full local history copies require sufficient temporary disk space.

Retirement preparation batches historical row updates and locale tombstones in
transactions on isolated candidate shards. A failed preparation discards those copies
before any delivery is emitted.

Combined publisher-ledger reconciliation runs inside transactions on disposable source,
history and current candidates. Per-record batches use nested savepoints; failed
preparation rolls back open transactions and emits no delivery.

Preparation-cache code fingerprints exclude test files; runtime code and all source,
curation and division dependencies still invalidate reuse when their contents change.
Metadata fingerprints cover curations, processing rules, ruleset versions, snapshot
processing policies, division codes and patches. Dataset input lists and catalogue
documents do not invalidate ALS preparation. Published division lookup contents and
snapshot references are checked independently.

## Division membership

ALS preparation selects the latest published SaanSeoi geographic Division edition and
the latest published DivisionArea snapshot with the same variant and cohort. Where no
curated edition is published, it uses the requested Overture cohort and its published
DivisionArea snapshot. Both immutable snapshot IDs are retained as release lookup
dependencies, including empty releases.

After all coordinate and locality corrections, a shared spatial index matches each
Address point to available district, town, macrohood, neighbourhood, village, microhood,
hamlet and individual-island polygons. Holes and MultiPolygons retain their exact
geometry. Shared boundaries or overlapping peers with more than one candidate leave the
corresponding scalar relationship unset. Common canonical ancestors supply
administrative references; island landforms remain separate from numbered levels.

Exact English and Traditional Chinese structured locality names supplement towns,
villages and hamlets without polygons. Matching normalises Unicode, case and whitespace,
requires district ancestry and rejects duplicate names, conflicting recognised names and
incompatible ancestry. Building names, street-name substrings and formatted-address
substrings do not establish membership. Missing polygons are unknown coverage, not an
exclusion. Name or Address evidence cannot override an available polygon that excludes
the point.

The canonical Address columns retain the resolved references in current and history
storage. Preparation provenance records geometry, text and ancestry evidence alongside
both snapshot IDs, separately from the untouched publisher payload. Supplementary
Addresses inherit recorded references from their selected official base.

`filter[division]` matches recorded country, area, district, town, hood, village, hamlet
or landform IDs in list and search requests, including historical reads. The `landform`
relationship remains the explicit individual-island association. Filtering reads
materialised membership; it does not run geometry tests per API request.

CURRENT division filtering unions indexed lookups across the dedicated role columns.
Partial `(roleId, scopeId, id)` indexes omit null memberships. Matching several roles
counts an Address once within its physical scope; identical IDs in separate selected
scopes remain separate records. List pagination applies after this deduplication, with
the physical scope breaking equal-ID ordering ties. HISTORY retains the recorded IDs
without role lookup indexes.

## Composition member roles

The `saanseoi` Address domain uses `address/hkgov-dpo` as its `primary` member and
`address/overture-places` as its `supplementary` member. Both contribute Address records
to the collection. `division/overture` has role `lookup` and supplies geographic
relationships. Variants identify the materialised collection; the domain identifies the
combined API collection.

## Processing policy ownership

ALS publisher occurrences are retained by ingestion rules before reconstruction,
deduplication or curation. Address snapshot recipes select preparation, curation and
canonical normalisation. Supplementary Overture Address recipes also retain Place
normalisation and reviewed address analysis, with exact policy and curation evidence.

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

The March 2025 review records 15 high-confidence reconciliations in
`hkgov-dpo-address-march-deletion-retentions.json`, with complete publisher-group guards
through August 2026. Sing Yick Building keeps its 75, 77 and 75–77 frontages. Named
sports, park and court premises remain distinct from surviving unnamed street
assertions. Ka Yu/Ka Yue and Ap Lei Chau Municipal Services Building retain their
identities through spelling and abbreviation corrections. Capital Tower retains its
broad site identity as a complex, with Towers A and B independently beneath it. Lok Wah
Catholic Primary School and Lok Man Sun Chuen retain their campus/complex identities.
Human review confirms 17 retentions and two demolitions. Pao Yue Kong Swimming Pool
retains its named premise; A Hotel retains its building identity as Epoch Hotel. KK
Hotel and Le Hoteru Hotel retire as demolished premises, with replacement buildings
remaining distinct. The fixture preserves the original automatic confidence alongside
human-reviewed decisions; browser reviews show confidence and matching evidence.

The April 2025 review automatically reconciles Tai Fai House and Sing Fai House when the
publisher adds their Block 2 and Block 1 qualifiers, preserving all 952 unit IDs.
Reviewed retention rules preserve Chung Yuet Lau beneath Jat Min Chuen, Cheung Ching
Community Hall, Amber Place, and the Yu Nga Court complex separately from Nga Shing
House. Fu Shan Public Mortuary retains its identity as FPS Storage Facility; the former
Cognitio College retains its identity through the recorded change of use. Exact
publisher assertions across the retained deliveries guard these decisions. New source
evidence requires verification before the rules can apply.

The reviewed Seaside Sonata entries retain four distinct towers—1, 2, 3 and 5—with
201–218 Hai Tan Street as their shared address. Tower 4 is intentionally absent; the
development has four towers, not five, as listed in the
[project sales information](https://hk.centanet.com/info/en/new-property/Cheung-Sha-Wan/Seaside-Sonata/1696).
Shiu King Building retains its 177–181 Ngau Tau Kok Road, 2–8 On Wah Street and 10 Chun
Wah Road building addresses. Its 6 On Wah Street shop address is represented as a unit
child of the 2–8 On Wah Street building record. Identity aliases link distinct
predecessor IDs to the retained shop ID; an identity already equal to that ID does not
create an alias edge.

The ALS preparation checkpoint rejects changed dependency keys from its bounded header
before loading the large result. Matching checkpoints still require the complete result
hash and sealed-file checks. It writes and hashes result entries incrementally. It keeps
the sealed-file and dependency checks while avoiding duplicate complete JSON strings for
the large preparation result. Interrupted writes cannot establish cache reuse.

The 22 May 2025 review retains 18 identities under
`hkgov-dpo-address-may-deletion-retentions.json`. THE STEP blocks remain individually
retained until revoked. Lok Yuen House premises are buildings; renamed commercial
premises preserve identity continuity. THE HEDON uses 11–15 Matheson Street. The
reviewed Wong’s Factory Building record has an explicit retirement approval based on
closure evidence, without asserting a demolition date.

Hin Fat House uses one reviewed owner through the publisher’s estate-qualified named
record. The approved 872-unit inventory is retained on a 3D omission even when its
publisher 2D building remains present. A returning 3D assertion takes precedence over
the fallback; all reviewed unit identities remain subject to validation.

Returning Yip Wong house records preserve the reviewed physical owner identities and
unit IDs. The approved June Ching Sum backfill keeps its predecessor owner and 949 units
while retaining the publisher’s Block 2 components. Source hashes guard that continuity
decision across the inspected deliveries.

June 2025 confidence-based continuity preserves 11 predecessor premise IDs for clear
renames, spelling corrections, equivalent addresses and publisher record replacements.
The June confidence fixture records the selected successor, confidence reason, available
linked evidence and exact publisher payload hashes. Separate street frontages retain
separate identities. Ambiguous hierarchy changes and new retirements remain subject to
manual review; closure alone is not proof of demolition.

June review decisions reuse active curations before requesting another decision. Wong
Teck Building retains its separate frontages under the established frontage policy.
Ching Tin Estate and Tung Tau (II) Estate Refuse Collection Point keep their existing
curated identities; approved duplicate predecessor identities become guarded aliases.
The selected Block 7B typo corrections use the same alias mechanism, preserving both
street frontages. The June review fixture records eight user decisions and four
applications of prior authority, with publisher or target-record evidence guards.

The September Get Nice Centre rename decision also supports the June 274 Chatham Road
North frontage, guarded by its own publisher source evidence.

The final June review retains The Vim and Kei Wah Court names, Anchor Street Refuse
Collection Point, and the distinct West Kowloon Government Offices complex and its North
and South towers. The Kodak House building retains its identity without the obsolete
name. The selected Eastcore rename preserves continuity, and the Shek Pik staff-mess
address is reconciled through an alias. Ten exact predecessor records have retirement
approval, distinguishing demolition, facility closure and dropped names without
inferring demolition from closure alone.

### August 2025 continuity review

Source-guarded curations preserve the established identities for Sky One (Hotel COZi
Wetland), Sunny House (Pentahotel), Tung Tsz Scout Centre and the South Horizons estate
address. The South Horizons decision reuses the existing estate-component curation.

Two Yip Wo House address representations keep their separate identities while duplicate
unit inventories resolve to the established inventory. This requires exact owner
metadata, complete matching unit tokens, and unchanged canonical unit IDs across both
releases; partial or changed inventories remain subject to review.

The August 2025 user review retains named buildings and the Palm Springs project name,
reconciles the Lee Wang frontages and corrected college address, and preserves distinct
buildings beneath the RMHC, Good Mansion and Silverstrand complexes. Three exact prior
identities have user-approved retirement decisions. Browser reviews support copying JSON
directly or downloading the same document; both include the exact report digest.

September 2025 continuity reuses the six existing identity decisions for the four Grand
Central towers, GR8 Inno-Tech Centre and Lions–YMCA Junk Bay Youth Camp. Exact publisher
evidence guards preserve the predecessor IDs. Cape Collinson Crematorium retains its
complex identity across a coordinate and Chinese spelling correction at the same street
address.

### September 2025 reviewed premises

The 3 September review retains sixteen premise records through guarded publisher
evidence and explicit identity reconciliation. The kindergarten and management-centre
frontages reconcile to the selected Laguna Street addresses while other valid frontages
remain available. Tsing Fung retains its combined frontage alongside the separate shop
addresses; YKK retains both phase addresses. Named buildings persist when the publisher
omits their names, Horizon Bay is named De Hua Tower, and Eminence Tower 1 is classified
as a building. Five Chek Chue Barracks block records have explicit user-approved
retirement decisions; these decisions do not assert physical demolition. The review
receipt and fixture preserve the submitted report digest and reasons.

If the reviewed management-centre frontages reappear in later publisher deliveries,
exact bilingual address and coordinate guards preserve the selected canonical identity
and retain the returned publisher assertions in curation evidence.

### November 2025 continuity

Six exact publisher continuity rules preserve predecessor identities for Woody House,
Tanner Hill Towers 1 and 2, Champion Tower, ICBC Tower and the Three Garden Road
complex. Publisher selectors and payload assertions guard the renamed or reformatted
premises; existing alternative Tanner Hill addresses remain available. Other November
premise changes follow the explicit user decisions below.

### November 2025 reviewed premises

The completed 4 November review retains all 113 Shek Kong Barracks identities, including
the complex. Guarded archived publisher records preserve their original IDs and scope.
Summerbreeze is a building; Sang On retains its valid frontages. Far East Bank Building
continues as Silka Far East Hotel, with the two separate predecessor frontages recorded
as aliases of the combined predecessor identity. The selected HSBC Building address owns
the reviewed alias. Dorsett Kai Tak, CLP Headquarters, Peng Chau Rural Committee and
Harbour Mansion remain distinct named premises. The Palm Springs and Royal Palms house
IDs survive publisher address formatting changes. CUHK Medical Centre retains its
complex classification. Lok Yuen retains both combined building frontages and seven
separate shop/unit addresses beneath the matching frontage. AIA Hong Kong Tower has an
explicit retirement approval; the decision does not assert an exact demolition date.

### Explicit review outcomes

Review JSON schema 2 records the intended operation and affected IDs in `resolution`.
Options distinguish keeping the previous premise, renaming the same premise, merging
duplicates with an explicit surviving identity, linking a building to a complex,
correcting one record's classification, retaining a building alongside selected shops,
and retaining separate address frontages. Each option previews the result. Shop and
frontage choices accept multiple candidates; hierarchy choices specify the parent and
child. Required choices must be complete before copying or downloading JSON. Draft
imports validate the report digest, membership and operation fields. Review selections
remain instructions until processed; the page never publishes dataset changes.

The address-structure review option keeps the previous ID while adopting a selected
candidate street and number. Estate context and real building names are selected
independently. The export carries bilingual components, clears the erroneous house/block
prefix, and records the chosen classification. Publisher village fields used for road
addresses can be moved into street fields without duplicating the old village address.
For example, 25 Maple Drive can retain The Green as estate context with no building name
or building classification. This remains a reviewer instruction until processed.

### December 2025 reviewed addresses

The 16 December 2025 review preserves ORIA, Stone Rise and Centre for Food Safety
building names and canonical identities. Kingdom Power Commercial Building continues as
Lee Fung Commercial Building. Kailey Tower uses 14–16 Stanley Street with duplicate
Stanley Street identities recorded as aliases; 23 Wellington Street remains separate.
The user's written address instructions take precedence over the forced reviewer
selection, and both are retained in the local decision receipt.

12 Santa Barbara Avenue retains Royal Palms / 加州豪園. 23 and 25 Maple Drive retain The
Green / 歌賦嶺 as estate context, with the house prefixes removed and Maple Drive stored
as the street rather than a building name. Explicit street-address classification
(`unknown`) takes precedence over classification inferred from the estate name. Tsing Yi
Town Clinic keeps its building identity separately from the clinic complex. The previous
“39 Sha Tsui Road” identity has retirement approval; the current 37–43 Sha Tsui Road
address remains. No demolition date is asserted.

The guarded rules are in `hkgov-dpo-address-december-2025-reviewed-retentions.json`; the
retirement is recorded in `hkgov-dpo-address-approved-retirements.json`. Publisher
evidence remains unchanged.

### Deferred 2026 investigations

The authorised 2026 import records uncertain address changes as
`needs-further-investigation`. This permits the publisher's omission to take effect
without approving retirement or asserting demolition. The deletion report retains
`requiresReview: true`, with `ingestionDisposition: ready-with-investigations`; the
unresolved work remains visible after ingestion.

`SAANSEOI_ALS_INVESTIGATION_AUTHORITY` supplies the explicit authority for creating 2026
deferrals. Each acknowledgement matches the source version, predecessor and exact report
digest. The durable queue is retained in the `ss-evidence` R2 archive, catalogued in
`fixtures/reviews/manifest.json` and cached in
`fixtures/reviews/hkgov-dpo-address-investigations/`. It preserves previous identities,
candidate evidence and lost inventories, including unit IDs. Preparation deferrals
preserve the sealed evidence for identity drift, unverified curations and conflicting
reviewed street components. A street conflict retains the assembled source assertion,
previous correction and conflicting values; it does not apply the disputed correction.
Missing street fields may be restored only when all supplied values agree with the
reviewed street. Missing previously reviewed inventories retain the expected canonical
unit IDs in preparation investigations. Existing inventories with changed canonical unit
IDs still fail integrity validation. Preparation evidence is sealed after these
inventory checks. Conflicting hierarchy evidence preserves the proposed relationship and
all estate records as an investigation before any part of that relationship is applied.
The disputed correction remains unapplied; final parent and membership validation still
runs. A change to evidence invalidates the matching acknowledgement. Invalid hierarchy,
missing parents, file-integrity failures and division-linkage errors remain blocking.

Confident continuations require one-to-one evidence. Exact bilingual addresses,
number-format corrections and omitted names retain the established identity when the
publisher, location and other premise components agree. House prefixes can become street
numbers while preserving bilingual estate and phase context. Different house numbers,
ambiguous matches, site-part scope changes and genuinely different names remain
investigations. The predecessor preparation is included in the cache fingerprint. Each
automatic continuation records its reasoning and alias in prepared provenance.
Estate-restoration rules accept a matching name already supplied by confident
continuity, retain both provenance records, and reject conflicting derived names.

Exact source assertions also record verified coordinate-only adjustments to earlier
curations where all bilingual premise fields and publisher identities agree. When a
publisher reintroduces an additional street address whose provisional ID is already
owned by a curated address, an explicitly reviewed rule assigns a separate stable ID.
The shared provisional ID does not become an alias of the additional address. D Hall,
Ablutions Block and Bauhinia House at 10 Hollywood Road and 16 Old Bailey Street are
recorded this way in `hkgov-dpo-address-2026-reviewed-continuity.json`. ORIA and Stone
Rise return with bilingual publisher names from July 2026. Each matches its existing
reviewed canonical identity; the returned record supplies the location without inserting
a duplicate retained record. The same exact-evidence handling covers The Stellar, Six
Pacific Place, Kowloon East Government Offices and CUHK Medical Centre, preserving their
reviewed classifications when publisher names move between fields.

A subsequent revision can resolve an investigation and restore a previously omitted
identity. Original publisher assertions, earlier memberships and the investigation
evidence remain available for that decision. Deferral itself does not establish that a
record persisted.

## DPO review operation contract

DPO editorial decisions are durable ingestion inputs. The validated
`hkgov-dpo-address-review-program.json` selects semantic operations over registered
review JSON, covering source guards, premise retention, identity reconciliation,
classification, derived parents, duplicate suppression, frontage reconstruction and
inventory ownership. Release bounds, reviewed identities, source hashes and parent
relationships belong in the fixtures. Shared executors preserve operation order and
retain the program, policy and originating evidence in the audit inputs.

Editors register a decision fixture once and select supported operation codes without
adding monthly TypeScript handlers. The program's adjacent JSON Schema describes the
executable envelope; runtime validators check each decision collection. Existing
canonical IDs, identity keys, provenance and evidence guards remain part of the
contract. New semantics require an explicit operation and tests.

`hkgov-dpo-address-review-policy.json` defines bounded continuity and investigation
scopes. The 2026 authorisation does not extend to other years. Deferral requires exact
evidence and an explicit authority; structural errors remain blocking. Triage labels and
generated issue reports do not authorise mutations or retirements. Membership integrity,
cache hashes and deletion approvals remain independent gates.

See
[the DPO operation reference](../sources/hkgov-dpo/address.md#executable-review-decisions)
for the code vocabulary, inputs, execution stages and extension requirements.

## Canonical source attribution

Each `sources` item identifies its upstream codes as `publisher` and `dataset`, with
`recordId` identifying the publisher occurrence.

Official Address2D and Address3D attribution lists `hkgov-dpo`, the registered Address
dataset and each retained publisher occurrence ID. Hashes, audit IDs and component
corrections are excluded. Component correction fixtures remain in the ALS R2 audit. A
curated record without an identified upstream occurrence has an empty attribution array.
Full API responses return these stored references without adding snapshot or release
identifiers.

### Snapshot event storage

Canonical HISTORY stores a changed component once, with its introducing `snapshotId`,
`operation`, content hash and payload in the same row. Unchanged components inherit the
selected parent. Deletions append identity-only tombstones, and ancestor rows remain
immutable. Reversions and independent branch changes have distinct introducing events.
The read-only `historyEvents` view stores no additional membership rows. Snapshot reads
resolve ancestry before filtering and use the exact introducing snapshot to fetch
content. SOURCE release validity and interpretation evidence remain separate.

## Geometry, timestamps and serving readiness

Address2D exposes point geometry without a stored or API `bbox` field. Official
addresses retain their publisher point; supplementary addresses without an established
point retain null geometry. Clients can calculate bounds from the points they display.

CURRENT Address components retain `createdAt` without `updatedAt`. Changed content
replaces the component under the same scope and record key. HISTORY components retain
the introducing snapshot and event creation time. Public content responses omit
`updatedAt`; publication receipts retain operational update timing.

`addressPublicationState` is the delivery and serving-readiness receipt. Its `scopeId`
matches the storage key in CURRENT Address rows; its `snapshotId` identifies their
logical snapshot. `publicationToken` guards delivery ownership, `preparedAt` confirms
complete validation, and `status=current` permits serving after publication. It remains
separate from `addressSearchScopes`, which records the snapshot indexed for search.

The FTS5 virtual table `addressSearchFts` is created by search finalisation, outside
Drizzle's ordinary table migrations. A database with no finalised Address search
selection can have an empty `addressSearchScopes` table and no FTS table. Publication
and release-set reconciliation run the finalisation workflow.

## Localisation metadata

Locale values carry the shared [localisation metadata](../i18n-metadata.md) contract.
`meta.isLocaleInferred` records language assignment, while `meta.fields` records each
field's origin, optional human verification and optional translator identity. Metadata
participates in canonical content hashes and retained locale revisions.

## HISTORY ownership

Canonical events derive their producing release from their introducing snapshot's
primary inputs. Inherited events retain that original ownership. See
[HISTORY producer ownership](source-evidence.md#history-producer-ownership) for the
shared contract and dataset discriminators on combined geometry snapshots.

### Local identity review

The development map review reads sealed ALS identity changes, compares previous and
current evidence, and saves explicit decisions with optional research notes. Partial
exports and imports retain selected decisions while omitted cases remain pending.
Reviewer names are excluded from exports and fixtures. Browser drafts and exports are
bound to the exact review digest. The validated importer preserves existing identity
decisions, rejects conflicts and leaves unresolved investigations blocking. See the
[local identity review workflow](../sources/hkgov-dpo/address.md#local-identity-review)
for the page and application commands.

The `2024-07-31.0` identity review records distinct IDs for 88WL and Terra, while
retaining the predecessor IDs for Fu Tip Estate Social Service Building and Lingnan
University's amenities building. Each decision retains its exact identity pair, optional
note and evidence digest.

ALS SQL generation releases preparation audit copies, the input identity ledger and full
predecessor payloads before normalising chunks. Sealed audit evidence remains available,
and the identity ledger advances only after successful publication.

The Fu Tip Estate Social Service Building and Lingnan amenities building retain their
reviewed July 2024 predecessor IDs in subsequent retention fixtures. The identity
decisions and retention rules must name the same canonical premises.

The `2024-09-03.0` identity decisions retain the predecessor IDs for all 22 Emerald Bay
premises, using the reviewed Emerald Bay A11 decision and the explicit instruction to
apply it across the group. China Taiping Finance Centre, 383 King’s Road, Bamboo Vista
and The Rainbow use distinct IDs. Ying Lun Centre, Tsuen Fook Kui and Kin Sang Car Park
retain their predecessor IDs. Exact identity pairs and the sealed review digest
accompany every decision.

The `2024-10-18.0` Emerald Bay to Ocean Camino name changes retain the same 22 published
premise IDs under the explicit group instruction. Exact source comparisons permit only
the building-name change; every other identity component remains equal. S22 and Five
Pacific Place remain separate review cases.

The remaining `2024-10-18.0` decisions identify S22 and Five Pacific Place as new
developments with distinct IDs. Their exact identity pairs and sealed review digest are
recorded with the optional development notes.

Identity review researches the building’s construction, groundbreaking or occupation
permit dates before requesting decisions. A documented new development whose
construction is roughly contemporaneous with the source-name appearance may receive a
distinct ID under the explicit review instruction. Evidence must match the exact site
and retain its source URLs and dates. An established building’s rename, ownership change
or refurbishment alone does not establish a new development; unclear cases remain
subject to review.
