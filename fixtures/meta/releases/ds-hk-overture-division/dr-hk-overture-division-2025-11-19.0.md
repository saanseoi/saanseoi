---
createdAt: "2026-07-22T00:00:00.000Z"
updatedAt: "2026-08-20T00:00:00.000Z"
dataset: "ds-hk-overture-division"
release: "dr-hk-overture-division-2025-11-19.0"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-11-19.0"
releaseVersion: "2025-11-19.0"
sourceSchemaVersion: "1.14.0"
type: "division"
cohortKey: "2025-11-19.0"
releaseNotesUrl: "https://docs.overturemaps.org/blog/2025/11/19/release-notes/#divisions"
---

# EN

## Changelog

- <orange>Upstream</orange> Refreshed OSM data on <black>2025-11-06</black>
- <orange>Upstream</orange> Made minor, incremental updates to the data

## Compatibility

SaanSeoi's [Division](/docs#models/Division) retains compatibility with Overture's
[division](https://docs.overturemaps.org/schema/reference/divisions/division/) type
where possible. However, we will diverge from the source model when localised handling
is meaningful for Hong Kong. We deviate from Overture schema (`{{sourceSchemaVersion}}`)
in the following ways:

### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

### Enriched Fields

Fields which retain the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) - wrapped under the
  <black>overture</black> key to allow conflation with other datasets while retaining
  attribution lineage of the source.

### Normalised Fields

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
  <black>rawProperties.hierarchies</black>.
  - `hierarchies[][].division_id` - as <black>hierarchies[].division_id</black>
- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) maps to the
  [canonical <black>type</black> and <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1)
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) maps to the
  canonical <black>type</black> and <black>level</black>
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) maps
  to the canonical hierarchy entry's <black>type</black> and <black>level</black>

### Dropped Fields

Fields which are not exposed as part of [Division](/docs#models/Division). The original
source value remains available in the
[Divisions source-record endpoint](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)
under `rawProperties`, where the source record remains available. Of the fields listed
below, all listed fields are available in the source record under `rawProperties`; they
are not duplicated in the canonical Division resource.

#### Due to zero variance

- `names.rules[].perspectives` - empty
- `names.rules[].between` - empty
- `names.rules[].side` - empty
- `theme` - always <black>divisions</black>
- `type` - always <black>division</black>
- `country` - always <black>HK</black>
- `region` - empty
- `perspectives` - empty
- `norms` - only <black>{driving_side: left}</black> for the whole SAR

#### Due to redundancy

- `parent_division_id` - redundant with the last retained canonical
  <black>hierarchy[].division_id</black> entry
- `hierarchies[][].name` - redundant, as the division record has a name too

#### Due to quality issues

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
suburb          209
town             16
village        199
```

- `population` - too sparse for storage or API exposure: only 5 of 1,810 records are
  non-null in this source version, and given the source of the data, this is expected to
  remain the case.

#### Due to veracity issues

- `capital_division_ids` - while each district is given a "capital", there is no concept
  of a district capital in Hong Kong
- `capital_of_divisions` - see <black>capital_division_ids</black>.

#### Due to source ownership

- `version` - source-record metadata and in the raw publisher source record, but not
  duplicated in the canonical Division response

### Dropped Values

#### Due to redundancy

- `hierarchies[][]` - the top-level country ancestor is implicit for every division in
  the Hong Kong SAR, and the division itself is redundant with the row being described.

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 於 <black>2025-11-06</black> 更新 OSM 資料
- <orange>上游</orange> 對資料作出輕微、逐步的更新

## 兼容性

SaanSeoi 的 [Division](/docs#models/Division) 在可行範圍內保持與 Overture
[division](https://docs.overturemaps.org/schema/reference/divisions/division/)
類型的兼容性。然而，當本地化處理對香港具有意義時，我們會與來源模型有所不同。相對於 Overture
schema（`{{sourceSchemaVersion}}`），我們在以下方面有所偏離：

### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [Id](/docs#models/Id)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

### 增補欄位

保留原始資料完整範圍並加以補充的欄位：

- `sources` - [Sources](/docs#models/Sources) - 包裹於 <black>overture</black>
  key 之下，以便與其他資料集融合，同時保留來源鏈歸屬。

### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `names` -
  [按 locale 正規化](saanseoi:en:note/overture-division-locale-normalization/v1) 為
  [DivisionI18n](/docs#models/DivisionI18n)
  - `names.common` 作為 <black>i18n.{{ LOCALE }}.name</black>
  - `names.primary` 作為 <black>i18n.{{LOCALE}}.name</black> 的 fallback，並推斷 locale
  - `names.rules` 作為 <black>i18n.{{ LOCALE }}.rules</black>
- `hierarchies[][]` -
  [正規化為 division hierarchy](saanseoi:en:note/overture-division-hierarchy-normalization/v1)
  為
  [DivisionHierarchy](/docs#models/DivisionHierarchy)。原始來源 hierarchy 可在來源記錄回應的
  <black>rawProperties.hierarchies</black> 中取得。
  - `hierarchies[][].division_id` - 作為 <black>hierarchy[].division_id</black>

- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) 映射至
  [canonical <black>type</black> 和 <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1)
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) 映射至canonical
  <black>type</black> 和 <black>level</black>
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) 映射至
  [canonical <black>type</black> 和 <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1)，原始 hierarchy 可在來源記錄回應的
  <black>rawProperties.hierarchies</black> 中取得

### 不公開欄位

以下欄位不會作為 [Division](/docs#models/Division)
的一部分公開。原始來源值會在來源記錄獲保留時，透過
[Divisions 來源記錄端點](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`rawProperties` 提供。以下列出的欄位均可在保留來源記錄的 `rawProperties`
中取得；這些欄位不會在 canonical `Division` 資源中重複保存。

#### 因為來源擁有權

- `version` - 保留為來源記錄 metadata 及原始發布者物件的一部分，但不會在 canonical
  Division 回應中重複保存

#### 因為沒有變異

- `names.rules[].perspectives` - 空值
- `names.rules[].between` - 空值
- `names.rules[].side` - 空值
- `theme` - 永遠為 <black>divisions</black>
- `type` - 永遠為 <black>division</black>
- `country` - 永遠為 <black>HK</black>
- `region` - 空值
- `perspectives` - 空值
- `norms` - 整個 SAR 僅有 <black>{driving_side: left}</black>

#### 因為冗餘

- `parent_division_id` - 與最後保留的 canonical <black>hierarchy[].division_id</black>
  entry 重複
- `hierarchies[][].name` - 屬於冗餘，因為 division record 本身已有名稱

#### 因為品質問題

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

#### 因為真確性問題

- `capital_division_ids` - 雖然每個 district 都獲指定一個「capital」，但香港並沒有 district
  capital 的概念
- `capital_of_divisions` - 見 <black>capital_division_ids</black>。

### 不保留的值

#### 因為冗餘

- `hierarchies[][]` - 對香港特別行政區的每個 division 而言，最上層 country
  ancestor 是隱含的；而 division 本身亦與該 row 所描述的對象重複。

# ZH-HANS

## 更新记录

- <orange>上游</orange> 于 <black>2025-11-06</black> 更新 OSM 数据
- <orange>上游</orange> 对数据作出轻微、渐进式更新

## 兼容性

SaanSeoi 的 [Division](/docs#models/Division) 在可行范围内保持与 Overture
[division](https://docs.overturemaps.org/schema/reference/divisions/division/)
类型的兼容性。然而，当本地化处理对香港具有意义时，我们会与来源模型有所不同。相对于 Overture
schema（`{{sourceSchemaVersion}}`），我们在以下方面有所偏离：

### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [Id](/docs#models/Id)
- `cartography` - [CartographicHints](/docs#models/CartographicHints)
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `wikidata` - [WikidataId](/docs#models/WikidataId)

### 增补字段

保留原始数据完整范围并加以补充的字段：

- `sources` - [Sources](/docs#models/Sources) - 包裹在 <black>overture</black>
  key 下，以便与其他数据集融合，同时保留来源链归属。

### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `names` -
  [按 locale 规范化](saanseoi:en:note/overture-division-locale-normalization/v1) 为
  [DivisionI18n](/docs#models/DivisionI18n)
  - `names.common` 作为 <black>i18n.{{ LOCALE }}.name</black>
  - `names.primary` 作为 <black>i18n.{{LOCALE}}.name</black> 的 fallback，并推断 locale
  - `names.rules` 作为 <black>i18n.{{ LOCALE }}.rules</black>
- `hierarchies[][]` -
  [规范化为 division hierarchy](saanseoi:en:note/overture-division-hierarchy-normalization/v1)
  为
  [DivisionHierarchy](/docs#models/DivisionHierarchy)。原始来源 hierarchy 可在源记录响应的
  <black>rawProperties.hierarchies</black> 中获取。
  - `hierarchies[][].division_id` - 作为 <black>hierarchy[].division_id</black>

- `subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) 映射至
  [canonical <black>type</black> 和 <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1)，并可于
  <black>rawProperties.subtype</black> 中取得原始值
- `class` - [OvertureDivisionClass](/docs#models/OvertureDivisionClass) 映射至canonical
  <black>type</black> 和 <black>level</black>，原始值可于
  <black>rawProperties.class</black> 中取得
- `hierarchies[][].subtype` - [OverturePlaceType](/docs#models/OverturePlaceType) 映射至
  [canonical <black>type</black> 和 <black>level</black>](saanseoi:en:note/overture-division-type-level-mapping/v1)，原始 hierarchy 则保留于
  <black>rawProperties.hierarchies</black>

### 不公开字段

以下字段不会作为 [Division](/docs#models/Division)
的一部分公开。原始来源值会在源记录得到保留时，通过
[Divisions 源记录端点](/docs#tag/Sources/operation/listDivisionSourceRecordsV0) 的
`rawProperties` 提供。以下列出的字段均可在保留源记录的 `rawProperties`
中取得；这些字段不会在 canonical `Division` 资源中重复保存。

#### 因为来源拥有权

- `version` - 保留为源记录 metadata 及原始发布者对象的一部分，但不会在 canonical
  Division 响应中重复保存

#### 因为没有变化

- `names.rules[].perspectives` - 空值
- `names.rules[].between` - 空值
- `names.rules[].side` - 空值
- `theme` - 始终为 <black>divisions</black>
- `type` - 始终为 <black>division</black>
- `country` - 始终为 <black>HK</black>
- `region` - 空值
- `perspectives` - 空值
- `norms` - 整个 SAR 仅有 <black>{driving_side: left}</black>

#### 因为冗余

- `parent_division_id` - 与最后保留的 canonical <black>hierarchy[].division_id</black>
  entry 重复
- `hierarchies[][].name` - 属于冗余，因为 division record 本身已有名称

#### 因为质量问题

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

#### 因为真实性问题

- `capital_division_ids` - 虽然每个 district 都获指定一个“capital”，但香港并没有 district
  capital 的概念
- `capital_of_divisions` - 见 <black>capital_division_ids</black>。

### 不保留的值

#### 因为冗余

- `hierarchies[][]` - 对香港特别行政区的每个 division 而言，最上层 country
  ancestor 是隐含的；而 division 本身也与该 row 所描述的对象重复。
