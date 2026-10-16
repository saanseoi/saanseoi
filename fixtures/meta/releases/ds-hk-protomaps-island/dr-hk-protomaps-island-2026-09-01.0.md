---
dataset: "ds-hk-protomaps-island"
release: "dr-hk-protomaps-island-2026-09-01.0"
regionCode: "hk"
source: "protomaps"
sourceVersion: "2026-09-01.0"
releaseVersion: "2026-09-01.0"
type: "divisionArea"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi source release of island and coastline data from the September
  2026 Protomaps map of Hong Kong.
- Retains **1,671 source records**: 764 OpenStreetMap island features and 907 coastline
  land records.
- Establishes the baseline for comparisons with later releases.

## Coverage

The [Protomaps basemap release](https://tiles.saanseoi.hk/releases/hk/2026-09-01.json)
supplies island locations and shapes, together with the coastline of Hong Kong. SaanSeoi
uses these records to identify islands and to limit administrative area shapes to land.

OpenStreetMap features include island, islet and archipelago entries. Some are point
labels rather than outlines. The coastline records include mainland land as well as
islands; the full coastline is retained so it can also support administrative areas.

## Retained fields

- `sourceRecordId` — identifies the original OpenStreetMap feature or coastline record.
- `properties.kind` — distinguishes OpenStreetMap island features from coastline land
  records.
- `properties.tags` — retains the OpenStreetMap tags supplied with the feature.
- `properties.names` — retains names with explicit language tags, keyed by language.
- `geometry` — retains the source location or shape; available when geometry is
  requested with a source record.

## Notes and limitations

The record count is not a count of distinct islands. OpenStreetMap and coastline records
may describe the same land, and mainland coastline records are included. Changes compare
the retained record contents and shapes; an added or removed record does not necessarily
mean an island has appeared or disappeared.

Names are retained where provided. Unnamed features remain unnamed, and a name without a
language tag is kept in `properties.tags` without assigning it a language. SaanSeoi's
curated names, island identities and boundaries are published separately in
[Divisions, Localities, Neighbourhoods & Islands](/sources/ds-hk-saanseoi-division).

# ZH-HANT

## 更新記錄

- 山水初始來源版本，收錄 2026 年 9 月 Protomaps 香港地圖的島嶼及海岸線資料。
- 保留 **1,671 筆來源記錄**：764 筆 OpenStreetMap 島嶼要素及 907 筆海岸線陸地記錄。
- 作為往後版本比較的基準。

## 涵蓋範圍

[Protomaps 底圖版本](https://tiles.saanseoi.hk/releases/hk/2026-09-01.json)提供島嶼位置及形狀，以及香港海岸線。山水利用這些記錄辨識島嶼，並將行政區域的形狀限制在陸地上。

OpenStreetMap 要素包括島嶼、小島及群島記錄。部分只有位置標記，沒有輪廓。海岸線記錄同時涵蓋大陸陸地及島嶼；保留完整海岸線也能支援行政區域的劃定。

## 保留欄位

- `sourceRecordId` — 識別原始 OpenStreetMap 要素或海岸線記錄。
- `properties.kind` — 區分 OpenStreetMap 島嶼要素及海岸線陸地記錄。
- `properties.tags` — 保留要素附帶的 OpenStreetMap 標籤。
- `properties.names` — 保留明確標示語言的名稱，並以語言為鍵。
- `geometry` — 保留來源位置或形狀；查詢來源記錄時要求包含幾何即可取得。

## 備註及限制

記錄總數並非獨立島嶼的數目。OpenStreetMap 及海岸線記錄可能描述同一片陸地，而且海岸線記錄包括大陸陸地。版本變更比較保留的記錄內容及形狀；新增或移除記錄不一定代表島嶼實際出現或消失。

來源提供的名稱會予以保留。沒有名稱的要素維持無名；沒有語言標籤的名稱保留於
`properties.tags`，不會為它指定語言。山水整理的名稱、島嶼識別碼及邊界會在[區劃、地方、社區及島嶼](/sources/ds-hk-saanseoi-division)資料集中另行發布。

# ZH-HANS

## 更新记录

- 山水初始来源版本，收录 2026 年 9 月 Protomaps 香港地图的岛屿及海岸线资料。
- 保留 **1,671 条来源记录**：764 条 OpenStreetMap 岛屿要素及 907 条海岸线陆地记录。
- 作为以后版本比较的基准。

## 涵盖范围

[Protomaps 底图版本](https://tiles.saanseoi.hk/releases/hk/2026-09-01.json)提供岛屿位置及形状，以及香港海岸线。山水利用这些记录识别岛屿，并将行政区域的形状限制在陆地上。

OpenStreetMap 要素包括岛屿、小岛及群岛记录。部分只有位置标记，没有轮廓。海岸线记录同时涵盖大陆陆地及岛屿；保留完整海岸线也能支持行政区域的划定。

## 保留字段

- `sourceRecordId` — 标识原始 OpenStreetMap 要素或海岸线记录。
- `properties.kind` — 区分 OpenStreetMap 岛屿要素及海岸线陆地记录。
- `properties.tags` — 保留要素附带的 OpenStreetMap 标签。
- `properties.names` — 保留明确标示语言的名称，并以语言为键。
- `geometry` — 保留来源位置或形状；查询来源记录时要求包含几何即可取得。

## 备注及限制

记录总数并非独立岛屿的数目。OpenStreetMap 及海岸线记录可能描述同一片陆地，而且海岸线记录包括大陆陆地。版本变更比较保留的记录内容及形状；新增或移除记录不一定代表岛屿实际出现或消失。

来源提供的名称会予以保留。没有名称的要素维持无名；没有语言标签的名称保留于
`properties.tags`，不会为它指定语言。山水整理的名称、岛屿标识码及边界会在[区划、地方、社区及岛屿](/sources/ds-hk-saanseoi-division)数据集中另行发布。
