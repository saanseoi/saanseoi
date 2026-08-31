---
createdAt: "2026-08-26T15:01:14.302Z"
updatedAt: "2026-08-26T15:01:14.302Z"
apiFamily: "stats"
apiVersion: "api-stats-v0.1"
apiReleaseSet: "data-hk-stats-2018"
revision: "0"
regionCode: "hk"
cohortKey: "2018"
---

# EN

## Using the Statistics API

For the full reference, see the
[Statistics API docs](/docs#tag/Statistics/operation/listDivisionStatisticsV01).

This guide explains how to make requests to the Statistics API. For the shape and
contents of API <i>responses</i>, see the [response schema](?tab=schema) and
[sample responses](?tab=samples). Each section stands on its own, so you can go straight
to the one you need.

{{apiKeyNote:en}}

{{experimentalApiWarning:en}}

### Latest release and observation

In Statistics, “latest” can mean two different things:

1. **Latest release revision** is the newest published edition of a release set. A
   permalink or catalogue revision can instead select an earlier edition.
2. **Latest statistical observation** is the most recent reference period available for
   one statistical series. A reference period is the time that a figure describes.

Unlike Divisions, Statistics contains many series that are updated on different
schedules. A population measure might be annual, another measure quarterly, and another
monthly. A census measure may not have a newer observation at all.

The official Statistics view is therefore:

```url
/stats/v0
```

It returns the latest available observation for each separate series, using the newest
revision of the release set for that observation’s period. It is not a complete history.
For example, if a monthly series has an observation for {{ cohortYear }}-08, a latest
request does not also return its observations for {{ cohortYear }}-01 through
{{ cohortYear }}-07.

Use an exact reference-period filter when you need a particular period:

```url
/stats/v0?
          filter[referencePeriod]={{ cohortKey }}
```

This returns records with the exact reference-period code in the selected release set.
The list endpoint accepts an exact period only; it does not accept date ranges. For
example, <black>{{ cohortYear }}</black> and <black>{{ cohortYear }}-Q1</black> are
separate codes: requesting <black>{{ cohortYear }}</black> does not also return the
first quarter of {{ cohortYear }}.

To retrieve the complete available history for one field, use the multi-period series
endpoint. It returns one geography-value map per reference period in
<black>valuesByReferencePeriod</black>:

```url
/stats/v0/series?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

<black>filter[field]</black> identifies the series to return.
<black>filter[dataset]</black> prevents a field with the same name in another dataset
from making the request ambiguous. The geography filters select one compatible geography
dimension when the field is available for more than one kind or level of geography. The
endpoint returns an ambiguity error instead of combining incompatible geography or
analytical dimensions.

To retrieve a geography-value map for one exact reference period, use the geography
endpoint. It returns the selected period's values keyed by the geography code in
<black>values</black>:

```url
/stats/v0/geographies?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

Unlike <black>/series</black>, <black>/geographies</black> requires
<black>filter[referencePeriod]</black> because it returns one map. Its dataset and
geography filters have the same disambiguation role, and its
<black>meta.geography</black> describes the codes used as keys. For comparison:

| Family                                            | What a request returns by default               |
| ------------------------------------------------- | ----------------------------------------------- |
| Divisions                                         | The latest cohort in the selected domain        |
| Statistics                                        | The latest observation for each separate series |
| Statistics with `referencePeriod={{ cohortKey }}` | Records for exactly that reference period       |

Without selectors, the endpoint uses the latest effective release in the current
[catalogue](saanseoi:en:definition/catalogue/v1). To request this exact release, specify
both <black>cohort</black> and <black>domain</black>:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}
```

To reproduce a result after the catalogue changes, save the fully qualified
<black>links.permalink</black> from a successful response. It records the selected
<black>releaseSet</black> and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1). You can also request
this release set directly with <black>releaseSet={{ apiReleaseSet }}</black>.

## Shaping the Response

A [profile](saanseoi:en:definition/profile/v1) controls how much detail the API returns.
Use <black>default</black> for the core record: its reference period, geography,
breakdowns, values, and any comparability note. Use <black>full</black> when you also
need source-release identity, the publisher's feature reference, and timestamps.

Use the [response schema](?tab=schema) for the complete field list, or the
[sample responses](?tab=samples) to select a profile and compare the response. For
example, request the full provenance view with:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          profile=full
```

### Statistics and related geography

Each statistic keeps its publisher’s reference period, breakdowns, value, precision,
observation status, and reviewed measure meaning. When its geography has been reviewed,
the statistic has a <black>divisionId</black> and a link at
<black>relationships.division</black>. An unreviewed geography has a null relationship;
this means that no division link is available, not that the value is zero.

To add the canonical division resource for each linked statistic:

```url
/stats/v0?
          include=divisions
```

To add the reviewed area variant for each observation’s own geography cohort:

```url
/stats/v0?
          include=areas
```

To request both the division and its area:

```url
/stats/v0?
          include=divisions,areas
```

To request one exact provider area [variant](saanseoi:en:definition/variant/v1):

```url
/stats/v0?
          include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> adds canonical division resources to
<black>included</black>. <black>include=areas</black> adds the reviewed area variant for
the statistic's geography cohort, such as <black>hkgov-censtatd:2016</black>,
<black>hkgov-censtatd:2021</black>, <black>hkgov-censtatd-area</black>, or
<black>hkgov-censtatd-hma</black>.

If a qualified area variant is unavailable, the API returns an error instead of silently
returning different geometry.

## Discovering Statistics

Use the Statistics Registry to find the datasets and exact field names that the records
endpoint accepts. It searches the available catalogue scope, rather than only the one
release resolved for a normal statistics request. Start by searching a word in a measure
or field name or description:

```url
/stats/v0/registry/search?
          q=household
```

A **measure** is the broad concept, such as domestic households. A **field** is the
exact value you can request; it may carry a particular aggregation, unit, or breakdown.
To browse the measures in this release's dataset:

```url
/stats/v0/registry/measures?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district
```

Then browse its fields, or narrow them to one measure:

```url
/stats/v0/registry/fields?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[measure]=domesticHouseholds
```

After choosing a field, inspect where it is available. This shows its reference periods
and geography coverage, and provides a ready-made geography request for each period:

```url
/stats/v0/registry/fields/ds-hk-hkgov-censtatd-division-statistic-population-households-district/domesticHouseholds/availability
```

Use the returned <black>datasetCode</black> and <black>fieldName</black> to request
statistics. For example:

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}
```

Use <black>cohort</black>, <black>releaseSet</black>, or another catalogue selector on a
registry request when you need discovery limited to a particular published view.

## Adding Languages (`I18n`)

The <black>values</black> object uses canonical field names and exact publisher values;
its numbers and codes are not translated. Request <black>include=fields</black> to add
the matching field definitions in <black>included</black>. They contain the localised
field names and descriptions, alongside units, aggregation, and dimensions.

By default, those definitions are returned in English and Traditional Chinese. This is
the same as requesting <black>locales=en,zh-hant</black>. Use <black>locales=*</black>
for every available language, or provide a supported comma-separated list of languages:

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          include=fields&
          locales=en,zh-hant
```

## Filters & Pagination

Filters narrow a statistics list before it is split into pages. Use
<black>filter[dataset]</black> for one source dataset, <black>filter[field]</black> for
one exact field, <black>filter[division]</black> for one canonical division ID, and
<black>filter[referencePeriod]</black> for one exact period code. A record-list request
uses <black>field</black>, not the broader <black>measure</black> code returned by the
Registry.

For example, this requests one field for one division in the {{ cohortKey }} release:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[division]=106de92f-8a6d-44ba-b2c6-488d181a0deb
```

Use <black>page[limit]</black> and <black>page[offset]</black> to work through the
filtered results. A page can contain at most 100 records:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          page[limit]=25&
          page[offset]=50
```

Follow the response's <black>links.next</black>, <black>links.prev</black>, and
<black>links.first</black> instead of calculating the next offset yourself. Use
<black>meta.page.total</black> to show or plan for the complete filtered result.

## Time Travel

Use <black>effectiveAt</black> to select the release that was effective at a particular
time. Use <black>knownAt</black> to select what the API
[catalogue](saanseoi:en:definition/catalogue/v1) knew at that time, or use
<black>catalogRevision</black> for one exact published checkpoint.

Records come from the source releases selected by that immutable release set. A later
source compilation therefore cannot change the result returned by a saved permalink.

## Domains

A [domain](saanseoi:en:definition/domain/v1) is a separate collection within an API
family. <black>{{ domainCode }}</black> is currently the only domain offered within the
Statistics family, so there are no other domains to explore.
