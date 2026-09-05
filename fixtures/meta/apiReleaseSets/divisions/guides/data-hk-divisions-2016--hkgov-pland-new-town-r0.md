---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2016--hkgov-pland-new-town"
regionCode: "hk"
cohortKey: "2016"
domainCode: "hkgov-pland-new-town"
---

# EN

## Using the Divisions API

For the full reference, see the
[Divisions API docs](/docs#tag/divisions/GET/divisions/v0).

This guide explains how to make requests to the Divisions API. For the shape and
contents of API <i>responses</i>, see the [response schema](?tab=schema) and
[sample responses](?tab=samples). Each section stands on its own, so you can go straight
to the one you need.

{{apiKeyNote:en}}

To inspect the source records behind this release, use the
[Divisions source-record endpoint](/docs#tag/Sources/operation/listDivisionSourceRecordsV0).
Pass the required `sourceRelease` query parameter. The response returns the retained
source object under `rawProperties`; these fields are source provenance, not additional
canonical Division fields.

## Requesting data

{{experimentalApiWarning:en}}

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> to get a list of divisions:

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

Every division in the list has an <black>id</black>. Use it with <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> to get one division.

For the same release, keep the domain and cohort in the detail request:

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=full
```

**Version Selection**

Unless you specify a [cohort](saanseoi:en:definition/cohort/v1) or
[domain](saanseoi:en:definition/domain/v1), the API returns records from the
<black>latest</black> cohort in the default <black>geographic</black> domain.

To request records from this specific release, include both selectors:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

The examples below include the cohort and domain for consistency, even where they do not
affect the feature being explained.

## Understanding this domain

This is an independently versioned <black>{{ domainCode }}</black> domain, not a filter
over the default geographic collection. It contains the Planning Department New Town
division snapshot and its exact area companion; records from other domains are never
mixed into the result.

New Towns are planning geographies, not District Council districts. Identities are
cohort-scoped and are not substituted for Planning Units or Overture divisions.

The source does not assert every common Divisions field. Those values are null in this
dataset; use its identifiers, names, geometry, and provenance where available. Do not
infer a district relationship or filter on an empty <black>level</black>,
<black>divisionType</black>, or <black>parent</black> field.

## Shaping the Response

A <black>profile</black> controls how much information each response contains. If you do
not choose one, the API uses <black>default</black>. <black>compact</black> is useful
for a short list, <black>map</black> adds map coordinates, and <black>full</black> adds
geometry and detailed provenance.

{{apiProfileTable:en}}

For a map-ready response, set <black>profile=map</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
```

## Geometry

Set <black>profile=map</black> or <black>profile=full</black> to include the matching
geometry for this cohort. Unlike the <black>geographic</black> domain, this domain has
no companion geometry to select: when the selected profile asks for geometry, the API
returns its matching default area geometry.

## Adding languages

The publisher provides English, Traditional Chinese, and Simplified Chinese names; no
machine translation is used. The default name selection is
<black>locales=en,zh-hant</black>; request <black>locales=en,zh-hant,zh-hans</black> to
include Simplified Chinese. <black>locales=*</black> returns every available locale,
while <black>locales=null</black> omits names.

## Filters & Pagination

Filters only work when the selected domain supplies the field being filtered. In this
release, <black>level</black>, <black>divisionType</black>, and <black>parent</black>
are blank, so use the domain and cohort to select the data, then paginate the list:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
```

Follow <black>links.next</black>, <black>links.prev</black>, and
<black>links.first</black> from the response instead of calculating the next page.

## Time travel

Time travel lets you reproduce an earlier analysis, explain a past response, or separate
a later backfill from what the catalogue knew when a decision was made.

Use <black>effectiveAt</black> to select the release effective at an instant:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt=2025-10-01T00:00:00.000Z
```

Use <black>knownAt</black> to resolve the newest catalogue checkpoint known at an
instant, which excludes later backfills:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt=2026-08-24T04:00:46.011Z
```

Use <black>catalogRevision</black> to pin one immutable published checkpoint. Combine it
with <black>releaseSet</black> when replaying a recorded result:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision=catalog-hk-divisions-v0.1-2026-08-24.11&
                 releaseSet={{ apiReleaseSet }}
```

When selectors overlap, <black>catalogRevision</black> takes precedence over
<black>knownAt</black>, and <black>releaseSet</black> takes precedence over
<black>cohort</black> and <black>effectiveAt</black>.

Every successful response also provides <black>links.permalink</black>: a permanent link
to the resources you loaded. It contains the resolved
[release set](saanseoi:en:definition/release-set/v1) and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1) selectors, so save it
to replay that exact result later.

## Switching domains

A [domain](saanseoi:en:definition/domain/v1) is a separate collection within the
Divisions API. Keep domains separate when comparing results: their identities, geometry,
and fields come from different sources.

{{domains:en}}

## Recover from Failure

The API returns a number of error codes. Here is how to recover from each one:

- `404` from a detail request means that the ID is not in the selected release. Recheck
  the ID and its domain, cohort, and time-travel selectors.
- `422` means that the request is invalid. Read the validation details, then correct the
  selector, filter, locale, or pagination value before trying again.
- `503` with <black>snapshot_not_ready</black> means that no active division snapshot
  matches the selection. Retry after it is published or choose a published release; do
  not treat the response as an empty result.
