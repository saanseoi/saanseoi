---
createdAt: "2026-09-09T00:00:00.000Z"
updatedAt: "2026-09-09T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2025-10-22.0"
revision: "0"
regionCode: "hk"
cohortKey: "2025-10-22.0"
domainCode: "overture"
---

# EN

## Changelog

- Publishes the Overture Places snapshot for <black>{{ cohortKey }}</black>.
- <orange>Upstream</orange> Added and populated the <black>basic_category</black>
  property. It supplies <black>attributes.basicCategory</black> in the canonical Place
  response; <black>taxonomy.primary</black> continues to use the publisher category in
  this cohort because Overture has not yet added <black>taxonomy</black>.

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
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2025-10-22.0</black>.
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
- This change reflects an Overture schema addition, not a change to the Places API
  contract. Read the linked source-release notes before comparing category values across
  cohorts.
- H3 and full-text indexes are derived projections of the selected Place snapshot.

# ZH-HANT

## 更新紀錄

- 發布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 新增並填入 <black>basic_category</black>
  屬性。它供應標準 Place 回應中的
  <black>attributes.basicCategory</black>；由於此 cohort 的 Overture 尚未新增
  <black>taxonomy</black>，<black>taxonomy.primary</black> 仍使用發布者類別。

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

- 此項變更反映 Overture schema 新增欄位，並非 Places
  API 合約變更。比較不同 cohort 的類別值前，請閱讀連結的來源發布附註。
- H3 及全文索引是所選 Place snapshot 的衍生 projection。

# ZH-HANS

## 更新记录

- 发布 <black>{{ cohortKey }}</black> 的 Overture Places snapshot。
- <orange>Upstream</orange> 新增并填入 <black>basic_category</black>
  属性。它供给标准 Place 响应中的
  <black>attributes.basicCategory</black>；由于此 cohort 的 Overture 尚未新增
  <black>taxonomy</black>，<black>taxonomy.primary</black> 仍使用发布者类别。

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

- 此项变更反映 Overture schema 新增字段，并非 Places
  API 合约变更。比较不同 cohort 的类别值前，请阅读链接的源发布说明。
- H3 及全文索引是所选 Place snapshot 的派生 projection。
