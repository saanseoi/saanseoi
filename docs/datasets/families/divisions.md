# Divisions dataset family

## Classification and stored ancestry

Geographic divisions expose `category`, `class` and `level`. Administrative classes are
`sar` (0), `area` (1) and `district` (2); localities are `city` (1), `town` (3),
`village` (5) and `hamlet` (6); hoods are `macrohood` (4), `neighbourhood` (5) and
`microhood` (6). The separate country anchor remains administrative. Planning and
statistical domains retain their domain-specific classes with no geographic category.
Levels can be shared and skipped; a hood does not require a city parent.

Ingestion stores `hierarchies.administrative`, `hierarchies.locality` and
`hierarchies.full` as arrays of ancestor paths. Every entry is `{ id, name, class }`.
Paths run broadest to narrowest and exclude the division itself. Locality paths retain
the nearest locality and its hood ancestry; full paths combine administrative ancestry
with that locality/hood path, omitting only a city. Paths preserve source correlations:
multiple districts or hoods do not create a Cartesian product of invented paths. `name`
is Traditional Chinese followed by English, trimmed and deduplicated, or the one
available name; absent names are null. The API returns these stored paths without
ancestor lookups or locale-dependent label construction. Optional `include=hierarchy`
loads the distinct ancestor resources, including cities, in `included`.

Hong Kong Island, Kowloon and New Territories administrative areas have deterministic
SaanSeoi UUIDs and district-union geometry. Kowloon city retains its source UUID
`17009785-57fd-4e5b-af86-2d27352e4718`; Kowloon area uses
`bb5c7e0a-fd09-5416-8bb8-9593c90280fb`. The `KL` statistical code identifies the area,
not the city. Kowloon city and area share the same district-union geometry. Hong Kong
city retains its source identity and geometry when present; its missing identity or
geometry is reconstructed from Central and Western, Wan Chai and Eastern districts. Hong
Kong Island area also includes Southern District. Publisher assertions remain unchanged
and reconstruction evidence is retained separately.

The current/history schema requires these materialised paths. Populated databases need a
separately authorised rebuild and reingestion; generated schema migrations do not
reconstruct names, city identities or branching in existing snapshots. Do not publish an
old flat hierarchy as the new contract.

Open source versions with unchanged hashes retain their release ID, validity and
timestamps. Publisher membership determines omissions independently of release markers.
Geometry source and derivative conflict updates run only for closed assertions; closing
a changed version targets that current version without rewriting older history.

New Territories area restoration includes the nine statutory district land geometries
and Lok Ma Chau Loop, then removes the configured Shenzhen Bay Port exclusion.

[Minimal initialisation](../minimal-initialisation.md) selects two Overture and Planning
versions while retaining the configured companion geometry prerequisites.

## API release statistics

Division API release statistics replay immutable snapshot membership across assigned
history shards, including inherited records and localised names. Counts, locale coverage
and churn therefore describe the complete API inventory. Churn compares the preceding
published cohort/revision in the same region, domain and API version; the first release
counts its inventory as added. Identity, hierarchy, attributes and names participate in
change detection; geometry and ingestion provenance do not.

Both general and Planning division publication calculate these API statistics.

Planning source SQL uses schema-derived column lists and retains publisher attributes in
`rawProperties` alongside the complete source geometry. Reconciled division release sets
use the same calculation and recover missing churn for both current and archived
cohorts. Draft API sets wait for their required companion snapshots before calculating
statistics. To rebuild local statistics for all published division domains, run:

```sh
./bin/saanseoi stats:backfill-divisions --target local --dry-run
./bin/saanseoi stats:backfill-divisions --target local
```

`--release CODE[,CODE...]` limits the repaired releases without limiting predecessor
selection. The command validates every selected inventory before writing. It replaces
API presentation statistics only; source statistics, snapshots and publication state
remain intact. Missing history assignments or content versions stop the backfill.

Planning division release statistics include identity and attribute churn, separately
from source input counts. Repair statistics appear under Quality Checks. See the
[Planning source documentation](../sources/hkgov-pland/divisionArea.md) for local
retained-history backfill instructions.

Published source releases expose [schemas and samples](../source-record-access.md) from
their retained publisher records. Source validity follows the source release, including
shared Planning division/area projections and every assigned source shard. Restoring a
missing source ledger uses the registered archive and its content hash; canonical
divisions and published release metadata remain independent of that repair.

Geometry release churn describes incoming source records against the parent snapshot.
For merge uploads, parent members absent from the input remain in the snapshot and are
not counted as removed. Replacement uploads count absent parent members as removed.

## Resetting division data

`saanseoi reset:divisions --target local --dry-run` previews a reset of all division
identities, areas and boundaries across every domain. Omit `--dry-run` to confirm and
execute it; `--yes` skips the confirmation. Preview and production targets use the same
command with `--target preview` or `--target production`.

The reset removes division releases, snapshots, API release sets and catalogue
revisions, canonical current and history rows, and release-owned source rows across all
configured Hong Kong annual shards. Dataset definitions, reviewed identities and source
evidence assets remain available for reinitialisation. Source releases shared with
another resource family remain. Generated delivery and release caches are removed unless
`--keep-cache` is specified; delivery generations are invalidated in either case.

Dependencies in addresses, Places division links, statistics and other snapshot or API
families block the reset before deletion. Remote targets require a matching local
metadata cache and check dependencies directly in D1. The command rechecks the plan and
dependencies under the SQL delivery writer lock before execution. Pending delivery work
must be resolved first. Stop ingestion writers before resetting; database families are
reset sequentially, so an interrupted reset must be rerun before reinitialising
divisions.

## Processing

Hong Kong Area insertion is a bulk normalisation rule, not a patch or curation. A
separate `hong-kong-sar-area-district-hierarchy` guard checks the resulting ancestry for
districts and district descendants. For each source path, it requires exactly one
recognised Area between the Hong Kong SAR and district, rejects conflicting or duplicate
ancestors, and blocks unresolved mappings for review. Non-district branches do not
acquire invented district parents. Audit retains checked/failed counts separately from
the rule's assignment count.

Reviewed supplemental replacements are resolved before row processing. For an identity
being replaced, the hierarchy guard checks the final replacement after normalisation;
the intermediate source row remains available for source provenance.

QA corrections use explicit patch origins and fixtures under `fixtures/meta/patches/`.
Curations name their related review guard; patch source checks are application
preconditions, not triggers for requesting review. Area and boundary normalisers share
the `division-geometry-exclusions.json` executable policy, retained as a resolved
dependency in both declarations. WKB decoding has a shared registered rule too.

Division, area, boundary, classification, translation, Planning and synthetic-area
normalisers register JSON declarations from `fixtures/meta/processing-rules/`; Audit
retains those same frozen definitions. Taxonomy mappings, locale priorities and geometry
exclusions are consumed from their parameters. Merge ruleset references resolve these
definitions and include their content in the resolved ruleset hash.

API locale fallback lists contain only alternative source locales. Existing target names
are kept before alternatives are checked; English has no alternatives. The audit
presents locale rules together in one flat mapping table.

Division normalisation retains executor-backed branch conditions, stable branch IDs and
precedence for level/type classification, API locale copying and text locale inference.
Bulk audit counts record selected matches and changed outputs per branch; shadowed
candidates do not count as matches. Classification changes compare the canonical result
with the raw source `level` or `type`. Locale copying counts added locale rows, and
inference counts evaluated text values that produce locale-bearing output. Preparatory
hierarchy lookups do not contribute to these counters.

Recorded zero means no selected matches or changes in that execution. Missing branch
definitions or counters mean **not recorded**. Audit presents only retained policy and
never substitutes the current implementation for a historical declaration.

Overture attribution remains in `rawProperties.sources`, including explicit nulls or
empty arrays supplied by the publisher. Private acquisition locators do not repeat
publisher attribution or canonical identifiers.

Local geometry prerequisite checks may read a pending delivery only when its sealed
plans prove ownership by the exact release being resumed. Other releases remain blocked
until that owner completes publication and releases the database.

Source records retain publisher payloads in `rawProperties`, with identity, provenance
and release history alongside them. Publisher record versions remain in
`rawProperties.version`; content hashes and release validity track source history.
Extracted names, classifications, hierarchy, cartography and geometry flags belong to
canonical history/current tables, not duplicate source columns. Native geometry may be
retained separately when the publisher delivers it outside the attribute payload.

Canonical and geometry ingestion retain recipes, source rules and exact selections under
the [assembly provenance contract](../pipeline.md#snapshot-assembly-provenance).
Verified reuse preserves the published assembly evidence; draft companion inputs refresh
it.

Canonical, Planning Department and geometry processing retain
[processing audits](../processing-provenance.md) in content-addressed R2 objects. D1
registers the compact manifest and attempt status. Bulk rules expose registered
declarations and counts; bulk curations expose selected fixtures. Individual curations
are paginated and searchable. Failed blocking guards prevent publication. Audit
verification uses a bounded cache of verified JSON objects for shared fixture
references, checking every individual pointer without repeatedly parsing its fixture.
Remote provenance delivery transfers up to four verified objects concurrently and
registers the manifest only after every dependency and the final root are acknowledged.
Remote release-set reconciliation refreshes metadata before calculating published API
statistics, so publication and recoverable statistics attempts use committed membership.
History caches retain all Division identity and name versions needed by published
snapshot journals, including superseded versions used for predecessor comparisons. Cache
rebuilds group selected tables by data/schema export mode per binding. Binary geometry
rows retain their separate byte-for-byte verified transfer. Post-publication statistics
failures are recorded against their ingest stage without changing published or
superseded source-release status.

Curated Division codes use `SCREAMING_SNAKE_CASE` (for example, `TSEUNG_KWAN_O`).
Metadata registry synchronisation assigns each code to its canonical Division and
removes superseded codes for that same domain and canonical ID. Division processing
reads these curated assignments; domain codes and source identifiers retain their own
formats.

The `/v0.1/identityBridge` endpoint derives source-to-canonical mappings from the
selected API release set. Planning keys include their level; subunit values include
their TPU. Reviewed mappings needed by ingestion live in
`fixtures/meta/curations/identity/` and are not metadata database rows. See
[identity lookups](../../identity-bridge.md) for selectors and pagination.

Planning Division retries reuse sealed SQL and completion counts without repeating
normalisation, comparison, materialisation or import artefact generation. Local
materialisation runs on WAL-safe planning copies; target mutations start only after the
complete plan is sealed. Remote preparation uses its isolated release mirror.

Canonical Division delivery reads comparison baselines, normalises records and builds
source, history, current and metadata SQL only inside new-plan preparation. The sealed
plan retains the original SQL artefact count and extraction/localisation counts as
checksummed workflow outputs. Retries skip those baseline reads and normalisation, and
report the original counts even after partial replay. Snapshot lineage preparation
remains a separate stage.

Canonical Division inserts stay below 96 KiB per SQL statement. Oversized text is
assembled in payload-scoped staging tables before the original insert executes, so
geometry, Unicode text, constraints and conflict-update rules retain their full values.
The staging tables are removed before the delivery receipt is written.

Remote geometry delivery generates SQL from lazy mirror-table iterators inside the
sealed-plan preparation callback. A retained plan skips those reads. Statement packing
tracks UTF-8 byte counts incrementally and closes the iterator on interruption.

Remote replay includes superseded history and source versions, selected through the
snapshot change journal and closing release code. Closures update exact version keys
without replacing historical geometry; C&SD source derivatives are retained too.

Canonical Division and Planning Department SQL artefact imports use native local
delivery plans as well as remote delivery plans. Local geometry materialisation uses
WAL-safe SQLite planning copies, capturing exact mutations and retained churn outputs
for receipt-backed replay without regenerating geometry writes. See
[SQL delivery](../sql-delivery.md).

Canonical, Planning Department and geometry SQL imports use
[sealed delivery phases](../sql-delivery.md). The local mirror supplies the planning
context. Remote receipts confirm each retained payload before the identical SQL reaches
the shared mirror; publication follows delivery.

The Divisions API family combines canonical divisions with geometry companions. Geometry
variants are source-specific records and are not merged. The family currently requires
canonical `division`, Overture `divisionArea`, Overture `divisionBoundary`, and the
latest published HAD and C&SD district-area snapshots at or before the set cohort. The
boundary requirement remains exact-cohort Overture. This keeps the two authoritative
district-area sources in every Overture release without selecting future data.

When Divisions release-set publication is deferred, every nested source upload retains
that deferral. It may publish its source release and snapshot, but it cannot create an
API revision for an already current cohort; only explicit reconciliation publishes a
draft release set.

C&SD statistics archives use a combined intake path. The `hkgov-censtatd:statistics`
command includes available `division` and `divisionArea` companions by default,
alongside `divisionStatistic`. `--defer-stats-release-set` selects Statistics-only
intake unless `--include-geography` is also supplied; `--geography-only` processes the
geography companions without Statistics. This Statistics-resource choice is independent
of Divisions release-set publication, which is controlled by `--defer-api-release-set`
and may be reconciled separately.

Registry codes use lowercase kebab-case even though programmatic resource-type enums use
camelCase. For example, `divisionArea` is encoded as `division-area` and
`divisionBoundary` as `division-boundary`. A dataset describes one publisher product and
declares one or more available resource types; each release records the specific
resource type it materialises. Dataset metadata supplies publisher, product, and source
variant directly; publication code must not infer them by parsing an identifier.

The reusable resource contract and variant rules are documented in
[`divisionGeometry`](../resourceType/divisionGeometry.md) and
[`spec/divisions-geometry.md`](../../../spec/divisions-geometry.md). The Overture and
Home Affairs Department profiles are kept in the provider source folders:

- [`Overture geometry`](../sources/overture/divisionGeometry.md)
- [`Home Affairs Department area`](../sources/hkgov-had/divisionArea.md)
- [`Overture historical reconstructions`](../sources/overture/historicalReconstruction.md)
- [`Planning Department TPU and subunit areas`](../sources/hkgov-pland/divisionArea.md)
- [`LandsD place names`](../sources/hkgov-landsd/placeName.md)

The default `geographic` domain retains Overture as its primary provider variant, rather
than using the provider name as the domain identity. If Overture omits Hong Kong Island,
Kowloon, or the New Territories, ingestion restores their level-1 `area` identities from
the configured district members. Every one of those recognised areas receives an
individual Overture `divisionArea` geometry patch when Overture omits its own area
geometry, even if Overture does provide the division identity itself. Those reviewed
identities retain their Wikidata identifiers: Hong Kong Island (`Q3248921`), Kowloon
(`Q239143`) and the New Territories (`Q596660`). This rule is applied independently to
every Overture cohort, so a missing area is not limited to the newest release. Kowloon
reuses Overture's historic division ID `17009785-57fd-4e5b-af86-2d27352e4718`; it is
never assigned a SaanSeoi replacement. Lok Ma Chau Loop
(`222b7818-970a-491d-98b6-b88d8c6f0161`) is a level-4 `macrohood`, not a district: the
correction keeps level 2 to the 18 statutory districts, retains raw Overture taxonomy as
provenance, and is recorded in each affected source release's processing actions. C&SD
Permanent Living Quarters geometry then references those Overture identities rather than
creating parallel divisions. The separate `hkgov-censtatd-hma` domain publishes C&SD's
173 polygonal Housing Market Areas. Building Groups are not divisions: their source
centroids remain source history for a future buildings projection.

When ingestion emits a supplemental area row, it retains an individual identity-patch
application with the reviewed fixture, affected identity, observed source classification
and geometry type, replacement row and district identities. The area geometry processor
retains one individual geometry-patch application per restored area. Historical releases
without that retained ingestion evidence do not receive inferred applications.

The 2023-H2 C&SD Permanent Living Quarters statistics output maps its source codes to
those stable Overture area identities. Its Area/type polygons join the same
cohort-qualified `hkgov-censtatd` companion as C&SD's annual district polygons; it does
not add a second Geographic division collection. The 2021 HMA statistics output instead
supplies the separate HMA domain's primary canonical division snapshot
(`hkgov-censtatd:2021`), paired with its native `hkgov-censtatd-hma` geometry. Although
the HMA source dataset also publishes statistics, its statistics and its division
geography have distinct snapshot lineages.

Planning Department Planning Units and New Towns are independent API domains, not
optional members of the Geographic release. Each Planning Department source dataset
exposes both `division` and `divisionArea` from the same upstream layer and cohort. Each
domain release contains only snapshots that can be returned together. Planning-domain
canonical rows therefore never need an Overture cohort in order to be published, and a
2006 planning cohort can be backfilled even when no 2006 Overture divisions exist. New
Town identities are cohort-scoped; Planning Unit and Overture lineages use persistent
identity. Updater-driven Planning Department intake verifies the mirrored archive's
managed key and SHA-256 before parsing it. TPU ingestion accepts both the original
historical packages and CSDI's equivalent deduplicated repackages, after verifying their
provider-cell-key coverage. Historical Planning backfills retain verified derived
Parquet locally by archive digest and preparation contract, allowing a retry to reuse
source reconstruction without reusing mutable release materialisation state.

Published domain releases are immutable. Adding another eligible secondary snapshot to
an already published cohort creates the next trailing composition revision (`...-0` to
`...-1`). The publication then creates a family-and-region API catalogue revision that
points at the richer release. An older catalogue continues pointing at the earlier
domain release, which preserves knowledge-time replay without duplicating canonical
rows.

The uploader reports readiness as an `API DOMAIN RELEASE` and reports the catalogue
revision created when the domain release becomes publishable. Geographic readiness
checks its Overture, HAD, and C&SD composition members; each Planning Department domain
is checked independently.

## Composition-owned ingestion dependencies

The API composition also defines the prerequisites required to materialise its members.
This is intentionally not source-dataset metadata. For the Geographic domain, canonical
`division` must be materialised before Overture `divisionArea` or `divisionBoundary` for
the same cohort; the Planning Unit and New Town areas similarly require their domain's
canonical division. `saanseoi update` expands the requested family with these providers
and performs them in dependency order. The resulting geometry snapshot records the exact
selected division source release as a lookup input, preserving replayable provenance
without duplicating the dependency declaration in each source fixture.

## Bootstrap recovery

`saanseoi update --target <environment> --api-family divisions --download --yes` reads
the selected environment's release report before choosing source work. A successful
report is authoritative: saved local check state never represents a source release that
the environment has not reported. An empty Geographic report rebuilds the current
Overture STAC release and the retained Overturist archive catalogue in release order.
C&SD district areas are independently keyed by their 2016 and 2021 cohorts, so an
interrupted bootstrap rebuilds only an absent cohort; a cohort already reported by the
target is not selected again. This lets the command resume safely after interruption
without re-publishing completed source releases.

The canonical `schemaVersion` may remain unchanged when a new source merely supplies
more values in the same response shape. Merge rulesets are domain-scoped for new
planning releases; the existing Overture ruleset keeps its legacy code. Adding a new
closed-enum domain or include variant is instead an API contract-minor change.

Functional domains are explicit (`administrative`, `planning`, `electoral`, and
`geographic`). A division may have secondary domain memberships, while hierarchy edges
carry domain context so planning or electoral relationships cannot enter the default
administrative traversal accidentally. Cohort keys identify the period selected for a
release; source publication and validity metadata remain provenance.

The LandsD Place Name database is registered as the separate `hkgov-landsd` geographic
domain because its settlement points are an alternative primary division collection, not
an Overture geometry companion. Only `PLACE_CLASS=Settlement` records belong in that
division domain. Its Hydrographic and Topographic records remain source data for a
future government place-name projection; they should not be forced into the divisions
taxonomy.

The LandsD selection Bulk Rule retains counts for all native inputs, selected
settlements and exclusions by publisher class, including missing or unexpected classes.
The [source documentation](../sources/hkgov-landsd/placeName.md#divisions-projection)
describes the retained audit and local backfill.

All division geometry uploads calculate their canonical WGS84 bbox directly from the
normalised geometry. Canonical geometry and bbox are persisted only in history and
current; source records include publisher evidence, while named source derivatives
retain their explicit transform output. Upstream bbox fields are not trusted as
persisted geometry extents.

Source-specific aggregate geometry canonicalisation is permitted only when its provider
profile documents the triggering topology condition and the source records remain
unchanged. The Planning Department 2021 TPU aggregate uses this policy for coincident
geometry fragments and boundaries that a pairwise overlay cannot node.

Canonical division source releases persist locale completeness and churn stats as well
as a district distribution. A district row contributes to itself; every other row is
counted against the `district` entry in its normalised hierarchy. Atlas joins those
canonical identifiers to the HAD district-area geometry for a comparable map across
division datasets.

Geometry releases additionally persist release-owned district geometry facts from the
exact canonical EPSG:4326 snapshot: features, Polygon/MultiPolygon parts, area, boundary
segments, and boundary length. A boundary segment is a non-zero coordinate-to-coordinate
edge across every exterior or interior polygon ring, or every boundary line. It
indicates geometric complexity rather than positional accuracy; an exact C&SD release
and its `simplified` display derivative therefore never share or replace these
measurements.

Historical C&SD district areas are cohort-qualified statistical-geometry companions,
never defaults. The census land-clipped district releases use
`hkgov-censtatd-landclipped`; annual district polygons and C&SD Area/type polygons use
`hkgov-censtatd`. Both keep an explicit snapshot for each source-authorised cohort, even
when its geometry bytes match an earlier cohort. `simplified` is a named 10-metre
display transform of the selected companion snapshot, not an independent composition
member.

The processing cache retains each simplified WGS84 GeoJSON coverage under
`.local/dataops/simplified-coverage`, keyed by the complete input geometry, the 10-metre
tolerance and the versioned simplification contract. Re-uploading unchanged source
geometry therefore reuses the verified display derivative; a changed source, tolerance
or contract produces a new one.

Several C&SD source releases can contribute to one companion cohort. The materialiser
compares each incoming complete canonical row set before writing: when every row is
already present with the same materialisation, it is retained as a `snapshotSource` with
`verified_identical_geometry`, rather than duplicating canonical current/history rows.
Non-overlapping rows are recorded as `contributed_geometry` and merged into the
companion. This distinction is per complete materialisation, not a source-level
duplicate.

Completed-release validation recognises these recorded geometry contributions while
their shared composition is draft. It verifies the source membership, shard assignments
and materialised rows independently of API activation; it does not require the
contributing dataset to own the composition lineage.

For API-field provenance, Population and Household Statistics is the canonical C&SD
district relationship whenever it is available. Permanent Living Quarters may still
contribute geometry to that companion. District Land Area, Population and Density
remains a source and can seed an earlier companion, but becomes redundant for the
API-field signature once either canonical C&SD source is present. The redundant source
is reported with the release-set lookup rather than becoming a competing field mapping.

The 2016 and 2021 C&SD variants are separate required inputs, not successive revisions
of one source release. Each keeps its own snapshot lineage and remains available when
the other cohort is published. Geometry churn is calculated only against a snapshot's
declared parent; an initial C&SD cohort therefore reports all 18 district areas as
additions and never as removals from another cohort.

For Overture, locale inference, API-locale fallbacks and `CN-GD` geometry exclusions
contribute aggregate counters to registered processor declarations, without affected
record lists. Reviewed area geometry retains its fixture-backed union/exclusion patch
and parameters. AI and human name translations are individual fixture curations with
source text, resulting text, target locale and available parent names. The retained
fixture preserves unused entries as well as applied instructions. Translation
applications are captured for every source using the shared Division processor,
including C&SD. Lok Ma Chau Loop uses a guarded classification fixture in both direct
normalisation and hierarchy lookup. The admin-level expectation permits an omitted field
only when the accepted source-release schema has no `admin_level` column; supplied
values must match the fixture. Translation preparation passes the source-release context
through the same normalisation guard. Identity, class and subtype checks remain
mandatory, and source drift blocks ingestion. Audit shows bulk summaries first and loads
declarations, fixtures and individual pages on request.

For Hong Kong Overture divisions, locale-less Chinese names—including alternate name
rules—are inferred as `zh-hant`; an explicit source `zh` tag is also normalised to
`zh-hant`.

Overture division hierarchy columns follow the accepted schema for the declared source
release. From `2026-02-18.0`, the Parquet file must contain `admin_level`; earlier
cohorts use subtype, class, parent and name fields. Missing required columns block
processing.

## Reviewable API name translations

Division imports complete the API's `en`, `zh-hant`, and `zh-hans` name locales only
when a publisher has supplied at least one name. A missing Simplified Chinese value is
translated from Traditional Chinese where available, and vice versa. When no Chinese
name is available, English supplies a missing Chinese value. If both Chinese values are
present but English is absent, Simplified Chinese supplies the English translation.

Overture geographic divisions use one version-controlled translation memory per dataset:
`fixtures/i18n/datasets/<datasetCode>.json`. An entry is identified by its field,
context hash, source locale, source-text hash, and target locale. For divisions, the
context is the parent division ID and English parent name. This avoids re-translating
the same name every month without incorrectly sharing a name whose meaning changes under
a different parent.

Version 2 fixtures use three maps: `contexts` stores each parent context once,
`translations` stores each distinct translation and its provenance once, and `usages`
links a contextual lookup key to a translation, record IDs and release bounds. Identical
translations can share a value across contexts; differing contextual choices retain
separate values. Release audit documents retain expanded application evidence.

Translation context retains multilingual parent display names as `parentName.<locale>`
alongside `parentDivisionId`. Display names are excluded from the context hash. Audit
selects the UI locale, then English, another retained name in locale order, and the
parent ID.

Each entry also retains literal `sourceText` and the sorted canonical `recordIds` that
have used it, so a web editor can show the source and link directly to affected
divisions. Those IDs are references, not part of the identity key: the importer resolves
each record through the context-and-source key at import time. Each entry records its
context, provenance (`ai-translated` or `human-translated`), and the first and last
source releases that used it. Fixture review may replace an AI result with a human
translation while retaining the same identity key. Translations are timeless values: a
fixture entry has no validity interval. Releases instead preserve the exact application
that was made in their immutable audit actions.

The older source-release fixture format remains available for Planning Department
division datasets. During the Overture transition, a matching legacy entry seeds the
dataset fixture without calling the translation service again. A later local import
reads the dataset fixture rather than calling the translation service; it may add
missing entries in locale-pair batches, which keeps the generated changes reviewable
before release SQL is used in production.

Only a local import may create a missing fixture entry. A non-local import can use an
existing fixture but fails clearly when an entry is absent. A source that provides codes
without a name is not translated. Locale statistics distinguish publisher-provided,
inferred, AI-translated, and human-translated names as four exclusive categories.

## Publisher source boundary

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`rawProperties`.

A recognised Hong Kong Area identity supplied as a point can have source ancestry
through one of its own districts. When that district belongs to the same reviewed Area,
canonical ancestry ends at the Hong Kong SAR. The Area is never inserted into its own
ancestry. The original source row, identity, names and geometry remain retained, and the
hierarchy normalisation is recorded in the release audit.

Initialisation stops at the first failed upload so a retained SQL delivery keeps
exclusive ownership until its release is recovered. If audit delivery also fails, the
log includes both the original guard reason and the delivery error.

## Source record response

The [source record contract](../source-records.md) retains publisher attributes in
`rawProperties`, including publisher-authored attribution. Records expose source
identity and optional native geometry. Resource types, variants and internal acquisition
locators are not publisher-record fields. Geometry retains the source coordinates and
CRS; canonical geometry is available through the family’s canonical API.

## Local D1 with production artefacts

For a fresh local initialisation, `--target local --r2 production` keeps processing and
registrations in local D1 while retaining source and provenance objects in production
R2. See the
[storage-target workflow](../d1-bootstrap.md#ingest-locally-with-production-r2) for
immutable uploads and continuation requirements.

## Registry metadata

Official division dataset processing metadata declares the identity bridge, Lands
Department settlement selection and Planning Department normalisation where applicable.
Source and resource releases retain their creation-time policy. Planning release
statistics use the `release` kind.
