---
createdAt: "2026-07-06T14:53:59.654Z"
updatedAt: "2026-07-06T19:27:16.581Z"
dataset: "ds-hk-overture-address"
release: "overture-hk-2025-09-24.0-address"
regionCode: "hk"
source: "overture"
sourceVersion: "2025-09-24.0"
type: "address"
cohortKey: "2025-09-24.0"
schemaVersion: "overture-address-v2025-09-24.0"
---

# EN

## Upstream Release Notes

[2025-09-24 release notes](https://docs.overturemaps.org/blog/2025/09/24/release-notes/)

## Changelog

Initial 山水 | SaanSeoi release.

## Compatibility

山水 | SaanSeoi retains compatibility with the Overture address type where possible, but diverges
from the source model where localised handling provides a richer view of the data.

The SaanSeoi [address resourceType](../../../../docs/datasets/resourceType/address.md) is an assembly of
the Overture [address](https://docs.overturemaps.org/schema/reference/addresses/address/) (`overture-address-v2025-09-24.0`) and HK Government Address Lookup Services (`hkgov-als-address-v2026-01-01.0`) datasets, with the latter serving as the primary reference. As such, it deviates from the Overture schema in the following ways:

### Directly Retained Fields

Fields that retain the Overture value directly:

- `id` - [Id](https://docs.overturemaps.org/schema/reference/system/ref/id/)
- `bbox` - [BBox](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `geometry` - [Geometry](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `version` - [FeatureVersion](https://docs.overturemaps.org/schema/reference/core/feature_version/)

### Enriched Fields

Fields processed to better fit the local scope or support future conflation with
other datasets. Original source attribution is preserved:

- `sources` - [Sources](https://docs.overturemaps.org/schema/reference/core/sources/) - wrapped under the `overture` key to allow conflation with other datasets while preserving source-lineage attribution.

### Normalized Fields

Fields reorganized to create strong links with divisions and support API response shaping:

- `address_levels[]` - normalized into canonical division references. The Overture `2025-09-24.0` Hong Kong SAR address file contains exactly two address levels per row: area (`HK`, `KLN`, or `NT`) followed by one of the 18 district names. SaanSeoi resolves those values against the same-cohort published division snapshot.
  - `address_levels[0].value` - as `areaId`
  - `address_levels[1].value` - as `districtId`
- `number` - as `i18n.en.streetNumber`
- `street` - as `i18n.en.streetName`
- `number` and `street` - formatted as `i18n.en.formattedAddress` when both are present
- `country` - resolved to canonical `countryId` from the division snapshot

### Dropped Fields

Fields that are not retained as canonical address fields. They are therefore not
offered as part of the `address` resourceType, but remain available for source
audit through retained Overture source rows in `rawProperties`.

#### Due to zero variance

- `theme` - always `addresses`
- `type` - always `address`
- `country` - always `HK`
- `postcode` - empty
- `postal_city` - empty
- `unit` - empty

# ZH-HANT

## 上游版本說明

[2025-09-24 版本說明](https://docs.overturemaps.org/blog/2025/09/24/release-notes/)

## 更新日誌

首個 山水 | SaanSeoi 版本。

## 兼容性

山水 | SaanSeoi 會盡可能保留與 Overture 地址類型的兼容性，但在本地化處理能夠提供更豐富的資料視圖時，會偏離來源模型。

SaanSeoi [address resourceType](../../../../docs/datasets/resourceType/address.md) 由 Overture [address](https://docs.overturemaps.org/schema/reference/addresses/address/)（`overture-address-v2025-09-24.0`）及香港政府地址查找服務（`hkgov-als-address-v2026-01-01.0`）資料集組成，並以後者作為主要參考。因此，它在以下方面偏離 Overture schema：

### 直接保留欄位

直接保留 Overture 值的欄位：

- `id` - [Id](https://docs.overturemaps.org/schema/reference/system/ref/id/)
- `bbox` - [BBox](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `geometry` - [Geometry](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `version` - [FeatureVersion](https://docs.overturemaps.org/schema/reference/core/feature_version/)

### 增潤欄位

經處理以更符合本地範圍，或支援日後與其他資料集整合的欄位。原始來源歸屬會被保留：

- `sources` - [Sources](https://docs.overturemaps.org/schema/reference/core/sources/) - 包裹在 `overture` 鍵之下，以便與其他資料集整合，同時保留來源譜系歸屬。

### 標準化欄位

經重組以建立與分區的強連結，並支援整理 API 回應格式的欄位：

- `address_levels[]` - 標準化為規範分區參照。Overture `2025-09-24.0` 香港特別行政區地址檔案中，每一列均恰好包含兩個地址層級：區域（`HK`、`KLN` 或 `NT`），其後為 18 個區議會分區名稱之一。SaanSeoi 會按同一 cohort 已發布的分區快照解析這些值。
  - `address_levels[0].value` - 作為 `areaId`
  - `address_levels[1].value` - 作為 `districtId`
- `number` - 作為 `i18n.en.streetNumber`
- `street` - 作為 `i18n.en.streetName`
- `number` 和 `street` - 當兩者同時存在時，格式化為 `i18n.en.formattedAddress`
- `country` - 從分區快照解析為規範 `countryId`

### 捨棄欄位

不會保留為規範地址欄位的欄位。因此，它們不會作為 `address` resourceType 的一部分提供，但仍可透過 `rawProperties` 中保留的 Overture 來源列作來源審核。

#### 因為沒有變異

- `theme` - 一律為 `addresses`
- `type` - 一律為 `address`
- `country` - 一律為 `HK`
- `postcode` - 空白
- `postal_city` - 空白
- `unit` - 空白

# ZH-HANS

## 上游版本说明

[2025-09-24 版本说明](https://docs.overturemaps.org/blog/2025/09/24/release-notes/)

## 更新日志

首个 山水 | SaanSeoi 版本。

## 兼容性

山水 | SaanSeoi 会尽可能保留与 Overture 地址类型的兼容性，但在本地化处理能够提供更丰富的数据视图时，会偏离来源模型。

SaanSeoi [address resourceType](../../../../docs/datasets/resourceType/address.md) 由 Overture [address](https://docs.overturemaps.org/schema/reference/addresses/address/)（`overture-address-v2025-09-24.0`）及香港政府地址查找服务（`hkgov-als-address-v2026-01-01.0`）数据集组成，并以后者作为主要参考。因此，它在以下方面偏离 Overture schema：

### 直接保留字段

直接保留 Overture 值的字段：

- `id` - [Id](https://docs.overturemaps.org/schema/reference/system/ref/id/)
- `bbox` - [BBox](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `geometry` - [Geometry](https://docs.overturemaps.org/schema/reference/system/primitive/geometry/)
- `version` - [FeatureVersion](https://docs.overturemaps.org/schema/reference/core/feature_version/)

### 增润字段

经处理以更符合本地范围，或支持日后与其他数据集整合的字段。原始来源归属会被保留：

- `sources` - [Sources](https://docs.overturemaps.org/schema/reference/core/sources/) - 包裹在 `overture` 键之下，以便与其他数据集整合，同时保留来源谱系归属。

### 标准化字段

经重组以建立与分区的强链接，并支持整理 API 响应格式的字段：

- `address_levels[]` - 标准化为规范分区参照。Overture `2025-09-24.0` 香港特别行政区地址文件中，每一行均恰好包含两个地址层级：区域（`HK`、`KLN` 或 `NT`），其后为 18 个区议会分区名称之一。SaanSeoi 会按同一 cohort 已发布的分区快照解析这些值。
  - `address_levels[0].value` - 作为 `areaId`
  - `address_levels[1].value` - 作为 `districtId`
- `number` - 作为 `i18n.en.streetNumber`
- `street` - 作为 `i18n.en.streetName`
- `number` 和 `street` - 当两者同时存在时，格式化为 `i18n.en.formattedAddress`
- `country` - 从分区快照解析为规范 `countryId`

### 舍弃字段

不会保留为规范地址字段的字段。因此，它们不会作为 `address` resourceType 的一部分提供，但仍可通过 `rawProperties` 中保留的 Overture 来源行作来源审核。

#### 因为没有变异

- `theme` - 一律为 `addresses`
- `type` - 一律为 `address`
- `country` - 一律为 `HK`
- `postcode` - 空白
- `postal_city` - 空白
- `unit` - 空白
