---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2021--hkgov-censtatd-hma"
regionCode: "hk"
cohortKey: "2021"
domainCode: "hkgov-censtatd-hma"
---

# EN

## Changelog

- Initial SaanSeoi release for the <i>C&SD</i>'s Housing Market Area domain.

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

- <black>Housing Market Areas</black> are Census geographies. Their `HMA_21C` codes
  identify this domain; they do not refer to the same areas as any of the
  <black>Overture</black> divisions, even when their names overlap.
- `BG_21C` <black>Building Group</black> points remain source history and statistics
  dimensions. They have no polygonal geometry, so they are not promoted to Divisions
  geometry or assigned an arbitrary canonical division.
- Some general Divisions fields are blank (<black>null</black>) because the source does
  not provide them. This is expected.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> for publisher-specific compatibility and
  quality decisions.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 對<i>政府統計處</i>房屋市場區域 domain 的初始發布。

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

- <black>房屋市場區域</black>屬人口普查地理單元。其 `HMA_21C`
  代碼識別此domain；即使名稱重疊，亦不代表與任何 <black>Overture</black>
  division 指向相同範圍。
- `BG_21C`
  <black>樓宇組群</black>點保留於來源歷史及統計維度。它們沒有多邊形幾何，因此不會升格為 Divisions 幾何，亦不會被任意指派為標準區劃。
- 部分一般 Divisions 欄位因來源未提供而為空值 (<black>null</black>)。這是預期行為。
- 請參閱 <black>{{ primarySourceRelease }}</black>
  的 [來源發布說明]({{ primarySourceReleaseUrl }})，以了解發布者特有的相容性及品質決定。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 对<i>政府统计处</i>房屋市场区域 domain 的初始发布。

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

- <black>房屋市场区域</black>属人口普查地理单元。其 `HMA_21C`
  代码标识此domain；即使名称重叠，也不代表与任何 <black>Overture</black>
  division 指向相同范围。
- `BG_21C`
  <black>楼宇组群</black>点保留于来源历史及统计维度。它们没有多边形几何，因此不会升格为 Divisions 几何，也不会被任意指定为规范区划。
- 部分一般 Divisions 字段因源未提供而为空值 (<black>null</black>)。这是预期行为。
- 请参阅 <black>{{ primarySourceRelease }}</black>
  的 [源发布说明]({{ primarySourceReleaseUrl }})，以了解发布者特有的兼容性及质量决定。
