# Statistics dataset family

The Stats API family is the home for published subject-matter observations, not the
operational ingestion and release metrics that are already called `stats` in the
metadata database. Its planned primary resource is `divisionStatistic`: an immutable
published value connected to an exact statistical-geography cohort and reference period.

The initial registry entries are deliberately source-only. No C&SD figures are ingested
or exposed until the pending `statisticSeries`, `divisionStatistic`, and
`statisticalGeography` schema design is complete and its Drizzle migrations have been
generated through the normal workflow. This prevents a value from being silently
attached to a non-matching administrative-boundary vintage.

The planned v0.1 collection is `/v0/stats` (with the `/v0.1/stats` alias). It will
eventually support the documented Division Statistics filters and retain source release,
publication date, reference period, unit, measure definition, and the resolved or
unmatched geography cohort for every observation.

The current candidate inventory is maintained in
[`C&SD division statistics`](../sources/hkgov-censtatd/divisionStatistics.md).

The C&SD subdivided-units district source is one logical dataset with distinct 2016
By-census and 2021 Census releases. Each release retains its own CSDI source and
statistical-geography cohort.
