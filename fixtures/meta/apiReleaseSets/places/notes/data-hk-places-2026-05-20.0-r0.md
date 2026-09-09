---
createdAt: "2026-09-09T00:00:00.000Z"
updatedAt: "2026-09-09T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2026-05-20.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-05-20.0"
domainCode: "overture"
---

# EN

## Changelog

- Publishes the Overture Places snapshot for <black>{{ cohortKey }}</black>.
- <orange>Upstream</orange> Changed the default <black>operating_status</black> from
  <black>open</black> to null.
- <orange>Upstream</orange> Updated default confidence values for existing providers.

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
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2026-05-20.0</black>.
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
- A null operating status is publisher data, not evidence that a Place is closed or has
  not been verified. Confidence changes are likewise upstream source changes.

# ZH-HANT

## 更新紀錄

- 發布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 將預設 <black>operating_status</black> 由
  <black>open</black> 改為 null。
- <orange>Upstream</orange> 更新現有 provider 的預設 confidence 值。

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

- Operating status 是發布者資料，並非 SaanSeoi 對 Place 開放狀態的獨立核實。

- Null operating
  status 是發布者資料，不代表 Place 已關閉或尚未核實。Confidence 變更同樣是上游來源變更。

# ZH-HANS

## 更新记录

- 发布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 将默认 <black>operating_status</black> 由
  <black>open</black> 改为 null。
- <orange>Upstream</orange> 更新现有 provider 的默认 confidence 值。

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

- Operating status 是发布者数据，并非 SaanSeoi 对 Place 开放状态的独立核实。

- Null operating
  status 是发布者数据，不代表 Place 已关闭或尚未核实。Confidence 变更同样是上游源变更。
