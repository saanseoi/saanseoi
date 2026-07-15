---
createdAt: "2026-07-15T00:00:00.000Z"
updatedAt: "2026-07-15T00:00:00.000Z"
dataset: "ds-hk-overture-divisionBoundary"
release: "overture-hk-2025-09-24.0-divisionBoundary"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-09-24.0"
sourceSchemaVersion: "1.12.0"
type: "divisionBoundary"
cohortKey: "2025-09-24.0"
---

# EN

## Changelog

Initial SaanSeoi release.

## Compatibility

Boundaries represent borders between divisions of the same subtype. In the case of Hong
Kong, only district-level divisions have boundaries as these are the only official
administrative levels within the SAR.

### Directly Retained Fields

- `id` - [Id](/docs#models/Id)
- `division_ids` - normalized to `leftDivisionId` and `rightDivisionId`
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry), retaining LineString and
  MultiLineString values
- `is_land` and `is_territorial` - normalized as `isLand` and `isTerritorial`

### Enriched Fields

- `sources` - wrapped under the <black>overture</black> key
- `rawProperties` - dropped source values retained for compatibility and audit

### Normalized Fields

- `class` - normalized to canonical `type` (`land`, `maritime`, or `mixed` when both
  flags are true)
- `division_ids[0]` and `division_ids[1]` - normalized to the left/right relationship

### Compatibility Fields

- `version`, `subtype`, and `class` - retained under <black>overture.version</black>,
  <black>overture.subtype</black>, and <black>overture.class</black>

### Dropped Fields

- `theme`, `type`, `country`, `region`, `is_disputed`, and `perspectives` are not
  exposed as canonical fields. `perspectives` is required to be null during preflight;
  non-null values fail processing. Null-country maritime/international-water boundaries
  are kept.

Rows whose `region` is `CN-GD` are excluded. LineString and MultiLineString records are
both accepted. The release includes stats for source, imported, and rejected rows.

# ZH-HANT

## 更新紀錄

- SaanSeoi 香港 Overture 區劃邊界的首次發佈。

## 兼容性

邊界代表相同 subtype 區劃之間的界線。在香港，只有區級區劃具有邊界，因為這些是特區內唯一的正式行政級別。

### 直接保留欄位

- `id` - [識別碼](/docs#models/Id)
- `division_ids` - 正規化為 `leftDivisionId` 和 `rightDivisionId`
- `bbox` - [包圍盒](/docs#models/BBox)
- `geometry` - [幾何](/docs#models/Geometry)，保留 LineString 和 MultiLineString 值
- `is_land`、`is_territorial` - 正規化為 `isLand` 和 `isTerritorial`

### 增補欄位

- `sources` - 包裹於 <black>overture</black> 鍵下
- `rawProperties` - 捨棄的來源值保留於此，以供兼容及稽核

### 正規化欄位

- `class` - 正規化為標準 `type`（`land`、`maritime`；兩個標誌均為真時為 `mixed`）
- `division_ids[0]`、`division_ids[1]` - 正規化為左／右邊界關係

### 兼容欄位

- `version`、`subtype`、`class` - 分別保留於
  <black>overture.version</black>、<black>overture.subtype</black> 和
  <black>overture.class</black>

### 不公開欄位

- `theme`、`type`、`country`、`region`、`is_disputed`、`perspectives`
  不會作為標準欄位公開。 `perspectives`
  預檢時必須為 null，非 null 值會令處理失敗；香港及國際水域中 `country`
  為 null 的邊界會保留。

`region` 為 `CN-GD`
的資料會排除。LineString 和 MultiLineString 記錄均會接受。此發佈包含來源、匯入及拒絕記錄的統計資料。

# ZH-HANS

## 更新记录

- SaanSeoi 香港 Overture 区划边界的首次发布。

## 兼容性

边界代表相同 subtype 区划之间的界线。在香港，只有区级区划具有边界，因为这些是特区内唯一的正式行政级别。

### 直接保留字段

- `id` - [标识码](/docs#models/Id)
- `division_ids` - 规范化为 `leftDivisionId` 和 `rightDivisionId`
- `bbox` - [包围盒](/docs#models/BBox)
- `geometry` - [几何](/docs#models/Geometry)，保留 LineString 和 MultiLineString 值
- `is_land`、`is_territorial` - 规范化为 `isLand` 和 `isTerritorial`

### 增补字段

- `sources` - 包裹在 <black>overture</black> 键下
- `rawProperties` - 舍弃的源值保留在此，以供兼容及稽核

### 规范化字段

- `class` - 规范化为标准 `type`（`land`、`maritime`；两个标志均为真时为 `mixed`）
- `division_ids[0]`、`division_ids[1]` - 规范化为左／右边界关系

### 兼容字段

- `version`、`subtype`、`class` - 分别保留在
  <black>overture.version</black>、<black>overture.subtype</black> 和
  <black>overture.class</black>

### 不公开字段

- `theme`、`type`、`country`、`region`、`is_disputed`、`perspectives`
  不会作为标准字段公开。 `perspectives`
  预检时必须为 null，非 null 值会令处理失败；香港及国际水域中 `country`
  为 null 的边界会保留。

`region` 为 `CN-GD`
的数据会排除。LineString 和 MultiLineString 记录均会接受。此发布包含来源、导入及拒绝记录的统计资料。
