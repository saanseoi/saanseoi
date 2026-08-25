---
createdAt: "2026-08-19T00:00:00.000Z"
updatedAt: "2026-08-19T00:00:00.000Z"
dataset: "ds-hk-hkgov-censtatd-division-statistic-major-housing-estates"
release: "dr-hk-hkgov-censtatd-division-statistic-major-housing-estates-2021"
regionCode: "hk"
source: "hkgov-censtatd"
sourceVersion: "2021"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1695182015782_79001"
releaseVersion: "2021.0"
type: "divisionStatistic"
cohortKey: "2021"
hkgovCenstatdCuration: "fixtures/meta/curations/hkgov-censtatd-statistics/major-housing-estates-2021.json"
measureCuration: "fixtures/meta/curations/hkgov-censtatd-statistics-measures/major-housing-estates.json"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release.
- <orange>Upstream</orange> Add [C&SD](saanseoi:en:definition/hkgov-censtatd/v1)'s
  {{ sourceVersion }} Census statistics for Major Housing Estates.

## Versioning

This source release is versioned as <black>{{ releaseVersion }}</black>, from the
publisher's <black>{{ sourceVersion }}</black> Census cohort. A source release preserves
that statistical geography and its reviewed measures; a later CSDI archive slot does not
create a new version when its publisher package is unchanged.

## Compatibility

### Directly Retained Fields

The original C&SD property name and literal are retained with every observation as
<black>sourceField</black> and <black>sourceValue</black>. They remain available for
publisher provenance and do not become API field names.

### Normalised Fields

Each reviewed source field becomes a canonical statistics observation with a stable
<black>measureCode</black>, statistic kind, aggregation, unit, status, reference period,
and localised measure offering. The source geometry and feature identity remain attached
to the release-owned statistics series.

### Measure offerings

The measureCode [naming convention](saanseoi:en:note/hkgov-censtatd-measure-naming/v1)
and [detailing](saanseoi:en:note/hkgov-censtatd-measure-offerings/v1) separate a
readable statistical name from its exact definition.

## Measure mapping

The reviewed mapping below is generated from this release's C&SD
[measure curation manifest](saanseoi:en:definition/hkgov-censtatd-measure-curation-manifest/v1).

{{hkgovCenstatdMeasureTable:en}}

# ZH-HANT

## 變更記錄

- 山水 | SaanSeoi 初始版本。
- <orange>上游</orange> 新增 [C&SD](saanseoi:zh-hant:definition/hkgov-censtatd/v1) 的
  {{ sourceVersion }} 年人口普查主要屋苑統計資料。

## 版本控制

此來源發布使用發布者 <black>{{ sourceVersion }}</black> 年人口普查批次，版本為
<black>{{ releaseVersion }}</black>。來源發布保留該統計地理範圍及經審核的指標；其發布者套件如無變更，日後的 CSDI 歸檔時段不會建立新版本。

## 相容性

### 直接保留欄位

每項觀測均保留原始 C&SD 屬性名稱及字面值，分別為 <black>sourceField</black> 和
<black>sourceValue</black>。它們用於發布者來源追溯，並不會成為 API 欄位名稱。

### 正規化欄位

每個經審核的來源欄位均會成為標準統計觀測，並附有穩定的
<black>measureCode</black>、統計種類、匯總方式、單位、狀態、參考時段及在地化指標 offering。來源幾何及要素識別碼會保留在該發布專屬的統計 series 上。

### 指標 offering

已發布的 <black>measureCode</black> 遵循
[統計指標命名慣例](saanseoi:zh-hant:note/hkgov-censtatd-measure-naming/v1)。其易讀名稱及精確納入準則遵循
[指標 offering 慣例](saanseoi:zh-hant:note/hkgov-censtatd-measure-offerings/v1)。

## 指標對應

以下經審核的對應表由此發布的
[C&SD 指標整理清單](saanseoi:zh-hant:definition/hkgov-censtatd-measure-curation-manifest/v1)
產生。

{{hkgovCenstatdMeasureTable:zh-Hant}}

# ZH-HANS

## 变更记录

- 山水 | SaanSeoi 初始版本。
- <orange>上游</orange> 新增 [C&SD](saanseoi:zh-hans:definition/hkgov-censtatd/v1) 的
  {{ sourceVersion }} 年人口普查主要屋苑统计数据。

## 版本控制

此来源发布使用发布者 <black>{{ sourceVersion }}</black> 年人口普查批次，版本为
<black>{{ releaseVersion }}</black>。来源发布保留该统计地理范围及经审核的指标；其发布者套件如无变更，日后的 CSDI 归档时段不会建立新版本。

## 兼容性

### 直接保留字段

每项观测均保留原始 C&SD 属性名称及字面值，分别为 <black>sourceField</black> 和
<black>sourceValue</black>。它们用于发布者来源追溯，并不会成为 API 字段名称。

### 规范化字段

每个经审核的来源字段均会成为标准统计观测，并附有稳定的
<black>measureCode</black>、统计种类、汇总方式、单位、状态、参考时段及本地化指标 offering。来源几何及要素标识符会保留在该发布专属的统计 series 上。

### 指标 offering

已发布的 <black>measureCode</black> 遵循
[统计指标命名惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-naming/v1)。其易读名称及精确纳入准则遵循
[指标 offering 惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-offerings/v1)。

## 指标对应

以下经审核的对应表由此发布的
[C&SD 指标整理清单](saanseoi:zh-hans:definition/hkgov-censtatd-measure-curation-manifest/v1)
产生。

{{hkgovCenstatdMeasureTable:zh-Hans}}
