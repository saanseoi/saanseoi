---
createdAt: "2026-08-19T00:00:00.000Z"
updatedAt: "2026-08-19T00:00:00.000Z"
dataset: "ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type"
release: "dr-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type-2023-H2"
regionCode: "hk"
source: "hkgov-censtatd"
sourceVersion: "2023-H2"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635933883228_46491"
releaseVersion: "2023-H2.0"
type: "divisionStatistic"
cohortKey: "2023-H2"
hkgovCenstatdCuration: "fixtures/meta/curations/hkgov-censtatd-statistics/permanent-living-quarters-area-type.json"
measureCuration: "fixtures/meta/curations/hkgov-censtatd-statistics-measures/permanent-living-quarters-area-type.json"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release.
- <orange>Upstream</orange> Add [C&SD](saanseoi:en:definition/hkgov-censtatd/v1)'s
  {{ sourceVersion }} Permanent Living Quarters by Area and Type statistics.

## Versioning

The version <black>{{ releaseVersion }}</black> preserves C&SD's reviewed
<black>{{ sourceVersion }}</black> publisher release. Its source period and statistical
geography come from the native layer, not from the date of a CSDI archive slot.

## Compatibility

### Directly Retained Fields

Every observation retains the original C&SD property name and literal as
<black>sourceField</black> and <black>sourceValue</black> for publisher provenance.

### Normalised Fields

Each reviewed source field becomes a canonical statistics observation with a stable
<black>measureCode</black>, statistic kind, aggregation, unit, status, reference period,
and localised measure offering. The source feature identity and area geography remain
attached to the release-owned series.

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
  {{ sourceVersion }} 年下半年按區域及類型劃分的永久性居住屋宇統計資料。

## 版本控制

版本 <black>{{ releaseVersion }}</black> 保留 C&SD 經審核的
<black>{{ sourceVersion }}</black>
發布。其來源時段及統計地理範圍取自原生圖層，而非 CSDI 歸檔時段的日期。

## 相容性

### 直接保留欄位

每項觀測均保留原始 C&SD 屬性名稱及字面值，分別為 <black>sourceField</black> 和
<black>sourceValue</black>，以保留發布者來源追溯。

### 正規化欄位

每個經審核的來源欄位均成為標準統計觀測，並附有穩定的
<black>measureCode</black>、統計種類、匯總方式、單位、狀態、參考時段及在地化指標 offering。來源要素識別碼及區域地理範圍保留於發布專屬的 series。

### 指標 offering

[指標代碼命名慣例](saanseoi:zh-hant:note/hkgov-censtatd-measure-naming/v1) 及
[指標 offering 慣例](saanseoi:zh-hant:note/hkgov-censtatd-measure-offerings/v1)
把易讀的統計名稱與其精確定義分開。

## 指標對應

以下經審核的對應表由此發布的
[C&SD 指標整理清單](saanseoi:zh-hant:definition/hkgov-censtatd-measure-curation-manifest/v1)
產生。

{{hkgovCenstatdMeasureTable:zh-Hant}}

# ZH-HANS

## 变更记录

- 山水 | SaanSeoi 初始版本。
- <orange>上游</orange> 新增 [C&SD](saanseoi:zh-hans:definition/hkgov-censtatd/v1) 的
  {{ sourceVersion }} 年下半年按区域及类型划分的永久性居住屋宇统计数据。

## 版本控制

版本 <black>{{ releaseVersion }}</black> 保留 C&SD 经审核的
<black>{{ sourceVersion }}</black>
发布。其来源时段及统计地理范围取自原生图层，而非 CSDI 归档时段的日期。

## 兼容性

### 直接保留字段

每项观测均保留原始 C&SD 属性名称及字面值，分别为 <black>sourceField</black> 和
<black>sourceValue</black>，以保留发布者来源追溯。

### 规范化字段

每个经审核的来源字段均成为标准统计观测，并附有稳定的
<black>measureCode</black>、统计种类、汇总方式、单位、状态、参考时段及本地化指标 offering。来源要素标识符及区域地理范围保留于发布专属的 series。

### 指标 offering

[指标代码命名惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-naming/v1) 及
[指标 offering 惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-offerings/v1)
把易读的统计名称与其精确定义分开。

## 指标对应

以下经审核的对应表由此发布的
[C&SD 指标整理清单](saanseoi:zh-hans:definition/hkgov-censtatd-measure-curation-manifest/v1)
产生。

{{hkgovCenstatdMeasureTable:zh-Hans}}
