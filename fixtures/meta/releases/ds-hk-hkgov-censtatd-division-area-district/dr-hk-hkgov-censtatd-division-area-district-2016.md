---
createdAt: "2026-07-21T00:00:00.000Z"
updatedAt: "2026-07-21T00:00:00.000Z"
dataset: "ds-hk-hkgov-censtatd-division-area-district"
release: "dr-hk-hkgov-censtatd-division-area-district-2016"
regionCode: "hk"
source: "hkgov-censtatd"
sourceVersion: "2016"
releaseVersion: "2016.0"
sourceSchemaVersion: "1.0"
type: "divisionArea"
cohortKey: "2016"
---

# EN

## Changelog

- <orange>Upstream</orange> Add geometry for the C&SD {{cohortKey}} Census' District
  Council districts.

## Geometry

The source release contains exactly 18 Polygon or MultiPolygon district areas. The GML
declares <black>EPSG:2326</black> (Hong Kong 1980 Grid): each <black>gml:posList</black>
is supplied as northing/easting, is normalised to <black>[easting, northing]</black>,
then transformed to WGS 84 <black>[longitude, latitude]</black> GeoJSON coordinates in
<black>EPSG:4326</black> (rounded to eight decimal places). Empty and invalid geometry
is rejected; no source geometry is silently repaired.

## Compatibility

This is a census-geography assertion, not an evergreen administrative boundary. Each
area is connected to its canonical division through the reviewed, cohort-specific
<black>hkgov-censtatd</black> identifier bridge.

### Normalised Fields

- `geometry` - canonical <black>EPSG:4326</black> GeoJSON geometry
- `bbox` - calculated from the canonical <black>EPSG:4326</black> geometry
- `district_class` - resolves to <black>divisionId</black> through the cohort-specific
  identifier bridge
- The GML `dc_eng` and `dc_chi` labels are retained in the C&SD source i18n audit rows
  as <black>en</black> and <black>zh-hant</black>. They are not fields on the included
  geometry resource; SaanSeoi division labels, when requested, are canonical
  <black>data.attributes.i18n</black> values.
- `sources` - public attribution lineage of the source is under
  <black>included[].attributes.sources.hkgovCenstatd</black>; it is an array of
  publisher attribution values such as <black>{ dataset: "hkgov-censtatd",
  districtClass: "B", districtCode: 12 }</black>.

### Compatibility Fields

- `source_geometry` - retained as <black>sourceGeometry</black> in C&SD source storage;
  it is not exposed by the public divisions response. It will be made available as an
  <orange>UPCOMING<orange> improvement to our APIs.
- Public geometry responses serialize provider identifiers under
  <black>included[].attributes.sourceKeys</black>. The C&SD identifiers `district_code`,
  `district_class` are
  <black>included[].attributes.sourceKeys.hkgovCenstatd.code</black> and
  <black>included[].attributes.sourceKeys.hkgovCenstatd.class</black>.
- `census_year` - The selected census cohort is
  <black>included[].attributes.variant</black>, whose value is
  <black>hkgov-censtatd:{{cohortKey}}</black>.

### Dropped Fields

- No publisher field is discarded during ingestion. The complete native GML feature
  member, unprojected <black>EPSG:2326</black> geometry, and publisher properties remain
  in source storage for audit, but the public divisions response does not expose them.

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 政府統計處 {{cohortKey}} 年區議會分區統計地理資料分期。

## 幾何

來源版本包含剛好 18 個 Polygon 或 MultiPolygon 地區範圍。GML 宣告
<black>EPSG:2326</black>（Hong Kong 1980 Grid）；每個 <black>gml:posList</black>
以北距／東距順序提供，會先正規化為 <black>[easting, northing]</black>，再轉換為 WGS
84 的 <black>[longitude, latitude]</black> GeoJSON 座標和 <black>EPSG:4326</black>
（四捨五入至小數點後八位）。空或無效的幾何會被拒絕，不會靜默修復來源幾何。

## 兼容性

此資料屬人口普查統計地理主張，並非恆常的行政界線。每個範圍透過按分期審核的
<black>hkgov-censtatd</black> 識別碼橋接表連接至標準區劃。

### 正規化欄位

- `geometry` - 標準 <black>EPSG:4326</black> GeoJSON 幾何
- `bbox` - 由標準 <black>EPSG:4326</black> 幾何計算
- `district_class` 透過按分期的識別碼橋接表解析為 <black>divisionId</black>
- GML 的 <black>dc_eng</black> 和 <black>dc_chi</black> 標籤會分別作為 <black>en</black>
  和 <black>zh-hant</black>
  保留於 C&SD 來源 i18n 稽核列；它們不是 included 幾何 resource 的欄位。要求 SaanSeoi 區劃標籤時，會取得標準的
  <black>data.attributes.i18n</black> 值。
- `sources` - 公開來源鏈歸屬為
  <black>included[].attributes.sources.hkgovCenstatd</black>；它是發布者歸屬值的陣列，例如
  <black>{ dataset: "hkgov-censtatd", districtClass: "B", districtCode: 12 }</black>。

### 兼容欄位

- `source_geometry` - 會以 <black>sourceGeometry</black>
  保留於 C&SD 來源儲存；公開 divisions response 尚未提供。它將於日後的
  <orange>UPCOMING</orange> API 改進中提供。
- 公開幾何 response 在 <black>included[].attributes.sourceKeys</black>
  下序列化發布者識別碼。C&SD 識別碼 <black>district_code</black> 和
  <black>district_class</black> 分別為
  <black>included[].attributes.sourceKeys.hkgovCenstatd.code</black> 和
  <black>included[].attributes.sourceKeys.hkgovCenstatd.class</black>。
- `census_year` - 選取的人口普查分期為
  <black>included[].attributes.variant</black>，值為
  <black>hkgov-censtatd:{{cohortKey}}</black>。

### 不公開欄位

- Ingestion 不會捨棄任何發布者欄位。完整原生 GML feature member、未投影的
  <black>EPSG:2326</black> 幾何及發布者屬性會保留在來源儲存供稽核，但公開 divisions
  response 不會提供它們。

# ZH-HANS

## 更新记录

- <orange>上游</orange> 政府统计处 {{cohortKey}} 年区议会分区统计地理资料分期。

## 几何

源版本包含刚好 18 个 Polygon 或 MultiPolygon 地区范围。GML 声明
<black>EPSG:2326</black>（Hong Kong 1980 Grid）；每个 <black>gml:posList</black>
以北距／东距顺序提供，会先规范化为 <black>[easting, northing]</black>，再转换为 WGS
84 的 <black>[longitude, latitude]</black> GeoJSON 坐标和 <black>EPSG:4326</black>
（四舍五入至小数点后八位）。空或无效的几何会被拒绝，不会静默修复源几何。

## 兼容性

此数据属于人口普查统计地理主张，并非恒常的行政边界。每个范围通过按分期审核的
<black>hkgov-censtatd</black> 标识符桥接表连接至标准区划。

### 规范化字段

- `geometry` - 标准 <black>EPSG:4326</black> GeoJSON 几何
- `bbox` - 由标准 <black>EPSG:4326</black> 几何计算
- `district_class` 通过按分期的标识符桥接表解析为 <black>divisionId</black>
- GML 的 <black>dc_eng</black> 和 <black>dc_chi</black> 标签会分别作为 <black>en</black>
  和 <black>zh-hant</black>
  保留于 C&SD 源 i18n 稽核行；它们不是 included 几何 resource 的字段。请求 SaanSeoi 区划标签时，会取得标准的
  <black>data.attributes.i18n</black> 值。
- `sources` - 公开来源链归属为
  <black>included[].attributes.sources.hkgovCenstatd</black>；它是发布者归属值的数组，例如
  <black>{ dataset: "hkgov-censtatd", districtClass: "B", districtCode: 12 }</black>。

### 兼容字段

- `source_geometry` - 会以 <black>sourceGeometry</black>
  保留于 C&SD 源存储；公开 divisions response 尚未提供。它将于日后的
  <orange>UPCOMING</orange> API 改进中提供。
- 公开几何 response 在 <black>included[].attributes.sourceKeys</black>
  下序列化发布者标识符。C&SD 标识符 <black>district_code</black> 和
  <black>district_class</black> 分别为
  <black>included[].attributes.sourceKeys.hkgovCenstatd.code</black> 和
  <black>included[].attributes.sourceKeys.hkgovCenstatd.class</black>。
- `census_year` - 选取的人口普查分期为
  <black>included[].attributes.variant</black>，值为
  <black>hkgov-censtatd:{{cohortKey}}</black>。

### 不公开字段

- Ingestion 不会丢弃任何发布者字段。完整原生 GML feature member、未投影的
  <black>EPSG:2326</black> 几何及发布者属性会保留在源存储供稽核，但公开 divisions
  response 不会提供它们。
