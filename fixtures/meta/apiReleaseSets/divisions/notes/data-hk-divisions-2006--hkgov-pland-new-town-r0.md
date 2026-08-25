---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2006--hkgov-pland-new-town"
regionCode: "hk"
cohortKey: "2006"
domainCode: "hkgov-pland-new-town"
---

# EN

## Changelog

- Initial SaanSeoi release for the <i>Planning Department</i>'s New Town domain.

## Revision log

- `r{{ revision }}` adds <black>division</black> and <black>division-area</black> from
  the source release.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- <black>New Towns</black> are planning geographies. Their names are cohort-scoped, so
  the API does not infer an identity across cohorts or from <black>Overture</black>
  divisions, as they do not refer to the same areas even if they have the same names.
- Some general Divisions fields are blank (<black>null</black>) because the source does
  not provide them. This is expected.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> for publisher-specific compatibility and
  quality decisions.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 對<i>規劃署</i>新市鎮 domain 的初始發布。

## 修訂紀錄

- `r{{ revision }}` 從來源發布加入 <black>division</black> 及
  <black>division-area</black>。

## 發布範圍

此不可變的 [發布集](saanseoi:zh-hant:definition/release-set/v1) 發布
{{regionName:zh-Hant}} 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)
[cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black>。以下來源發布組成此發布集。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- <black>新市鎮</black>屬規劃地理單元。其名稱按 cohort 劃分，因此 API 不會跨 cohort 或根據
  <black>Overture</black> divisions 推斷身分；即使名稱相同，其所指面積亦不相同。
- 部分一般 Divisions 欄位因來源未提供而為空值 (<black>null</black>)。這是預期行為。
- 請參閱 <black>{{ primarySourceRelease }}</black>
  的 [來源發布說明]({{ primarySourceReleaseUrl }})，以了解發布者特有的相容性及品質決定。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 对<i>规划署</i>新市镇 domain 的初始发布。

## 修订记录

- `r{{ revision }}` 从源发布加入 <black>division</black> 及
  <black>division-area</black>。

## 发布范围

此不可变的 [发布集](saanseoi:zh-hans:definition/release-set/v1) 发布
{{regionName:zh-Hans}} 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)
[cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black>。以下源发布构成此发布集。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- <black>新市镇</black>属规划地理单元。其名称按 cohort 划分，因此 API 不会跨 cohort 或根据
  <black>Overture</black> divisions 推断身份；即使名称相同，其所指面积也不相同。
- 部分一般 Divisions 字段因源未提供而为空值 (<black>null</black>)。这是预期行为。
- 请参阅 <black>{{ primarySourceRelease }}</black>
  的 [源发布说明]({{ primarySourceReleaseUrl }})，以了解发布者特有的兼容性及质量决定。
