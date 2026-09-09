---
createdAt: "2026-09-09T00:26:38.567Z"
updatedAt: "2026-09-09T00:26:38.567Z"
apiFamily: "addresses"
apiVersion: "api-addresses-v0.1"
apiReleaseSet: "data-hk-addresses-2024-07-25.0"
revision: "0"
regionCode: "hk"
cohortKey: "2024-07-25.0"
domainCode: "saanseoi"
---

# EN

## Changelog

- First 山水 | SaanSeoi Addresses API release set for {{regionName:en}}.
- Publishes the Address Lookup Service snapshot for <black>{{ cohortKey }}</black> as
  the primary Address collection. The nearest (i.e. earliest) Overture Division context
  is selected for inclusion in the Addresses API composition.
- Normalises bilingual formatted addresses, premise components, coordinates, government
  identifiers, and publisher provenance into the canonical Address model.

## Revision log

- `r{{ revision }}` contains the initial Address source release and its supporting
  Division source release.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases make up this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- The Address collection is anchored to the Government Address Lookup Service source
  release for this cohort. Address IDs are canonical SaanSeoi identifiers, not ALS CSU
  IDs; use <black>profile=full</black> when you need the retained identifiers and source
  evidence.
- The supporting Overture Division snapshot supplies canonical geographic relationships.
  Where a reviewed matching division or street has a divergent spelling, SaanSeoi uses
  the Overture canonical name and retains the ALS form as an alternative name. ALS
  building, estate and unit wording, and its published coordinates, remain source data.
- <black>Address3D</black> coverage currently extends only to the ALS
  <black>public-rental-housing</black> delivery; ALS has supplied no
  <black>Address3D</black> inventory for other address classes. Coverage describes the
  unit collection attached to an <black>Address2D</black> record. A value of
  <black>none</black> means no such source collection is available, not that the
  building has no units. <black>ancestor</black> coverage means the collection belongs
  to a parent <black>Address2D</black> record, not to the child whose coverage is being
  read. For example, <black>MODEL HOUSING ESTATE</black> is a complex; <black>MAN HONG
  HOUSE</black> is its <black>762–774</black> building parent with one
  <black>422-unit</black> collection, and <black>762</black>, <black>764</black>,
  <black>766</black>, <black>768</black>, <black>770</black> and <black>774</black> are
  distinct section children. ALS does not identify a unit's section, so a section's
  <black>ancestor</black> coverage does not assign any of the <black>422</black> units
  to it. That membership remains unresolved until the source explicitly provides it.
- Building-number ranges preserve the source assertion. They do not imply that every
  intervening number exists, or establish a parent-child relationship between addresses.
- Coordinates identify an address position. They are not a building footprint or a
  postal-delivery guarantee.
- Full-text and building-number search indexes are derived projections of this immutable
  release set. Read the source release notes linked in the
  [Release scope table](#source-heading-release-scope) for publisher-specific quality,
  provenance, and compatibility details.

### Known Quality Issues

- The <b>Building CSU-ID</b> (Common Spatial Unit ID) identifies a publisher spatial
  unit. It is formed by concatenating <black>GEO_REFNO</black>, <black>POLY_TYPE</black>
  and <black>CREATE_DATE</black>. <black>GEO_REFNO</black> is the ten-digit Hong Kong
  1980 Grid reference of the label point inside the building polygon: its two five-digit
  halves are the easting and northing with decimals and the preceding `8` omitted. Here,
  `3372511726` represents E `833725`, N `811726`. <black>POLY_TYPE</black> `T` is
  unclear what it means, but its consistent throughout. <black>CREATE_DATE</black>
  `20141201` is the automatically generated label-creation date, 1 December 2014.
  Together they form `3372511726T20141201`. The label-point reference need not match the
  delivered ALS representative point: this example's easting/northing are `833734`,
  `811742`. The retained ALS GeoJSON exposes only the composite `CsuId`.
- A <black>CSU-ID</black> is <u>not</u> a durable one-to-one address identifier across
  ALS releases. ALS can update a premise to a different CSU without changing its
  building, address or inventory, and change other source assertions while retaining the
  CSU. SaanSeoi therefore retains it as source evidence; but to track cross-release
  identity we use a combination of GeoAddress and bilingual premise components, with a
  [guarded review](?tab=audit) for ambiguity or change. A repeated CSU is not
  necessarily co-located: e.g. six `HUNG FOOK BUILDING` assertions share
  `2092834041P20050609`; five are at E `820929`, N `834040`, while `38 FOOK TAK STREET`
  is at E `821279`, N `833717`, 476.3 metres away. Treat the <black>CSU-ID</black> as
  indicative of identity and location at best.
- The upstream ALS source is inconsistent in its coverage between releases and will
  often drop <black>Address2D</black> and <black>Address3D</black> only for them to
  later appear again. We have attempted to back and/or forward-fill the erroneous
  removal of records where possible.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi {{regionName:zh-Hant}} Addresses API 首個發布集。
- 將 <black>{{ cohortKey }}</black> 的政府地址查詢服務 snapshot 作為主要 Address
  collection 發布，並按 Addresses API composition 選取所需的 Overture
  Division 背景資料。
- 將雙語格式化地址、處所組成部分、座標、政府識別碼及發布者溯源資料正規化為標準 Address 模型。

## 修訂紀錄

- `r{{ revision }}` 包含初始 Address 來源發布及其支援 Division 來源發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- Address collection 以此 cohort 的政府地址查詢服務來源發布為基礎。Address
  ID 是 SaanSeoi 標準識別碼，並非 ALS CSU ID；如需保留的識別碼及來源證據，請使用
  <black>profile=full</black>。
- 支援的 Overture Division
  snapshot 提供標準地理關係，不會取代 ALS 發布的地址文字或座標。
- Address3D coverage 說明 Address2D 記錄可用的單位 collection。coverage 為
  <black>none</black>
  並不證明樓宇沒有單位。祖先 coverage 在關係明確解析前亦不確立成員關係。
- 樓宇號碼範圍保留來源斷言，不表示每個中間號碼均存在，亦不建立地址之間的父子關係。
- 座標標示地址位置，並非樓宇輪廓或郵遞保證。
- 全文及樓宇號碼搜尋索引是此不可變 release set 的衍生 projection。請參閱
  [發布範圍表](#source-heading-release-scope)連結的來源發布附註，以了解發布者特有的資料品質、溯源及相容性資料。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi {{regionName:zh-Hans}} Addresses API 首个发布集。
- 将 <black>{{ cohortKey }}</black> 的政府地址查询服务 snapshot 作为主要 Address
  collection 发布，并按 Addresses API composition 选择所需的 Overture
  Division 背景数据。
- 将双语格式化地址、处所组成部分、坐标、政府标识符及发布者溯源数据规范化为标准 Address 模型。

## 修订记录

- `r{{ revision }}` 包含初始 Address 源发布及其支持 Division 源发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下源发布组成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- Address collection 以此 cohort 的政府地址查询服务源发布为基础。Address
  ID 是 SaanSeoi 标准标识符，并非 ALS CSU ID；如需保留的标识符及源证据，请使用
  <black>profile=full</black>。
- 支持的 Overture Division
  snapshot 提供标准地理关系，不会取代 ALS 发布的地址文本或坐标。
- Address3D coverage 说明 Address2D 记录可用的单位 collection。coverage 为
  <black>none</black>
  并不证明楼宇没有单位。祖先 coverage 在关系明确解析前也不确立成员关系。
- 楼宇号码范围保留源断言，不表示每个中间号码均存在，也不建立地址之间的父子关系。
- 坐标标示地址位置，并非楼宇轮廓或邮递保证。
- 全文及楼宇号码搜索索引是此不可变 release set 的派生 projection。请参阅
  [发布范围表](#source-heading-release-scope)链接的源发布说明，以了解发布者特有的数据质量、溯源及兼容性资料。
