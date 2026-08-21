---
createdAt: "2026-07-27T00:00:00.000Z"
updatedAt: "2026-07-27T00:00:00.000Z"
dataset: "ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district"
release: "dr-hk-hkgov-censtatd-division-statistic-land-area-population-density-district-2022"
regionCode: "hk"
source: "hkgov-censtatd"
sourceVersion: "2022"
sourceSchemaVersion: "1.0"
releaseVersion: "2022.0"
type: "divisionStatistic"
cohortKey: "2022"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=censtatd_rcd_1635934215448_25451"
hkgovCenstatdCuration: "fixtures/meta/curations/hkgov-censtatd-statistics/land-area-population-density-district.json"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release
- <orange>Upstream</orange> Add [C&SD](saanseoi:en:definition/hkgov-censtatd/v1)'s
  {{ sourceVersion }} District Land Area, Population and Density statistics for all 18
  District Council districts.

## Versioning

This release is derived from the native <black>Density_{{ sourceVersion }}.gml</black>
layer in CSDI archive slot <black>2023-Q4</black>. The archive slot records _when_ the
publisher package was archived, _not_ when the source was released. As such, we use
<black>{{ releaseVersion }}</black> to version this source dataset; which is based on
the source's reference year.

## Compatibility

### Directly Retained Fields

These source fields are renamed for API consistency only; their values and units are
unchanged in <black>data.attributes.*</black>.

- `PERIOD` - maps to <black>referenceYear</black> and equals
  <black>{{ sourceVersion }}</black>.
- `LA` - maps to <black>landAreaSqKm</black> in square kilometres.
- `POPN_D` - maps to <black>midYearPopulationDensityPerSqKm</black> in people per square
  kilometre.

### Normalised fields

These source values are converted before being returned through
<black>data.attributes.*</black>.

- `DC` - resolves from this C&SD numeric to the SaanSeoi canonical
  <black>divisionId</black> and <black>districtCode</black>. The raw C&SD number is
  available through <black>sourceKeys.hkgovCenstatd.districtCode</black>.
- `MYPOPN_LAND` - is expressed by C&SD in thousands. It is multiplied by
  <black>1,000</black> during ingestion, so <black>midYearPopulation</black> is the
  number of people.

### Compatibility fields

- `DC_ENG` - is available as <black>sourceKeys.hkgovCenstatd.i18n.en.name</black>.
- `DC_CHI` - is available as <black>sourceKeys.hkgovCenstatd.i18n.zh-hant.name</black>.

## Measure mapping

The fieldName [naming convention](saanseoi:en:note/hkgov-censtatd-measure-naming/v1) and
[detailing](saanseoi:en:note/hkgov-censtatd-measure-offerings/v1) separate a readable
statistical name from its exact definition. The mapping below is generated from this
release's C&SD
[measure curation manifest](saanseoi:en:definition/hkgov-censtatd-measure-curation-manifest/v1).

{{hkgovCenstatdMeasureTable:en}}

# ZH-HANT

## 變更記錄

- 山水 | SaanSeoi 初始版本
- <orange>上游</orange> 新增 [C&SD](saanseoi:zh-hant:definition/hkgov-censtatd/v1) 的
  {{ sourceVersion }} 年全港 18 個區議會分區的土地面積、人口及人口密度統計資料。

## 版本控制

本發布衍生自 [CSDI](saanseoi:zh-hant:definition/hkgov-csdi/v1) 歸檔時段
<black>2023-Q4</black> 中的原生 <black>Density_{{ sourceVersion }}.gml</black>
圖層。歸檔時段記錄的是發布者套件的歸檔時間，而非來源的發布時間。因此，我們使用
<black>{{ releaseVersion }}</black> 作為此來源資料集的版本；該版本以來源的參考年份為準。

## 相容性

### 直接保留欄位

以下來源欄位僅為 API 一致性而重新命名；其值和單位在 <black>data.attributes.*</black>
中維持不變。

- `PERIOD` - 對應至 <black>referenceYear</black>，並等於
  <black>{{ sourceVersion }}</black>。
- `LA` - 對應至 <black>landAreaSqKm</black>，單位為平方公里。
- `POPN_D` - 對應至
  <black>midYearPopulationDensityPerSqKm</black>，單位為每平方公里人數。

### 正規化欄位

以下來源值會先轉換，然後透過 <black>data.attributes.*</black> 傳回。

- `DC` - 此 C&SD 數值代碼會對應至 SaanSeoi 標準的 <black>divisionId</black> 及
  <black>districtCode</black>。原始 C&SD 數值可透過
  <black>sourceKeys.hkgovCenstatd.districtCode</black> 取得。
- `MYPOPN_LAND` - C&SD 以千為單位表示此值。資料擷取時會乘以 <black>1,000</black>，因此
  <black>midYearPopulation</black> 是實際人數。

### 相容性欄位

- `DC_ENG` - 可透過 <black>sourceKeys.hkgovCenstatd.i18n.en.name</black> 取得。
- `DC_CHI` - 可透過 <black>sourceKeys.hkgovCenstatd.i18n.zh-hant.name</black> 取得。

## 指標對應

[指標代碼命名慣例](saanseoi:zh-hant:note/hkgov-censtatd-measure-naming/v1) 及
[指標 offering 慣例](saanseoi:zh-hant:note/hkgov-censtatd-measure-offerings/v1)
把易讀的統計名稱與其精確定義分開。以下經審核的對應表由此發布的
[C&SD 指標整理清單](saanseoi:zh-hant:definition/hkgov-censtatd-measure-curation-manifest/v1)
產生。

{{hkgovCenstatdMeasureTable:zh-Hant}}

# ZH-HANS

## 变更记录

- 山水 | SaanSeoi 初始版本
- <orange>上游</orange> 新增 [C&SD](saanseoi:zh-hans:definition/hkgov-censtatd/v1) 的
  {{ sourceVersion }} 年全港 18 个区议会分区的土地面积、人口及人口密度统计资料。

## 版本控制

本发布衍生自 [CSDI](saanseoi:zh-hans:definition/hkgov-csdi/v1) 归档时段
<black>2023-Q4</black> 中的原生 <black>Density_{{ sourceVersion }}.gml</black>
图层。归档时段记录的是发布者套件的归档时间，而非来源的发布时间。因此，我们使用
<black>{{ releaseVersion }}</black> 作为此来源数据集的版本；该版本以来源的参考年份为准。

## 兼容性

### 直接保留字段

以下来源字段仅为 API 一致性而重新命名；其值和单位在 <black>data.attributes.*</black>
中保持不变。

- `PERIOD` - 对应至 <black>referenceYear</black>，并等于
  <black>{{ sourceVersion }}</black>。
- `LA` - 对应至 <black>landAreaSqKm</black>，单位为平方公里。
- `POPN_D` - 对应至
  <black>midYearPopulationDensityPerSqKm</black>，单位为每平方公里人数。

### 规范化字段

以下来源值会先转换，然后通过 <black>data.attributes.*</black> 返回。

- `DC` - 此 C&SD 数值代码会对应至 SaanSeoi 标准的 <black>divisionId</black> 及
  <black>districtCode</black>。原始 C&SD 数值可通过
  <black>sourceKeys.hkgovCenstatd.districtCode</black> 取得。
- `MYPOPN_LAND` - C&SD 以千为单位表示此值。数据摄取时会乘以 <black>1,000</black>，因此
  <black>midYearPopulation</black> 是实际人数。

### 兼容性字段

- `DC_ENG` - 可通过 <black>sourceKeys.hkgovCenstatd.i18n.en.name</black> 取得。
- `DC_CHI` - 可通过 <black>sourceKeys.hkgovCenstatd.i18n.zh-hant.name</black> 取得。

## 指标对应

[指标代码命名惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-naming/v1) 及
[指标 offering 惯例](saanseoi:zh-hans:note/hkgov-censtatd-measure-offerings/v1)
把易读的统计名称与其精确定义分开。以下经审核的对应表由此发布的
[C&SD 指标整理清单](saanseoi:zh-hans:definition/hkgov-censtatd-measure-curation-manifest/v1)
产生。

{{hkgovCenstatdMeasureTable:zh-Hans}}
