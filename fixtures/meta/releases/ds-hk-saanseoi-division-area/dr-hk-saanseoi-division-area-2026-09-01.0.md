---
dataset: "ds-hk-saanseoi-division-area"
release: "dr-hk-saanseoi-division-area-2026-09-01.0"
regionCode: "hk"
source: "saanseoi"
sourceVersion: "2026-09-01.0"
releaseVersion: "2026-09-01.0"
sourceSchemaVersion: "1.0"
type: "divisionArea"
cohortKey: "2026-09-01.0"
---

# EN

## Changelog

- Initial curated edition of Hong Kong division polygons.
- Curated Mei Foo, Tung Tau and Starstreet outlines, island group geometry and reviewed
  containment assertions identify the retained polygon fingerprints.

- Large administrative geometries use multiple records partitioned along existing
  polygon components; coordinates and islands are retained.

- Curated Hong Kong divisions, bilingual aliases, classifications, exclusions and
  hierarchy.
- Includes Nga Tsin Wai and Kowloon Nam Shan Mei, with the latest curated geometry
  exports.
- SAR and District territorial polygons use Overture; Area territories union their
  constituent districts. Separate land-clipped polygons use the pinned Protomaps
  coastline mask.

## Sources and Coverage

This monthly edition uses Overture `2026-08-19.0`, Protomaps `2026-09-01.3` and LandsD
`2026-06-10.0`. Exact archive keys and checksums are retained in the release manifest.
Curated fixtures supply additions, exclusions, naming and geometry selections. Matching
uses bilingual names or aliases within 5,000 metres, or curated native identifiers;
ambiguous matches remain unresolved. Excluded LandsD entries are retained in the
upstream dataset.

Territorial and land-clipped geometry retain their source records. Ordinary islands and
disconnected territorial parts remain included. Drawn neighbourhood boundaries are
curated approximations, not statutory boundaries. ODbL attribution: SaanSeoi,
OpenStreetMap contributors and Overture Maps Foundation; Lands Department naming
evidence is identified separately.

## Coverage Limits

Island groups are named landform identities. Group membership does not assert a polygon
boundary; member islands retain their individual polygons. Multiple area records can
belong to one division, including separate territorial and land-clipped representations
and partitions of large administrative geometries.

# ZH-HANT

## 更新紀錄

- 香港地區名稱、別名、分類、排除項目、層級及最新繪製範圍。
- 包含衙前圍及九龍南山尾。
- 香港特別行政區及十八區的領土範圍採用 Overture；三大地域由所屬區的範圍合併。陸地裁切版本採用固定版本的 Protomaps 海岸線。

## 來源及涵蓋範圍

來源版本為 Overture `2026-08-19.0`、Protomaps `2026-09-01.3` 及地政總署
`2026-06-10.0`。來源檔案及校驗值保留於版本清單。保留離島及不相連的領土部分；經繪製的鄰里範圍並非法定界線。

## 涵蓋限制

島群是具名地貌實體。島群成員關係不代表多邊形界線；各成員島嶼保留獨立多邊形。一個地理分區可有多筆面域記錄，包括分開保留的領土及陸地裁切範圍，以及大型行政範圍的分段。

# ZH-HANS

## 更新记录

- 香港地区名称、别名、分类、排除项目、层级及最新绘制范围。
- 包含衙前围及九龙南山尾。
- 香港特别行政区及十八区的领土范围采用 Overture；三大地域由所属区的范围合并。陆地裁切版本采用固定版本的 Protomaps 海岸线。

## 来源及覆盖范围

来源版本为 Overture `2026-08-19.0`、Protomaps `2026-09-01.3` 及地政总署
`2026-06-10.0`。来源档案及校验值保留于版本清单。保留离岛及不相连的领土部分；经绘制的邻里范围并非法定界线。

## 覆盖限制

岛群是具名地貌实体。岛群成员关系不代表多边形界线；各成员岛屿保留独立多边形。一个地理分区可有多笔面域记录，包括分开保留的领土及陆地裁切范围，以及大型行政范围的分段。
