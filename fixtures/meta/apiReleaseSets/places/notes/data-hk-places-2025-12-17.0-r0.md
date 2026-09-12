---
createdAt: "2026-09-09T00:00:00.000Z"
updatedAt: "2026-09-09T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2025-12-17.0"
revision: "0"
regionCode: "hk"
cohortKey: "2025-12-17.0"
domainCode: "overture"
---

# EN

## Changelog

- Publishes the Overture Places snapshot for <black>{{ cohortKey }}</black>.
- The upstream notes combine this release with the unavailable
  <black>2025-11-19.0</black> Places release.
- <orange>Upstream</orange> Added <black>taxonomy</black>, which now supplies canonical
  primary, hierarchy, and alternate taxonomy values.
- <orange>Upstream</orange> Added about 5,000 POIs from AllThePlaces.

## Revision log

- `r{{ revision }}` contains the Place source release and the required supporting
  Address and Division source releases selected by the Places API composition.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- The Place collection is anchored to the Overture Place source release for this cohort.
  You can pull the source records with
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2025-12-17.0</black>.
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
- The new upstream taxonomy changes source coverage, not the Places API contract.
  Earlier cohorts retain the documented category fallback; compare values only within
  their selected release set.
- H3 and full-text indexes are derived projections of the selected Place snapshot.

# ZH-HANT

## 更新紀錄

- 發布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- 上游附註將此發布與不可用的 <black>2025-11-19.0</black> Places 發布合併說明。
- <orange>Upstream</orange> 新增
  <black>taxonomy</black>，現供應標準的主要、階層及替代 taxonomy 值。
- <orange>Upstream</orange> 從 AllThePlaces 新增約 5,000 個 POI。

## 修訂紀錄

- `r{{ revision }}` 包含 Place 來源發布，以及由 Places API
  composition 選取的所需 Address 及 Division 支援來源發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- Operating status 是發布者資料，並非 SaanSeoi 對 Place 開放狀態的獨立核實。

- 新的上游 taxonomy 改變來源覆蓋，並非 Places
  API 合約。較早 cohort 保留已記錄的類別 fallback；請只在所選 release set 內比較值。
- H3 及全文索引是所選 Place snapshot 的衍生 projection。

# ZH-HANS

## 更新记录

- 发布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- 上游说明将此发布与不可用的 <black>2025-11-19.0</black> Places 发布合并说明。
- <orange>Upstream</orange> 新增
  <black>taxonomy</black>，现供给标准的主要、层级及替代 taxonomy 值。
- <orange>Upstream</orange> 从 AllThePlaces 新增约 5,000 个 POI。

## 修订记录

- `r{{ revision }}` 包含 Place 源发布，以及由 Places API
  composition 选择的所需 Address 及 Division 支持源发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- Operating status 是发布者数据，并非 SaanSeoi 对 Place 开放状态的独立核实。

- 新的上游 taxonomy 改变源覆盖，并非 Places
  API 合约。较早 cohort 保留已记录的类别 fallback；请只在所选 release set 内比较值。
- H3 及全文索引是所选 Place snapshot 的派生 projection。
