---
createdAt: "2026-09-06T00:00:00.000Z"
updatedAt: "2026-09-06T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2025-09-24.0"
revision: "0"
regionCode: "hk"
cohortKey: "2025-09-24.0"
domainCode: "overture"
---

# EN

## Changelog

- First 山水 | SaanSeoi Places API release set for {{regionName:en}}.
- Publishes the Overture Places snapshot for <black>{{ cohortKey }}</black> as the
  primary Place collection, with the required address and Division context selected by
  the Places API composition.
- Normalises names, categories, brands, addresses, and publisher provenance into the
  canonical Place model while retaining the original Overture record for inspection.

## Revision log

- `r{{ revision }}` contains the initial Place source release and its required
  supporting address and Division source releases.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- The Place collection is anchored to the Overture Place source release for this cohort.
  Discover its source release with
  <black>/places/v0.1/source-releases?releaseSet=data-hk-places-2025-09-24.0-r0</black>.
  Read retained Overture records with
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2025-09-24.0</black>.
  Follow <black>nextCursor</black> for further JSON pages, or add
  <black>format=ndjson</black> to stream the records. Add
  <black>include=geometry</black> to expose the retained source geometry separately.
- Address context is supplementary. `address2dId` is populated only when the Place
  address can be matched to the selected ALS snapshot; this release does not resolve an
  `address3dId`. An unmatched publisher address remains source data and does not create
  or modify an official ALS address.
- Division relationships are derived from the reviewed address link. A Place without an
  ALS link can have an empty Division relationship; do not infer a Division from point
  geometry.
- Place geometry is a point for positioning and indexing. It is not a boundary and does
  not by itself establish Division membership. H3 indexes and full-text search are
  derived projections of the Place snapshot.
- Overture's September 2025 source release sets every `operating_status` value to
  `open`; this reflects the source release and should not be treated as an independent
  current-status verification.
- Read the source release notes linked in the
  [Release scope table](#source-heading-release-scope) for publisher-specific schema,
  provenance, and compatibility details.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi {{regionName:zh-Hant}} Places API 首個發布集。
- 將 <black>{{ cohortKey }}</black> 的 Overture Places snapshot 作為主要 Place
  collection 發布，並按 Places API composition 選取必要的地址及 Division 背景資料。
- 將名稱、類別、品牌、地址及發布者溯源資料正規化為標準 Place 模型，同時保留原始 Overture 記錄供查閱。

## 修訂紀錄

- `r{{ revision }}` 包含初始 Place 來源發布，以及所需的地址及 Division 支援來源發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- Place collection 以此 cohort 的 Overture Place 來源發布為基礎。使用
  <black>/places/v0.1/source-releases?releaseSet=data-hk-places-2025-09-24.0-r0</black>
  尋找其來源發布。使用
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2025-09-24.0</black>
  讀取保留的 Overture 記錄。沿 <black>nextCursor</black> 取得後續 JSON 頁面，或加入
  <black>format=ndjson</black> 串流傳輸記錄。加入 <black>include=geometry</black>
  可另行取得保留的來源幾何資料。
- 地址背景資料屬於補充資料。只有在 Place 地址能與所選 ALS snapshot 配對時，才會填入
  `address2dId`；此版本不會解析
  `address3dId`。未配對的發布者地址會保留為來源資料，不會建立或修改官方 ALS 地址。
- Division 關係由已審核的地址連結衍生。沒有 ALS 連結的 Place，其 Division 關係可以為空；請勿從點幾何資料推斷 Division。
- Place 幾何資料是用於定位及索引的點，不是邊界，也不會單獨確立 Division 歸屬。H3 索引及全文搜尋是由 Place
  snapshot 衍生的 projection。
- Overture 2025 年 9 月來源發布將所有 `operating_status` 值設定為
  `open`；這反映來源發布，不應視作獨立的目前狀態核實。
- 請參閱[發布範圍表](#source-heading-release-scope)連結的來源發布附註，以了解發布者特有的schema、溯源及相容性資料。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi {{regionName:zh-Hans}} Places API 首个发布集。
- 将 <black>{{ cohortKey }}</black> 的 Overture Places snapshot 作为主要 Place
  collection 发布，并按 Places API composition 选择必要的地址及 Division 背景数据。
- 将名称、类别、品牌、地址及发布者溯源数据规范化为标准 Place 模型，同时保留原始 Overture 记录供查阅。

## 修订记录

- `r{{ revision }}` 包含初始 Place 源发布，以及所需的地址及 Division 支持源发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- Place collection 以此 cohort 的 Overture Place 源发布为基础。使用
  <black>/places/v0.1/source-releases?releaseSet=data-hk-places-2025-09-24.0-r0</black>
  查找其源发布。使用
  <black>/places/v0.1/sources?sourceRelease=dr-hk-overture-place-2025-09-24.0</black>
  读取保留的 Overture 记录。沿 <black>nextCursor</black> 获取后续 JSON 页面，或添加
  <black>format=ndjson</black> 流式传输记录。添加 <black>include=geometry</black>
  可另行获取保留的源几何数据。
- 地址背景数据属于补充数据。只有在 Place 地址能与所选 ALS snapshot 匹配时，才会填入
  `address2dId`；此版本不会解析
  `address3dId`。未匹配的发布者地址会保留为源数据，不会创建或修改官方 ALS 地址。
- Division 关系由已审核的地址链接衍生。没有 ALS 链接的 Place，其 Division 关系可以为空；请勿从点几何数据推断 Division。
- Place 几何数据是用于定位及索引的点，不是边界，也不会单独确立 Division 归属。H3 索引及全文搜索是由 Place
  snapshot 衍生的 projection。
- Overture 2025 年 9 月源发布将所有 `operating_status` 值设为
  `open`；这反映源发布，不应视作独立的当前状态核实。
- 请参阅[发布范围表](#source-heading-release-scope)链接的源发布说明，以了解发布者特有的schema、溯源及兼容性资料。
