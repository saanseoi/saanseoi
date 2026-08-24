# Statistics dataset family

The Stats API family is the home for published subject-matter observations, not the
operational ingestion and release metrics that are already called `stats` in the
metadata database. Its canonical record is `statsRecords`: an immutable publisher
feature and reference period, with a nullable reviewed canonical `divisionId`,
dimensions, and a complete JSON map of its normalised measures.

The initial C&SD District Land Area, Population and Density releases write two distinct
layers. The source shard preserves C&SD's numeric `DC` and complete assertion. The
history shard resolves `DC` only through the reviewed C&SD numeric and HAD district-code
bridges, then records the canonical `divisionId`, canonical `districtCode`, reference
year and measures. This prevents a publisher identifier from being mistaken for a
SaanSeoi district code.

Canonical Stats records expose that reviewed SaanSeoi `districtCode` as
`geography.code`; the publisher's numeric `DC` remains only in source provenance and the
constructed `sourceFeatureRef`.

For the C&SD density releases, the updater parses its locally prepared publisher ZIP and
records the mirrored archive's managed key and SHA-256 in source provenance. Only GML
members are expanded, with explicit entry-count and uncompressed-size limits. Remote
publication still builds SQL using the corresponding local target-database cache.

Publisher delivery and statistical reference time are separate storage concerns. Raw
assertions remain in the source shard selected by the publisher release's delivery year.
Canonical `statsRecords` history is split by `referencePeriodEndYear`; periods ending
before 2025 use `DB_HISTORY_HK_BEFORE`. A period spanning more than one year uses its
end year. For example, a 2026 compilation row for 2016 remains raw source evidence in
the 2026 source shard while its canonical history record and snapshot belong to `BEFORE`
and cohort `2016`.

The current shard materialises the latest version independently for each stable dataset,
source feature, and exact `referencePeriodCode`. Replaying a later compilation updates
only the periods it contains; an omitted period does not delete an existing current
observation. History retains every source-release-specific record revision in the
reference period's shard.

Each source release materialises one dataset snapshot per distinct exact reference
period. Statistics release sets use that period code as their cohort and composition
members match it with `exact_ref`. Dataset-code members are optional because not every
dataset publishes every period; a later dataset or corrected compilation creates a new
immutable revision only for the affected period.

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
aggregation metadata remains authoritative. Units are registered metadata in
`fixtures/meta/units`; an unrecognised unit prompts for its dimension, symbol, English
name, and definition before it is persisted and synchronised. Azure Translator fills
Traditional and Simplified Chinese unit names and definitions from those English prompt
values. The registered CSDI Simplified Data Specification is a review candidate retained
as provenance. The CLI first displays compact metadata with the stable source-release
portal URL, then a proposal of `sourceField -> fieldName`, its reviewed-unit suggestion,
and the English/Traditional Chinese/Simplified Chinese name and description together.
The unit suggestion is drawn only from compatible, previously reviewed canonical measure
names; it is never admitted without review. On rejection, CSDI's English name and
description become the editable defaults. If either changes, Azure Translator supplies
new Chinese defaults; accepting those machine values unchanged records
`isTranslationVerified=false`. Official CSDI locale rows remain verified. `--yes`
refuses every uncurated field.

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

Area/type and HMA are approved source-release fan-outs. Area/type creates the three
Geographic-domain level-1 areas; HMA creates the separate C&SD Housing Market Area
domain. Their observations carry the matching deterministic canonical `divisionId`.
Building Group centroids remain source-only for a future buildings projection.

The current candidate inventory is maintained in
[`C&SD division statistics`](../sources/hkgov-censtatd/divisionStatistics.md).

## Local C&SD replay reset

Use `./bin/saanseoi stats:reset-censtatd --target local --dry-run` to inspect the local
C&SD statistic releases and rows that would be cleared. Re-run with `--yes` to remove
only their source assertions, canonical statistic rows, ingestion metrics and processing
actions, then mark those releases retryable. It does not remove the C&SD district-area
source assertions or any non-C&SD statistics. Re-ingest with
`./bin/saanseoi update --target local --scope stats --download --yes --check-now`.

The C&SD subdivided-units district source is one logical dataset with distinct 2016
By-census and 2021 Census releases. Each release retains its own CSDI source and
statistical-geography cohort.
