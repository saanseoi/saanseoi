---
createdAt: "2026-07-06T14:53:53.553Z"
updatedAt: "2026-07-06T19:01:36.542Z"
dataset: "ds-hk-overture-division"
release: "overture-hk-2025-09-24.0-division"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-09-24.0"
schemaVersion: "overture-division-v2025-09-24.0"
type: "division"
cohortKey: "2025-09-24.0"
---

# EN

## Upstream Release Notes

[2025-09-24 release notes](https://docs.overturemaps.org/blog/2025/09/24/release-notes/)

## Changelog

Initial 山水 | SaanSeoi release.

## Compatibility

山水 | SaanSeoi retains compatibility with the Overture division type where possible, but will diverge 
from the source model where localised handling is meaningful in the context of the Hong Kong SAR.

The SaanSeoi [division resourceType](../../../../docs/datasets/resourceType/division.md)
deviates from the Overture [division](https://docs.overturemaps.org/schema/reference/divisions/division/)
schema (`overture-division-v2025-09-24.0`) in the following ways:

### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](https://docs.overturemaps.org/schema/reference/system/ref/id/)
- `cartography` - [CartographicHints](https://docs.overturemaps.org/schema/reference/core/cartographic_hints/)
- `bbox` - [BBox](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `geometry` - [Geometry](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `version` - [FeatureVersion](https://docs.overturemaps.org/schema/reference/core/feature_version/)
- `wikidata` - [WikidataId](https://docs.overturemaps.org/schema/reference/system/wikidata_id/)

### Enriched Fields

Fields processed to better fit the local scope or support future conflation with
other datasets. No original source attribution is lost:

- `sources` - [Sources](https://docs.overturemaps.org/schema/reference/core/sources/) - wrapped under the `overture` key to allow conflation with other datasets while retaining source-chain attribution.

### Compatibility Fields

Like _Enriched Fields_, but these source fields are used as inputs into mappings that
are more appropriate for the local context. The original values are retained
through Overture compatibility keys:

- `subtype` - [PlaceType](https://docs.overturemaps.org/schema/reference/divisions/types/place_type/) - contributes to canonical `level` and `type`, and is available under `overture.subtype`
- `class` - [DivisionClass](https://docs.overturemaps.org/schema/reference/divisions/types/division_class/) - contributes to canonical `level` and `type`, and is available under `overture.class`
- `hierarchies[][].subtype` - contributes to canonical hierarchy `level` and `type`, with the original hierarchy retained under `overture.hierarchies`

### Normalized Fields

Fields reorganized for storage, query, or API response shaping:

- `names` - normalized by locale
  - `names.common` as `i18n.{{LOCALE}}.name`
  - `names.primary` as fallback for `i18n.{{LOCALE}}.name` with an inferred locale
  - `names.rules` as `i18n.{{LOCALE}}.rules`
- `hierarchies[][]` - normalized into `hierarchy`. The Overture `hierarchies[][].name` field does not specify a locale, so SaanSeoi resolves hierarchy labels from matching division i18n rows where possible. The outer array is dropped because Hong Kong SAR does not contain alternative hierarchies. The original `hierarchies` value is available under `overture.hierarchies` as a compatibility field.
  - `hierarchies[][].division_id` - as `hierarchies[].division_id`
  - `hierarchies[][].name` - as `hierarchies[].i18n.{{LOCALE}}.name`

### Dropped Fields

Fields which are not retained. They are thus not offered as part of the `division `resourceType, but they will be made available under an Overture compatability API in the future **[FORTHCOMING]**.

#### Due to zero variance

- `names.rules[].perspectives` - empty
- `names.rules[].between` - empty
- `names.rules[].side` - empty
- `theme` - always `divisions`
- `type` - always `division`
- `country` - always `HK`
- `region` - empty
- `perspectives` - empty
- `norms` - only `{driving_side: left}` for the whole SAR

#### Due to redundancy

- `parent_division_id` - redundant with the last retained canonical `hierarchy[].division_id` entry

#### Due to quality issues

`local_type` appears to be sourced from `place=*` OSM data. It is retained for
source audit/name processing, but is not used as the canonical division taxonomy
because the observed values are inconsistent, incomplete, and locally
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

#### Due to veracity issues

- `capital_division_ids` - while each district is given a "capital", there is no concept of a district capital in Hong Kong
- `capital_of_divisions` - see `capital_division_ids`.

### Dropped Values

#### Due to redundancy

- `hierarchies[][]` - the top-level country ancestor is implicit for every division in the Hong Kong SAR, and the division itself is redundant with the row being described.

# ZH-HANT

## 上游版本說明

[2025-09-24 版本說明](https://docs.overturemaps.org/blog/2025/09/24/release-notes/)

## 更新紀錄

山水 | SaanSeoi 初始版本。

## 兼容性

山水 | SaanSeoi 會在可行範圍內保持與 Overture division 類型兼容，但當香港特別行政區的本地化處理需要更合適的表達時，會與來源模型有所分歧。

SaanSeoi [division resourceType](../../../../docs/datasets/resourceType/division.md)
以下列方式偏離 Overture [division](https://docs.overturemaps.org/schema/reference/divisions/division/)
schema (`overture-division-v2025-09-24.0`)：

### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [Id](https://docs.overturemaps.org/schema/reference/system/ref/id/)
- `cartography` - [CartographicHints](https://docs.overturemaps.org/schema/reference/core/cartographic_hints/)
- `bbox` - [BBox](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `geometry` - [Geometry](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `version` - [FeatureVersion](https://docs.overturemaps.org/schema/reference/core/feature_version/)
- `wikidata` - [WikidataId](https://docs.overturemaps.org/schema/reference/system/wikidata_id/)

### 增補欄位

經處理以更切合本地範圍，或支援日後與其他資料集融合的欄位。原始來源歸屬不會遺失：

- `sources` - [Sources](https://docs.overturemaps.org/schema/reference/core/sources/) - 包裹於 `overture` key 之下，讓資料可與其他資料集融合，同時保留來源鏈歸屬。

### 兼容欄位

與 _增補欄位_ 類似，但這些來源欄位會作為輸入，映射至更適合本地脈絡的欄位。原始值會透過 Overture 兼容 key 保留：

- `subtype` - [PlaceType](https://docs.overturemaps.org/schema/reference/divisions/types/place_type/) - 參與產生 canonical `level` 和 `type`，並可於 `overture.subtype` 取得
- `class` - [DivisionClass](https://docs.overturemaps.org/schema/reference/divisions/types/division_class/) - 參與產生 canonical `level` 和 `type`，並可於 `overture.class` 取得
- `hierarchies[][].subtype` - 參與產生 canonical hierarchy 的 `level` 和 `type`，原始 hierarchy 則保留於 `overture.hierarchies`

### 正規化欄位

為了儲存、查詢或 API 回應形狀而重新整理的欄位：

- `names` - 按 locale 正規化
  - `names.common` 作為 `i18n.{{LOCALE}}.name`
  - `names.primary` 作為 `i18n.{{LOCALE}}.name` 的 fallback，並推斷 locale
  - `names.rules` 作為 `i18n.{{LOCALE}}.rules`
- `hierarchies[][]` - 正規化為 `hierarchy`。Overture 的 `hierarchies[][].name` 欄位沒有指定 locale，因此 SaanSeoi 會盡可能從相符 division i18n rows 解析 hierarchy 標籤。由於香港特別行政區沒有 alternative hierarchies，外層 array 會被移除。原始 `hierarchies` 值可作為兼容欄位於 `overture.hierarchies` 取得。
  - `hierarchies[][].division_id` - 作為 `hierarchies[].division_id`
  - `hierarchies[][].name` - 作為 `hierarchies[].i18n.{{LOCALE}}.name`

### 不保留欄位

以下欄位不會被保留，因此不會作為 `division` resourceType 的一部分提供；但日後會於 Overture 兼容 API 中提供 **[即將推出]**。

#### 因為沒有變異

- `names.rules[].perspectives` - 空值
- `names.rules[].between` - 空值
- `names.rules[].side` - 空值
- `theme` - 永遠為 `divisions`
- `type` - 永遠為 `division`
- `country` - 永遠為 `HK`
- `region` - 空值
- `perspectives` - 空值
- `norms` - 全香港特別行政區只有 `{driving_side: left}`

#### 因為冗餘

- `parent_division_id` - 與最後一個保留的 canonical `hierarchy[].division_id` entry 重複

#### 因為品質問題

`local_type` 看來來自 `place=*` OSM 資料。它會保留作來源審核／名稱處理用途，但不會用作 canonical division taxonomy，因為觀察到的值不一致、不完整，亦不完全切合本地脈絡。樣本：

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

#### 因為真確性問題

- `capital_division_ids` - 雖然每個 district 都獲指定一個「capital」，但香港並沒有 district capital 的概念
- `capital_of_divisions` - 見 `capital_division_ids`。

### 不保留的值

#### 因為冗餘

- `hierarchies[][]` - 對香港特別行政區的每個 division 而言，最上層 country ancestor 是隱含的；而 division 本身亦與該 row 所描述的對象重複。

# ZH-HANS

## 上游版本说明

[2025-09-24 版本说明](https://docs.overturemaps.org/blog/2025/09/24/release-notes/)

## 更新记录

山水 | SaanSeoi 初始版本。

## 兼容性

山水 | SaanSeoi 会在可行范围内保持与 Overture division 类型兼容，但当香港特别行政区的本地化处理需要更合适的表达时，会与来源模型有所分歧。

SaanSeoi [division resourceType](../../../../docs/datasets/resourceType/division.md)
以下列方式偏离 Overture [division](https://docs.overturemaps.org/schema/reference/divisions/division/)
schema (`overture-division-v2025-09-24.0`)：

### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [Id](https://docs.overturemaps.org/schema/reference/system/ref/id/)
- `cartography` - [CartographicHints](https://docs.overturemaps.org/schema/reference/core/cartographic_hints/)
- `bbox` - [BBox](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `geometry` - [Geometry](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `version` - [FeatureVersion](https://docs.overturemaps.org/schema/reference/core/feature_version/)
- `wikidata` - [WikidataId](https://docs.overturemaps.org/schema/reference/system/wikidata_id/)

### 增补字段

经处理以更契合本地范围，或支持日后与其他数据集融合的字段。原始来源归属不会丢失：

- `sources` - [Sources](https://docs.overturemaps.org/schema/reference/core/sources/) - 包裹于 `overture` key 之下，使数据可与其他数据集融合，同时保留来源链归属。

### 兼容字段

与 _增补字段_ 类似，但这些来源字段会作为输入，映射至更适合本地语境的字段。原始值会通过 Overture 兼容 key 保留：

- `subtype` - [PlaceType](https://docs.overturemaps.org/schema/reference/divisions/types/place_type/) - 参与生成 canonical `level` 和 `type`，并可于 `overture.subtype` 取得
- `class` - [DivisionClass](https://docs.overturemaps.org/schema/reference/divisions/types/division_class/) - 参与生成 canonical `level` 和 `type`，并可于 `overture.class` 取得
- `hierarchies[][].subtype` - 参与生成 canonical hierarchy 的 `level` 和 `type`，原始 hierarchy 则保留于 `overture.hierarchies`

### 规范化字段

为了存储、查询或 API 响应形状而重新整理的字段：

- `names` - 按 locale 规范化
  - `names.common` 作为 `i18n.{{LOCALE}}.name`
  - `names.primary` 作为 `i18n.{{LOCALE}}.name` 的 fallback，并推断 locale
  - `names.rules` 作为 `i18n.{{LOCALE}}.rules`
- `hierarchies[][]` - 规范化为 `hierarchy`。Overture 的 `hierarchies[][].name` 字段没有指定 locale，因此 SaanSeoi 会尽可能从相符 division i18n rows 解析 hierarchy 标签。由于香港特别行政区没有 alternative hierarchies，外层 array 会被移除。原始 `hierarchies` 值可作为兼容字段于 `overture.hierarchies` 取得。
  - `hierarchies[][].division_id` - 作为 `hierarchies[].division_id`
  - `hierarchies[][].name` - 作为 `hierarchies[].i18n.{{LOCALE}}.name`

### 不保留字段

以下字段不会被保留，因此不会作为 `division` resourceType 的一部分提供；但日后会于 Overture 兼容 API 中提供 **[即将推出]**。

#### 因为没有变异

- `names.rules[].perspectives` - 空值
- `names.rules[].between` - 空值
- `names.rules[].side` - 空值
- `theme` - 永远为 `divisions`
- `type` - 永远为 `division`
- `country` - 永远为 `HK`
- `region` - 空值
- `perspectives` - 空值
- `norms` - 全香港特别行政区只有 `{driving_side: left}`

#### 因为冗余

- `parent_division_id` - 与最后一个保留的 canonical `hierarchy[].division_id` entry 重复

#### 因为质量问题

`local_type` 看来来自 `place=*` OSM 数据。它会保留作来源审核／名称处理用途，但不会用作 canonical division taxonomy，因为观察到的值不一致、不完整，也不完全契合本地语境。样本：

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

#### 因为真实性问题

- `capital_division_ids` - 虽然每个 district 都获指定一个“capital”，但香港并没有 district capital 的概念
- `capital_of_divisions` - 见 `capital_division_ids`。

### 不保留的值

#### 因为冗余

- `hierarchies[][]` - 对香港特别行政区的每个 division 而言，最上层 country ancestor 是隐含的；而 division 本身也与该 row 所描述的对象重复。
