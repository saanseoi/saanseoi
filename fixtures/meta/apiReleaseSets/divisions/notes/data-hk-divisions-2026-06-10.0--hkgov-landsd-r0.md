---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2026-06-10.0--hkgov-landsd"
regionCode: "hk"
cohortKey: "2026-06-10.0"
domainCode: "hkgov-landsd"
---

# EN

## Changelog

- Initial SaanSeoi release for the <i>Lands Department</i>'s settlement domain.
- <orange>Upstream</orange> adds the Place Name database dated
  <black>{{ cohortKey }}</black>.
- Publishes <black>PLACE_CLASS=Settlement</black> records as point divisions; the other
  native gazetteer records remain in source history.

## Revision log

- `r{{ revision }}` adds a <black>point division</black> from the source release.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- This domain contains <black>settlement place names</black> only, it does not provide
  an administrative hierarchy.
- <black>Hydrographic</black> and <black>Topographic</black> source records remain
  outside the Divisions projection.
- Some general Divisions fields are blank (<black>null</black>) because the source does
  not provide them. This is expected.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> for publisher-specific compatibility and
  quality decisions.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 對<i>地政總署</i>聚居地 domain 的初始發布。
- <orange>上游</orange> 加入日期為 <black>{{ cohortKey }}</black> 的地名資料庫。
- 將 <black>PLACE_CLASS=Settlement</black>
  記錄發布為點區劃；其餘原生地名錄記錄仍保留於來源歷史。

## 修訂紀錄

- `r{{ revision }}` 從來源發布加入 <black>point division</black>。

## 發布範圍

此不可變的 [發布集](saanseoi:zh-hant:definition/release-set/v1) 發布
{{regionName:zh-Hant}} 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)
[cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black>。以下來源發布組成此發布集。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- 此 domain 只包含<black>聚居地名稱</black>，並非<black>區議會分區</black>或行政層級。<black>Hydrographic</black>
  及 <black>Topographic</black> 來源記錄仍在 Divisions projection 以外。
- 部分一般 Divisions 欄位因來源未提供而為空值 (<black>null</black>)。這是預期行為。
- 請參閱 <black>{{ primarySourceRelease }}</black>
  的 [來源發布說明]({{ primarySourceReleaseUrl }})，以了解發布者特有的相容性及品質決定。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 对<i>地政总署</i>聚居地 domain 的初始发布。
- <orange>上游</orange> 加入日期为 <black>{{ cohortKey }}</black> 的地名数据库。
- 将 <black>PLACE_CLASS=Settlement</black>
  记录发布为点区划；其余原生地名录记录仍保留于源历史。

## 修订记录

- `r{{ revision }}` 从源发布加入 <black>point division</black>。

## 发布范围

此不可变的 [发布集](saanseoi:zh-hans:definition/release-set/v1) 发布
{{regionName:zh-Hans}} 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)
[cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black>。以下源发布构成此发布集。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- 此 domain 只包含<black>聚居地名称</black>，并非<black>区议会分区</black>或行政层级。<black>Hydrographic</black>
  及 <black>Topographic</black> 源记录仍在 Divisions projection 以外。
- 部分一般 Divisions 字段因源未提供而为空值 (<black>null</black>)。这是预期行为。
- 请参阅 <black>{{ primarySourceRelease }}</black>
  的 [源发布说明]({{ primarySourceReleaseUrl }})，以了解发布者特有的兼容性及质量决定。
