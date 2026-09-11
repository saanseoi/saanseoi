# Statistics dataset family

Statistics source replay closes changed hashes and same-release omissions explicitly.
Conflict updates leave open matching versions untouched, including their original
release and validity. Large geometry reconstruction is limited to incomplete or closed
rows, so replay does not rewrite or append to a complete unchanged payload.

Source-shard assignments use the four-digit year of the publisher version, including
versions with quarter or half-year suffixes. Canonical history uses each observation's
reference-period end year independently.

[Minimal initialisation](../minimal-initialisation.md) selects at most two distinct
configured versions per source dataset, including their companion resources.

Each publisher version has one source release and independently processed resource
children. A multi-resource product uses resource-qualified child codes such as
`dr-…-2024::divisionStatistic` and `dr-…-2024::divisionArea`. The public source code,
release notes and source schema belong to their shared parent.

Update readiness checks every declared resource type in the same source version when
geography is requested. Statistics-only intake checks the Statistics resource alone. An
unchanged publisher archive does not make a missing companion resource current.

Each child owns its processing phases, audit, statistics and snapshot associations.
`snapshotSources.resourceReleaseId` references the resource child in `releases`. Retries
replace only that child's results. The source release freezes its expected resource
types at registration and becomes published only when every expected child is published;
a missing or failed child blocks parent publication. Statistics and Divisions API
release sets activate separately. Source pages label each resource and present its
counts independently; observations, divisions and areas are not summed.

Publisher [schemas and samples](../source-record-access.md) use the Statistics source
catalogue and the exact source release. Every shard holding retained assertions must
have a source-shard assignment for that release. A missing assignment can be restored
from matching source rows whose `releaseId` and `validFromRelease` both identify the
published release; the records and canonical observations remain intact.

C&SD source-assertion normalisation and district identity bridging have executable
JSON-backed rules in `fixtures/meta/processing-rules/`. Both merge rulesets reference
the same district mapping definition. Upload audits retain the rules executed by the
selected path, including their counts. Reviewed field and localisation declarations
identify their related guard requirements.

Retained identity-bridge fixtures include the registered SaanSeoi `divisionCode` when
available, alongside the reviewed canonical ID. The code is display metadata and does
not change identity resolution. Audit tables deduplicate equivalent field mappings
across retained fixture representations; copying preserves the original documents.

`saanseoi reset:stats --target local|preview|production` resets all Statistics releases,
snapshots, API release sets, source assertions, canonical records and dictionaries
across regions and retained shard years. It also retracts division identities and exact
or simplified geometry contributed by Statistics datasets, selected through dataset
ownership and non-lookup snapshot provenance. Unrelated geography and lookup
dependencies remain available. Derived geographic snapshots, dependent Divisions API
release sets and their catalogue revisions are retracted together. Other inputs to those
compositions retain their source releases, assertions and independent snapshots. The
plan lists each affected Divisions release set before confirmation. Shared
source-release identities and source evidence assets are retained. Non-geographic
families that reference the selected releases, snapshots or divisions block the reset.
Use `--dry-run` to inspect the plan, `--yes` to skip confirmation, and `--keep-cache` to
retain release SQL artefacts. Remote resets require a matching local database cache; the
plan and dependencies are checked again under the SQL delivery lock.

Statistics initialisation first restores the Geographic Divisions prerequisites.
Divisions reconciliation recreates missing draft compositions from retained primary
snapshots; geographic initialisation then restores C&SD district and area-type inputs
and publishes complete Divisions release sets before the remaining statistics uploads.

General and district C&SD uploads retain a versioned
[processing provenance result](../processing-provenance.md) before publication. It
captures registered normalisation and scaling declarations, execution counts, reviewed
field/measure/geography fixtures and API-field declarations. It contains no publisher or
canonical value packs. Recorded translations are individual curations; publisher labels
and origin-unrecorded labels remain reviewed bulk metadata.

Normalisation, population scaling, geography-identity and field/localisation
declarations live in `fixtures/meta/processing-rules/`. The canonical normalisation
cache uses the `censtatd-packed-statistic-normalisation-v2` contract and includes
registered rule definitions in its identity alongside source inputs and reviewed
metadata.

Merge ruleset entries for scaling and field curation reference these same definitions;
their resolved hashes include the declarations rather than only the reference names.

Publisher attributes are retained in `properties` with source identity, release history,
provenance and native geometry. Extracted measures, period labels and geographic codes
are materialised in canonical history/current records rather than duplicated in source
columns. Separately versioned geometry derivatives retain their exact input hash and
transformation evidence.

Each reference-period snapshot records its exact-release assembly under the
[assembly provenance contract](../pipeline.md#snapshot-assembly-provenance). Periods can
share a recipe; each has its own run and cohort. Remote replay includes the full recipe.

Processing audits live in content-addressed R2 objects; D1 registers the manifest and
attempt status. Audit loads individual pages and readable fixtures lazily, with
free-text search. Failed blocking guards remain inspectable and prevent publication.

Local source and canonical SQL use native receipt-backed delivery plans. Interrupted
payload replay resumes from retained SQL without repeating committed writes; local
metadata preparation remains part of the owning workflow. See
[SQL delivery](../sql-delivery.md).

Both Statistics importers build source and canonical SQL lazily inside plan preparation.
A retained local or remote plan skips those builders, and source and canonical SQL
arrays need not coexist in memory. Reviewed canonical values, dictionaries and Division
bridge resolutions contribute to a row-wise preparation checksum; changed preparation
cannot silently reuse retained SQL. Source-file checksums, canonical input identities
and field review are checked before delivery.

General and district imports retain checksummed source-row artefacts scoped to the
release, prepared-file checksum and processing contract. Retries reuse decoded source
rows and their original timestamps instead of repeating Parquet decoding and source
hashing. First-run general source preparation normalises one Parquet batch at a time; it
does not retain a second full raw-row array or allocate a Promise per row. Canonical
Division mappings and field curation are not cached with source rows.

Prepared rows stream into independently checksummed binary chunks, normally bounded at 4
MiB; an oversized row occupies its own chunk. An ordered, checksummed manifest is
published only after every chunk is durable. Resume verifies chunks individually and
does not allocate a serialised buffer for the complete cohort. Canonical processing
still materialises the decoded row collection.

Field-discovery and curated canonical normalisation have separate content-addressed
caches for cohorts larger than 18 source rows. The fixed district cohort and smaller
inputs normalise directly, avoiding persistent-cache overhead. Cache identities include
ordered source inputs, resolved Division mappings, area-companion configuration and
field/measure metadata. Identical retries reuse the normalised sections; changed inputs
calculate a new result. Field review and bridge resolution run outside the cache, and
the SQL plan still rejects changed canonical preparation once sealed.

Source, canonical and release-metadata SQL use
[sealed delivery phases](../sql-delivery.md). Adjacent batches for the same database are
combined into bounded uploads. Receipts and separate local checkpoints allow interrupted
imports to resume from retained SQL without calculating replacement SQL from a partially
updated mirror.

Remote recovery can reattach to an active import by its exact payload ETag after a stale
bookmark or storage reset. It requires the matching receipt before advancing and does
not re-upload or re-ingest uncertain batches.

The Stats API family is the home for published subject-matter observations, not the
operational ingestion and release metrics that are already called `stats` in the
metadata database. Its canonical record is `statsRecords`: one dataset, exact reference
period and semantic geography, with a nullable reviewed canonical `divisionId` and a
flat JSON `values` map containing every dimension-qualified field. Analytical dimensions
belong to the versioned field definitions. List/detail IDs and pagination identify these
geography/period packs; maps and time series continue to select one field's values.

List and detail responses include the matching versioned `statistic-fields` resources by
default. Each definition appears once in the document's `included` array, with its
dimensions, units and requested locale labels. Match each value's
`fieldDefinitionHashes` entry to the definition's `versionHash`. An explicit `include`
list replaces the default: use `include=none` to omit included resources, or
`include=fields,divisions` to request definitions and related divisions. Response
permalinks pin the resolved include selection. Geography and series responses retain
their single-field shapes.

The initial C&SD District Land Area, Population and Density releases write two distinct
layers. The source shard preserves C&SD's numeric `DC` and complete source record. The
history shard resolves `DC` only through the reviewed C&SD numeric and HAD district-code
bridges, then records the canonical `divisionId`, canonical `districtCode`, reference
year and measures. This prevents a publisher identifier from being mistaken for a
SaanSeoi district code.

These reviewed identity mappings live in `fixtures/meta/curations/identity/`. Ingestion
reads the version-controlled curations directly and validates their content hashes;
metadata synchronisation does not materialise identity mappings. Public identifier
discovery uses the [release-scoped identity lookup](../../identity-bridge.md).

Canonical Stats records expose that reviewed SaanSeoi `districtCode` as
`geography.code`; the publisher's numeric `DC` remains only in source provenance and the
constructed `sourceFeatureRef`.

When a reviewed statistic has an area companion, its dataset fixture declares
`areaCompanionByReferencePeriod`. Ingestion resolves that declaration for each
observation and stores its `domainCode`, `variant` and `cohortKey` in
`geography.areaCompanion`. Thus bare `include=areas` and `include=divisions` use the
geometry and canonical division domain explicitly reviewed for the record's own
reference period; the API never infers either from a dataset name, delivery release, or
the Geographic domain's Overture default. A qualified `areas:<variant>` request changes
only the variant and retains that stored cohort. If that exact counterpart is
unavailable, it returns `409 variant_cohort_unavailable` rather than falling back. The
response permalink qualifies the resolved variant.

For the C&SD density releases, the updater parses its locally prepared publisher ZIP and
records the mirrored archive's managed key and SHA-256 in source provenance. Only GML
members are expanded, with explicit entry-count and uncompressed-size limits. Remote
publication still builds SQL using the corresponding local target-database cache.

## C&SD combined ingestion

The `hkgov-censtatd:statistics` importer normally materialises the Statistics snapshot
and any `division` or `divisionArea` geography companions available in the same C&SD
archive. Passing `--defer-stats-release-set` changes the default to Statistics-only
ingestion; `--include-geography` explicitly restores the geography fan-out for that run.
`--geography-only` skips the Statistics snapshot and processes only the available
geography companions. These resource uploads share the prepared archive and source
provenance, but Statistics and Divisions release-set publication remain separate: use
`--defer-api-release-set` when the Divisions release set must also remain deferred.

Publisher delivery and statistical reference time are separate storage concerns. Raw
source records remain in the source shard selected by the publisher release's delivery
year. Canonical `statsRecords` history is split by `referencePeriodEndYear`; periods
ending before 2025 use `DB_HISTORY_HK_BEFORE`. A period spanning more than one year uses
its end year. For example, a 2026 compilation row for 2016 remains raw source evidence
in the 2026 source shard while its canonical history record and snapshot belong to
`BEFORE` and cohort `2016`.

The current shard serves the latest published values independently for each dataset,
exact `referencePeriodCode` and semantic geography. Geography identity includes kind,
code, class and any stable namespace; it excludes publisher release/version and geometry
companion vintage. Building groups use their parent Housing Market Area as a namespace.
New annual releases preserve earlier periods. A partial revision replaces only supplied
fields; omitted fields and geographies remain available. An explicit suppression or
unavailable value replaces the corresponding value.

Both current and history store the same complete packs, `fieldSources` and
`fieldDefinitionHashes`. Each field keeps the provenance of its last real value or
definition change. A content version covers values, field meanings, canonical division
linkage and reviewed geography metadata, including its companion. Unchanged reissues
reuse that version without rewriting either canonical row or adding a
snapshot-membership row for it. Source assertions and publication metadata retain the
new release's evidence.

History stores immutable complete versions only for changed packs, sharded by the
reference period's end year. `snapshotVersionChanges` records sparse `statsRecord`
upserts along the snapshot parent chain; a snapshot with no changed packs inherits its
parent's complete state. Publication promotes changed selected packs into current.
Deferred or incomplete ingestion does not replace published current data.

`statsPublicationState` holds one readiness checkpoint per dataset and exact reference
period. Its selected `snapshotId` and `publishing`/`current` status gate API reads while
changed packs and their definitions are promoted. Earlier periods retain independent
checkpoints; unchanged reissues update publication metadata without rewriting packs.

Unlike lineage-scoped families, this checkpoint gates promotion of the dataset/period's
changed packs and has no delivery-token columns. Current pack identity remains
independent of the publication snapshot. The shared
[publication-state contract](../publication-state-plan.md) describes this deliberate
boundary and the common API readiness checks.

Ordinary Stats requests use current for every reference period. Explicit release-set,
catalogue or time selectors use history when they resolve to an older publication;
selecting an older reference year alone does not select an older revision.

The [retained-data rebuild procedure](stats-rebuild.md) prepares packed current/history
content from consistent SQLite exports. It preserves source evidence, exact values and
publication status, and validates replacement content before a maintenance cutover.

Canonical-history replay uses immutable inserts with bounded statement sizes for packs,
dictionary versions and sparse snapshot changes, so each D1 import stays within SQLite's
expression-depth limit.

Each source release materialises one snapshot under the uploaded dataset code for each
distinct exact reference period. Statistics release sets use that period code as their
cohort and composition members match it with `exact_ref`. Dataset-code members are
optional because not every dataset publishes every period; a later dataset or corrected
compilation creates a new immutable revision only for the affected period. The first
compilation is an unadorned initial release set; later source contributions use `-r1`,
`-r2`, and so on.

API field fixtures cover the exact reference-period snapshot anchors and canonical
source-schema signatures used by bootstrap, including annual Population and Household
periods from 2016 through 2025 and the Permanent Living Quarters district period
`2023-Q3`. A publisher delivery label such as `2026-Q2` does not substitute for those
periods. Each primary member of a composed cohort can supply its lineage anchor;
unreviewed source-schema combinations remain blocked.

Packed values use exact decimal strings or canonical categorical codes. The retained
publisher assertion preserves original property names and literals; normalisation also
records precision and status for structural release statistics. Field and measure
dictionaries remain small, shared metadata. Both current and history retain immutable
content versions referenced by each pack's `fieldDefinitionHashes`; a partial correction
can therefore retain several field-definition versions in the same dataset. Field hashes
cover analytical dimensions, statistical meaning, localisations and the linked measure
version. Localisations share their owning field or measure hash. Readers join these
exact versions, independently of source-release markers or `isCurrent`.

Source geometry stays in provenance until a reviewed geometry is released through the
Divisions family. There is no multiplier column or separate statistical-geography
registry.

Every C&SD publisher field requires a reviewed entry in
`fixtures/meta/curations/hkgov-censtatd-statistics/`. One manifest per dataset assigns
its stable canonical `fieldName`, retains the publisher `sourceField`, assigns a
reviewed `statisticKind` (`count`, `quantity`, `proportion`, `ratio`, `rate`, `density`,
or `index`) and a separate `aggregation` (`none`, `total`, `mean`, `median`, and related
forms). Median and percentile aggregations also record `aggregationPercentile` (50 for a
median; otherwise the named rank from 0 to 100), and the dictionary supplies the
English, Traditional Chinese, and Simplified Chinese measure dictionary. A proportion,
ratio, rate, or density can also name its canonical `denominatorFieldName`. These
semantics are independent of `valueKind` (numeric or categorical) and `unitCode`.
`measureCode` identifies the underlying dimension-free concept, while `fieldName`
retains any aggregation qualifier needed to distinguish published values; the structured
aggregation metadata remains authoritative. `periodicity` records a field's named
interval, such as `week` or `month`, separately from the observation's reference period.
Units are registered metadata in `fixtures/meta/units`; an unrecognised unit prompts for
its dimension, symbol, English name, and definition before it is persisted and
synchronised. Azure Translator fills Traditional and Simplified Chinese unit names and
definitions from those English prompt values. The registered CSDI Simplified Data
Specification is a review candidate retained as provenance. The CLI first displays
compact metadata with the stable source-release portal URL, then a proposal of
`sourceField -> fieldName`, its reviewed-unit suggestion, and the English/Traditional
Chinese/Simplified Chinese name and description together. The unit suggestion is drawn
only from compatible, previously reviewed canonical measure names; it is never admitted
without review. On rejection, CSDI's English name and description become the editable
defaults. If either changes, Azure Translator supplies new Chinese defaults; accepting
those machine values unchanged records `isTranslationVerified=false`. Official CSDI
locale rows remain verified. `--yes` refuses every uncurated field.

When a publisher explicitly says that a classification changed between reference
periods, the field dictionary records a structured `comparability` caution with the
reason and affected earlier periods. It warns consumers to treat cross-period
comparisons carefully; it neither invalidates the value nor becomes an analytical
dimension.

Source identifiers are retained as provenance or geography references and are not
statistic values. A reviewed unit always describes the reported numeric value, rather
than a category or range embedded in the publisher field name.

The curation prompt permits `none`, `mean`, `median`, `minimum`, `maximum`, and
`percentile` for every statistic kind. It permits `total` only for `count` and
`quantity`: summing a proportion, ratio, rate, density, or index does not preserve that
statistic kind.

When a later field has the same proposed English description after only its age group is
removed, the CLI reuses a unique prior series decision as the prompt defaults for
statistic kind, aggregation, and denominator measure. Each remains reviewable. Semantic
statistic-kind defaults recognise explicit terms such as `proportion`, `percentage`, and
`ratio` before falling back to the canonical key or unit.

Apply the
[C&SD measure naming policy](../sources/hkgov-censtatd/divisionStatistics.md#measure-naming-policy)
when reviewing its source fields: human-facing names identify the measure, while
descriptions and reviewed metadata record its statistical expression.

The reviewed schema provenance retains its declared `Null Option` as nullable
`sourceNullOption`; SaanSeoi's observation-status normalisation remains independent. An
intentionally unmapped canonical unit is stored as `publisher-unknown`, never inferred.
The source-release Stats tab then exposes the release's measure dictionary with its
definition, unit, and observation count. Counts come from the source resource's
structural `observations` facts grouped by field, including unchanged reissues; they do
not count all retained dictionary versions or require new canonical source-release
markers. Definitions resolve through that source's snapshot ancestry and the packs'
exact field hashes. Its structural cards at the end show the reviewed statistic kinds
and aggregations; `valueKind` remains an ingestion detail.

Permanent Living Quarters and HMA are approved source-release fan-outs. Permanent Living
Quarters creates the three Geographic-domain level-1 areas; HMA creates the separate
C&SD Housing Market Area domain. Their observations carry the matching deterministic
canonical `divisionId`. Building Group centroids remain source-only for a future
buildings projection.

The current candidate inventory is maintained in
[`C&SD division statistics`](../sources/hkgov-censtatd/divisionStatistics.md).

## Initial Statistics publication

`./bin/saanseoi init:stats:government --target local` ingests the Government Statistics
launch set, defers intermediate Statistics release-set publication, and bootstraps the
completed cohorts once. Each reference period is therefore first published as one
complete unadorned initial release set. Bootstrap considers every published Stats-family
source and selects its linked `divisionStatistic` snapshots, so a source whose primary
artefact is C&SD geometry contributes both its geometry and its Statistics periods.

The C&SD subdivided-units district source is one logical dataset with distinct 2016
By-census and 2021 Census releases. Each release retains its own CSDI source and
statistical-geography cohort.

Rules that consume identity mappings retain the selected bridge fixtures alongside their
execution counts. Audit cards can also display the same release’s retained geography
bridge as shared evidence for those rules. Bridge tables show publisher identities and
codes, SaanSeoi division codes and canonical identities; UUIDs use a middle ellipsis
with the full identity available on hover.

## Publisher source boundary

Publisher values, acquisition references, original geometry and canonical resolutions
follow the [source record storage contract](../source-records.md). Field renaming and
flattening preserve upstream values; corrections and resolved identities remain outside
`properties`.

## API release statistics

The Stats tab describes each frozen API release at its exact reference period. Counts
resolve its Statistics snapshots through sparse parent ancestry, including unchanged
reissues whose snapshots contain no new packs. Exact `fieldDefinitionHashes` select
field definitions and labels. Supporting geometry and lookup sources do not contribute
statistical records. Duplicate shard copies count once; conflicting versions, missing
contributing datasets and missing field definitions stop calculation.

Metrics include geographic packs, observations, referenced field-definition versions,
dataset-qualified measures, datasets, reference periods, geography types, canonical
division linkage, field coverage, published/suppressed/unavailable values,
numeric/categorical values, statistical kinds, aggregations and units. Field-label
coverage uses the distinct field definitions referenced in that cohort as its
denominator; unverified labels remain explicit. Unlinked geography is a coverage fact,
not an assertion that a match is incorrect. Publisher values remain strings and are
never summed to produce these metrics.

Primary-record churn compares the preceding release with the same API version, domain,
region and period granularity. Packs match by dataset and geography kind, code, class
and namespace. Changed packs have different field/value mappings, field-definition
hashes, canonical division linkage or geometry companion domain/variant. Values are
compared as literal strings, including suppression and unavailable markers. Exact
reference periods and geometry companion cohorts are excluded from this cross-period
comparison, as are source provenance and record-version metadata.

Within each continuing geography, identical payloads match first, remaining pairs count
as changed, and unmatched packs count as added or removed. Added, changed and unchanged
sum to the selected release's count; removed, changed and unchanged sum to the preceding
count. A first release counts every pack as added.

Structural changes independently count added, removed and retained field, measure and
geography identities against that same preceding release. They do not compare numerical
values. The first comparable release has no structural change baseline.

Publication and reconciliation calculate these presentation facts. To rebuild all local
published releases without re-ingestion or changing snapshot membership:

```fish
bun apps/harbour-cli/src/cli.ts stats:backfill-statistics --target local --dry-run
bun apps/harbour-cli/src/cli.ts stats:backfill-statistics --target local
```

Use `--release CODE[,CODE...]` to select API releases. The backfill prepares and
validates every selected release before replacing any saved presentation statistics.

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

## API field inputs

Field provenance separates publisher properties from registry values, reviewed curation
and intermediate results. Period mappings name the actual dataset fields or release
context. Value mappings identify the individual publisher measure fields and reviewed
curation entries. Retained property keys use camelCase, with original field spellings
preserved in provenance and curation. Processing-rule references are pinned to the
definitions captured by the selected releases.

Source storage and public records use `properties` for retained attributes. API-field
inputs reference this path through the shared dataset-scoped `publisherFields` mapping.
Processing-rule definitions remain in their registered fixtures and are pinned by the
selected release.

Retained locale-bearing labels use `En`, `ZhHant` and `ZhHans` suffixes, for example
`buildingNameEn` and `dcZhHant`. Publisher mappings place these labels after other
properties. Original publisher paths and language dictionary identifiers retain their
spelling; demographic measures about language are not locale-bearing labels.
