---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-20T00:00:00.000Z"
dataset: "ds-hk-hkgov-landsd-division"
release: "dr-hk-hkgov-landsd-division-2026-06-10.0"
regionCode: "hk"
source: "hkgov-landsd"
sourceVersion: "2026-06-10.0"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752"
releaseVersion: "2026-06-10.0"
sourceSchemaVersion: "1.0"
type: "division"
cohortKey: "2026-06-10.0"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release.
- <orange>Upstream</orange> Adds the Lands Department Place Name database dated
  <black>{{ sourceVersion }}</black>.
- Publishes the source's 1,613 <black>PLACE_CLASS=Settlement</black> records as point
  divisions. The complete 2,706-record native gazetteer remains in source history.

## Versioning

This source release follows the publisher archive date. Its immutable SaanSeoi release
version is <black>{{ releaseVersion }}</black>.

## Geometry

Every published settlement has one Point geometry in <black>EPSG:4326</black>. Empty,
non-finite, or out-of-range coordinates are rejected. SaanSeoi calculates each
division's bounding box from the accepted point without manufacturing an area or
boundary.

## Compatibility

This release is a settlement-place-name collection, not an administrative hierarchy.
Only records whose publisher class is <black>Settlement</black> enter this Divisions
domain. Hydrographic and Topographic records remain complete native source assertions
for a future Places projection; they are not silently recast as divisions.

### Directly Retained Fields

- `geometry` - retained as canonical Point geometry
- `GEO_NAME_ID` - retained as the persistent publisher identifier
- `PLACE_CLASS`, `PLACE_TYPE`, and `DISTRICT` - retained with the source assertion
- Official and alias `PLACE_NAME` relationship rows - retained with their publisher
  status and bilingual labels

### Enriched Fields

- `bbox` - calculated from canonical geometry
- `sources` - retains the complete source feature, source properties, archive identity,
  and attribution lineage under <black>hkgovLandsd</black>

### Normalised Fields

- `GEO_NAME_ID` - becomes the canonical identifier <black>LANDSD:{GEO_NAME_ID}</black>
- Official English and Traditional Chinese names become locale-specific
  [DivisionI18n](/docs#models/DivisionI18n) records; aliases remain source assertions
- Every published record has canonical <black>type=settlement</black> and
  <black>level=5</black>

### Source fields

Publisher keys remain in the retained source record's <black>rawProperties</black>. The
complete native feature and properties remain available through the source-record
endpoint.

### Dropped Fields

No native field is discarded from source storage. Hydrographic and Topographic rows are
excluded only from this Divisions projection and remain available for audit and future
use.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 初始版本。
- <orange>上游</orange> 新增日期為 <black>{{ sourceVersion }}</black>
  的地政總署地名資料庫。
- 將來源中 1,613 筆 <black>PLACE_CLASS=Settlement</black>
  記錄發布為點區劃；完整的 2,706 筆原生地名錄仍保留於來源歷史。

## 版本控制

此來源發布依發布者歸檔日期版本化；其不可變的 SaanSeoi 發布版本為
<black>{{ releaseVersion }}</black>。

## 幾何

每個已發布居住地均有一個 <black>EPSG:4326</black>
Point 幾何。空值、非有限或超出範圍的座標會被拒絕。SaanSeoi 由已接受的點計算每個區劃的包圍盒，不會製造範圍或邊界。

## 兼容性

此發布是居住地地名 collection，而非行政 hierarchy。只有發布者類別為
<black>Settlement</black> 的記錄會進入此 Divisions
domain。水文及地形記錄會完整保留為原生來源主張，以供未來 Places 投影使用；它們不會被靜默改列為區劃。

### 直接保留欄位

- `geometry` - 保留為標準 Point 幾何
- `GEO_NAME_ID` - 保留為持久發布者識別碼
- `PLACE_CLASS`、`PLACE_TYPE` 及 `DISTRICT` - 隨來源主張保留
- 官方及別名 `PLACE_NAME` 關聯列 - 連同發布者狀態及雙語標籤保留

### 增補欄位

- `bbox` - 由標準幾何計算
- `sources` - 在 <black>hkgovLandsd</black>
  下保留完整來源 feature、來源屬性、歸檔識別及歸屬鏈

### 正規化欄位

- `GEO_NAME_ID` - 成為標準識別碼 <black>LANDSD:{GEO_NAME_ID}</black>
- 官方英文及繁體中文名稱成為按語言地區劃分的 [DivisionI18n](/docs#models/DivisionI18n)
  記錄；別名仍保留為來源主張
- 每筆已發布記錄的標準值均為 <black>type=settlement</black> 及 <black>level=5</black>

### 來源欄位

發布者 key 會保留在來源記錄的 <black>rawProperties</black>
中。完整原生 feature 及屬性可透過來源記錄端點取得。

### 不公開欄位

來源儲存不會捨棄任何原生欄位。水文及地形記錄只會從此 Divisions 投影排除，並仍可供稽核及日後使用。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 初始版本。
- <orange>上游</orange> 新增日期为 <black>{{ sourceVersion }}</black>
  的地政总署地名数据库。
- 将来源中 1,613 条 <black>PLACE_CLASS=Settlement</black>
  记录发布为点区划；完整的 2,706 条原生地名录仍保留于来源历史。

## 版本控制

此来源发布依发布者归档日期版本化；其不可变的 SaanSeoi 发布版本为
<black>{{ releaseVersion }}</black>。

## 几何

每个已发布居住地均有一个 <black>EPSG:4326</black>
Point 几何。空值、非有限或超出范围的坐标会被拒绝。SaanSeoi 由已接受的点计算每个区划的包围盒，不会制造范围或边界。

## 兼容性

此发布是居住地地名 collection，而非行政 hierarchy。只有发布者类别为
<black>Settlement</black> 的记录会进入此 Divisions
domain。水文及地形记录会完整保留为原生来源断言，以供未来 Places 投影使用；它们不会被静默改列为区划。

### 直接保留字段

- `geometry` - 保留为规范 Point 几何
- `GEO_NAME_ID` - 保留为持久发布者标识符
- `PLACE_CLASS`、`PLACE_TYPE` 及 `DISTRICT` - 随来源断言保留
- 官方及别名 `PLACE_NAME` 关系行 - 连同发布者状态及双语标签保留

### 增补字段

- `bbox` - 由规范几何计算
- `sources` - 在 <black>hkgovLandsd</black>
  下保留完整来源 feature、来源属性、归档标识及归属链

### 规范化字段

- `GEO_NAME_ID` - 成为规范标识符 <black>LANDSD:{GEO_NAME_ID}</black>
- 官方英文及繁体中文名称成为按语言区域划分的 [DivisionI18n](/docs#models/DivisionI18n)
  记录；别名仍保留为来源断言
- 每条已发布记录的规范值均为 <black>type=settlement</black> 及 <black>level=5</black>

### 来源字段

发布者 key 会保留在源记录的 <black>rawProperties</black>
中。完整原生 feature 及属性可通过源记录端点取得。

### 不公开字段

来源存储不会丢弃任何原生字段。水文及地形记录只会从此 Divisions 投影排除，并仍可供审核及日后使用。
