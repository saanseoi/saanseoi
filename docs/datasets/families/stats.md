# Statistics dataset family

The Stats API family is the home for published subject-matter observations, not the
operational ingestion and release metrics that are already called `stats` in the
metadata database. Its canonical record is `statsObservations`: an immutable published
observation connected to a source release and reference period, with a nullable reviewed
canonical `divisionId`.

The initial C&SD District Land Area, Population and Density releases write two distinct
layers. The source shard preserves C&SD's numeric `DC` and complete assertion. The
history shard resolves `DC` only through the reviewed C&SD numeric and HAD district-code
bridges, then records the canonical `divisionId`, canonical `districtCode`, reference
year and measures. This prevents a publisher identifier from being mistaken for a
SaanSeoi district code.

For the C&SD density releases, the updater parses its locally prepared publisher ZIP and
records the mirrored archive's managed key and SHA-256 in source provenance. Only GML
members are expanded, with explicit entry-count and uncompressed-size limits. Remote
publication still builds SQL using the corresponding local target-database cache.

The current shard materialises the latest version of each observation across all source
compilations. The history shard keeps superseded observations and dictionaries, so a
later compilation may revise historic reference periods without duplicating them in
current data. This is deliberately not a cohort-based Stats API model: a new optional
dataset member, or historic dimensions added to an existing member, creates the next
Stats family revision. It does not require a shared base cohort across datasets.

The generic observation schema stores exact decimal text (not floats), original source
literals, an optional `valuePrecision`, categorical `valueCode`s, and normalised measure
and dimension dictionaries. There is no multiplier column and no separate
statistical-geography registry. Source geometry stays in provenance until a reviewed
geometry is released through the Divisions family.

Every C&SD publisher field requires a reviewed entry in
`fixtures/meta/curations/hkgov-censtatd-statistics.json`. The entry assigns its stable
canonical `measureCode`, retains the publisher `sourceField`, assigns a reviewed
`statisticKind` (`count`, `quantity`, `proportion`, `ratio`, `rate`, `density`, or
`index`) and a separate `aggregation` (`none`, `total`, `mean`, `median`, and related
forms), and supplies the English, Traditional Chinese, and Simplified Chinese measure
dictionary. A proportion, ratio, rate, or density can also name its canonical
`denominatorMeasureCode`. These semantics are independent of `valueKind` (numeric or
categorical) and `unitCode`. Units are registered metadata in `fixtures/meta/units`; an
unrecognised unit prompts for its dimension, symbol, English name, and definition before
it is persisted and synchronised. Azure Translator fills Traditional and Simplified
Chinese unit names and definitions from those English prompt values. The registered CSDI
Simplified Data Specification is a review candidate retained as provenance. The CLI
first displays compact metadata with the stable source-release portal URL, then a
proposal of `sourceField -> measureCode`, its reviewed-unit suggestion, and the
English/Traditional Chinese/Simplified Chinese name and description together. The unit
suggestion is drawn only from compatible, previously reviewed canonical measure names;
it is never admitted without review. On rejection, CSDI's English name and description
become the editable defaults. If either changes, Azure Translator supplies new Chinese
defaults; accepting those machine values unchanged records
`isTranslationVerified=false`. Official CSDI locale rows remain verified. `--yes`
refuses every uncurated field.

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

The C&SD subdivided-units district source is one logical dataset with distinct 2016
By-census and 2021 Census releases. Each release retains its own CSDI source and
statistical-geography cohort.
