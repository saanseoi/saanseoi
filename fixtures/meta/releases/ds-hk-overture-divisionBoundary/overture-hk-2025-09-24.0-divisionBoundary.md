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

- Initial Overture division-boundary release for Hong Kong.

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

- `class` - normalized to canonical `type` (`land` or `maritime`)
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

- 香港 Overture 區劃邊界的首次發佈。

## 兼容性

邊界代表相同 subtype 區劃之間的界線。在香港，只有區級區劃具有邊界，因為這些是特區內唯一的正式行政級別。

### 直接保留欄位

- `id`、`division_ids`（正規化為 `leftDivisionId` 和
  `rightDivisionId`）、`bbox`、`geometry`
- `is_land`、`is_territorial`（正規化為 `isLand`、`isTerritorial`）

### 增補欄位

- `sources` 包裹於 <black>overture</black> key 下；原始值保留於 `rawProperties`

### 正規化欄位

- `class` 正規化為 `type`（`land` 或 `maritime`）

### 兼容欄位

- `version`、`subtype`、`class` 保留於
  <black>overture.version</black>、<black>overture.subtype</black>、<black>overture.class</black>

### 不公開欄位

- `theme`、`type`、`country`、`region`、`is_disputed`、`perspectives`。`perspectives`
  必須為 null；香港及國際水域的 null-country 邊界會保留。

`region` 為 `CN-GD` 的資料不會匯入；LineString 和 MultiLineString 均會保留。

# ZH-HANS

## 更新记录

- 香港 Overture 区划边界的首次发布。

## 兼容性

边界代表相同 subtype 区划之间的界线。在香港，只有区级区划具有边界，因为这些是特区内唯一的正式行政级别。

### 直接保留字段

- `id`、`division_ids`（规范化为 `leftDivisionId` 和
  `rightDivisionId`）、`bbox`、`geometry`
- `is_land`、`is_territorial`（规范化为 `isLand`、`isTerritorial`）

### 增补字段

- `sources` 包裹在 <black>overture</black> key 下；原始值保留在 `rawProperties`

### 规范化字段

- `class` 规范化为 `type`（`land` 或 `maritime`）

### 兼容字段

- `version`、`subtype`、`class` 保留在
  <black>overture.version</black>、<black>overture.subtype</black>、<black>overture.class</black>

### 不公开字段

- `theme`、`type`、`country`、`region`、`is_disputed`、`perspectives`。`perspectives`
  必须为 null；香港及国际水域的 null-country 边界会保留。

`region` 为 `CN-GD` 的数据不会导入；LineString 和 MultiLineString 均会保留。
