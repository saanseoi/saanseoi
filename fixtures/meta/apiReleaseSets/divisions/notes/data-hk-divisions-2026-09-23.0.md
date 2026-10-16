---
createdAt: "2026-10-11T04:00:00.000Z"
updatedAt: "2026-10-11T04:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2026-09-23.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-09-23.0"
domainCode: "geographic"
---

# EN

<note title="Deprecated API endpoint">
<orange>Deprecated</orange> The <black>/divisions/v0.1</black> API endpoint is deprecated. For new integrations, use <black>/divisions/v0.2</black> and its SaanSeoi inventory. This release documents the Overture inventory; its identities, hierarchy and geometry choices are specific to v0.1. See the [v0.2 guide](/apis/divisions/data-hk-divisions-2026-10-01.0?tab=guide).
</note>

## Changelog

- <orange>Upstream</orange> Uses Overture `2026-09-23.0`, with mostly minor, incremental
  changes and an OSM cut-off date of <black>2026-09-16</black>.
- <orange>Upstream</orange> Overture reports global GERS churn of **1.29%** for Division
  Areas and **0.38%** for Division Boundaries. These are worldwide figures, not Hong
  Kong change rates.
- <orange>Sources</orange> See the
  [September Overture source notes](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-09-23.0)
  for schema `2.0.0`, retained fields and source limitations.

## Revision log

- `r{{ revision }}` contains 5 source snapshots.

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
- The C&SD area companion describes the 2021 census geography. Use it with that census
  cohort, not as a permanently current administrative boundary.
- The Overture <black>boundary</black> companion is only available for district-level
  divisions.
- Does not include Overture attributes that are sparse or unsuitable for Hong Kong,
  including `population`, `local_type`, and district-capital fields.

# ZH-HANT

<note title="已棄用的 API 端點">
<orange>已棄用</orange> <black>/divisions/v0.1</black> API 端點已棄用。新整合請使用 <black>/divisions/v0.2</black> 及其山水 inventory。此發布記錄 Overture inventory；其識別碼、層級及幾何選項屬於 v0.1。請參閱 [v0.2 指南](/apis/divisions/data-hk-divisions-2026-10-01.0?tab=guide)。
</note>

## 更新紀錄

- <orange>上游</orange> 使用 Overture
  `2026-09-23.0`，主要為輕微、漸進式更新；OSM 截止日期為 <black>2026-09-16</black>。
- <orange>上游</orange> Overture 公布的全球 GERS 變動率為 Division Area
  **1.29%**、Division Boundary **0.38%**。這些是全球數字，並非香港變動率。
- <orange>來源</orange> schema
  `2.0.0`、保留欄位及來源限制，請參閱[九月 Overture 來源附註](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-09-23.0)。

## 修訂紀錄

- `r{{ revision }}` 包含 5 個來源 snapshot。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- 請參閱[發布範圍表](#source-heading-release-scope)連結的來源發布附註，以了解各發布者特有的資料品質及相容性決定。
- 不同發布者的面及邊界是分開的選項。它們存在於此發布中，不代表可互換，亦不會合併其幾何。
- 政府統計處面配套描述 2021 年人口普查地理範圍。請用於該人口普查 cohort，而非視作持續有效的行政邊界。
- Overture <black>boundary</black> 配套只適用於地區級區劃。
- 不提供稀疏或不適用於香港的 Overture 屬性，包括 `population`、`local_type`
  及地區首府欄位。

# ZH-HANS

<note title="已弃用的 API 端点">
<orange>已弃用</orange> <black>/divisions/v0.1</black> API 端点已弃用。新集成请使用 <black>/divisions/v0.2</black> 及其山水 inventory。此发布记录 Overture inventory；其标识符、层级及几何选项属于 v0.1。请参阅 [v0.2 指南](/apis/divisions/data-hk-divisions-2026-10-01.0?tab=guide)。
</note>

## 更新记录

- <orange>上游</orange> 使用 Overture
  `2026-09-23.0`，主要为轻微、渐进式更新；OSM 截止日期为 <black>2026-09-16</black>。
- <orange>上游</orange> Overture 公布的全球 GERS 变动率为 Division Area
  **1.29%**、Division Boundary **0.38%**。这些是全球数字，并非香港变动率。
- <orange>来源</orange> schema
  `2.0.0`、保留字段及来源限制，请参阅[九月 Overture 源说明](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-09-23.0)。

## 修订记录

- `r{{ revision }}` 包含 5 个来源 snapshot。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下来源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- 请参阅[发布范围表](#source-heading-release-scope)链接的来源发布说明，以了解各发布者特有的数据质量及兼容性决定。
- 不同发布者的面及边界是分开的选项。它们存在于此发布中，不代表可互换，也不会合并其几何。
- 政府统计处面配套描述 2021 年人口普查地理范围。请用于该人口普查 cohort，而非视作持续有效的行政边界。
- Overture <black>boundary</black> 配套只适用于地区级区划。
- 不提供稀疏或不适用于香港的 Overture 属性，包括 `population`、`local_type`
  及地区首府字段。
