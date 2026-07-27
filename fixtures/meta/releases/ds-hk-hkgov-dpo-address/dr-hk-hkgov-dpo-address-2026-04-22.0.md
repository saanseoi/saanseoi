---
createdAt: "2026-07-21T00:00:00.000Z"
updatedAt: "2026-07-21T00:00:00.000Z"
dataset: "ds-hk-hkgov-dpo-address"
release: "dr-hk-hkgov-dpo-address-2026-04-22.0"
regionCode: "hk"
source: "hkgov-dpo"
sourceVersion: "2026-04-22.0"
releaseVersion: "2026-04-22.0"
sourceSchemaVersion: "3.2"
type: "address"
cohortKey: "2026-04-22.0"
---

# EN

## Changelog

- Digital Policy Office Address Lookup Service (ALS) delivery dated 2026-04-22.

## Compatibility

This release imports the ALS two-dimensional district GeoJSON deliveries. The separate
public-rental-housing three-dimensional file is not part of this address resource. Each
retained premise is represented as a point and is associated with the selected same-year
Overture division snapshot.

### Directly Retained Fields

- `geometry` - retained as the source point geometry
- Chinese and English premise-address components - retained in localized source records
- `Easting` and `Northing` - retained with the source record
- `CsuId` and `GeoAddress` - retained as source identifiers and source evidence

### Enriched Fields

- `sources` - attribution lineage of the source, delivery file, and
  premise-normalization evidence are retained under the <black>hkgovAls</black> key
- `bbox` - calculated from the canonical point geometry

### Normalised Fields

- Chinese and English address components - normalised into the canonical localized
  address structure.
- A stable `ss-` UUIDv5 premise identity is derived from the complete premise
  representation. Reviewed identity-drift decisions may retain an earlier identity.
- District and area aliases are resolved against the selected division snapshot.

### Compatibility Fields

- The original Chinese and English premise-address objects are retained through the
  <black>hkgovAls</black> source profile.
- Publisher coordinates, `CsuId`, `GeoAddress`, source file, and feature index remain
  available as source data.

### Dropped Fields

- The separate ALS three-dimensional public-rental-housing delivery is not imported into
  the two-dimensional address dataset.
- Exact duplicate source features and equivalent premise variants are consolidated;
  their source evidence is retained in release processing records.

# ZH-HANT

## 更新紀錄

- 數字政策辦公室地址查詢服務（ALS）2026-04-22 的資料交付。

## 兼容性

此版本匯入 ALS 的二維地區 GeoJSON 資料。獨立的公共租住房屋三維檔案不屬於此地址資源。每個保留的樓宇地址均表示為點，並關聯至所選取的同年 Overture 區劃 snapshot。

### 直接保留欄位

- `geometry` 作為來源點幾何保留
- 中英文樓宇地址組成部分作為本地化來源記錄保留
- `Easting`、`Northing`、`CsuId` 和 `GeoAddress` 隨來源記錄保留

### 增補欄位

- `sources` 會在 <black>hkgovAls</black> key 下保留來源鏈、交付檔案和樓宇正規化證據
- `bbox` 由標準點幾何計算

### 正規化欄位

- 中英文地址組成部分會正規化為標準本地化地址結構。
- 由完整樓宇表示法衍生穩定的 `ss-` UUIDv5 身份；經審核的身份漂移決定可保留較早身份。
- 地區及區域別名會按所選區劃 snapshot 解析。

### 兼容欄位

- 原始中英文樓宇地址物件透過 <black>hkgovAls</black> 來源 profile 保留。
- 發布者座標、`CsuId`、`GeoAddress`、來源檔案和 feature index 仍可作為來源資料取得。

### 不公開欄位

- 獨立的 ALS 公共租住房屋三維資料不會匯入二維地址資料集。
- 完全重複的來源 feature 及等價的樓宇變體會合併，其來源證據保留於版本處理記錄。

# ZH-HANS

## 更新记录

- 数字政策办公室地址查询服务（ALS）2026-04-22 的数据交付。

## 兼容性

此版本导入 ALS 的二维地区 GeoJSON 数据。独立的公共租赁房屋三维文件不属于此地址资源。每个保留的楼宇地址均表示为点，并关联至所选取的同年 Overture 区划 snapshot。

### 直接保留字段

- `geometry` 作为源点几何保留
- 中英文楼宇地址组成部分作为本地化源记录保留
- `Easting`、`Northing`、`CsuId` 和 `GeoAddress` 随源记录保留

### 增补字段

- `sources` 会在 <black>hkgovAls</black> key 下保留源链、交付文件和楼宇规范化证据
- `bbox` 由标准点几何计算

### 规范化字段

- 中英文地址组成部分会规范化为标准本地化地址结构。
- 由完整楼宇表示法衍生稳定的 `ss-` UUIDv5 身份；经审核的身份漂移决定可保留较早身份。
- 地区及区域别名会按所选区划 snapshot 解析。

### 兼容字段

- 原始中英文楼宇地址对象通过 <black>hkgovAls</black> 源 profile 保留。
- 发布者坐标、`CsuId`、`GeoAddress`、源文件和 feature index 仍可作为源数据取得。

### 不公开字段

- 独立的 ALS 公共租赁房屋三维数据不会导入二维地址数据集。
- 完全重复的源 feature 及等价的楼宇变体会合并，其源证据保留于版本处理记录。
