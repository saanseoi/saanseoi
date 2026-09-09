---
createdAt: "2026-09-09T00:26:38.567Z"
updatedAt: "2026-09-09T00:26:38.567Z"
apiFamily: "addresses"
apiVersion: "api-addresses-v0.1"
apiReleaseSet: "data-hk-addresses-2024-07-25.0"
revision: "0"
regionCode: "hk"
cohortKey: "2024-07-25.0"
domainCode: "saanseoi"
---

# EN

## Changelog

- First 山水 | SaanSeoi Addresses API release set for {{regionName:en}}.
- Publishes the Address Lookup Service snapshot for <black>{{ cohortKey }}</black> as
  the primary Address collection. The nearest (i.e. earliest) Overture Division context
  is selected for inclusion in the Addresses API composition.
- Normalises bilingual formatted addresses, premise components, coordinates, government
  identifiers, and publisher provenance into the canonical Address model.

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

- 山水 | SaanSeoi {{regionName:zh-Hant}} Addresses API 首個發布集。
- 將 <black>{{ cohortKey }}</black> 的政府地址查詢服務 snapshot 作為主要 Address
  collection 發布，並按 Addresses API composition 選取所需的 Overture
  Division 背景資料。
- 將雙語格式化地址、處所組成部分、座標、政府識別碼及發布者溯源資料正規化為標準 Address 模型。

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

- 山水 | SaanSeoi {{regionName:zh-Hans}} Addresses API 首个发布集。
- 将 <black>{{ cohortKey }}</black> 的政府地址查询服务 snapshot 作为主要 Address
  collection 发布，并按 Addresses API composition 选择所需的 Overture
  Division 背景数据。
- 将双语格式化地址、处所组成部分、坐标、政府标识符及发布者溯源数据规范化为标准 Address 模型。

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
