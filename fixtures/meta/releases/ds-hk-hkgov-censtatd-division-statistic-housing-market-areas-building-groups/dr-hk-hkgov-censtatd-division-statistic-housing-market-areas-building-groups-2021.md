---
createdAt: "2026-08-19T00:00:00.000Z"
updatedAt: "2026-08-19T00:00:00.000Z"
dataset: "ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups"
release: "dr-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-2021"
regionCode: "hk"
source: "hkgov-censtatd"
sourceVersion: "2021"
releaseVersion: "2021.0"
type: "divisionStatistic"
cohortKey: "2021"
hkgovCenstatdCuration: "fixtures/meta/curations/hkgov-censtatd-statistics/housing-market-areas-building-groups-2021.json"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release.
- <orange>Upstream</orange> Add [C&SD](saanseoi:en:definition/hkgov-censtatd/v1)'s
  {{ sourceVersion }} Census statistics for Housing Market Areas and Building Groups.

## Versioning

This source release is versioned as <black>{{ releaseVersion }}</black>, from the
publisher's <black>{{ sourceVersion }}</black> Census cohort.

## Compatibility

SaanSeoi retains C&SD's publisher assertions and presents reviewed values as canonical
statistics. It does not expose the publisher property schema as the statistics API.

### Directly Retained Fields

Publisher values retain their original property name and literal inside each packed
record value:

- <black>sourceField</black> - the C&SD property name
- <black>sourceValue</black> - its unmodified literal

The source assertion also retains the complete publisher property set, geometry, archive
identity, and feature identity. The canonical series identity qualifies that feature as
<black>&lt;layer&gt;:&lt;feature&gt;</black>. These provenance values do not become
canonical <black>measureCode</black>s or API selection fields.

### Normalised Fields

Each reviewed C&SD measure becomes a canonical observation with a stable
<black>measureCode</black>, statistic kind, aggregation, unit, status, reference period,
and localised offering. A measure will not be published until its metadata has been
reviewed in this release's curation manifest.

- Numeric literals become <black>numericValue</black>; categorical literals become a
  value code.
- <black>**</black> becomes a suppressed observation; <black>-</black>,
  <black>N.A.</black>, and <black>NA</black> become unavailable observations. The
  original literal remains in <black>sourceValue</black>.
- The 2021 Census is the reference period and geometry cohort. Housing Market Area,
  Building Group, and Building Group class are normalised as dimensions where supplied.

### Geography treatment

Both publisher layers are retained as statistics assertions. The reviewed
<black>HMA_21C</black> code supplies deterministic Housing Market Area identities and is
separately published as the <black>hkgov-censtatd-hma</black> Division and Division Area
geometry. <black>BG_21C</black> Building Group points remain source history and
statistics dimensions: they are not promoted to a Divisions geometry or assigned an
arbitrary canonical division as they don't have polygonal geometry.

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
  {{ sourceVersion }} 年人口普查房屋市場區及樓宇組群統計資料。

## 版本控制

此來源發布的版本為 <black>{{ releaseVersion }}</black>，來自發布者
<black>{{ sourceVersion }}</black> 年人口普查批次。

## 相容性

山水保留 C&SD 的發布者斷言，並把經審核的數值呈現為標準統計資料。它不會把發布者的屬性綱要公開為統計 API。

### 直接保留欄位

每個打包記錄值均保留發布者數值的原始屬性名稱及字面值：

- <black>sourceField</black> - C&SD 屬性名稱
- <black>sourceValue</black> - 未經修改的原始字面值

來源斷言亦保留完整發布者屬性集、幾何、歸檔識別及要素識別。標準 series 會把該要素限定為
<black>&lt;layer&gt;:&lt;feature&gt;</black>。這些來源追溯數值不會成為標準
<black>measureCode</black> 或 API 選擇欄位。

### 正規化欄位

每個經審核的 C&SD 指標均會成為標準觀測，並附有穩定的
<black>measureCode</black>、統計種類、匯總方式、單位、狀態、參考時段及在地化 offering。指標的中繼資料必須先在此發布的整理清單完成審核，才會發布。

- 數字字面值會成為 <black>numericValue</black>；分類字面值會成為 value code。
- <black>**</black> 會成為受抑制觀測；<black>-</black>、<black>N.A.</black> 及
  <black>NA</black> 會成為不可用觀測。原始字面值仍保留於 <black>sourceValue</black>。
- 2021 年人口普查是參考時段及幾何批次；如有提供，房屋市場區、樓宇組群及樓宇組群類別會正規化為維度。

### 地理範圍處理

兩個發布者圖層均保留為統計斷言。經審核的 <black>HMA_21C</black>
代碼會提供確定的房屋市場區識別，並另行發布為 <black>hkgov-censtatd-hma</black>
Division 及 Division Area 幾何。<black>BG_21C</black>
的樓宇組群點會保留為來源歷史及統計維度：不會提升為 Divisions 幾何，亦不會隨意指定標準 division。因為它們沒有多邊形幾何。

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
  {{ sourceVersion }} 年人口普查房屋市场区及楼宇组群统计数据。

## 版本控制

此来源发布的版本为 <black>{{ releaseVersion }}</black>，来自发布者
<black>{{ sourceVersion }}</black> 年人口普查批次。

## 兼容性

SaanSeoi 保留 C&SD 的发布者断言，并将经审核的数值呈现为规范统计数据。它不会把发布者的属性架构公开为统计 API。

### 直接保留字段

每个打包记录值均保留发布者数值的原始属性名称及字面值：

- <black>sourceField</black> - C&SD 属性名称
- <black>sourceValue</black> - 未经修改的原始字面值

来源断言亦保留完整发布者属性集、几何、归档识别及要素识别。规范 series 会把该要素限定为
<black>&lt;layer&gt;:&lt;feature&gt;</black>。这些来源追溯数值不会成为规范
<black>measureCode</black> 或 API 选择字段。

### 规范化字段

每个经审核的 C&SD 指标均会成为规范观测，并附有稳定的
<black>measureCode</black>、统计种类、汇总方式、单位、状态、参考时段及本地化 offering。指标的元数据必须先在此发布的整理清单完成审核，才会发布。

- 数字字面值会成为 <black>numericValue</black>；分类字面值会成为 value code。
- <black>**</black> 会成为受抑制观测；<black>-</black>、<black>N.A.</black> 及
  <black>NA</black> 会成为不可用观测。原始字面值仍保留于 <black>sourceValue</black>。
- 2021 年人口普查是参考时段及几何批次；如有提供，房屋市场区、楼宇组群及楼宇组群类别会规范化为维度。

### 地理范围处理

两个发布者图层均保留为统计断言。经审核的 <black>HMA_21C</black>
代码会提供确定的房屋市场区标识，并另行发布为 <black>hkgov-censtatd-hma</black>
Division 及 Division Area 几何。<black>BG_21C</black>
的楼宇组群点会保留为来源历史及统计维度：不会提升为 Divisions 几何，也不会随意指定规范 division。因为它们没有多边形几何。

### 指标 offering

已发布的 <black>measureCode</black> 遵循
[统计指标命名惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-naming/v1)。其易读名称及精确纳入准则遵循
[指标 offering 惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-offerings/v1)。

## 指标对应

以下经审核的对应表由此发布的
[C&SD 指标整理清单](saanseoi:zh-hans:definition/hkgov-censtatd-measure-curation-manifest/v1)
产生。

{{hkgovCenstatdMeasureTable:zh-Hans}}
