---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2011--hkgov-pland-pu"
apiReleaseSetRevision: "0"
regionCode: "hk"
cohortKey: "2011"
domainCode: "hkgov-pland-pu"
primarySourceRelease: "dr-hk-hkgov-pland-division-pu-2011"
primarySourceReleaseUrl: "/sources/ds-hk-hkgov-pland-division-pu/dr-hk-hkgov-pland-division-pu-2011"
---

# EN

## Changelog

- <orange>Upstream</orange> publishes the <black>{{ cohortKey }}</black> <i>Planning
  Department</i> Planning Unit and subunit cohort.

## Revision log

- `r{{ apiReleaseSetRevision }}` adds <black>division</black> and
  <black>division-area</black> from the source release.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- <black>Planning Units</black> and <black>subunits</black> are planning geographies,
  not <black>District Council districts</black>. Their identifiers are specific to the
  <black>Planning Department</black>; matching provider codes retain their identity
  across cohorts, while each cohort records its own hierarchy and geometry.
- Some general Divisions fields are blank (<black>null</black>) because the source does
  not provide them. This is expected.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> for publisher-specific compatibility and
  quality decisions.

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 發布 <black>{{ cohortKey }}</black>
  <i>規劃署</i>規劃單位及分區 cohort。

## 修訂紀錄

- `r{{ apiReleaseSetRevision }}` 從來源發布加入 <black>division</black> 及
  <black>division-area</black>。

## 發布範圍

此不可變的 [發布集](saanseoi:zh-hant:definition/release-set/v1) 發布
{{regionName:zh-Hant}} 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)
[cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black>。以下來源發布組成此發布集。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- <black>規劃單位</black>及<black>分區</black>屬規劃地理單元，而非
  <black>區議會分區</black>。其識別碼屬於<black>規劃署</black>；相同發布者代碼可跨 cohort 保持身分，而各 cohort 仍記錄自己的層級及幾何。
- 部分一般 Divisions 欄位因來源未提供而為空值 (<black>null</black>)。這是預期行為。
- 請參閱 <black>{{ primarySourceRelease }}</black>
  的 [來源發布說明]({{ primarySourceReleaseUrl }})，以了解發布者特有的相容性及品質決定。

# ZH-HANS

## 更新记录

- <orange>上游</orange> 发布 <black>{{ cohortKey }}</black>
  <i>规划署</i>规划单位及分区 cohort。

## 修订记录

- `r{{ apiReleaseSetRevision }}` 从源发布加入 <black>division</black> 及
  <black>division-area</black>。

## 发布范围

此不可变的 [发布集](saanseoi:zh-hans:definition/release-set/v1) 发布
{{regionName:zh-Hans}} 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)
[cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black>。以下源发布构成此发布集。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- <black>规划单位</black>及<black>分区</black>属规划地理单元，而非
  <black>区议会分区</black>。其标识符属于<black>规划署</black>；相同发布者代码可跨 cohort 保持身份，而各 cohort 仍记录自己的层级及几何。
- 部分一般 Divisions 字段因源未提供而为空值 (<black>null</black>)。这是预期行为。
- 请参阅 <black>{{ primarySourceRelease }}</black>
  的 [源发布说明]({{ primarySourceReleaseUrl }})，以了解发布者特有的兼容性及质量决定。
