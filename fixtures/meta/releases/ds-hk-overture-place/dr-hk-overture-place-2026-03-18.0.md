---
createdAt: "2026-07-14T05:19:28.642Z"
updatedAt: "2026-08-20T00:00:00.000Z"
dataset: "ds-hk-overture-place"
release: "dr-hk-overture-place-2026-03-18.0"
regionCode: "hk"
source: "overture"
sourceVersion: "2026-03-18.0"
releaseVersion: "2026-03-18.0"
sourceSchemaVersion: "1.16.0"
type: "place"
cohortKey: "2026-03-18.0"
releaseNotesUrl: "https://docs.overturemaps.org/blog/2026/03/18/release-notes/#places"
---

# EN

## Changelog

- <orange>Upstream</orange> Made improvements to the <black>taxonomy</black> and
  <black>basic_category</black> fields
- <orange>Upstream</orange> Adjusted the methods used to calculate feature-level
  <black>confidence</black> scores

## Compatibility

SaanSeoi's [Place](/docs#models/Place) is compatible with Overture's
[place](https://docs.overturemaps.org/schema/reference/places/place/) type where
possible. A Place is represented as a point of interest with localised names, publisher
categories, contact details, and optional context from the Hong Kong Government Address
Lookup Service (ALS). We deviate from Overture schema (`{{sourceSchemaVersion}}`) where
a canonical model is more useful for Hong Kong.

The complete publisher data remains available in the Overture source record, including
fields which are normalised or are not exposed by the canonical Place model.

### Direct Fields

Fields that use the Overture value directly:

- `id` - [Id](/docs#models/Id) - a stable GERS UUID; see
  [Overture's GERS documentation](https://docs.overturemaps.org/gers/)
- `bbox` - [BBox](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `operating_status` -
  [OperationStatus](https://docs.overturemaps.org/schema/reference/places/types/operating_status/) -
  exposed as <black>operatingStatus</black> in the API response
- `confidence` - [ConfidenceScore](/docs#models/ConfidenceScore)
- `websites` - [Array<HttpUrl>](/docs#models/HttpUrl)
- `socials` - [Array<HttpUrl>](/docs#models/HttpUrl)
- `emails` - [Array<EmailStr>](/docs#models/EmailStr)
- `phones` - [Array<PhoneNumber>](/docs#models/PhoneNumber)

### Enriched Fields

Fields which include the full extent of the original data, with certain additions:

- `sources` - [Sources](/docs#models/Sources) the complete publisher source-attribution
  array includes each source record's property, dataset, licence, record identifier, and
  other available provenance fields. It's then wrapped under the <black>overture</black>
  key to allow conflation with other datasets while preserving attribution lineage of
  the source.

### Normalised Fields

Fields reorganised for storage, query, or API response shaping:

- `basic_category` - exposed as <black>place.basicCategory</black>.
- `taxonomy.primary` - exposed as <black>place.taxonomy.primary</black>.
- `taxonomy.hierarchy` - exposed as <black>place.taxonomy.hierarchy</black>.
- `taxonomy.alternate` - exposed as <black>place.taxonomy.alternates</black>. For
  earlier source variants, <black>categories.alternate</black> remains the fallback.
- `brand` - Its Wikidata identifier is exposed as <black>place.wikidataId</black>
  ([WikidataId](/docs#models/WikidataId)), and its localised names are exposed through
  <black>i18n[].brandName</black>, <black>i18n[].brandNameVariant</black>, and
  <black>i18n[].brandNameAlts</black> ([PlaceI18n](/docs#models/PlaceI18n)).
- `addresses` - <black>freeform</black> addresses are normalised by locale into
  [PlaceI18n](/docs#models/PlaceI18n), and are exposed through
  <black>i18n[].freeformAddress</black>. A separate <black>address2dId</black> is
  populated only when a value can be matched to the selected ALS snapshot; this release
  does not resolve an <black>address3dId</black>. We omit the other keys under addresses
  because they have quality issues.
- `names` - normalised by locale into [PlaceI18n](/docs#models/PlaceI18n). The first
  value for a locale is the canonical name, later values are retained as alternatives
  and variants, and locale-less values are marked as inferred.

### Derived Indexes and Projections

- Each Place is indexed into H3 cells at resolutions <black>5</black>, <black>7</black>,
  and <black>9</black> for the Places <black>by-cell</black> API.
- The full-text index is rebuilt for the active snapshot from localised names, brand
  names, taxonomy, address, division, and street text.

### Dropped Fields

Fields which are not exposed as part of [Place](/docs#models/Place). The original source
value remains available in the
[Places source-record endpoint](/docs#tag/Sources/operation/listPlaceSourceRecordsV0)
under `rawProperties`, where the source record remains available.

#### Due to zero variance

- `theme` - always <black>places</black>
- `type` - always <black>place</black>

#### Due to normalisation

- `categories` - dropped because it is redundant with <black>place.basicCategory</black>
  and <black>place.taxonomy</black>.

#### Due to source ownership

- `version` - source-record metadata and in the raw publisher source record, but not
  duplicated in the canonical Place response

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 改進 <black>taxonomy</black> 及 <black>basic_category</black>
  欄位
- <orange>上游</orange> 調整計算要素層級 <black>confidence</black> 分數的方法

## 兼容性

SaanSeoi 的 [Place](/docs#models/Place) 在可行範圍內保持與 Overture 的
[place](https://docs.overturemaps.org/schema/reference/places/place/)
類型兼容。Place 以具備本地化名稱、發布者分類、聯絡資料，以及可選香港政府地址查詢服務（ALS）背景資料的興趣點表示。當標準模型對香港更有意義時，我們會偏離 Overture
schema（`{{sourceSchemaVersion}}`）。

完整的發布者斷言會保留在 Overture 來源記錄中，包括已正規化或不會由標準 Place 模型公開的欄位。

### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [識別碼](/docs#models/Id) - 穩定的 GERS UUID；見
  [Overture 的 GERS 文件](https://docs.overturemaps.org/gers/)
- `bbox` - [包圍盒](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `operating_status` -
  [OperationStatus](https://docs.overturemaps.org/schema/reference/places/types/operating_status/) - 在 API 回應中公開為
  <black>operatingStatus</black>
- `confidence` - [ConfidenceScore](/docs#models/ConfidenceScore) - 發布者的信心值
- `websites` - [Array<HttpUrl>](/docs#models/HttpUrl) - 發布者網站值
- `socials` - [Array<HttpUrl>](/docs#models/HttpUrl) - 發布者社交平台資料值
- `emails` - [Array<EmailStr>](/docs#models/EmailStr) - 發布者電郵值
- `phones` - [Array<PhoneNumber>](/docs#models/PhoneNumber) - 發布者電話值

### 增補欄位

包含原始資料完整範圍並加以補充的欄位：

- `sources` - [Sources](/docs#models/Sources)
  完整的發布者來源歸屬陣列，包括每個來源記錄的 property、dataset、授權、記錄識別碼及其他可用溯源欄位。它會包裹於
  <black>overture</black> key 下，以便與其他資料集融合，同時保留來源歸屬鏈。

### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `basic_category` - 在 API 回應中公開為 <black>place.basicCategory</black>。
- `taxonomy.primary` - 在 API 回應中公開為 <black>place.taxonomy.primary</black>。
- `taxonomy.hierarchy` - 在 API 回應中公開為 <black>place.taxonomy.hierarchy</black>。
- `taxonomy.alternate` - 在 API 回應中公開為
  <black>place.taxonomy.alternates</black>。對較早的來源版本，<black>categories.alternate</black>
  仍是後備值。
- `brand` - 其 Wikidata 識別碼公開為
  <black>place.wikidataId</black>（[WikidataId](/docs#models/WikidataId)），本地化名稱公開於
  <black>i18n[].brandName</black>、<black>i18n[].brandNameVariant</black> 及
  <black>i18n[].brandNameAlts</black>（[PlaceI18n](/docs#models/PlaceI18n)）。
- `addresses` - <black>freeform</black> 地址按 locale 正規化為
  [PlaceI18n](/docs#models/PlaceI18n)，並透過 <black>i18n[].freeformAddress</black>
  公開。只有在值能與所選 ALS snapshot 配對時才會填入
  <black>address2dId</black>；此版本不會解析
  <black>address3dId</black>。地址下的其他鍵因品質問題而省略。
- `names` - 按 locale 正規化為
  [PlaceI18n](/docs#models/PlaceI18n)。每個 locale 的第一個值為標準名稱，其後的值保留為替代名稱及變體；沒有 locale 的值會標記為推斷所得。

### 衍生索引及 projection

- 每個 Place 會在 H3 resolution <black>5</black>、<black>7</black> 及 <black>9</black>
  建立索引，供 Places <black>by-cell</black> API 使用
- 目前 snapshot 會重建全文索引，內容來自本地化名稱、品牌名稱、taxonomy、地址、division 及 street 文字

### 不公開欄位

以下欄位不會作為 [Place](/docs#models/Place)
的一部分公開。原始來源值會在來源記錄獲保留時，透過
[Places 來源記錄端點](/docs#tag/Sources/operation/listPlaceSourceRecordsV0) 的
`rawProperties` 提供。

#### 因為沒有變異

- `theme` - 永遠為 <black>places</black>
- `type` - 永遠為 <black>place</black>

#### 因為正規化

- `categories` - 因與 <black>place.basicCategory</black> 及
  <black>place.taxonomy</black> 重複而捨棄。

#### 因為來源所有權

- `version` - 作為來源記錄 metadata 及原始發布者斷言保留，但不會在標準 Place 回應中重複

# ZH-HANS

## 更新记录

- <orange>上游</orange> 改进 <black>taxonomy</black> 及 <black>basic_category</black>
  字段
- <orange>上游</orange> 调整计算要素级别 <black>confidence</black> 分数的方法

## 兼容性

SaanSeoi 的 [Place](/docs#models/Place) 在可行范围内保持与 Overture 的
[place](https://docs.overturemaps.org/schema/reference/places/place/)
类型兼容。Place 以具备本地化名称、发布者分类、联系资料，以及可选香港政府地址查询服务（ALS）背景资料的兴趣点表示。当标准模型对香港更有意义时，我们会偏离 Overture
schema（`{{sourceSchemaVersion}}`）。

完整的发布者断言会保留在 Overture 源记录中，包括已规范化或不会由标准 Place 模型公开的字段。

### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [标识码](/docs#models/Id) - 稳定的 GERS UUID；见
  [Overture 的 GERS 文档](https://docs.overturemaps.org/gers/)
- `bbox` - [包围盒](/docs#models/BBox)
- `geometry` - [Geometry](/docs#models/Geometry)
- `operating_status` -
  [OperationStatus](https://docs.overturemaps.org/schema/reference/places/types/operating_status/) - 在 API 响应中公开为
  <black>operatingStatus</black>
- `confidence` - [ConfidenceScore](/docs#models/ConfidenceScore) - 发布者的置信值
- `websites` - [Array<HttpUrl>](/docs#models/HttpUrl) - 发布者网站值
- `socials` - [Array<HttpUrl>](/docs#models/HttpUrl) - 发布者社交平台资料值
- `emails` - [Array<EmailStr>](/docs#models/EmailStr) - 发布者电子邮件值
- `phones` - [Array<PhoneNumber>](/docs#models/PhoneNumber) - 发布者电话值

### 增补字段

包含原始数据完整范围并加以补充的字段：

- `sources` - [Sources](/docs#models/Sources)
  完整的发布者来源归属数组，包括每个源记录的 property、dataset、许可、记录标识码及其他可用溯源字段。它会包裹于
  <black>overture</black> key 下，以便与其他数据集融合，同时保留来源归属链。

### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `basic_category` - 在 API 响应中公开为 <black>place.basicCategory</black>。
- `taxonomy.primary` - 在 API 响应中公开为 <black>place.taxonomy.primary</black>。
- `taxonomy.hierarchy` - 在 API 响应中公开为 <black>place.taxonomy.hierarchy</black>。
- `taxonomy.alternate` - 在 API 响应中公开为
  <black>place.taxonomy.alternates</black>。对于较早的源版本，<black>categories.alternate</black>
  仍是后备值。
- `brand` - 其 Wikidata 标识符公开为
  <black>place.wikidataId</black>（[WikidataId](/docs#models/WikidataId)），本地化名称公开于
  <black>i18n[].brandName</black>、<black>i18n[].brandNameVariant</black> 及
  <black>i18n[].brandNameAlts</black>（[PlaceI18n](/docs#models/PlaceI18n)）。
- `addresses` - <black>freeform</black> 地址按 locale 规范化为
  [PlaceI18n](/docs#models/PlaceI18n)，并通过 <black>i18n[].freeformAddress</black>
  公开。只有在值能与所选 ALS snapshot 匹配时才会填入
  <black>address2dId</black>；此版本不会解析
  <black>address3dId</black>。地址下的其他键因质量问题而省略。
- `names` - 按 locale 规范化为
  [PlaceI18n](/docs#models/PlaceI18n)。每个 locale 的第一个值为标准名称，其后的值保留为替代名称及变体；没有 locale 的值会标记为推断所得。

### 衍生索引及 projection

- 每个 Place 会在 H3 resolution <black>5</black>、<black>7</black> 及 <black>9</black>
  建立索引，供 Places <black>by-cell</black> API 使用
- 当前 snapshot 会重建全文索引，内容来自本地化名称、品牌名称、taxonomy、地址、division 及 street 文本

### 不公开字段

以下字段不会作为 [Place](/docs#models/Place)
的一部分公开。原始源值会在源记录得到保留时，通过
[Places 源记录端点](/docs#tag/Sources/operation/listPlaceSourceRecordsV0) 的
`rawProperties` 提供。

#### 因为没有变化

- `theme` - 始终为 <black>places</black>
- `type` - 始终为 <black>place</black>

#### 因为规范化

- `categories` - 因与 <black>place.basicCategory</black> 及
  <black>place.taxonomy</black> 重复而舍弃。

#### 因为来源所有权

- `version` - 作为源记录 metadata 及原始发布者断言保留，但不会在标准 Place 响应中重复
