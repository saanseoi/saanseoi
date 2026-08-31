---
createdAt: "2026-08-26T15:01:19.797Z"
updatedAt: "2026-08-26T15:01:19.797Z"
apiFamily: "stats"
apiVersion: "api-stats-v0.1"
apiReleaseSet: "data-hk-stats-2023-r0"
revision: "0"
regionCode: "hk"
cohortKey: "2023"
---

# EN

## Changelog

- First 山水 | SaanSeoi Statistics API release set for {{regionName:en}}, covering the
  <black>{{ cohortKey }}</black> reference period.

## Revision Log

- `r{{ revision }}` adds the initial statistics datasets for the
  <black>{{ cohortKey }}</black> reference period. The added datasets and their source
  releases are listed below.

## Release Scope

This [release](saanseoi:en:definition/release/v1) makes selected {{ domainCode }}
statistics for {{regionName:en}} available through the SaanSeoi Statistics API. It
covers the <black>{{ cohortKey }}</black> reference period: the time that the figures
describe, not necessarily the date when the source was published.

The <black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) groups
these statistics published by departments within the Hong Kong SAR Government. Rather
than copying an entire source dataset unchanged, SaanSeoi selects the figures that
describe this reference period and presents them as one collection. Each figure remains
connected to the source release that supplied it.

A source can be published after the period it describes. It may therefore add figures
for {{ cohortKey }}, or correct figures already included here. In either case, SaanSeoi
publishes a new numbered revision of this release set. Earlier revisions are kept
unchanged, so a saved result can always be traced back to the version used.

Statistics are organised by the period they describe. This means older reference periods
remain available even when newer figures have been published, and later source releases
can add to a past period where appropriate.

The following source releases contributed to this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- This revision includes only figures whose exact reference period is
  <black>{{ cohortKey }}</black>. It does not include every figure published during that
  calendar year.
- Values are retained exactly, including precise decimal values and publisher codes. The
  <black>full</black> response profile also includes the original value supplied by the
  publisher.
- Different sources may use their own definitions, units, coverage, and quality checks.
  Read the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black>, as well as the notes for the other listed
  source releases, before comparing or interpreting their figures.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 首個涵蓋 {{regionName:zh-Hant}} <black>{{ cohortKey }}</black>
  參考期的 Statistics API 發布集。

## 修訂紀錄

- `r{{ revision }}` 新增了 <black>{{ cohortKey }}</black>
  參考期的初始統計資料集。新增的資料集及其來源發布列於下方。

## 發布範圍

此 [release](saanseoi:zh-hant:definition/release/v1) 透過 SaanSeoi Statistics API 提供
{{regionName:zh-Hant}} 的選定 <black>{{ domainCode }}</black> 統計資料。它涵蓋
<black>{{ cohortKey }}</black> 參考期：即數值所描述的時間，而不一定是來源發布的日期。

<black>{{ domainCode }}</black> [domain](saanseoi:zh-hant:definition/domain/v1)
匯集香港特別行政區政府各部門發布的這些統計資料。SaanSeoi 不會原封不動地複製整個來源資料集，而是選取描述這個參考期的數值，並作為一個集合提供。每個數值均保留與其所屬來源發布的連結。

來源可以在其所描述的期間之後才發布。因此，它可能為 {{ cohortKey }}
新增數值，或更正已包括在此的數值。無論哪種情況，SaanSeoi 都會發布這個發布集的新編號修訂版。較早的修訂版會保持不變，因此已儲存的結果總能追溯至所使用的版本。

統計資料按其描述的期間組織。這表示即使已有較新的數值，較早的參考期仍然可用；較後發布的來源亦可在適當時為過往期間加入資料。

以下來源發布為此發布集作出貢獻。

## 組成來源發布

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- 此修訂版只包括參考期完全為 <black>{{ cohortKey }}</black>
  的數值，並不包括在該曆年發布的所有數值。
- 數值會按原樣保留，包括精確的小數數值和發布者代碼。<black>full</black>
  回應 profile 亦包括發布者提供的原始數值。
- 不同來源可能採用各自的定義、單位、涵蓋範圍及品質檢查。比較或詮釋數值前，請閱讀
  <black>{{ primarySourceRelease }}</black> 的 [source-release
  notes]({{ primarySourceReleaseUrl }})，以及其他列出來源發布的附註。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 首个涵盖 {{regionName:zh-Hans}} <black>{{ cohortKey }}</black>
  参考期的 Statistics API 发布集。

## 修订记录

- `r{{ revision }}` 新增了 <black>{{ cohortKey }}</black>
  参考期的初始统计数据集。新增的数据集及其来源发布列于下方。

## 发布范围

此 [release](saanseoi:zh-hans:definition/release/v1) 通过 SaanSeoi Statistics API 提供
{{regionName:zh-Hans}} 的选定 <black>{{ domainCode }}</black> 统计数据。它涵盖
<black>{{ cohortKey }}</black> 参考期：即数值所描述的时间，而不一定是来源发布的日期。

<black>{{ domainCode }}</black> [domain](saanseoi:zh-hans:definition/domain/v1)
汇集香港特别行政区政府各部门发布的这些统计数据。SaanSeoi 不会原封不动地复制整个来源数据集，而是选取描述这个参考期的数值，并作为一个集合提供。每个数值均保留与其所属来源发布的链接。

来源可以在其所描述的期间之后才发布。因此，它可能为 {{ cohortKey }}
新增数值，或更正已包括在此的数值。无论哪种情况，SaanSeoi 都会发布这个发布集的新编号修订版。较早的修订版会保持不变，因此已保存的结果总能追溯至所使用的版本。

统计数据按其描述的期间组织。这表示即使已有较新的数值，较早的参考期仍然可用；较后发布的来源也可在适当时为过往期间加入数据。

以下来源发布为此发布集作出贡献。

## 组成来源发布

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- 此修订版只包括参考期完全为 <black>{{ cohortKey }}</black>
  的数值，并不包括在该历年发布的所有数值。
- 数值会按原样保留，包括精确的小数数值和发布者代码。<black>full</black>
  响应 profile 也包括发布者提供的原始数值。
- 不同来源可能采用各自的定义、单位、涵盖范围及质量检查。比较或诠释数值前，请阅读
  <black>{{ primarySourceRelease }}</black> 的 [source-release
  notes]({{ primarySourceReleaseUrl }})，以及其他列出来源发布的说明。
