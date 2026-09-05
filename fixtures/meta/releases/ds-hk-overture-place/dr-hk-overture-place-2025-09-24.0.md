---
createdAt: "2026-07-06T14:53:53.553Z"
updatedAt: "2026-08-20T00:00:00.000Z"
dataset: "ds-hk-overture-place"
release: "dr-hk-overture-place-2025-09-24.0"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-09-24.0"
releaseVersion: "2025-09-24.0"
sourceSchemaVersion: "1.12.0"
type: "place"
cohortKey: "2025-09-24.0"
releaseNotesUrl: "https://docs.overturemaps.org/blog/2025/09/24/release-notes/#places"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release
- <orange>Upstream</orange> Added <black>license</black> within <black>sources</black>
  and populated it with applicable license information
- <orange>Upstream</orange> Added a new <black>operating_status</black> property,
  indicating whether a place is "open", "permanently_closed", or "temporarily_closed";
  all values were set to "open" for the September release
- <orange>Upstream</orange> Added approximately six million POIs from Foursquare Open
  Source Places
- <orange>Upstream</orange> Implemented signal "patches" to dynamically update the
  <black>confidence</black> property based on signals

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

- `categories.primary` - exposed as <black>place.basicCategory</black> and
  <black>place.taxonomy.primary</black> in the API response. This source version does
  not yet provide separate `basic_category` and `taxonomy` fields, so the same primary
  category supplies both values. See [Place](/docs#models/Place) and
  [PlaceTaxonomy](/docs#models/PlaceTaxonomy) for the response datatypes.
- `categories.alternate` - exposed as <black>place.taxonomy.alternates</black> in the
  API response ([PlaceTaxonomy](/docs#models/PlaceTaxonomy)).
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

#### Due to source ownership

- `version` - source-record metadata and in the raw publisher source record, but not
  duplicated in the canonical Place response

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 初始版本
- <orange>上游</orange> 在 <black>sources</black> 中新增
  <black>license</black>，並填入適用的授權資訊
- <orange>上游</orange> 新增 <black>operating_status</black>
  欄位，用以表示地點是「open」、「permanently_closed」還是「temporarily_closed」；九月版本的所有值均設為「open」
- <orange>上游</orange> 從 Foursquare Open Source Places 新增約六百萬個興趣點
- <orange>上游</orange> 實作 signal「patches」，根據 signals 動態更新
  <black>confidence</black> 欄位

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

### 來源欄位

保留原始資料完整範圍並加以補充的欄位：

- `sources` - 保留完整的發布者來源歸屬陣列，包括每個來源記錄的 property、dataset、license、記錄識別碼及其他可用的溯源欄位
- `addresses` - 保留發布者地址物件及文字值。只有在值能與所選 ALS
  snapshot 配對時，才會另外填入 <black>address2dId</black>；此 release 不會解析
  <black>address3dId</black>
- `brand` - 完整的發布者品牌物件會保留在 Overture source
  record 中。API 會將其 Wikidata 識別碼公開為 <black>place.wikidataId</black>
  （[WikidataId](/docs#models/WikidataId)），並將本地化名稱公開於
  <black>i18n[].brandName</black>、<black>i18n[].brandNameVariant</black> 及
  <black>i18n[].brandNameAlts</black>（[PlaceI18n](/docs#models/PlaceI18n)）。

不會假定 Overture 地址識別碼就是 SaanSeoi ALS 識別碼。Places
ingest 只有在識別碼存在於所選 ALS
snapshot 時才會先採用；否則會對 ALS 格式化地址值進行 Unicode 正規化、轉為小寫、摺疊空白及去除首尾空白後，嘗試精確配對。未配對的值會保留為發布者地址資料，不會建立或修改官方 ALS 地址。

所選的 ALS address
snapshot 是此 cohort 之前或當時最新發布的兼容 snapshot；只有在沒有較早 snapshot 時，才會向前選取最早的兼容 snapshot。其相關的已發布 division
snapshot 會為目前的 Place projection 提供 division IDs。

### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `categories.primary` - 在 API 回應中公開為 <black>place.basicCategory</black> 及
  <black>place.taxonomy.primary</black>。此來源版本尚未提供獨立的 `basic_category` 及
  `taxonomy` 欄位，因此兩個值都使用相同的 primary category。回應資料類型請參閱
  [Place](/docs#models/Place) 及 [PlaceTaxonomy](/docs#models/PlaceTaxonomy)。
- `categories.alternate` - 在 API 回應中公開為
  <black>place.taxonomy.alternates</black>（[PlaceTaxonomy](/docs#models/PlaceTaxonomy)）。
- `brand` - 其 Wikidata 識別碼公開為 <black>place.wikidataId</black>
  （[WikidataId](/docs#models/WikidataId)），本地化名稱公開於
  <black>i18n[].brandName</black>、<black>i18n[].brandNameVariant</black> 及
  <black>i18n[].brandNameAlts</black>（[PlaceI18n](/docs#models/PlaceI18n)）。
- `addresses` - <black>freeform</black> 地址按 locale 正規化為
  [PlaceI18n](/docs#models/PlaceI18n)，並透過 <black>i18n[].freeformAddress</black>
  公開。只有在值能與所選 ALS snapshot 配對時才會填入
  <black>address2dId</black>；此版本不會解析
  <black>address3dId</black>，地址下其他鍵因品質問題不予保留。
- `names` - 按 locale 正規化為
  [PlaceI18n](/docs#models/PlaceI18n)。每個 locale 的第一個值為標準名稱，其後的值保留為替代名稱及變體；沒有 locale 的值會標記為推斷所得。

### 衍生索引及 projection

- 每個 Place 會在 H3 resolution <black>5</black>、<black>7</black> 及 <black>9</black>
  建立索引，供 Places <black>by-cell</black> API 使用
- 目前 snapshot 會重建全文索引，內容來自本地化名稱、品牌名稱、taxonomy、地址、division 及 street 文字
- <black>placesDivision</black>
  是只供目前使用的 projection，由已接受的 ALS 地址列、其記錄的 division
  snapshot，以及該列的 division IDs 衍生。它不是歷史真相，也不會複製到 Place history
- 對於已連接 ALS 的 Place，Place history 會記錄所選的 address snapshot 及 address
  ID。歷史讀取必須沿著這些已記錄的參考，讀取歷史地址，再使用地址項目的 division
  IDs；不得將歷史 Place 連接至最新的 address 或 division projection

### 不公開欄位

以下欄位不會作為標準 Place 欄位重複儲存。原始值仍可在保留的 Overture 來源斷言中取得。未來會透過 Overture 兼容 API 提供這些欄位
<orange>即將推出</orange>。

#### 因為沒有變異

- `theme` - 永遠為 <black>places</black>
- `type` - 永遠為 <black>place</black>

#### 因為正規化

- `categories` - 其中已填入的值會透過標準分類欄位公開；完整來源物件會保留於 Overture 來源斷言中
- `brand` - 其中已填入的值會透過標準品牌欄位及本地化品牌名稱列公開；完整來源物件會保留於 Overture 來源斷言中
- `names` - 透過 [PlaceI18n](/docs#models/PlaceI18n)
  公開，而不是以原始巢狀 locale 物件公開

#### 因為來源所有權

- `version` - 作為來源記錄 metadata 及原始發布者斷言保留，但不會在標準 Place 回應中重複

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 初始版本
- <orange>上游</orange> 在 <black>sources</black> 中新增
  <black>license</black>，并填入适用的许可信息
- <orange>上游</orange> 新增 <black>operating_status</black>
  字段，用于表示地点是“open”、“permanently_closed” 还是 “temporarily_closed”；九月版本的所有值均设为“open”
- <orange>上游</orange> 从 Foursquare Open Source Places 新增约六百万个兴趣点
- <orange>上游</orange> 实现 signal“patches”，根据 signals 动态更新
  <black>confidence</black> 字段

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

### 来源字段

保留原始数据完整范围并加以补充的字段：

- `sources` - 保留完整的发布者来源归属数组，包括每个来源记录的 property、dataset、license、记录标识码及其他可用的溯源字段
- `addresses` - 保留发布者地址对象及文本值。只有在值能与所选 ALS
  snapshot 匹配时，才会另外填入 <black>address2dId</black>；此 release 不会解析
  <black>address3dId</black>
- `brand` - 完整的发布者品牌对象会保留在 Overture source
  record 中。API 会将其 Wikidata 标识符公开为 <black>place.wikidataId</black>
  （[WikidataId](/docs#models/WikidataId)），并将本地化名称公开于
  <black>i18n[].brandName</black>、<black>i18n[].brandNameVariant</black> 及
  <black>i18n[].brandNameAlts</black>（[PlaceI18n](/docs#models/PlaceI18n)）。

不会假定 Overture 地址标识码就是 SaanSeoi ALS 标识码。Places
ingest 只有在标识码存在于所选 ALS
snapshot 时才会先采用；否则会对 ALS 格式化地址值进行 Unicode 规范化、转换为小写、折叠空格及去除首尾空格后，尝试精确匹配。未匹配的值会保留为发布者地址资料，不会创建或修改官方 ALS 地址。

所选的 ALS address
snapshot 是此 cohort 之前或当时最新发布的兼容 snapshot；只有在没有较早 snapshot 时，才会向前选取最早的兼容 snapshot。其相关的已发布 division
snapshot 会为当前 Place projection 提供 division IDs。

### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `categories.primary` - 在 API 响应中公开为 <black>place.basicCategory</black> 和
  <black>place.taxonomy.primary</black>。此源版本尚未提供独立的 `basic_category` 和
  `taxonomy` 字段，因此两个值都使用相同的 primary category。响应数据类型请参阅
  [Place](/docs#models/Place) 和 [PlaceTaxonomy](/docs#models/PlaceTaxonomy)。
- `categories.alternate` - 在 API 响应中公开为
  <black>place.taxonomy.alternates</black>（[PlaceTaxonomy](/docs#models/PlaceTaxonomy)）。
- `brand` - 其 Wikidata 标识符公开为 <black>place.wikidataId</black>
  （[WikidataId](/docs#models/WikidataId)），本地化名称公开于
  <black>i18n[].brandName</black>、<black>i18n[].brandNameVariant</black> 及
  <black>i18n[].brandNameAlts</black>（[PlaceI18n](/docs#models/PlaceI18n)）。
- `addresses` - <black>freeform</black> 地址按 locale 规范化为
  [PlaceI18n](/docs#models/PlaceI18n)，并通过 <black>i18n[].freeformAddress</black>
  公开。只有在值能与所选 ALS snapshot 匹配时才会填入
  <black>address2dId</black>；此版本不会解析
  <black>address3dId</black>，地址下其他键因质量问题不予保留。
- `names` - 按 locale 规范化为
  [PlaceI18n](/docs#models/PlaceI18n)。每个 locale 的第一个值为标准名称，其后的值保留为替代名称及变体；没有 locale 的值会标记为推断所得。

### 衍生索引及 projection

- 每个 Place 会在 H3 resolution <black>5</black>、<black>7</black> 及 <black>9</black>
  建立索引，供 Places <black>by-cell</black> API 使用
- 当前 snapshot 会重建全文索引，内容来自本地化名称、品牌名称、taxonomy、地址、division 及 street 文本
- <black>placesDivision</black>
  是只供当前使用的 projection，由已接受的 ALS 地址行、其记录的 division
  snapshot，以及该行的 division IDs 衍生。它不是历史真相，也不会复制到 Place history
- 对于已连接 ALS 的 Place，Place history 会记录所选的 address snapshot 及 address
  ID。历史读取必须沿着这些已记录的参考，读取历史地址，再使用地址项目的 division
  IDs；不得将历史 Place 连接至最新的 address 或 division projection

### 不公开字段

以下字段不会作为标准 Place 字段重复存储。原始值仍可在保留的 Overture 源断言中取得。未来会通过 Overture 兼容 API 提供这些字段
<orange>即将推出</orange>。

#### 因为没有变化

- `theme` - 始终为 <black>places</black>
- `type` - 始终为 <black>place</black>

#### 因为规范化

- `categories` - 其中已填入的值会通过标准分类字段公开；完整源对象会保留在 Overture 源断言中
- `brand` - 其中已填入的值会通过标准品牌字段及本地化品牌名称列公开；完整源对象会保留在 Overture 源断言中
- `names` - 通过 [PlaceI18n](/docs#models/PlaceI18n)
  公开，而不是以原始嵌套 locale 对象公开

#### 因为来源所有权

- `version` - 作为源记录 metadata 及原始发布者断言保留，但不会在标准 Place 响应中重复
