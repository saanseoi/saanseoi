---
createdAt: "2026-07-22T00:00:00.000Z"
updatedAt: "2026-07-22T00:00:00.000Z"
dataset: "ds-hk-overture-division-area"
release: "dr-hk-overture-division-area-2026-06-17.0"
regionCode: "hk"
source: "overture"
sourceVersion: "2026-06-17.0"
releaseVersion: "2026-06-17.0"
sourceSchemaVersion: "1.17.0"
type: "divisionArea"
cohortKey: "2026-06-17.0"
releaseNotesUrl: "https://docs.overturemaps.org/blog/2026/06/17/release-notes/#divisions"
---

# EN

## Changelog

- <orange>Upstream</orange> OSM Cut-Off Date: <black>2026-06-06</black>

## Compatibility

SaanSeoi's [DivisionArea](/docs#models/DivisionArea) retains compatibility with
Overture's
[DivisionArea](https://docs.overturemaps.org/schema/reference/divisions/division_area/)
type where possible. This Overture variant is intended to provide the default area
geometry for SaanSeoi's geographical [Division](/docs#models/Division) records. We
deviate from Overture schema (`{{sourceSchemaVersion}}`) where a canonical model is more
useful for Hong Kong.

Source coverage flags are preserved as-is, including the upstream combination which
[runs counter to the schema](https://github.com/OvertureMaps/data/issues/542) where both
`is_land` and `is_territorial` are true; that combination produces our canonical
`type = mixed`.

### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `geometry` - [Geometry](/docs#models/Geometry) - retaining Polygon and MultiPolygon
  values
- `is_land` - normalised as <black>isLand</black>
- `is_territorial` - normalised as <black>isTerritorial</black>

### Enriched Fields

Fields which retain the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the
  <black>overture</black> key to allow conflation with other datasets while retaining
  attribution lineage of the source

### Normalised Fields

Fields reorganized for storage, query, or API response shaping:

- `division_id` - normalised as <black>divisionId</black>
- `bbox` - [BBox](/docs#models/BBox), calculated from the released canonical geometry
- `class` - normalised to canonical <black>type</black> (<black>land</black>,
  <black>maritime</black>, or <black>mixed</black> when both coverage flags are true)

### Compatibility Fields

Fields which are retained through <black>overture</black> compatibility keys:

- `version` - available as <black>overture.version</black>
- `subtype` - available as <black>overture.subtype</black>
- `class` - available as <black>overture.class</black>

These are available in any API responses which include this geometry at
<black>included[].attributes.sourceKeys.overture.{{ PROPERTYNAME }}</black>

### Dropped Fields

Fields which are not exposed as part of [DivisionArea](/docs#models/DivisionArea):

A future Overture compatibility API will make these available in the future
<orange>FORTHCOMING</orange>.

#### Due to zero variance

- `theme` - always <black>divisions</black>
- `type` - always <black>divisionArea</black>
- `country` - always <black>HK</black>
- `region` - empty

#### Due to ownership

- `names` - owned by the related [Division](/docs#models/Division) and not duplicated on
  [DivisionArea](/docs#models/DivisionArea)

- `admin_level` - accepted during preflight, but not exposed on canonical
  [DivisionArea](/docs#models/DivisionArea); the related
  [Division](/docs#models/Division) is the canonical owner of this administrative-level
  attribute.

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> OSM 截止日期：<black>2026-06-06</black>

## 兼容性

SaanSeoi 的 [DivisionArea](/docs#models/DivisionArea) 在可行範圍內保持與 Overture 的
[DivisionArea](https://docs.overturemaps.org/schema/reference/divisions/division_area/)
類型兼容。此 Overture 變體旨在為 SaanSeoi 的 地理 [Division](/docs#models/Division)
記錄提供預設的面積幾何。當標準模型更適合香港時，我們會偏離 Overture
schema（`{{sourceSchemaVersion}}`）。

來源覆蓋標誌會原樣保留，包括上游[違反 schema 的組合](https://github.com/OvertureMaps/data/issues/542)，其中
`is_land` 和 `is_territorial` 均為 true；該組合會產生我們的標準 `type = mixed`。

### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [識別碼](/docs#models/Id) - 穩定的 GERS UUID；見
  [Overture 的 GERS 文件](https://docs.overturemaps.org/gers/)
- `geometry` - [幾何](/docs#models/Geometry) - 保留 Polygon 和 MultiPolygon 值
- `is_land` - 正規化為 <black>isLand</black>
- `is_territorial` - 正規化為 <black>isTerritorial</black>

### 增補欄位

保留原始資料完整範圍並加以補充的欄位：

- `sources` - [來源](/docs#models/Sources) - 包裹於 <black>overture</black>
  鍵之下，以便與其他資料集融合，同時保留來源鏈歸屬

### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `division_id` - 正規化為 <black>divisionId</black>
- `bbox` - [包圍盒](/docs#models/BBox)，由發佈的標準幾何計算得出
- `class` - 正規化為標準
  <black>type</black>（<black>land</black>、<black>maritime</black>，或在兩個覆蓋標誌均為真時為
  <black>mixed</black>）

### 兼容欄位

透過 Overture 兼容 key 保留的欄位：

- `version` - 可於 <black>overture.version</black> 取得
- `subtype` - 可於 <black>overture.subtype</black> 取得
- `class` - 可於 <black>overture.class</black> 取得

這些欄位可在任何包含此幾何的 API 回應中，透過
<black>included[].attributes.sourceKeys.overture.{{ PROPERTYNAME }}</black> 取得。

### 不公開欄位

以下欄位不會作為 [DivisionArea](/docs#models/DivisionArea) 的一部分公開：

未來的 Overture 兼容 API 會提供這些欄位 <orange>即將推出</orange>。

#### 因為沒有變異

- `theme` - 永遠為 <black>divisions</black>
- `type` - 永遠為 <black>divisionArea</black>
- `country` - 永遠為 <black>HK</black>
- `region` - 空值

#### 因為所有權

- `names` - 由相關 [Division](/docs#models/Division) 擁有，不在
  [DivisionArea](/docs#models/DivisionArea) 上重複

- `admin_level` - 在預檢時接受，但不在標準 [DivisionArea](/docs#models/DivisionArea)
  幾何上公開；相關 [Division](/docs#models/Division) 是此行政層級屬性的標準擁有者。

# ZH-HANS

## 更新记录

- <orange>上游</orange> OSM 截止日期：<black>2026-06-06</black>

## 兼容性

SaanSeoi 的 [DivisionArea](/docs#models/DivisionArea) 在可行范围内保持与 Overture 的
[DivisionArea](https://docs.overturemaps.org/schema/reference/divisions/division_area/)
类型兼容。此 Overture 变体旨在为 SaanSeoi 的 地理 [Division](/docs#models/Division)
记录提供默认的面积几何。当标准模型更适合香港时，我们会偏离 Overture
schema（`{{sourceSchemaVersion}}`）。

来源覆盖标志会原样保留，包括上游[违反 schema 的组合](https://github.com/OvertureMaps/data/issues/542)，其中
`is_land` 和 `is_territorial` 均为 true；该组合会产生我们的标准 `type = mixed`。

### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [标识码](/docs#models/Id) - 稳定的 GERS UUID；见
  [Overture 的 GERS 文档](https://docs.overturemaps.org/gers/)
- `geometry` - [几何](/docs#models/Geometry) - 保留 Polygon 和 MultiPolygon 值
- `is_land` - 规范化為 <black>isLand</black>
- `is_territorial` - 规范化為 <black>isTerritorial</black>

### 增补字段

保留原始数据完整范围并加以补充的字段：

- `sources` - [来源](/docs#models/Sources) - 包裹在 <black>overture</black>
  键下，以便与其他数据集融合，同时保留来源链归属

### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `division_id` - 规范化為 <black>divisionId</black>
- `bbox` - [包围盒](/docs#models/BBox)，由发布的标准几何计算得出
- `class` - 规范化为标准
  <black>type</black>（<black>land</black>、<black>maritime</black>，或两个覆盖标志均为真时为
  <black>mixed</black>）

### 兼容字段

通过 Overture 兼容 key 保留的字段：

- `version` - 可在 <black>overture.version</black> 取得
- `subtype` - 可在 <black>overture.subtype</black> 取得
- `class` - 可在 <black>overture.class</black> 取得

这些字段可在任何包含此几何的 API 响应中，通过
<black>included[].attributes.sourceKeys.overture.{{ PROPERTYNAME }}</black> 取得。

### 不公开字段

以下字段不会作为 [DivisionArea](/docs#models/DivisionArea) 的一部分公开：

未来的 Overture 兼容 API 会提供这些字段 <orange>即将推出</orange>。

#### 因为没有变化

- `theme` - 始终为 <black>divisions</black>
- `type` - 始终为 <black>divisionArea</black>
- `country` - 始终为 <black>HK</black>
- `region` - 空值

#### 因为所有权

- `names` - 由相关 [Division](/docs#models/Division) 所有，不在
  [DivisionArea](/docs#models/DivisionArea) 上重复

- `admin_level` - 在预检时接受，但不在标准 [DivisionArea](/docs#models/DivisionArea)
  几何上公开；相关 [Division](/docs#models/Division) 是此行政层级属性的标准所有者。
