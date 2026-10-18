---
createdAt: "2026-09-09T00:26:38.567Z"
updatedAt: "2026-10-18T05:19:12.219Z"
apiFamily: "addresses"
apiVersion: "api-addresses-v0.1"
apiReleaseSet: "data-hk-addresses-2026-04-03.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-04-03.0"
publisherReleaseDate: "2026-04-03"
domainCode: "saanseoi"
---

# EN

## Changelog

- <orange>Upstream</orange> Digital Policy Office Address Lookup Service (ALS)
  two-dimensional district GeoJSON delivery dated
  <black>{{publisherReleaseDate}}</black>
- <orange>Upstream</orange> Widespread coordinate revision in the publisher's original
  GeoJSON explains the high volume of changed addresses. Compared with `2026-02-04.0`,
  148,990 of 177,985 uniquely matched points with identical non-coordinate properties
  (83.7%) have different coordinates. Across all matched points, the median grid
  displacement is 1.4 metres and 95.3% are within 10 metres. Both longitude/latitude and
  the publisher's easting/northing evidence change upstream of SaanSeoi processing.
- Of the moved points, 141,175 land exactly on the grid position encoded in the CSU
  identifier. This suggests a bulk reconciliation to CSU-associated positions, rather
  than a uniform geographic offset; the publisher's reason has not been established. The
  `2026-04-22.0` delivery retains these positions: only one of 181,951 otherwise
  identical, uniquely matched points changes coordinates.

## Revision log

- `r{{ revision }}` contains the initial Address source release and its supporting
  Division source release.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

{{addressNotesAndLimitations:en}}

### Curation policy

{{addressCurationPolicy:en}}

### Known Quality Issues

{{addressKnownQualityIssues:en}}

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 數字政策辦公室地址查詢服務（ALS）於
  <black>{{publisherReleaseDate}}</black> 交付的二維地區 GeoJSON 資料
- <orange>上游</orange> 發布者原始 GeoJSON 的大規模座標修訂，解釋了大量地址變更。與
  `2026-02-04.0`
  比較，在非座標屬性完全相同且可唯一配對的 177,985 個地址點中，148,990 個（83.7%）的座標不同。所有配對點的網格位移中位數為 1.4 米，95.3% 的位移不超過 10 米。經緯度及發布者的東向／北向座標均已在 SaanSeoi 處理前於上游變更。
- 其中 141,175 個移動點的新網格位置，與 CSU 識別碼所編碼的位置完全一致。這顯示可能是批量將座標與 CSU 關聯位置對齊，而非統一的地理偏移；尚未確立發布者作此修訂的原因。
  `2026-04-22.0`
  交付保留了這批位置：在其餘屬性相同且可唯一配對的 181,951 個點中，只有一個點的座標變更。

## 修訂紀錄

- `r{{ revision }}` 包含初始 Address 來源發布及其支援 Division 來源發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

{{addressNotesAndLimitations:zh-Hant}}

### 整理政策

{{addressCurationPolicy:zh-Hant}}

### 已知品質問題

{{addressKnownQualityIssues:zh-Hant}}

# ZH-HANS

## 更新记录

- <orange>上游</orange> 数字政策办公室地址查询服务（ALS）于
  <black>{{publisherReleaseDate}}</black> 交付的二维地区 GeoJSON 数据
- <orange>上游</orange> 发布者原始 GeoJSON 的大规模坐标修订，解释了大量地址变更。与
  `2026-02-04.0`
  比较，在非坐标属性完全相同且可唯一配对的 177,985 个地址点中，148,990 个（83.7%）的坐标不同。所有配对点的网格位移中位数为 1.4 米，95.3% 的位移不超过 10 米。经纬度及发布者的东向／北向坐标均已在 SaanSeoi 处理前于上游变更。
- 其中 141,175 个移动点的新网格位置，与 CSU 标识码所编码的位置完全一致。这显示可能是批量将坐标与 CSU 关联位置对齐，而非统一的地理偏移；尚未确立发布者作此修订的原因。
  `2026-04-22.0`
  交付保留了这批位置：在其余属性相同且可唯一配对的 181,951 个点中，只有一个点的坐标变更。

## 修订记录

- `r{{ revision }}` 包含初始 Address 源发布及其支持 Division 源发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

{{addressNotesAndLimitations:zh-Hans}}

### 整理政策

{{addressCurationPolicy:zh-Hans}}

### 已知质量问题

{{addressKnownQualityIssues:zh-Hans}}
