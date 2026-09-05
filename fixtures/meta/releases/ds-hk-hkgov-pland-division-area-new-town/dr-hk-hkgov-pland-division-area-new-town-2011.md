---
createdAt: "2026-07-21T00:00:00.000Z"
updatedAt: "2026-07-21T00:00:00.000Z"
dataset: "ds-hk-hkgov-pland-division-area-new-town"
release: "dr-hk-hkgov-pland-division-area-new-town-2011"
regionCode: "hk"
source: "hkgov-pland-new-town"
sourceVersion: "2011"
releaseVersion: "2011.0"
sourceSchemaVersion: "1.0"
type: "divisionArea"
cohortKey: "2011"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=pland_rcd_1634024777903_55269"
---

# EN

## Changelog

- Planning Department New Town cohort 2011.

## Geometry

Canonical areas are generated from accepted Polygon and MultiPolygon source cells.
Reviewed invalid rings use a `buffer(0)` repair only for canonical geometry; original
publisher geometry remains retained.

## Compatibility

This release is a Planning Department planning-domain source record, independent of
Overture administrative divisions. A normalised English name within this cohort forms a
cohort-scoped Planning Department identifier; no cross-cohort or Overture identity is
inferred.

### Directly Retained Fields

- `NewTown_en`, `NewTown_Tc`, and `NewTown_Sc` - retained in the Planning Department
  source profile
- `geometry` - retained as canonical <black>EPSG:4326</black> GeoJSON
- The English, Traditional Chinese, and Simplified Chinese labels are retained as
  localized names.

### Enriched Fields

- `sources` - attribution lineage of the source is retained under the
  <black>hkgovPland</black> key
- `bbox` - calculated from canonical geometry

### Normalised Fields

- Source cells are grouped into the published planning hierarchy and their accepted
  geometry is unioned for canonical divisions and areas.
- Original feature properties and geometry remain in source tables for auditability.

### Compatibility Fields

- `NewTown_en`, `NewTown_Tc`, and `NewTown_Sc` - available through the
  <black>hkgovPland</black> source profile
- Repair status and source-cell evidence - with the source record

### Dropped Fields

- Calculated source geometry is not substituted for source geometry. No cross-cohort
  replacement or implicit geometry merge is performed.

# ZH-HANT

## 更新紀錄

- 規劃署 2011 年新市鎮分期。

## 幾何

標準範圍由已接受的 Polygon 和 MultiPolygon 來源格網產生。經審核的無效環僅會以
`buffer(0)` 修復標準幾何；原始發布者幾何仍會保留。

## 兼容性

此版本是規劃署規劃領域的主張，獨立於 Overture 行政區劃。此分期內的正規化英文名稱形成按分期的規劃署識別碼；不會推斷跨分期或 Overture 身份。

### 直接保留欄位

- `NewTown_en`、`NewTown_Tc` 和 `NewTown_Sc` 保留於規劃署來源 profile
- `geometry` 保留為標準 <black>EPSG:4326</black> GeoJSON
- 英文、繁體中文及簡體中文標籤會作為本地化名稱保留。

### 增補欄位

- `sources` 保留於 <black>hkgovPland</black> key 下；`bbox` 由標準幾何計算

### 正規化欄位

- 來源格網會按已發布的規劃 hierarchy 分組，其已接受的幾何會聯集為標準區劃及範圍。
- 原始 feature 屬性及幾何會保留於來源表，以供稽核。

### 兼容欄位

- `NewTown_en`、`NewTown_Tc` 和 `NewTown_Sc` 可透過 <black>hkgovPland</black>
  來源 profile 取得
- 修復狀態及來源格網證據隨來源主張保留

### 不公開欄位

- 不會以計算出的來源幾何取代保留的來源幾何，亦不會進行跨分期取代或隱式幾何融合。

# ZH-HANS

## 更新记录

- 规划署 2011 年新市镇分期。

## 几何

标准范围由已接受的 Polygon 和 MultiPolygon 源格网产生。经审核的无效环仅会以 `buffer(0)`
修复标准几何；原始发布者几何仍会保留。

## 兼容性

此版本是规划署规划领域的主张，独立于 Overture 行政区划。此分期内的规范化英文名称形成按分期的规划署标识符；不会推断跨分期或 Overture 身份。

### 直接保留字段

- `NewTown_en`、`NewTown_Tc` 和 `NewTown_Sc` 保留于规划署源 profile
- `geometry` 保留为标准 <black>EPSG:4326</black> GeoJSON
- 英文、繁体中文及简体中文标签会作为本地化名称保留。

### 增补字段

- `sources` 保留于 <black>hkgovPland</black> key 下；`bbox` 由标准几何计算

### 规范化字段

- 源格网会按已发布的规划 hierarchy 分组，其已接受的几何会并集为标准区划及范围。
- 原始 feature 属性及几何会保留于源表，以供稽核。

### 兼容字段

- `NewTown_en`、`NewTown_Tc` 和 `NewTown_Sc` 可通过 <black>hkgovPland</black>
  源 profile 取得
- 修复状态及源格网证据随源主张保留

### 不公开字段

- 不会以计算出的源几何取代保留的源几何，亦不会进行跨分期取代或隐式几何融合。
