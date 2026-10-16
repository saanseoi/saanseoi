---
createdAt: "2026-07-14T05:19:28.642Z"
updatedAt: "2026-08-20T00:00:00.000Z"
dataset: "ds-hk-overture-division"
release: "dr-hk-overture-division-2026-03-18.0"
regionCode: "hk"
source: "overture"
sourceVersion: "2026-03-18.0"
releaseVersion: "2026-03-18.0"
sourceSchemaVersion: "1.16.0"
resourceTypes:
  - "division"
  - "divisionArea"
  - "divisionBoundary"
cohortKey: "2026-03-18.0"
releaseNotesUrl: "https://docs.overturemaps.org/blog/2026/03/18/release-notes/#divisions"
---

# EN

## Changelog

- <orange>Upstream</orange> Made minor, incremental changes to the data

## Division

### Compatibility

SaanSeoi's [Division](/docs#models/Division) retains compatibility with Overture's
[division](https://docs.overturemaps.org/schema/reference/divisions/division/) type
where possible. However, we will diverge from the source model when localised handling
is meaningful for Hong Kong. We deviate from Overture schema (`{{sourceSchemaVersion}}`)
in the following ways:

#### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

#### Enriched Fields

Fields which retain the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the
  <black>overture</black> key to allow conflation with other datasets while retaining
  attribution lineage of the source.

#### Normalised Fields

Fields reorganized for storage, query, or API response shaping:

- `names` -
  [normalised by locale](saanseoi:en:note/overture-division-locale-normalization/v1)
  into [DivisionI18n](/docs#models/DivisionI18n)
  - `names.common` as <black>i18n.{{ LOCALE }}.name</black>
  - `names.primary` as fallback for <black>i18n.{{LOCALE}}.name</black> with an inferred
    locale
  - `names.rules` as <black>i18n.{{ LOCALE }}.rules</black>
- `hierarchies[][]` -
  [normalised as a division hierarchy](saanseoi:en:note/overture-division-hierarchy-normalization/v1)
  into [DivisionHierarchy](/docs#models/DivisionHierarchy). The original source
  hierarchy is available in the source-record response under
  <black>properties.hierarchies</black>.
  - `hierarchies[][].division_id` - as <black>hierarchies[].division_id</black>
- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) maps to the
  [canonical <black>type</black> and <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1)
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) maps to the
  canonical <black>type</black> and <black>level</black>
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) maps
  to the canonical hierarchy entry's <black>type</black> and <black>level</black>
- `admin_level` - contributes to canonical <black>level</black> when available; the
  original source value remains in <black>properties</black>

#### Dropped Fields

Fields which are not exposed as part of [Division](/docs#models/Division). The original
source value remains available in the
[Divisions source-record endpoint](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)
under `properties`, where the source record remains available.

##### Due to zero variance

- `names.rules[].perspectives` - empty
- `names.rules[].between` - empty
- `names.rules[].side` - empty
- `theme` - always <black>divisions</black>
- `type` - always <black>division</black>
- `country` - always <black>HK</black>
- `region` - empty
- `perspectives` - empty
- `norms` - only <black>{driving_side: left}</black> for the whole SAR

##### Due to redundancy

- `parent_division_id` - redundant with the last retained canonical
  <black>hierarchy[].division_id</black> entry
- `hierarchies[][].name` - redundant, as the division record has a name too

##### Due to quality issues

- `local_type` - appears to be sourced from <black>place=*</black> OSM data. It is not
  retained because the observed values are inconsistent, incomplete, and locally
  incongruous. Sample:

```text
borough          4
city             1
dependency       1
hamlet         960
locality         1
neighbourhood  149
quarter        183
region          19
square          72
suburb         209
town            16
village        199
```

- `population` - too sparse for storage or API exposure: only 5 of 1,810 records are
  non-null in this source version, and given the source of the data, this is expected to
  remain the case.

##### Due to veracity issues

- `capital_division_ids` - while each district is given a "capital", there is no concept
  of a district capital in Hong Kong
- `capital_of_divisions` - see <black>capital_division_ids</black>.

##### Due to source ownership

- `version` - source-record metadata and in the raw publisher source record, but not
  duplicated in the canonical Division response

#### Dropped Values

##### Due to redundancy

- `hierarchies[][]` - the top-level country ancestor is implicit for every division in
  the Hong Kong SAR, and the division itself is redundant with the row being described.

## Division Area

### Compatibility

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

#### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `geometry` - [Geometry](/docs#models/Geometry) - retaining Polygon and MultiPolygon
  values
- `is_land` - normalised as <black>isLand</black>
- `is_territorial` - normalised as <black>isTerritorial</black>

#### Enriched Fields

Fields which retain the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the
  <black>overture</black> key to allow conflation with other datasets while retaining
  attribution lineage of the source

#### Normalised Fields

Fields reorganized for storage, query, or API response shaping:

- `division_id` - normalised as <black>divisionId</black>
- `bbox` - [BBox](/docs#models/BBox), calculated from the released canonical geometry
- `class` - normalised to canonical <black>type</black> (<black>land</black>,
  <black>maritime</black>, or <black>mixed</black> when both coverage flags are true)

#### Source fields

The original `version`, `subtype`, and `class` values are available in the retained
source record under `properties`. They are not duplicated in the canonical geometry
resource.

#### Dropped Fields

Fields which are not exposed as part of [DivisionArea](/docs#models/DivisionArea):

The original source value remains available in the
[Divisions source-record endpoint](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)
under `properties`, where the source record remains available.

##### Due to zero variance

- `theme` - always <black>divisions</black>
- `type` - always <black>divisionArea</black>
- `country` - always <black>HK</black>
- `region` - empty

##### Due to ownership

- `names` - owned by the related [Division](/docs#models/Division) and not duplicated on
  [DivisionArea](/docs#models/DivisionArea)

- `admin_level` - accepted during preflight, but not exposed on canonical
  [DivisionArea](/docs#models/DivisionArea); the related
  [Division](/docs#models/Division) is the canonical owner of this administrative-level
  attribute.

## Division Boundary

### Compatibility

SaanSeoi's [DivisionBoundary](/docs#models/DivisionBoundary) retains compatibility with
Overture's
[DivisionBoundary](https://docs.overturemaps.org/schema/reference/divisions/division_boundary/)
type where possible. This Overture variant is intended to provide the default boundary
geometry for SaanSeoi's geographical [Division](/docs#models/Division) records.
Boundaries represent borders between divisions of the same subtype. In Hong Kong, only
district-level divisions have boundaries, as these are the only official administrative
level within the SAR. We deviate from Overture schema (`{{sourceSchemaVersion}}`) where
a canonical model is more useful for Hong Kong.

Source coverage flags are preserved as-is, including the upstream combination which
[runs counter to the schema](https://github.com/OvertureMaps/data/issues/542) where both
`is_land` and `is_territorial` are true; that combination produces our canonical
`type = mixed`.

#### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `geometry` - [Geometry](/docs#models/Geometry), retaining LineString and
  MultiLineString values
- `is_land` - normalised as <black>isLand</black>
- `is_territorial` - normalised as <black>isTerritorial</black>

#### Enriched Fields

Fields which retain the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the
  <black>overture</black> key to allow conflation with other datasets while retaining
  attribution lineage of the source

#### Normalised Fields

Fields reorganized for storage, query, or API response shaping:

- `division_ids[0]` and `division_ids[1]` - normalised as <black>leftDivisionId</black>
  and <black>rightDivisionId</black>
- `bbox` - [BBox](/docs#models/BBox), calculated from the released canonical geometry
- `class` - normalised to canonical <black>type</black> (<black>land</black>,
  <black>maritime</black>, or <black>mixed</black> when both coverage flags are true)

#### Source fields

The original `version`, `subtype`, and `class` values are available in the retained
source record under `properties`. They are not duplicated in the canonical geometry
resource.

#### Dropped Fields

Fields which are not exposed as part of
[DivisionBoundary](/docs#models/DivisionBoundary):

The original source value remains available in the
[Divisions source-record endpoint](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)
under `properties`, where the source record remains available.

##### Due to zero variance

- `theme` - always <black>divisions</black>
- `type` - always <black>divisionBoundary</black>
- `country` - always <black>HK</black>
- `region` - empty
- `is_disputed` - empty
- `perspectives` - empty

The empty values must all be null during preflight, as a non-null value would fails the
upload and trigger a schema review.

##### Due to ownership

- `admin_level` - accepted during preflight, but not exposed on canonical
  [DivisionBoundary](/docs#models/DivisionBoundary); the related
  [Division](/docs#models/Division) is the canonical owner of this administrative-level
  attribute.

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 對資料作出輕微、逐步的更新

## 區劃

### 兼容性

山水的 [Division](/docs#models/Division) 在可行範圍內保持與 Overture
[division](https://docs.overturemaps.org/schema/reference/divisions/division/)
類型的兼容性。然而，當本地化處理對香港具有意義時，我們會與來源模型有所不同。相對於 Overture
schema（`{{sourceSchemaVersion}}`），我們在以下方面有所偏離：

#### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [Id](/docs#models/Id) - 穩定的 GERS UUID；見
  [Overture 的 GERS 文件](https://docs.overturemaps.org/gers/)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

#### 增補欄位

保留原始資料完整範圍並加以補充的欄位：

- `sources` - [Sources](/docs#models/Sources) - 包裹於 <black>overture</black>
  key 之下，以便與其他資料集融合，同時保留來源鏈歸屬。

#### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `names` -
  [按 locale 正規化](saanseoi:zh-hant:note/overture-division-locale-normalization/v1) 為
  [DivisionI18n](/docs#models/DivisionI18n)
  - `names.common` 作為 <black>i18n.{{ LOCALE }}.name</black>
  - `names.primary` 作為 <black>i18n.{{LOCALE}}.name</black> 的 fallback，並推斷 locale
  - `names.rules` 作為 <black>i18n.{{ LOCALE }}.rules</black>
- `hierarchies[][]` -
  [正規化為 division hierarchy](saanseoi:zh-hant:note/overture-division-hierarchy-normalization/v1)
  為
  [DivisionHierarchy](/docs#models/DivisionHierarchy)。原始來源 hierarchy 可在來源記錄回應的
  <black>properties.hierarchies</black> 中取得。
  - `hierarchies[][].division_id` - 作為 <black>hierarchies[].division_id</black>

- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType)
  對應至[標準 <black>type</black> 及 <black>level</black>](saanseoi:zh-hant:note/overture-division-type-level-mapping/v1)
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) 對應至標準
  <black>type</black> 及 <black>level</black>
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType)
  對應至標準層級項目的 <black>type</black> 及 <black>level</black>
- `admin_level` - 在有值時用於標準 <black>level</black>；原始來源值保留於
  <black>properties</black>

#### 不公開欄位

以下欄位不會作為 [Division](/docs#models/Division)
的一部分公開。原始來源值會在來源記錄獲保留時，透過
[Divisions 來源記錄端點](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`properties` 提供。

##### 因為沒有變異

- `names.rules[].perspectives` - 空值
- `names.rules[].between` - 空值
- `names.rules[].side` - 空值
- `theme` - 永遠為 <black>divisions</black>
- `type` - 永遠為 <black>division</black>
- `country` - 永遠為 <black>HK</black>
- `region` - 空值
- `perspectives` - 空值
- `norms` - 整個 SAR 僅有 <black>{driving_side: left}</black>

##### 因為冗餘

- `parent_division_id` - 與最後保留的 canonical <black>hierarchy[].division_id</black>
  entry 重複
- `hierarchies[][].name` - 屬於冗餘，因為 division record 本身已有名稱

##### 因為品質問題

- `local_type` - 看來源自 <black>place=*</black>
  OSM 資料。由於觀察到的值不一致、不完整，且不切合本地脈絡，因此不予保留。樣本：

```text
borough          4
city             1
dependency       1
hamlet         960
locality         1
neighbourhood  149
quarter        183
region          19
square          72
suburb         209
town            16
village        199
```

- `population` - 資料過於稀疏，不適合儲存或在 API 中公開：在此來源版本中，1,810 筆記錄只有 5 筆非 null；鑑於資料來源，預計未來仍會如此。

##### 因為真確性問題

- `capital_division_ids` - 雖然每個 district 都獲指定一個「capital」，但香港並沒有 district
  capital 的概念
- `capital_of_divisions` - 見 <black>capital_division_ids</black>。

##### 因為來源擁有權

- `version` - 保留為來源記錄 metadata 及原始發布者物件的一部分，但不會在 canonical
  Division 回應中重複保存

#### 不保留的值

##### 因為冗餘

- `hierarchies[][]` - 對香港特別行政區的每個 division 而言，最上層 country
  ancestor 是隱含的；而 division 本身亦與該 row 所描述的對象重複。

## 區劃範圍

### 兼容性

山水的 [DivisionArea](/docs#models/DivisionArea) 在可行範圍內保持與 Overture 的
[DivisionArea](https://docs.overturemaps.org/schema/reference/divisions/division_area/)
類型兼容。此 Overture 變體旨在為山水的 地理 [Division](/docs#models/Division)
記錄提供預設的面積幾何。當標準模型更適合香港時，我們會偏離 Overture
schema（`{{sourceSchemaVersion}}`）。

來源覆蓋標誌會原樣保留，包括上游[違反 schema 的組合](https://github.com/OvertureMaps/data/issues/542)，其中
`is_land` 和 `is_territorial` 均為 true；該組合會產生我們的標準 `type = mixed`。

#### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [識別碼](/docs#models/Id) - 穩定的 GERS UUID；見
  [Overture 的 GERS 文件](https://docs.overturemaps.org/gers/)
- `geometry` - [幾何](/docs#models/Geometry) - 保留 Polygon 和 MultiPolygon 值
- `is_land` - 正規化為 <black>isLand</black>
- `is_territorial` - 正規化為 <black>isTerritorial</black>

#### 增補欄位

保留原始資料完整範圍並加以補充的欄位：

- `sources` - [來源](/docs#models/Sources) - 包裹於 <black>overture</black>
  鍵之下，以便與其他資料集融合，同時保留來源鏈歸屬

#### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `division_id` - 正規化為 <black>divisionId</black>
- `bbox` - [包圍盒](/docs#models/BBox)，由發佈的標準幾何計算得出
- `class` - 正規化為標準
  <black>type</black>（<black>land</black>、<black>maritime</black>，或在兩個覆蓋標誌均為真時為
  <black>mixed</black>）

#### 來源欄位

原始 `version`、`subtype` 及 `class` 值可在保留來源記錄的 `properties`
下取得，不會在標準幾何資源中重複保存。

#### 不公開欄位

以下欄位不會作為 [DivisionArea](/docs#models/DivisionArea) 的一部分公開：

原始來源值會在來源記錄獲保留時，透過
[Divisions 來源記錄端點](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`properties` 提供。

##### 因為沒有變異

- `theme` - 永遠為 <black>divisions</black>
- `type` - 永遠為 <black>divisionArea</black>
- `country` - 永遠為 <black>HK</black>
- `region` - 空值

##### 因為所有權

- `names` - 由相關 [Division](/docs#models/Division) 擁有，不在
  [DivisionArea](/docs#models/DivisionArea) 上重複

- `admin_level` - 在預檢時接受，但不在標準 [DivisionArea](/docs#models/DivisionArea)
  幾何上公開；相關 [Division](/docs#models/Division) 是此行政層級屬性的標準擁有者。

## 區劃邊界

### 兼容性

山水的 [DivisionBoundary](/docs#models/DivisionBoundary) 在可行範圍內保持與 Overture 的
[DivisionBoundary](https://docs.overturemaps.org/schema/reference/divisions/division_boundary/)
類型兼容。此 Overture 變體旨在為山水的 [Division](/docs#models/Division)
記錄提供預設的邊界幾何。邊界代表相同 subtype 區劃之間的界線。在香港，只有區級區劃具有邊界，因為這些是特區內唯一的正式行政級別。當標準模型更適合香港時，我們會偏離 Overture
schema（`{{sourceSchemaVersion}}`）。

來源覆蓋標誌會原樣保留，包括上游[違反 schema 的組合](https://github.com/OvertureMaps/data/issues/542)，其中
`is_land` 和 `is_territorial` 均為 true；該組合會產生我們的標準 `type = mixed`。

#### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [識別碼](/docs#models/Id) - 穩定的 GERS UUID；見
  [Overture 的 GERS 文件](https://docs.overturemaps.org/gers/)
- `geometry` - [幾何](/docs#models/Geometry)，保留 LineString 和 MultiLineString 值
- `is_land` - 正規化為 <black>isLand</black>
- `is_territorial` - 正規化為 <black>isTerritorial</black>

#### 增補欄位

保留原始資料完整範圍並加以補充的欄位：

- `sources` - [來源](/docs#models/Sources) - 包裹於 <black>overture</black>
  鍵之下，以便與其他資料集融合，同時保留來源鏈歸屬

#### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `division_ids[0]` 和 `division_ids[1]` - 正規化為 <black>leftDivisionId</black>，以及
  <black>rightDivisionId</black>
- `bbox` - [包圍盒](/docs#models/BBox)，由發佈的標準幾何計算得出
- `class` - 正規化為標準
  <black>type</black>（<black>land</black>、<black>maritime</black>，或在兩個覆蓋標誌均為真時為
  <black>mixed</black>）

#### 來源欄位

原始 `version`、`subtype` 及 `class` 值可在保留來源記錄的 `properties`
下取得，不會在標準幾何資源中重複保存。

#### 不公開欄位

以下欄位不會作為 [DivisionBoundary](/docs#models/DivisionBoundary) 的一部分公開：

原始來源值會在來源記錄獲保留時，透過
[Divisions 來源記錄端點](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`properties` 提供。

##### 因為沒有變異

- `theme` - 永遠為 <black>divisions</black>
- `type` - 永遠為 <black>divisionBoundary</black>
- `country` - 永遠為 <black>HK</black>
- `region` - 空值
- `is_disputed` - 空值
- `perspectives` - 空值

所有空值在預檢時都必須為 null，因為非 null 值會令上傳失敗並觸發 schema 審查。

##### 因為所有權

- `admin_level` - 在預檢時接受，但不在標準
  [DivisionBoundary](/docs#models/DivisionBoundary) 幾何上公開；相關
  [Division](/docs#models/Division) 是此行政層級屬性的標準擁有者。

# ZH-HANS

## 更新记录

- <orange>上游</orange> 对数据作出轻微、渐进式的更新

## 区划

### 兼容性

山水的 [Division](/docs#models/Division) 在可行范围内保持与 Overture
[division](https://docs.overturemaps.org/schema/reference/divisions/division/)
类型的兼容性。然而，当本地化处理对香港具有意义时，我们会与来源模型有所不同。相对于 Overture
schema（`{{sourceSchemaVersion}}`），我们在以下方面有所偏离：

#### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [Id](/docs#models/Id) - 稳定的 GERS UUID；见
  [Overture 的 GERS 文档](https://docs.overturemaps.org/gers/)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

#### 增补字段

保留原始数据完整范围并加以补充的字段：

- `sources` - [Sources](/docs#models/Sources) - 包裹在 <black>overture</black>
  key 下，以便与其他数据集融合，同时保留来源链归属。

#### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `names` -
  [按 locale 规范化](saanseoi:zh-hans:note/overture-division-locale-normalization/v1) 为
  [DivisionI18n](/docs#models/DivisionI18n)
  - `names.common` 作为 <black>i18n.{{ LOCALE }}.name</black>
  - `names.primary` 作为 <black>i18n.{{LOCALE}}.name</black> 的 fallback，并推断 locale
  - `names.rules` 作为 <black>i18n.{{ LOCALE }}.rules</black>
- `hierarchies[][]` -
  [规范化为 division hierarchy](saanseoi:zh-hans:note/overture-division-hierarchy-normalization/v1)
  为
  [DivisionHierarchy](/docs#models/DivisionHierarchy)。原始来源 hierarchy 可在源记录响应的
  <black>properties.hierarchies</black> 中获取。
  - `hierarchies[][].division_id` - 作为 <black>hierarchies[].division_id</black>

- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType)
  对应至[标准 <black>type</black> 及 <black>level</black>](saanseoi:zh-hans:note/overture-division-type-level-mapping/v1)
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) 对应至标准
  <black>type</black> 及 <black>level</black>
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType)
  对应至标准层级项目的 <black>type</black> 及 <black>level</black>
- `admin_level` - 在有值时用于标准 <black>level</black>；原始源值保留于
  <black>properties</black>

#### 不公开字段

以下字段不会作为 [Division](/docs#models/Division)
的一部分公开。原始源值会在源记录得到保留时，通过
[Divisions 源记录端点](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`properties` 提供。

##### 因为没有变化

- `names.rules[].perspectives` - 空值
- `names.rules[].between` - 空值
- `names.rules[].side` - 空值
- `theme` - 始终为 <black>divisions</black>
- `type` - 始终为 <black>division</black>
- `country` - 始终为 <black>HK</black>
- `region` - 空值
- `perspectives` - 空值
- `norms` - 整个 SAR 仅有 <black>{driving_side: left}</black>

##### 因为冗余

- `parent_division_id` - 与最后保留的 canonical <black>hierarchy[].division_id</black>
  entry 重复
- `hierarchies[][].name` - 属于冗余，因为 division record 本身已有名称

##### 因为质量问题

- `local_type` - 看来源于 <black>place=*</black>
  OSM 数据。由于观察到的值不一致、不完整，且不符合本地语境，因此不予保留。样本：

```text
borough          4
city             1
dependency       1
hamlet         960
locality         1
neighbourhood  149
quarter        183
region          19
square          72
suburb         209
town            16
village        199
```

- `population` - 数据过于稀疏，不适合存储或在 API 中公开：在此源版本中，1,810 条记录只有 5 条非 null；鉴于数据来源，预计未来仍会如此。

##### 因为真实性问题

- `capital_division_ids` - 虽然每个 district 都获指定一个“capital”，但香港并没有 district
  capital 的概念
- `capital_of_divisions` - 见 <black>capital_division_ids</black>。

##### 因为来源拥有权

- `version` - 保留为源记录 metadata 及原始发布者对象的一部分，但不会在 canonical
  Division 响应中重复保存

#### 不保留的值

##### 因为冗余

- `hierarchies[][]` - 对香港特别行政区的每个 division 而言，最上层 country
  ancestor 是隐含的；而 division 本身也与该 row 所描述的对象重复。

## 区划范围

### 兼容性

山水的 [DivisionArea](/docs#models/DivisionArea) 在可行范围内保持与 Overture 的
[DivisionArea](https://docs.overturemaps.org/schema/reference/divisions/division_area/)
类型兼容。此 Overture 变体旨在为山水的 地理 [Division](/docs#models/Division)
记录提供默认的面积几何。当标准模型更适合香港时，我们会偏离 Overture
schema（`{{sourceSchemaVersion}}`）。

来源覆盖标志会原样保留，包括上游[违反 schema 的组合](https://github.com/OvertureMaps/data/issues/542)，其中
`is_land` 和 `is_territorial` 均为 true；该组合会产生我们的标准 `type = mixed`。

#### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [标识码](/docs#models/Id) - 稳定的 GERS UUID；见
  [Overture 的 GERS 文档](https://docs.overturemaps.org/gers/)
- `geometry` - [几何](/docs#models/Geometry) - 保留 Polygon 和 MultiPolygon 值
- `is_land` - 规范化为 <black>isLand</black>
- `is_territorial` - 规范化为 <black>isTerritorial</black>

#### 增补字段

保留原始数据完整范围并加以补充的字段：

- `sources` - [来源](/docs#models/Sources) - 包裹在 <black>overture</black>
  键下，以便与其他数据集融合，同时保留来源链归属

#### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `division_id` - 规范化为 <black>divisionId</black>
- `bbox` - [包围盒](/docs#models/BBox)，由发布的标准几何计算得出
- `class` - 规范化为标准
  <black>type</black>（<black>land</black>、<black>maritime</black>，或两个覆盖标志均为真时为
  <black>mixed</black>）

#### 来源字段

原始 `version`、`subtype` 及 `class` 值可在保留源记录的 `properties`
下获取，不会在标准几何资源中重复保存。

#### 不公开字段

以下字段不会作为 [DivisionArea](/docs#models/DivisionArea) 的一部分公开：

原始来源值会在源记录得到保留时，通过
[Divisions 源记录端点](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`properties` 提供。

##### 因为没有变化

- `theme` - 始终为 <black>divisions</black>
- `type` - 始终为 <black>divisionArea</black>
- `country` - 始终为 <black>HK</black>
- `region` - 空值

##### 因为所有权

- `names` - 由相关 [Division](/docs#models/Division) 所有，不在
  [DivisionArea](/docs#models/DivisionArea) 上重复

- `admin_level` - 在预检时接受，但不在标准 [DivisionArea](/docs#models/DivisionArea)
  几何上公开；相关 [Division](/docs#models/Division) 是此行政层级属性的标准所有者。

## 区划边界

### 兼容性

山水的 [DivisionBoundary](/docs#models/DivisionBoundary) 在可行范围内保持与 Overture 的
[DivisionBoundary](https://docs.overturemaps.org/schema/reference/divisions/division_boundary/)
类型兼容。此 Overture 变体旨在为山水的 [Division](/docs#models/Division)
记录提供默认的边界几何。边界代表相同 subtype 区划之间的界线。在香港，只有区级区划具有边界，因为这些是特区内唯一的正式行政级别。当标准模型更适合香港时，我们会偏离 Overture
schema（`{{sourceSchemaVersion}}`）。

来源覆盖标志会原样保留，包括上游[违反 schema 的组合](https://github.com/OvertureMaps/data/issues/542)，其中
`is_land` 和 `is_territorial` 均为 true；该组合会产生我们的标准 `type = mixed`。

#### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [标识码](/docs#models/Id) - 稳定的 GERS UUID；见
  [Overture 的 GERS 文档](https://docs.overturemaps.org/gers/)
- `geometry` - [几何](/docs#models/Geometry)，保留 LineString 和 MultiLineString 值
- `is_land` - 规范化为 <black>isLand</black>
- `is_territorial` - 规范化为 <black>isTerritorial</black>

#### 增补字段

保留原始数据完整范围并加以补充的字段：

- `sources` - [来源](/docs#models/Sources) - 包裹在 <black>overture</black>
  键下，以便与其他数据集融合，同时保留来源链归属

#### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `division_ids[0]` 和 `division_ids[1]` - 规范化为 <black>leftDivisionId</black>，以及
  <black>rightDivisionId</black>
- `bbox` - [包围盒](/docs#models/BBox)，由发布的标准几何计算得出
- `class` - 规范化为标准
  <black>type</black>（<black>land</black>、<black>maritime</black>，或两个覆盖标志均为真时为
  <black>mixed</black>）

#### 来源字段

原始 `version`、`subtype` 及 `class` 值可在保留源记录的 `properties`
下获取，不会在标准几何资源中重复保存。

#### 不公开字段

以下字段不会作为 [DivisionBoundary](/docs#models/DivisionBoundary) 的一部分公开：

原始来源值会在源记录得到保留时，通过
[Divisions 源记录端点](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`properties` 提供。

##### 因为没有变化

- `theme` - 始终为 <black>divisions</black>
- `type` - 始终为 <black>divisionBoundary</black>
- `country` - 始终为 <black>HK</black>
- `region` - 空值
- `is_disputed` - 空值
- `perspectives` - 空值

所有空值在预检时都必须为 null，因为非 null 值会导致上传失败并触发 schema 审查。

##### 因为所有权

- `admin_level` - 在预检时接受，但不在标准
  [DivisionBoundary](/docs#models/DivisionBoundary) 几何上公开；相关
  [Division](/docs#models/Division) 是此行政层级属性的标准所有者。
