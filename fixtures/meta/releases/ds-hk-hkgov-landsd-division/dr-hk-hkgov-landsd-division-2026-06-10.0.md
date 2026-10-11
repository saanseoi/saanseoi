---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-20T00:00:00.000Z"
dataset: "ds-hk-hkgov-landsd-division"
release: "dr-hk-hkgov-landsd-division-2026-06-10.0"
regionCode: "hk"
source: "hkgov-landsd"
sourceVersion: "2026-06-10.0"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=landsd_rcd_1648571595120_89752"
releaseVersion: "2026-06-10.0"
sourceSchemaVersion: "1.0"
type: "division"
cohortKey: "2026-06-10.0"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release.
- Includes all 2,706 records from the Lands Department Place Name database: settlement,
  hydrographic and topographic place names, with their locations, official names and
  aliases.

## Versioning

This source release follows the publisher archive date. Its immutable SaanSeoi release
version is <black>{{ releaseVersion }}</black>.

## Geometry

Each source record has a Point geometry in the publisher's <black>EPSG:2326</black>
coordinate system. These points identify locations; they do not describe area
boundaries.

## Coverage

All three values of `properties.placeClass` are included: `Settlement`, `Hydrographic`
and `Topographic`. Examples include villages, streams, hills and islands. No records are
excluded on the basis of this classification.

### Stored source fields

Source attributes are stored in the source record's `properties` object using SaanSeoi's
camelCase field names. The publisher's column names below show where each field comes
from. The joined name records are stored in `properties.placeNames` as an array.

| Stored field                         | Publisher field                            | Content                                                                                              |
| ------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `properties.geoNameId`               | `GEO_PLACE_NAME.GEO_NAME_ID`               | The publisher's place identifier.                                                                    |
| `properties.placeClass`              | `GEO_PLACE_NAME.PLACE_CLASS`               | The broad class: `Settlement`, `Hydrographic`, or `Topographic`.                                     |
| `properties.placeType`               | `GEO_PLACE_NAME.PLACE_TYPE`                | The publisher's more detailed place classification.                                                  |
| `properties.district`                | `GEO_PLACE_NAME.DISTRICT`                  | The publisher's district value.                                                                      |
| `properties.placeNames`              | `PLACE_NAME` rows matched by `GEO_NAME_ID` | Joined publisher name records. Each entry keeps its English and Traditional Chinese labels together. |
| `properties.placeNames[].nameEn`     | `PLACE_NAME.NAME_EN`                       | English label; `null` when absent.                                                                   |
| `properties.placeNames[].nameZhHant` | `PLACE_NAME.NAME_TC`                       | Traditional Chinese label; `null` when absent.                                                       |
| `properties.placeNames[].nameStatus` | `PLACE_NAME.NAME_STATUS`                   | `Official` for an official name or `Alias` for an alternative name.                                  |

The original point geometry is stored separately as `sourceGeometry` in
<black>EPSG:2326</black>. The source-record endpoint returns it as `geometry`, alongside
`properties`. Source records cover all 2,706 entries across the three classes.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 初始版本。
- 收錄地政總署地名資料庫的全部 2,706 筆記錄，涵蓋居住地、水文及地形名稱，並提供位置、官方名稱及別名。

## 版本控制

此來源版本按發布者的歸檔日期編號。其不可變更的 SaanSeoi 版本為
<black>{{ releaseVersion }}</black>。

## 幾何

每筆來源記錄均有一個使用發布者 <black>EPSG:2326</black>
座標系統的 Point 幾何。這些點表示位置，並不代表區域邊界。

## 涵蓋範圍

資料包括 `properties.placeClass` 的全部三個類別：`Settlement`（居住地）、
`Hydrographic`（水文）及
`Topographic`（地形），例如村落、溪流、山丘及島嶼。不會因上述分類而排除任何記錄。

### 來源欄位的儲存方式

來源屬性以 SaanSeoi 的 camelCase 欄位名稱儲存在來源記錄的 `properties`
物件中。下表列出各欄位對應的發布者欄名。配對的名稱記錄以陣列儲存在
`properties.placeNames`。

| 儲存欄位                             | 發布者欄位                                | 內容                                                                               |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `properties.geoNameId`               | `GEO_PLACE_NAME.GEO_NAME_ID`              | 發布者的地名識別碼。                                                               |
| `properties.placeClass`              | `GEO_PLACE_NAME.PLACE_CLASS`              | 主要類別：`Settlement`（居住地）、`Hydrographic`（水文）或 `Topographic`（地形）。 |
| `properties.placeType`               | `GEO_PLACE_NAME.PLACE_TYPE`               | 發布者較詳細的地名分類。                                                           |
| `properties.district`                | `GEO_PLACE_NAME.DISTRICT`                 | 發布者提供的地區值。                                                               |
| `properties.placeNames`              | 以 `GEO_NAME_ID` 配對的 `PLACE_NAME` 記錄 | 配對的發布者名稱記錄。每項的英文及繁體中文標籤一併儲存。                           |
| `properties.placeNames[].nameEn`     | `PLACE_NAME.NAME_EN`                      | 英文標籤；缺少時為 `null`。                                                        |
| `properties.placeNames[].nameZhHant` | `PLACE_NAME.NAME_TC`                      | 繁體中文標籤；缺少時為 `null`。                                                    |
| `properties.placeNames[].nameStatus` | `PLACE_NAME.NAME_STATUS`                  | `Official` 表示官方名稱，`Alias` 表示別名。                                        |

原始點幾何以 <black>EPSG:2326</black> 座標另存於 `sourceGeometry`。來源記錄端點以
`geometry` 傳回該幾何，並同時提供
`properties`。來源記錄涵蓋全部三個類別，共 2,706 筆資料。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 初始版本。
- 收录地政总署地名数据库的全部 2,706 条记录，涵盖居住地、水文及地形名称，并提供位置、官方名称及别名。

## 版本控制

此来源版本按发布者的归档日期编号。其不可变更的 SaanSeoi 版本为
<black>{{ releaseVersion }}</black>。

## 几何

每条来源记录均有一个使用发布者 <black>EPSG:2326</black>
坐标系统的 Point 几何。这些点表示位置，并不代表区域边界。

## 涵盖范围

数据包括 `properties.placeClass` 的全部三个类别：`Settlement`（居住地）、
`Hydrographic`（水文）及
`Topographic`（地形），例如村落、溪流、山丘及岛屿。不会因上述分类而排除任何记录。

### 来源字段的存储方式

来源属性以 SaanSeoi 的 camelCase 字段名称存储在来源记录的 `properties`
对象中。下表列出各字段对应的发布者列名。匹配的名称记录以数组存储在
`properties.placeNames`。

| 存储字段                             | 发布者字段                                | 内容                                                                               |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `properties.geoNameId`               | `GEO_PLACE_NAME.GEO_NAME_ID`              | 发布者的地名标识符。                                                               |
| `properties.placeClass`              | `GEO_PLACE_NAME.PLACE_CLASS`              | 主要类别：`Settlement`（居住地）、`Hydrographic`（水文）或 `Topographic`（地形）。 |
| `properties.placeType`               | `GEO_PLACE_NAME.PLACE_TYPE`               | 发布者较详细的地名分类。                                                           |
| `properties.district`                | `GEO_PLACE_NAME.DISTRICT`                 | 发布者提供的地区值。                                                               |
| `properties.placeNames`              | 以 `GEO_NAME_ID` 匹配的 `PLACE_NAME` 记录 | 匹配的发布者名称记录。每项的英文及繁体中文标签一并存储。                           |
| `properties.placeNames[].nameEn`     | `PLACE_NAME.NAME_EN`                      | 英文标签；缺少时为 `null`。                                                        |
| `properties.placeNames[].nameZhHant` | `PLACE_NAME.NAME_TC`                      | 繁体中文标签；缺少时为 `null`。                                                    |
| `properties.placeNames[].nameStatus` | `PLACE_NAME.NAME_STATUS`                  | `Official` 表示官方名称，`Alias` 表示别名。                                        |

原始点几何以 <black>EPSG:2326</black> 坐标另存于 `sourceGeometry`。来源记录端点以
`geometry` 返回该几何，并同时提供
`properties`。来源记录涵盖全部三个类别，共 2,706 条数据。
