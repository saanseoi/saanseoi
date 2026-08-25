---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-20T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2026-01-21.0"
regionCode: "hk"
cohortKey: "2026-01-21.0"
domainCode: "geographic"
---

# EN

## Changelog

- <orange>Upstream</orange> Overture refreshed OSM data and made minor incremental data
  updates.

## Revision log

- `r{{ revision }}` contains 7 source snapshots.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- Read the source release notes linked in the
  [Release scope table](#source-heading-release-scope) for decisions about data quality
  and compatibility that are specific to each publisher.
- Areas and boundaries from different providers are separate alternatives. Including
  them in this release does not make them interchangeable or combine their geometry.
- C&SD area companions describe the 2016 and 2021 census geographies. Use each with its
  corresponding census cohort, not as a permanently current administrative boundary.
- The Overture <black>boundary</black> companion is only available for district-level
  divisions.
- Does not include Overture attributes that are sparse or unsuitable for Hong Kong,
  including `population`, `local_type`, and district-capital fields.

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> Overture 更新 OSM 資料，並作出輕微、逐步的資料更新。

## 修訂紀錄

- `r{{ revision }}` 包含 7 個來源 snapshot。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 cohort <black>{{ cohortKey }}</black> 的
<black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

## 組成來源發布

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- 請參閱[發布範圍表](#release-scope)連結的來源發布附註，以了解各發布者特有的資料品質及相容性決定。
- 不同發布者的面及邊界是分開的選項。它們存在於此發布中，不代表可互換，亦不會合併其幾何。
- 政府統計處面配套描述 2016 年及 2021 年的人口普查地理範圍。請將每個配套用於相應的人口普查 cohort，而非視作持續有效的行政邊界。
- Overture <black>boundary</black> 配套只適用於地區級區劃。
- 不提供稀疏或不適用於香港的 Overture 屬性，包括 `population`、`local_type`
  及地區首府欄位。

# ZH-HANS

## 更新记录

- <orange>上游</orange> Overture 更新 OSM 数据，并作出轻微、渐进式的数据更新。

## 修订记录

- `r{{ revision }}` 包含 7 个来源 snapshot。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 cohort <black>{{ cohortKey }}</black> 的
<black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下来源发布组成此 release set。

## 组成来源发布

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- 请参阅[发布范围表](#release-scope)链接的来源发布说明，以了解各发布者特有的数据质量及兼容性决定。
- 不同发布者的面及边界是分开的选项。它们存在于此发布中，不代表可互换，也不会合并其几何。
- 政府统计处面配套描述 2016 年及 2021 年的人口普查地理范围。请将每个配套用于相应的人口普查 cohort，而非视作持续有效的行政边界。
- Overture <black>boundary</black> 配套只适用于地区级区划。
- 不提供稀疏或不适用于香港的 Overture 属性，包括 `population`、`local_type`
  及地区首府字段。
