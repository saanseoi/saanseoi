# Statistics dataset family

The Stats API family is the home for published subject-matter observations, not the
operational ingestion and release metrics that are already called `stats` in the
metadata database. Its primary record is `divisionStatistic`: an immutable published
value connected to a reviewed canonical division and reference period.

The initial C&SD District Land Area, Population and Density releases write two distinct
layers. The source shard preserves C&SD's numeric `DC` and complete assertion. The
history shard resolves `DC` only through the reviewed C&SD numeric and HAD district-code
bridges, then records the canonical `divisionId`, canonical `districtCode`, reference
year and measures. This prevents a publisher identifier from being mistaken for a
SaanSeoi district code.

For the C&SD density releases, the updater parses its locally prepared publisher ZIP and
records the mirrored archive's managed key and SHA-256 in source provenance. Remote
publication still builds SQL using the corresponding local target-database cache.

The current schema reserves a snapshot-scoped materialisation for the future `/v0/stats`
and `/v0.1/stats` collection. Its API composition, series registry and query filters are
not activated by this initial source/history publication, so this ingestion does not
claim that a C&SD statistic is an administrative-boundary release.

The current candidate inventory is maintained in
[`C&SD division statistics`](../sources/hkgov-censtatd/divisionStatistics.md).

The C&SD subdivided-units district source is one logical dataset with distinct 2016
By-census and 2021 Census releases. Each release retains its own CSDI source and
statistical-geography cohort.
