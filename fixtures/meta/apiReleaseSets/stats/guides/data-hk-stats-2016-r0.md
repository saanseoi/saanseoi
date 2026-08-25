---
createdAt: "2026-08-21T00:00:00.000Z"
updatedAt: "2026-08-21T00:00:00.000Z"
apiFamily: "stats"
apiVersion: "api-stats-v0.1"
apiReleaseSet: "data-hk-stats-2016-r0"
revision: "0"
regionCode: "hk"
cohortKey: "2016"
domainCode: "official"
primarySourceRelease: "dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016"
primarySourceReleaseUrl: "/sources/ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district/dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016"
---

# EN

## Using the Statistics API

{{apiKeyNote:en}}

The <black>v0.1</black> contract is experimental. Use either <black>GET
/stats/v0</black> or <black>GET /stats/v0/{id}</black>

Start with the official statistics collection:

```url
/stats/v0
```

### Latest release and observation

There are two independent meanings of “latest”:

1. **Latest release revision** selects the newest revision of a release set, unless a
   permalink or catalogue revision pins an older revision.
2. **Latest statistical observation** selects the newest reference period for one
   statistical series.

Divisions has effectively one temporal series in each domain, so its default selects one
latest cohort or release set. Statistics has many independent series: a population
measure may be annual, another quarterly, another monthly, and a census measure may have
no later observation.

The official Statistics view is therefore:

```url
/stats/v0
```

It selects the latest native observation for each independent statistical series from
the newest revision of that observation’s period release set. It is not a complete
history: when a monthly series has a 2026-08 observation, its 2026-01 through 2026-07
observations are older and are not returned by a latest selection.

Use the exact reference-period filter when the requested scope needs to be explicit:

```url
/stats/v0?filter[referencePeriod]=2016
```

This selects records with the exact reference-period code within the resolved release
set. The API does not currently provide range, all-period, or latest-per-series temporal
selection modes.

| Family                                 | Default temporal selection                           |
| -------------------------------------- | ---------------------------------------------------- |
| Divisions                              | Latest cohort for the selected domain                |
| Statistics                             | Latest observation of each independent native series |
| Statistics with `referencePeriod=2016` | Exact reference-period records                       |

Without selectors, the endpoint resolves the latest effective release in the current
[catalogue](saanseoi:en:definition/catalogue/v1). To select this exact release, set
<black>cohort</black> and <black>domain</black>:

```url
/stats/v0?domain={{ domainCode }}&cohort={{ cohortKey }}
```

To reproduce a result after the catalogue changes, retain the successful response's
fully qualified <black>links.permalink</black>. It records the resolved
<black>releaseSet</black> and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1). You can also select
this release set explicitly with <black>releaseSet={{ apiReleaseSet }}</black>.

### Domains

A [domain](saanseoi:en:definition/domain/v1) is one independently versioned lineage, not
a filter over unrelated releases.

- <black>{{ domainCode }}</black> is the only Statistics domain in v0.1. It contains the
  C&SD dataset snapshots published for this exact reference period and revision.

Every primary resource identifies its <black>datasetCode</black>, so datasets remain
distinguishable inside the domain. Use <black>filter[dataset]</black>,
<black>filter[division]</black>, <black>filter[referencePeriod]</black>, or
<black>filter[measure]</black> to narrow a list:

```url
/stats/v0?filter[division]=division-hk-18&filter[referencePeriod]=2016
```

Use <black>page[limit]</black> and <black>page[offset]</black> for pagination. The
maximum page size is 100.

### Statistics and related geography

Each statistic retains its exact publisher reference period, dimensions, values,
precision, observation status, and reviewed measure semantics. A reviewed
<black>divisionId</black> is exposed as <black>relationships.division</black>; records
whose geography has not been reviewed keep that relationship null.

Related resources are opt-in and separately selectable:

```url
/stats/v0?include=divisions
/stats/v0?include=areas
/stats/v0?include=divisions,areas
/stats/v0?include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> returns the canonical division resources in
<black>included</black>. <black>include=areas</black> has explicit default handling:
each linked observation resolves the reviewed area variant for its own geography cohort,
such as <black>hkgov-censtatd:2016</black>, <black>hkgov-censtatd:2021</black>,
<black>hkgov-censtatd-area</black>, or <black>hkgov-censtatd-hma</black>. A qualified
area include requests that exact provider [variant](saanseoi:en:definition/variant/v1);
an unavailable variant returns an error rather than silently substituting other
geometry.

### Languages (`I18n`)

By default, reviewed measure names and descriptions are provided in English and
Traditional Chinese. This is equivalent to <black>locales=en,zh-hant</black>. Set
<black>locales=*</black> to request every available locale, or pass another supported
comma-separated list.

### Response Shape

A [profile](saanseoi:en:definition/profile/v1) is a named response shape. The default
profile returns reference periods, dimensions, values, units, statistic kinds,
aggregations, and localised measure definitions. <black>compact</black> is smaller,
while <black>full</black> adds publisher field names, source literals, source-release
identity, and timestamps. See the
[Statistics endpoint documentation](/docs#tag/Statistics/operation/listDivisionStatisticsV01)
for the current parameter and field contract.

### Time Travel

Use <black>effectiveAt</black> to select the release effective at a time. Use
<black>knownAt</black> to select what the API
[catalogue](saanseoi:en:definition/catalogue/v1) knew at a time, and
<black>catalogRevision</black> for one exact published checkpoint. Records are read from
the source releases selected by that immutable release set, so a later source
compilation does not alter a saved permalink.
