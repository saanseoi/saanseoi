---
createdAt: "2026-10-15T09:08:50.441Z"
updatedAt: "2026-10-15T09:08:50.441Z"
apiFamily: "addresses"
apiVersion: "api-addresses-v0.1"
apiReleaseSet: "data-hk-addresses-2026-09-23.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-09-23.0"
publisherReleaseDate: "2026-08-19"
domainCode: "saanseoi"
---

# EN

## Changelog

- <orange>Upstream</orange> Adds supplementary addresses from Overture Places for
  <black>{{ cohortKey }}</black> to the existing ALS addresses from the
  <black>{{publisherReleaseDate}}</black> delivery.

## Revision log

- `r{{ revision }}` contains the selected ALS source release, supplementary Overture
  Places addresses, and supporting geographic source releases.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

Use <black>filter[dataset]</black> to select a contributing dataset. Supplementary
addresses retain their Overture Places attribution; they are not government-verified ALS
addresses.

{{addressNotesAndLimitations:en}}

### Curation policy

{{addressCurationPolicy:en}}

### Known Quality Issues

{{addressKnownQualityIssues:en}}

# ZH-HANT

## 更新紀錄

- 發布 <black>{{publisherReleaseDate}}</black> 的 ALS 地址，並納入
  <black>{{ cohortKey }}</black> Overture Places 中獲接納的補充地址。

## 修訂紀錄

- `r{{ revision }}` 包含選定的 ALS 來源發布、Overture
  Places 補充地址及支援地理來源發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

使用 <black>filter[dataset]</black> 選擇貢獻資料集。補充地址保留 Overture
Places 來源歸屬，並非經政府核實的 ALS 地址。

{{addressNotesAndLimitations:zh-Hant}}

### 整理政策

{{addressCurationPolicy:zh-Hant}}

### 已知品質問題

{{addressKnownQualityIssues:zh-Hant}}

# ZH-HANS

## 更新记录

- 发布 <black>{{publisherReleaseDate}}</black> 的 ALS 地址，并纳入
  <black>{{ cohortKey }}</black> Overture Places 中获接纳的补充地址。

## 修订记录

- `r{{ revision }}` 包含选定的 ALS 源发布、Overture Places 补充地址及支持地理源发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

使用 <black>filter[dataset]</black> 选择贡献数据集。补充地址保留 Overture
Places 源归属，并非经政府核实的 ALS 地址。

{{addressNotesAndLimitations:zh-Hans}}

### 整理政策

{{addressCurationPolicy:zh-Hans}}

### 已知质量问题

{{addressKnownQualityIssues:zh-Hans}}
