---
createdAt: "2026-07-15T00:00:00.000Z"
updatedAt: "2026-07-18T00:00:00.000Z"
dataset: "ds-hk-hkgov-had-division-area-district"
release: "dr-hk-hkgov-had-division-area-district-2022"
regionCode: "hk"
source: "hkgov-had"
sourceVersion: "2022"
sourceSchemaVersion: "1.2"
type: "divisionArea"
cohortKey: "2022"
---

# EN

## Changelog

Initial 山水 | SaanSeoi release, based on the oldest known _Home Affairs Department_
District Boundary area release for Hong Kong.

The source follows the
[Functional Area FSDT 1.2 specification](https://static.csdi.gov.hk/csdi-webpage/download/common/f9f4daf727620fe453d5c551e7ce63523df27fc618862b5a35979fe309b79003).

## Geometry

Null, empty, self-intersecting, and otherwise invalid polygon rings are rejected during
preflight. No geometry repair is performed.

## Lifecycle

The catalogue was published in July 2025 and the layer was last revised in 2022; the
service reports <black>BEGIN_LIFESPAN = 20160101</black> and an open
<black>END_LIFESPAN</black>.

## Compatibility

District areas are administrative polygons published by the Home Affairs Department. The
source describes the 18 Hong Kong districts and supplies Chinese and English names,
district codes, and boundary coordinates. Each area is associated with a canonical
division through the version-controlled <black>hkgov-had</black> identifier bridge;
source identifiers are never treated as Overture UUIDs.

### Directly Retained Fields

- `geometry` - retained as canonical <black>EPSG:4326</black> GeoJSON

### Compatibility Fields

These source fields are not directly exposed as <black>divisionArea</black> attributes.
They are available through the <black>sourceKeys</black> compatibility layer, under the
<black>hkgov<black> key, i.e. <black>included[].attributes.sourceKeys.hkgov</black>
using our database capitalization:

- `OBJECTID` -> <black>hkgov.objectId</black>
- `CSDI_ADMIN_AREA_ID` -> <black>hkgov.cdsiAdminAreaId</black>
- `AREA_TYPE` -> <black>hkgov.areaType</black>
- `AREA_ID` -> <black>hkgov.areaId</black>
- `AREA_CODE` -> <black>hkgov.areaCode</black>

### Normalised Fields

- `AREA_CODE` - as <black>divisionId</black>, through the <black>hkgov-had</black>
  identifier mapping

We also consider all records to be of <black>type</black> <black>mixed</black>, as they
include both land and nautical divisions, and as such <black>isLand</black> and
<black>isTerritorial</black> are both also set to <black>true</black>.

### Dropped Fields

These fields are not projected into compatibility columns or canonical attributes. They
remain in <black>rawProperties</black> where the source row is retained for
auditability:

#### Due to redundancy

- `NAME_TC` - redundant with canonical localized division names
- `NAME_EN` - redundant with canonical localized division names
- `DATA_OWNER` - redundant with dataset and publisher metadata
- `BEGIN_LIFESPAN` - redundant with release/cohort metadata
- `END_LIFESPAN` - redundant with release/cohort metadata

#### Due to calculated value

- `SHAPE_Length` - calculated source value
- `SHAPE_Area` - calculated source value

# ZH-HANT

## 更新紀錄

SaanSeoi 首次發佈，內容以已知最早的香港民政事務總署地區界線範圍資料發佈為基礎。

來源遵循
[功能區域 FSDT 1.2 規格](https://static.csdi.gov.hk/csdi-webpage/download/common/f9f4daf727620fe453d5c551e7ce63523df27fc618862b5a35979fe309b79003)。

## 幾何

預檢會拒絕空值、空幾何、自相交及其他無效的多邊形環。不會進行幾何修復。

## 生命週期

目錄於 2025 年 7 月發佈，圖層最後於 2022 年修訂；來源服務回報
`BEGIN_LIFESPAN = 20160101`，而 `END_LIFESPAN` 為開放值。

## 兼容性

地區範圍是民政事務總署發佈的行政多邊形，涵蓋香港十八區，並提供中英文名稱、地區編碼及界線座標。每個範圍透過版本控制的
<black>hkgov-had</black> 識別碼橋接表關聯至標準區劃；來源識別碼不會當作 Overture UUID。

### 直接保留欄位

- `geometry` - 保留為標準 <black>EPSG:4326</black> GeoJSON

### 兼容性欄位

以下來源欄位不會直接作為 <black>divisionArea</black> 屬性公開，而會透過
<black>hkgov</black> 兼容性層提供，並使用本系統的資料庫命名方式：

- `OBJECTID` -> <black>hkgov.objectId</black>
- `CSDI_ADMIN_AREA_ID` -> <black>hkgov.cdsiAdminAreaId</black>
- `AREA_TYPE` -> <black>hkgov.areaType</black>
- `AREA_ID` -> <black>hkgov.areaId</black>
- `AREA_CODE` -> <black>hkgov.areaCode</black>

### 標準化欄位

- `AREA_CODE` - 透過 <black>hkgov-had</black> 識別碼映射作為 <black>divisionId</black>

我們亦將所有記錄的 <black>type</black> 視為
<black>mixed</black>，因為它們同時包括陸地及航海區劃；因此 <black>isLand</black> 和
<black>isTerritorial</black> 亦同時設為 <black>true</black>。

### 捨棄欄位

以下欄位不會投影為兼容性欄位或標準屬性，而會保留於 <black>rawProperties</black>
的來源記錄中供稽核：

#### 由於重複

- `NAME_TC` - 與標準區劃本地化名稱重複
- `NAME_EN` - 與標準區劃本地化名稱重複
- `DATA_OWNER` - 與資料集及發佈者元資料重複
- `BEGIN_LIFESPAN` - 與發佈及 cohort 元資料重複
- `END_LIFESPAN` - 與發佈及 cohort 元資料重複

#### 由於屬於計算值

- `SHAPE_Length` - 來源計算值
- `SHAPE_Area` - 來源計算值

# ZH-HANS

## 更新记录

首次发布 SaanSeoi，内容以已知最早的香港民政事务总署地区界线范围资料发布为基础。

来源遵循
[功能区域 FSDT 1.2 规范](https://static.csdi.gov.hk/csdi-webpage/download/common/f9f4daf727620fe453d5c551e7ce63523df27fc618862b5a35979fe309b79003)。

## 几何

预检会拒绝空值、空几何、自相交及其他无效的多边形环。不会进行几何修复。

## 生命周期

目录于 2025 年 7 月发布，图层最后于 2022 年修订；来源服务报告
`BEGIN_LIFESPAN = 20160101`，而 `END_LIFESPAN` 为开放值。

## 兼容性

地区范围是民政事务总署发布的行政多边形，涵盖香港十八区，并提供中英文名称、地区编码及界线座标。每个范围通过版本控制的
<black>hkgov-had</black> 识别码桥接表关联至标准区划；来源识别码不会当作 Overture UUID。

### 直接保留字段

- `geometry` - 保留为标准 <black>EPSG:4326</black> GeoJSON

### 兼容性字段

以下源字段不会直接作为 <black>divisionArea</black> 属性公开，而会通过
<black>hkgov</black> 兼容性层提供，并使用本系统的数据库命名方式：

- `OBJECTID` -> <black>hkgov.objectId</black>
- `CSDI_ADMIN_AREA_ID` -> <black>hkgov.cdsiAdminAreaId</black>
- `AREA_TYPE` -> <black>hkgov.areaType</black>
- `AREA_ID` -> <black>hkgov.areaId</black>
- `AREA_CODE` -> <black>hkgov.areaCode</black>

### 标准化字段

- `AREA_CODE` - 通过 <black>hkgov-had</black> 识别码映射作为 <black>divisionId</black>

我们也将所有记录的 <black>type</black> 视为
<black>mixed</black>，因为它们同时包括陆地及航海区划；因此 <black>isLand</black> 和
<black>isTerritorial</black> 也同时设为 <black>true</black>。

### 舍弃字段

以下字段不会投影为兼容性字段或标准属性，而会保留在 <black>rawProperties</black>
的源记录中供稽核：

#### 由于重复

- `NAME_TC` - 与标准区划本地化名称重复
- `NAME_EN` - 与标准区划本地化名称重复
- `DATA_OWNER` - 与数据集及发布者元数据重复
- `BEGIN_LIFESPAN` - 与发布及 cohort 元数据重复
- `END_LIFESPAN` - 与发布及 cohort 元数据重复

#### 由于属于计算值

- `SHAPE_Length` - 源计算值
- `SHAPE_Area` - 源计算值
