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

The current candidate inventory is maintained in
[`C&SD division statistics`](../sources/hkgov-censtatd/divisionStatistics.md).

The C&SD subdivided-units district source is one logical dataset with distinct 2016
By-census and 2021 Census releases. Each release retains its own CSDI source and
statistical-geography cohort.
