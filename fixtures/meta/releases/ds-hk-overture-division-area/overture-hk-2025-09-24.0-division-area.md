---
createdAt: "2026-07-15T00:00:00.000Z"
updatedAt: "2026-07-15T00:00:00.000Z"
dataset: "ds-hk-overture-division-area"
release: "overture-hk-2025-09-24.0-division-area"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-09-24.0"
sourceSchemaVersion: "1.12.0"
type: "divisionArea"
cohortKey: "2025-09-24.0"
---

# EN

## Changelog

Initial 山水 | SaanSeoi release.

## Compatibility

Division areas are polygons that represent the land or maritime area covered by a
division. Each division area belongs to a division which it references by ID, and for
which the division area provides an area polygon. For ease of use, every division area
repeats the subtype, names, country, and region properties of the division it belongs
to.

### Directly Retained Fields

- `id` - [Id](/docs#models/Id)
- `division_id` - normalized as `divisionId`
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry), retaining Polygon and MultiPolygon
  values
- `is_land` - normalized as `isLand`
- `is_territorial` - normalized as `isTerritorial`

### Enriched Fields

- `sources` - wrapped under the <black>overture</black> key
- `rawProperties` - source-only values retained for compatibility and audit

### Compatibility Fields

- `version` - available as <black>overture.version</black>
- `subtype` - available as <black>overture.subtype</black>
- `class` - available as <black>overture.class</black>

### Dropped Fields

- `names` - redundant with the related division
- `theme`, `type` - no variance in this source
- `country`, `region` - repeated division properties; retained in `rawProperties`

Rows whose `region` is `CN-GD` are excluded from the Hong Kong release. Polygon and
MultiPolygon records are both accepted as documented by the upstream union type. The
source flags are preserved as-is, including the known upstream combination where both
`is_land` and `is_territorial` are true.

# ZH-HANT

## 更新紀錄

- 香港 Overture 區劃範圍的首次發佈。

## 兼容性

區劃範圍是代表區劃所涵蓋陸地或海事範圍的多邊形。每個區劃範圍透過 ID 關聯所屬區劃，並為該區劃提供範圍多邊形。為方便使用，每個區劃範圍都會重複所屬區劃的 subtype、names、country 和 region 屬性。

### 直接保留欄位

- `id`、`division_id`（正規化為 `divisionId`）、`bbox`、`geometry`
- `is_land`（正規化為 `isLand`）、`is_territorial`（正規化為 `isTerritorial`）

### 增補欄位

- `sources` 包裹於 <black>overture</black> key 下；原始值保留於 `rawProperties`

### 兼容欄位

- `version`、`subtype`、`class` 分別保留於
  <black>overture.version</black>、<black>overture.subtype</black>、<black>overture.class</black>

### 不公開欄位

- `names`、`theme`、`type`、`country`、`region`（後兩者仍保留於 `rawProperties`）

`region` 為 `CN-GD`
的資料不會匯入。Polygon 和 MultiPolygon 均會保留；來源旗標亦會原樣保留，包括已知上游同時將
`is_land` 和 `is_territorial` 設為 true 的資料。

# ZH-HANS

## 更新记录

- 香港 Overture 区划范围的首次发布。

## 兼容性

区划范围是代表区划所涵盖陆地或海事范围的多边形。每个区划范围通过 ID 关联所属区划，并为该区划提供范围多边形。为方便使用，每个区划范围都会重复所属区划的 subtype、names、country 和 region 属性。

### 直接保留字段

- `id`、`division_id`（规范化为 `divisionId`）、`bbox`、`geometry`
- `is_land`（规范化为 `isLand`）、`is_territorial`（规范化为 `isTerritorial`）

### 增补字段

- `sources` 包裹在 <black>overture</black> key 下；原始值保留在 `rawProperties`

### 兼容字段

- `version`、`subtype`、`class` 分别保留在
  <black>overture.version</black>、<black>overture.subtype</black>、<black>overture.class</black>

### 不公开字段

- `names`、`theme`、`type`、`country`、`region`（后两者仍保留在 `rawProperties`）

`region` 为 `CN-GD`
的数据不会导入。Polygon 和 MultiPolygon 均会保留；来源旗标也会原样保留，包括已知上游同时将
`is_land` 和 `is_territorial` 设为 true 的数据。
