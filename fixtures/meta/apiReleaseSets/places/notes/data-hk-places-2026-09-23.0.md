---
createdAt: "2026-09-25T05:47:23.826Z"
updatedAt: "2026-09-25T05:47:23.826Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2026-09-23.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-09-23.0"
---

# EN

## Changelog

- Publishes the Overture Places snapshot for <black>{{ cohortKey }}</black>.
- <orange>Upstream</orange> Removed the deprecated <black>categories</black> property,
  including <black>categories.primary</black> and <black>categories.alternate</black>.
  Use <black>taxonomy</black> or <black>basic_category</black> instead.

## Revision log

- `r{{ revision }}` contains the Place source release and the supporting Address and
  Division releases selected by the Places API composition.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- The Place collection is anchored to the Overture Place source release for this cohort.
  You can pull the source records with
  <black>/places/v0.1/sources?sourceRelease={{primarySourceRelease}}</black>. Follow
  <black>nextCursor</black> for further JSON pages, or add <black>format=ndjson</black>
  to stream the records. Add <black>include=geometry</black> to expose the retained
  source geometry separately.
- Address context is supplementary. `address2dId` is populated only when the Place
  address can be matched to the selected ALS snapshot; this release does not resolve an
  `address3dId`. This is a future improvement.
- Division relationships are derived from the reviewed address link. A Place without an
  ALS link can have an empty Division relationship.
- Place geometry is a point for positioning and indexing. H3 indexes and full-text
  search are derived projections of the Place snapshot.
- Operating status is publisher data, not an independent SaanSeoi verification that a
  Place is open.
- The Places API exposes canonical <black>basicCategory</black> and
  <black>taxonomy</black> fields.
- H3 and full-text indexes are derived projections of the selected Place snapshot.

# ZH-HANT

## 更新紀錄

- 發布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 移除已棄用的 <black>categories</black> 欄位，包括
  <black>categories.primary</black> 及 <black>categories.alternate</black>。請改用
  <black>taxonomy</black> 或 <black>basic_category</black>。
- <orange>Upstream</orange>
  全球 Place 數量由 73,631,092 增至 81,455,425（+10.63%）。BrightQuery 的覆蓋範圍由美國擴展至德國、意大利及丹麥，並在美國加入更多
  <black>services_and_business</black> 類別地點。
- <orange>Upstream</orange> 全球標示為 <black>open</black>
  的 Place 由 11,047,288 增至 18,361,914（+66.2%），改善營業狀態的資料覆蓋。

以上數字描述全球上游資料集，並非香港子集。請參閱
[Overture 九月發布附註](https://docs.overturemaps.org/blog/2026/09/23/release-notes/#places)。

## 修訂紀錄

- `r{{ revision }}` 包含 Place 來源發布，以及由 Places API
  composition 選取的 Address 及 Division 支援發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- Places API 提供標準 <black>basicCategory</black> 及 <black>taxonomy</black> 欄位。
- Operating status 是發布者資料，並非山水對 Place 開放狀態的獨立核實。
- H3 及全文索引是所選 Place snapshot 的衍生 projection。

# ZH-HANS

## 更新记录

- 发布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 移除已弃用的 <black>categories</black> 字段，包括
  <black>categories.primary</black> 及 <black>categories.alternate</black>。请改用
  <black>taxonomy</black> 或 <black>basic_category</black>。
- <orange>Upstream</orange>
  全球 Place 数量由 73,631,092 增至 81,455,425（+10.63%）。BrightQuery 的覆盖范围由美国扩展至德国、意大利及丹麦，并在美国加入更多
  <black>services_and_business</black> 类别地点。
- <orange>Upstream</orange> 全球标示为 <black>open</black>
  的 Place 由 11,047,288 增至 18,361,914（+66.2%），改善营业状态的数据覆盖。

以上数字描述全球上游数据集，并非香港子集。请参阅
[Overture 九月发布说明](https://docs.overturemaps.org/blog/2026/09/23/release-notes/#places)。

## 修订记录

- `r{{ revision }}` 包含 Place 源发布，以及由 Places API
  composition 选择的 Address 及 Division 支持发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- Places API 提供标准 <black>basicCategory</black> 及 <black>taxonomy</black> 字段。
- Operating status 是发布者数据，并非山水对 Place 开放状态的独立核实。
- H3 及全文索引是所选 Place snapshot 的派生 projection。
