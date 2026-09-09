---
createdAt: "2026-09-09T00:00:00.000Z"
updatedAt: "2026-09-09T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2026-08-19.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-08-19.0"
domainCode: "overture"
---

# EN

## Changelog

- Publishes the Overture Places snapshot for <black>{{ cohortKey }}</black>.
- <orange>Upstream</orange> Made major taxonomy and category updates for improved
  clarity.
- <orange>Upstream</orange> Added more detailed <black>operating_status</black> values;
  many more Places are now marked <black>open</black>.
- <orange>Upstream</orange> Deprecated <black>categories</black>, scheduled for removal
  in the September 2026 release in favour of <black>basic_category</black> and
  <black>taxonomy</black>.

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
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2026-08-19.0</black>.
  Follow <black>nextCursor</black> for further JSON pages, or add
  <black>format=ndjson</black> to stream the records. Add
  <black>include=geometry</black> to expose the retained source geometry separately.
- Address context is supplementary. `address2dId` is populated only when the Place
  address can be matched to the selected ALS snapshot; this release does not resolve an
  `address3dId`. This is a future improvement.
- Division relationships are derived from the reviewed address link. A Place without an
  ALS link can have an empty Division relationship.
- Place geometry is a point for positioning and indexing. H3 indexes and full-text
  search are derived projections of the Place snapshot.
- Operating status is publisher data, not an independent SaanSeoi verification that a
  Place is open.
- This source deprecation does not change the Places API contract in this release:
  canonical category and taxonomy fields remain available.
- H3 and full-text indexes are derived projections of the selected Place snapshot.

# ZH-HANT

## 更新紀錄

- 發布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 大幅更新 taxonomy 及 category，以改善清晰度。
- <orange>Upstream</orange> 加入更詳細的 <black>operating_status</black>
  值；更多 Place 現標示為 <black>open</black>。
- <orange>Upstream</orange> 棄用
  <black>categories</black>，預定於 2026 年 9 月發布移除，改用
  <black>basic_category</black> 及 <black>taxonomy</black>。

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

- 此來源棄用不會改變此發布的 Places API 合約：標準 category 及 taxonomy 欄位仍可用。
- Operating status 是發布者資料，並非 SaanSeoi 對 Place 開放狀態的獨立核實。
- H3 及全文索引是所選 Place snapshot 的衍生 projection。

# ZH-HANS

## 更新记录

- 发布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 大幅更新 taxonomy 及 category，以改善清晰度。
- <orange>Upstream</orange> 加入更详细的 <black>operating_status</black>
  值；更多 Place 现标示为 <black>open</black>。
- <orange>Upstream</orange> 弃用
  <black>categories</black>，预定于 2026 年 9 月发布移除，改用
  <black>basic_category</black> 及 <black>taxonomy</black>。

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

- 此源弃用不会改变此发布的 Places API 合约：标准 category 及 taxonomy 字段仍可用。
- Operating status 是发布者数据，并非 SaanSeoi 对 Place 开放状态的独立核实。
- H3 及全文索引是所选 Place snapshot 的派生 projection。
