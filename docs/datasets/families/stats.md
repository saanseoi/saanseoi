# Statistics dataset family

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
cache uses the `v1` contract and includes registered rule definitions in its identity
alongside source inputs and reviewed metadata.

Merge ruleset entries for scaling and field curation reference these same definitions;
their resolved hashes include the declarations rather than only the reference names.

Publisher attributes are retained in `rawProperties` with source identity, release
history, provenance and native geometry. Extracted measures, period labels and
geographic codes are materialised in canonical history/current records rather than
duplicated in source columns. Separately versioned geometry derivatives retain their
exact input hash and transformation evidence.

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
metadata database. Its canonical record is `statsRecords`: an immutable publisher
feature and reference period, with a nullable reviewed canonical `divisionId`,
dimensions, and a complete JSON map of its normalised measures.

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

The current shard materialises the latest version independently for each stable dataset,
source feature, and exact `referencePeriodCode`. Replaying a later compilation updates
only the periods it contains; an omitted period does not delete an existing current
observation. History retains every source-release-specific record revision in the
reference period's shard.

Canonical-history replay uses byte-bounded `IN` updates for record identities and short,
bounded composite predicates for dictionary identities, so each D1 import stays within
SQLite's expression-depth limit.

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

Each packed measure value stores exact decimal text (not floats), its original source
literal, an optional `valuePrecision`, and categorical `valueCode`s. Measure and
localised value dictionaries remain normalised because they are small shared metadata.
The current shard keeps the latest dataset dictionaries, while each touched
reference-year history shard keeps the source-release version used with that period's
records. This keeps dictionary selection local to the statistics data and avoids a
cross-shard metadata lookup. There is no multiplier column and no separate
statistical-geography registry. Source geometry stays in provenance until a reviewed
geometry is released through the Divisions family.

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
definition, unit, and observation count. Its structural cards at the end show the
reviewed statistic kinds and aggregations; `valueKind` remains an ingestion detail.

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
