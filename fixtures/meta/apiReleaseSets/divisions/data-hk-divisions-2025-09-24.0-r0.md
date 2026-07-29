---
createdAt: "2026-07-06T14:47:17.924Z"
updatedAt: "2026-07-06T14:47:17.924Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2025-09-24.0"
regionCode: "hk"
cohortKey: "2025-09-24.0"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi Divisions API release for Hong Kong.
- Publishes the first immutable Overture-domain view for cohort
  <black>{{ cohortKey }}</black>.
- Provides canonical division records with opt-in area and boundary companions. Geometry
  remains provider-specific; it is never silently merged or substituted.

## Release scope

This release is the initial <black>overture</black> domain release for the Hong Kong
Divisions API. Its primary collection is the Overture division snapshot for this cohort.
Area and boundary companions are selected according to the published composition policy:
the Overture geometry _must_ be from the same overture release version, while
independently published district-area variants may select from an earlier date.

The release adds the reviewed PRC country anchor used by the Hong Kong extract to
resolve parent and boundary references. It is a referent-only record: it has names and
identity, but no country geometry. This does not add a PRC coverage claim to the Hong
Kong release.

## Using the Divisions API

The <black>v0.1</black> contract is experimental. Use either <black>GET
/v0.1/divisions</black> or <black>GET /v0.1/divisions/{id}</black>; the
<black>/v0</black> aliases resolve to the same contract today.

Start with the default Overture collection:

```url
/v0.1/divisions
```

By default it will get the latest release. To select this exact effective cohort use
<black>cohort</black> and <black>domain</black> parameters:

```url
/v0.1/divisions?domain=overture&cohort=2025-09-24.0
```

Use <black>releaseSet=data-hk-divisions-2025-09-24.0</black> together with the resolved
catalogue revision when replaying a saved result. Successful responses return those
resolved values and a fully qualified <black>links.permalink</black>; retain that link
when a result must be reproducible.

### Domains

A domain is one coherent collection of divisions, not a filter over a combined table.
Records and hierarchy relationships from different domains are not mixed.

- <black>overture</black> is the default geographical/administrative collection. Use it
  for the release documented here.
- <black>hkgov-pland-pu</black> is the Planning Department's _Planning Unit_ collection.
- <black>hkgov-pland-new-town</black> is the Planning Department's _New Town_
  collection.

You may select a planning collection explicitly, for example:

```url
/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021
/v0.1/divisions?domain=hkgov-pland-new-town&cohort=2021
```

Those domains have their own cohorts and release sets; they are not members of this
Overture release. A request succeeds only where the selected catalogue contains a
release for that domain and cohort.

### Geometry and hierarchy

Division records stay compact unless relationships are requested. Use plural
<black>include</black> values:

```url
/v0.1/divisions?include=hierarchy
/v0.1/divisions?include=areas
/v0.1/divisions?include=boundaries
/v0.1/divisions?include=areas:hkgov-had
/v0.1/divisions?include=areas:hkgov-censtatd:2021&transform=simplified
```

An unqualified area or boundary uses the selected domain's configured default. A
qualified value requests that exact provider variant; unavailable variants return an
error rather than falling back to another source. Area and boundary resources are
returned in <black>included</black>, with relationships from their primary divisions.

Use <black>filter[level]</black>, <black>filter[divisionType]</black>, or
<black>filter[parent]</black> to narrow a list, and <black>page[limit]</black> and
<black>page[offset]</black> for pagination. The maximum page size is 100.

### Languages (`I18n`)

The default name selection is <black>en,zh-hant</black>. Set
<black>locales=en,zh-hant</black>, <black>locales=*</black>, or another supported list
explicitly when the response is stored or compared.

### Response Shape

<black>profile</black> controls the response shape; use the permalink to capture its
resolved default.

### Time Travel

Use <black>effectiveAt</black> to select the release effective at a time, and
<black>knownAt</black> to select what the API catalogue knew at a time. Use
<black>catalogRevision</black> for an exact publication checkpoint. These selectors make
it possible to distinguish a later backfill from the view that was previously published.

## Notes and limitations

- This release establishes the Overture domain; it does not make planning units or new
  towns interchangeable with Overture divisions.
- Geometry coverage is sparse and opt-in.
- The release preserves source provenance and exposes the selected domain, cohort, and
  catalogue in response metadata. Consult the linked source-release notes for detailed
  field compatibility and provider-specific quality decisions.
