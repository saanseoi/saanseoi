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

## Changelog

- First 山水 | SaanSeoi Statistics API release set for <black>{{cohortKey}}</black> for
  {{regionName:en}}.

## Revision Log

- `r{{ apiReleaseSetRevision }}` establishes the initial compiled view for reference
  period <black>{{ cohortKey }}</black>, using the source snapshots listed below.

## Release Scope

This [release](saanseoi:en:definition/release/v1) establishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for the Hong
Kong Statistics API. It is a single view of statistics for reference period
<black>{{ cohortKey }}</black>. SaanSeoi does not republish a whole source dataset
unchanged. Instead, it takes the observations for this reference period from each
relevant dataset and compiles them together.

A source dataset can publish figures for earlier periods as well as its own publication
period. That means a newly available dataset may add statistics for {{ cohortKey }}, or
a corrected source may improve the {{ cohortKey }} compilation. When that happens,
SaanSeoi creates a new, immutable revision of this {{ cohortKey }} release set; the
saved revision remains unchanged.

This differs from the Divisions API, where a newer source dataset will usually replace
an older one as the current view moves forward. A statistical observation remains
relevant for the period it describes. Older cohorts therefore continue to be available,
and each one can gain additional observations from later-published source datasets.

The following source releases contributed to this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- This revision contains observations whose exact reference period is
  <black>{{ cohortKey }}</black>.
- Values are exact decimal text or categorical codes, not floating-point approximations.
  The <black>full</black> profile also preserves the original publisher literal.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> and the other contributing source releases
  for publisher-specific definitions and quality decisions.

## ZH

{{apiReleaseSetSources:zh-Hant}}

{{apiReleaseSetSources:zh-Hans}}
