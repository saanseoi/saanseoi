---
dataset: "ds-hk-saanseoi-division"
release: "dr-hk-saanseoi-division-2026-09-01.0"
regionCode: "hk"
source: "saanseoi"
sourceVersion: "2026-09-01.0"
releaseVersion: "2026-09-01.0"
sourceSchemaVersion: "1.0"
type: "division"
cohortKey: "2026-09-01.0"
countsRelease: "dr-hk-saanseoi-division-2026-09-01.0"
divisionArchiveSha256: "2bbff2d967c370b26995010bcb70e259c69dc4e691d5eb7b39799114958b3e0e"
areaArchiveSha256: "e28bbe5a2c76e6bbbafc5b78e91d9e2baca596ab5fe28d9be545e8b705bfdc92"
divisionCount: "2,003"
areaCount: "589"
coveredDivisionCount: "562"
uncoveredDivisionCount: "1,441"
classCount_area: "3"
classCount_city: "2"
classCount_country: "1"
classCount_district: "18"
classCount_hamlet: "953"
classCount_island_group: "5"
classCount_islet: "146"
classCount_macrohood: "176"
classCount_major_island: "5"
classCount_microhood: "182"
classCount_minor_island: "106"
classCount_neighbourhood: "193"
classCount_sar: "1"
classCount_town: "19"
classCount_village: "193"
categoryCount_administrative: "23"
categoryCount_hood: "551"
categoryCount_landform: "262"
categoryCount_locality: "1,167"
overtureVersion: "2026-08-19.0"
overtureAreaVersion: "2026-08-19.0"
protomapsVersion: "2026-09-01.3"
landsdVersion: "2026-06-10.0"
rvdVersion: "2015-04-30.0"
basemapRelease: "2026-09-01"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release, with **{{divisionCount}} Division records** and
  **{{areaCount}} DivisionArea records**.
- Curated bilingual names and aliases, division codes, classifications and ancestry,
  drawing on Overture, Lands Department Place Names and named island evidence.
- Polygon coverage includes curated locality and neighbourhood drawings, island
  outlines, administrative territories and separate land-clipped areas.

## Introduction

Hong Kong's everyday geography is only partly represented in existing datasets.
Overture, drawing on OpenStreetMap, leaves gaps and assigns classifications that do not
always reflect local usage. The government's place-name records provide official naming
evidence, but do not capture every informal name used by residents. SaanSeoi brings
these sources together with curated names, classifications and boundaries, adding places
where evidence supports their common use.

This dataset includes two resource types in the same release: **Division** records
describe places, their names and ancestry; **DivisionArea** records provide their
available polygon geometry. Area records reference the corresponding divisions by
canonical identifier.

A division is a named geographic area. Its identity can be well established even when
its boundaries are approximate or unavailable. This release contains **{{divisionCount}}
divisions**, organised into four categories:

- **Administrative:** {{classCount_sar}} SAR for all of Hong Kong, its
  {{classCount_area}} <black>Areas</black> and {{classCount_district}}
  <black>Districts</black>, plus a country record for China that anchors the hierarchy —
  {{categoryCount_administrative}} records in total.
- **Localities:** {{classCount_city}} <black>Cities</black>, {{classCount_town}}
  <black>Towns</black>, {{classCount_village}} <black>Villages</black> and
  {{classCount_hamlet}} <black>Hamlets</black>. These classifications describe
  settlements; they do not imply that every boundary is legally defined.
- **Neighbourhoods:** {{classCount_macrohood}} <black>Macrohoods</black>,
  {{classCount_neighbourhood}} <black>Neighbourhoods</black> and
  {{classCount_microhood}} <black>Microhoods</black>. These describe places at different
  scales within urban areas, with curated relationships where the evidence supports
  them.
- **Landforms:** {{classCount_major_island}} <black>Major Islands</black>,
  {{classCount_minor_island}} <black>Minor Islands</black> and {{classCount_islet}}
  <black>Islets</black>, together with {{classCount_island_group}} <black>Island
  Groups</black>.

The **{{areaCount}} DivisionArea records** in this release provide polygons for
**{{coveredDivisionCount}} divisions**. The other **{{uncoveredDivisionCount}}
divisions** retain their identities and available point locations without asserting an
area boundary.

SaanSeoi publishes both resources as a curated dataset, with the contributing upstream
sources retained as evidence.

## Sources and Coverage

This monthly edition is dated {{releaseDate:en}}. Editions are scheduled for the first
of each month, using the latest upstream releases dated on or before the edition date
and carrying forward slower sources. This edition uses data from <black>Overture</black>
`{{overtureVersion}}`, <black>Protomaps</black> `{{protomapsVersion}}` and <black>Lands
Department</black> `{{landsdVersion}}`, with historical RVD list membership from
`{{rvdVersion}}`. Exact archive keys, checksums and input snapshot references are
retained in the release manifest.

- <orange>Overture</orange> Hong Kong <black>Division</black> and
  <black>DivisionArea</black> projections supply baseline identities, localised names,
  source classification, ancestry and available areas. These are normalised SaanSeoi
  projections with guarded Hong Kong corrections. See
  [ingestion notes](/sources/ds-hk-overture-division/) for full details.
- <orange>Lands Department</orange> Place Names supply official-name and location
  evidence. Points identify named features only. Whenever entries are excluded we add
  those entries in the audit.
- <orange>Protomaps</orange> Coastline and island features. A coastline component is
  accepted only where it corresponds to a named island or the mainland. The resulting
  island and land-clipped polygons are included in this release as DivisionArea records.
  The coastline input is shared with the
  [SaanSeoi basemap](/basemaps/releases/{{regionCode}}/{{basemapRelease}}).
- <orange>SaanSeoi</orange> Supplementary identities, bilingual names and aliases,
  classifications, hierarchy paths, exclusions, and handcrafted area drawings for
  divisions which lack Overture geometry.

We match Lands Department entries with Overture Divisions if their English and
Traditional Chinese names or aliases match within 5,000 metres of their respective point
coordinates. Hong Kong Island and Kowloon have been 100% resolved, but for the New
Territories, ambiguous and unmatched records remain unresolved.

Both resources are published under ODbL, with attribution to SaanSeoi, © OpenStreetMap
contributors and Overture Maps Foundation. Retained source evidence identifies the
contributors and source versions, including Lands Department naming evidence.

## Divisions

### Compatibility

A [Division](/docs#models/Division) describes a geographic identity, its names and
ancestry. This edition uses SaanSeoi schema `{{sourceSchemaVersion}}`. Its point
geometry locates the place; the DivisionArea records in this release describe its
polygon coverage.

#### Retained Fields

- `id` retains an Overture GERS UUID for a confirmed matching identity. SaanSeoi
  additions and unmatched island identities use deterministic `ss-` UUIDs from stable
  fixture keys. Division, area and hierarchy references use the same canonical
  identifiers.
- Available point `geometry`, `bbox`, `cartography`, `wikidata`, `identifiers` and
  `sources` are carried forward subject to curated choices.

#### Curated and Enriched Fields

- We curate the ultimate list of names and aliases. Unselected publisher names will
  often be added as aliases, so a division can be retrieved by all its known names.
- Curated SaanSeoi classification determines `category`, `class` and `level`
  independently of publisher levels. In practice we respect the administrative division
  hierarchies, but use our own neighbourhood classification.
- Administrative areas, cities and island landforms remain distinct identities even when
  names coincide. Hong Kong Island, Kowloon and New Territories are the three
  administrative areas; Lantau is an island landform.
- `hierarchies` are populated with curated `administrative`, `locality`, `landform` and
  `full` ancestor paths. If a division has multiple parents, the paths are preserved
  separately. Hierarchies are determined by polygon intersection, so until all the
  divisions in the New Territories have polygons, their ancestor paths will miss the
  most local neighbourhood levels.

Ambiguous island identities, missing ancestors, conflicting classes and malformed rings
block assembly. Classification or a shared name alone does not establish containment.
Raw Overture fields follow the source release's normalisation and retention rules.

### Coverage Limits

- Hierarchies depend on polygon intersection. Divisions in the New Territories without
  polygons can lack the most local neighbourhood levels in their ancestor paths.
- A name or point does not imply polygon coverage.
- A division can have more than one supported ancestry path.
- This edition is not an exhaustive or authoritative catalogue of every named place or
  island in Hong Kong.

## Division Areas

### Geometry and Coverage

The **{{areaCount}} DivisionArea records** cover **{{coveredDivisionCount}} distinct
divisions**. Each area belongs to a division in this dataset. A division can have
several area records, so the area count is not the number of divisions with polygons.

- **Administrative territories:** SAR and District polygons use Overture. The three Area
  territories are unions of their constituent districts. Territorial geometry is the
  administrative reference.
- **Land-clipped areas:** Separate polygons intersect administrative territories with
  the pinned Protomaps coastline mask to support land coverage calculations. Both
  territorial and land-clipped representations retain their source records.
- **Localities and neighbourhoods:** Curated drawings supply boundaries where Overture
  geometry is unavailable, including Nga Tsin Wai and Nam Sang Wai in Kowloon. Drawings
  cover Hong Kong Island and Kowloon; coverage in the New Territories remains
  incomplete.
- **Islands:** Selected island outlines use reviewed coastline and island geometry.
  Ordinary islands and disconnected territorial parts remain included.

Large administrative geometries can be partitioned along existing polygon components
into several area records, preserving their coordinates and disconnected parts.

### Coverage Limits

Curated locality and neighbourhood boundaries can overlap. Drawn boundaries are
approximations, not statutory boundaries. A division without an area record has no
polygon coverage in this release.

Island groups are named landform identities. Group membership alone does not establish
an enclosing territorial boundary. Island-group geometry combines member island
polygons, preserving sea gaps; member islands also retain their individual polygons.

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 首個版本，同一資料集包含 **{{divisionCount}} 筆 Division 記錄**及
  **{{areaCount}} 筆 DivisionArea 記錄**。
- 採用 Overture、地政總署地名及具名島嶼證據，審核雙語名稱及別名、分區代碼、分類及上層關係。
- 多邊形涵蓋範圍包括經審核的聚落及鄰里圖形、島嶼輪廓、行政領土範圍及分開保留的陸地裁切面域。

## 簡介

現有資料集未能完整呈現香港人在日常生活中認識的地方。Overture 採用包括 OpenStreetMap 在內的來源，但仍有遺漏，部分分類亦未能反映本地用法。政府地名記錄提供官方名稱證據，卻未能涵蓋居民使用的所有非正式地名。SaanSeoi 整合這些來源，審核名稱、分類及界線，並在有證據支持通行用法時加入地方。

本資料集在同一版本內包含兩種資源：**Division（地理分區）**記錄描述地方、名稱及上層關係；**DivisionArea（分區面域）**記錄提供可用的多邊形幾何。面域記錄透過標準識別碼參照對應的地理分區。

地理分區代表一個有名稱的地域。即使界線只有大概範圍或尚未確定，地方本身仍可明確識別。本版本共有
**{{divisionCount}} 個地理分區**，分為四類：

- **行政地理：**{{classCount_sar}} 個涵蓋全港的特別行政區、{{classCount_area}}
  個<black>地域</black>及 {{classCount_district}}
  個<black>區</black>，另加作為層級起點的中國國家記錄，共
  {{categoryCount_administrative}} 筆。
- **聚落：**{{classCount_city}} 個<black>城市</black>、{{classCount_town}}
  個<black>市鎮</black>、{{classCount_village}} 個<black>村落</black>及
  {{classCount_hamlet}}
  個<black>小村</black>。這些分類描述聚落，並不表示每個地方均有法定界線。
- **鄰里：**{{classCount_macrohood}}
  個<black>大型鄰里</black>、{{classCount_neighbourhood}} 個<black>鄰里</black>及
  {{classCount_microhood}}
  個<black>微型鄰里</black>，描述城市內不同尺度的地方，並按證據建立經審核的關係。
- **地貌：**{{classCount_major_island}}
  個<black>主要島嶼</black>、{{classCount_minor_island}} 個<black>小型島嶼</black>及
  {{classCount_islet}} 個<black>小島</black>，另有 {{classCount_island_group}}
  個<black>島群</black>。

本版本的 **{{areaCount}} 筆 DivisionArea 記錄**為 **{{coveredDivisionCount}}
個地理分區**提供多邊形。其餘 **{{uncoveredDivisionCount}}
個地理分區**保留實體及可用的位置點，但不提供面域界線。

SaanSeoi 將這兩種資源作為經審核的資料集發布，並保留上游來源作為依據。

## 來源及涵蓋範圍

此月度版本日期為
{{releaseDate:zh-Hant}}。版本編定於每月首日，選用版本日期或之前最新的上游版本；更新較慢的來源沿用可用版本。本版採用
<black>Overture</black> `{{overtureVersion}}`、<black>Protomaps</black>
`{{protomapsVersion}}` 及<black>地政總署</black>
`{{landsdVersion}}`，並保留差餉物業估價署 `{{rvdVersion}}`
歷史名單的成員資料。確切來源檔案鍵、校驗值及輸入快照參照保留於版本清單。

- <orange>Overture</orange> 香港 <black>Division</black> 及 <black>DivisionArea</black>
  投影提供基礎識別碼、本地化名稱、來源分類、上層關係及可用面域。這些是經 SaanSeoi 正規化的資料，包含設有檢查條件的香港專用修正。詳見[匯入說明](/sources/ds-hk-overture-division/)。
- <orange>地政總署</orange>地名資料提供官方名稱及位置證據。位置點只用於識別具名地物；排除的項目會記錄於審核資料。
- <orange>Protomaps</orange>
  提供海岸線及島嶼地物。只有對應具名島嶼或大陸陸地的海岸線組成部分才會獲採用。產生的島嶼及陸地裁切多邊形已包含於本版本的 DivisionArea 記錄。海岸線輸入亦用於
  [SaanSeoi 底圖](/basemaps/releases/{{regionCode}}/{{basemapRelease}})。
- <orange>SaanSeoi</orange>
  提供補充實體、雙語名稱及別名、分類、上層路徑、排除項目，以及為缺少 Overture 幾何的地理分區手工繪製的面域。

我們按英文及繁體中文名稱或別名，將位置點相距 5,000 米內的地政總署記錄與 Overture 地理分區配對。香港島及九龍的配對已全部處理；新界仍有不明確或未配對的記錄。

兩種資源均按 ODbL 發布，署名為 SaanSeoi、© OpenStreetMap contributors 及 Overture Maps
Foundation。保留的來源證據記錄貢獻者及來源版本，包括地政總署的名稱證據。

## 地理分區

### 兼容性

[Division](/docs#models/Division) 描述地理實體、名稱及上層關係。本版本採用 SaanSeoi
schema
`{{sourceSchemaVersion}}`。點幾何標示地方的位置；本版本的 DivisionArea 記錄則描述其多邊形涵蓋範圍。

#### 保留欄位

- `id` 為已確認配對的實體保留 Overture GERS
  UUID。SaanSeoi 新增及未配對的島嶼實體，以穩定的 fixture 鍵產生確定性的 `ss-`
  UUID。地理分區、面域及層級參照使用相同的標準識別碼。
- 可用的點 `geometry`、`bbox`、`cartography`、`wikidata`、`identifiers` 及 `sources`
  按審核選擇保留。

#### 審核及增補欄位

- 我們審核並選定名稱及別名。未獲選為主名稱的發布者名稱通常會加入別名，方便以不同已知名稱查找同一地理分區。
- SaanSeoi 審核分類獨立於發布者層級，決定 `category`、`class` 及
  `level`。我們尊重行政區劃的層級，並採用自己的鄰里分類。
- 即使名稱相同，行政地域、城市及島嶼地貌仍保留獨立身分。三個行政地域為香港島、九龍及新界；大嶼山屬島嶼地貌。
- `hierarchies` 包含經審核的 `administrative`、`locality`、`landform` 及 `full`
  上層路徑。若地理分區有多個上層，各條路徑會分別保留。層級關係以多邊形相交判定，因此在新界所有地理分區均有多邊形之前，其上層路徑仍可能缺少最細緻的鄰里層級。

島嶼身分不明確、缺少上層記錄、分類衝突及多邊形環格式不正確均會阻止組合。分類或同名本身不能確立包含關係。原始 Overture 欄位遵循來源版本的正規化及保留規則。

### 涵蓋限制

- 層級關係依賴多邊形相交。新界缺少多邊形的地理分區，其上層路徑可能缺少最細緻的鄰里層級。
- 具備名稱或位置點不表示已有多邊形。
- 同一地理分區可有多條獲證據支持的上層路徑。
- 本版並非香港所有具名地方或島嶼的完整或權威目錄。

## 分區面域

### 幾何及涵蓋範圍

本版本共有 **{{areaCount}} 筆 DivisionArea 記錄，涵蓋 {{coveredDivisionCount}}
個不同的地理分區**。每筆面域均屬於本資料集的一個地理分區。一個地理分區可有多筆面域記錄，因此面域記錄數目並不等於有多邊形的地理分區數目。

- **行政領土範圍：**香港特別行政區及各區的多邊形採用 Overture。三大地域的領土範圍由所屬區的範圍合併，作為行政範圍的參照。
- **陸地裁切面域：**另以行政領土範圍與固定版本的 Protomaps 海岸線遮罩相交，產生支援陸地覆蓋計算的多邊形。領土及陸地裁切兩種表示均保留來源記錄。
- **聚落及鄰里：**經審核的圖形為缺少 Overture 幾何的地方提供界線，包括衙前圍及九龍南山尾。繪製範圍涵蓋香港島及九龍；新界的涵蓋範圍仍未完整。
- **島嶼：**選定的島嶼輪廓採用經審核的海岸線及島嶼幾何，保留一般島嶼及不相連的領土部分。

大型行政幾何可沿現有多邊形組成部分分成多筆面域記錄，保留座標及不相連的部分。

### 涵蓋限制

經審核的聚落及鄰里界線可以重疊。繪製的界線屬近似範圍，並非法定界線。沒有面域記錄的地理分區，在本版本中沒有多邊形覆蓋。

島群是具名地貌實體。成員關係本身不代表包圍整個島群的領土界線。島群幾何合併成員島嶼的多邊形，保留島嶼之間的海域空隙；各成員島嶼亦保留獨立多邊形。

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 首个版本，同一数据集包含 **{{divisionCount}} 笔 Division 记录**及
  **{{areaCount}} 笔 DivisionArea 记录**。
- 采用 Overture、地政总署地名及具名岛屿证据，审核双语名称及别名、分区代码、分类及上层关系。
- 多边形覆盖范围包括经审核的聚落及邻里图形、岛屿轮廓、行政领土范围及分开保留的陆地裁切面域。

## 简介

现有数据集未能完整呈现香港人在日常生活中认识的地方。Overture 采用包括 OpenStreetMap 在内的来源，但仍有遗漏，部分分类亦未能反映本地用法。政府地名记录提供官方名称证据，却未能覆盖居民使用的所有非正式地名。SaanSeoi 整合这些来源，审核名称、分类及界线，并在有证据支持通行用法时加入地方。

本数据集在同一版本内包含两种资源：**Division（地理分区）**记录描述地方、名称及上层关系；**DivisionArea（分区面域）**记录提供可用的多边形几何。面域记录通过标准标识码参照对应的地理分区。

地理分区代表一个有名称的地域。即使界线只有大概范围或尚未确定，地方本身仍可明确识别。本版本共有
**{{divisionCount}} 个地理分区**，分为四类：

- **行政地理：**{{classCount_sar}} 个覆盖全港的特别行政区、{{classCount_area}}
  个<black>地域</black>及 {{classCount_district}}
  个<black>区</black>，另加作为层级起点的中国国家记录，共
  {{categoryCount_administrative}} 笔。
- **聚落：**{{classCount_city}} 个<black>城市</black>、{{classCount_town}}
  个<black>市镇</black>、{{classCount_village}} 个<black>村落</black>及
  {{classCount_hamlet}}
  个<black>小村</black>。这些分类描述聚落，并不表示每个地方均有法定界线。
- **邻里：**{{classCount_macrohood}}
  个<black>大型邻里</black>、{{classCount_neighbourhood}} 个<black>邻里</black>及
  {{classCount_microhood}}
  个<black>微型邻里</black>，描述城市内不同尺度的地方，并按证据建立经审核的关系。
- **地貌：**{{classCount_major_island}}
  个<black>主要岛屿</black>、{{classCount_minor_island}} 个<black>小型岛屿</black>及
  {{classCount_islet}} 个<black>小岛</black>，另有 {{classCount_island_group}}
  个<black>岛群</black>。

本版本的 **{{areaCount}} 笔 DivisionArea 记录**为 **{{coveredDivisionCount}}
个地理分区**提供多边形。其余 **{{uncoveredDivisionCount}}
个地理分区**保留实体及可用的位置点，但不提供面域界线。

SaanSeoi 将这两种资源作为经审核的数据集发布，并保留上游来源作为依据。

## 来源及覆盖范围

此月度版本日期为
{{releaseDate:zh-Hans}}。版本编定于每月首日，选用版本日期或之前最新的上游版本；更新较慢的来源沿用可用版本。本版采用
<black>Overture</black> `{{overtureVersion}}`、<black>Protomaps</black>
`{{protomapsVersion}}` 及<black>地政总署</black>
`{{landsdVersion}}`，并保留差饷物业估价署 `{{rvdVersion}}`
历史名单的成员数据。确切来源档案键、校验值及输入快照参照保留于版本清单。

- <orange>Overture</orange> 香港 <black>Division</black> 及 <black>DivisionArea</black>
  投影提供基础标识码、本地化名称、来源分类、上层关系及可用面域。这些是经 SaanSeoi 规范化的数据，包含设有检查条件的香港专用修正。详见[导入说明](/sources/ds-hk-overture-division/)。
- <orange>地政总署</orange>地名数据提供官方名称及位置证据。位置点只用于识别具名地物；排除的项目会记录于审核数据。
- <orange>Protomaps</orange>
  提供海岸线及岛屿地物。只有对应具名岛屿或大陆陆地的海岸线组成部分才会获采用。产生的岛屿及陆地裁切多边形已包含于本版本的 DivisionArea 记录。海岸线输入亦用于
  [SaanSeoi 底图](/basemaps/releases/{{regionCode}}/{{basemapRelease}})。
- <orange>SaanSeoi</orange>
  提供补充实体、双语名称及别名、分类、上层路径、排除项目，以及为缺少 Overture 几何的地理分区手工绘制的面域。

我们按英文及繁体中文名称或别名，将位置点相距 5,000 米内的地政总署记录与 Overture 地理分区匹配。香港岛及九龙的匹配已全部处理；新界仍有不明确或未匹配的记录。

两种资源均按 ODbL 发布，署名为 SaanSeoi、© OpenStreetMap contributors 及 Overture Maps
Foundation。保留的来源证据记录贡献者及来源版本，包括地政总署的名称证据。

## 地理分区

### 兼容性

[Division](/docs#models/Division) 描述地理实体、名称及上层关系。本版本采用 SaanSeoi
schema
`{{sourceSchemaVersion}}`。点几何标示地方的位置；本版本的 DivisionArea 记录则描述其多边形覆盖范围。

#### 保留字段

- `id` 为已确认匹配的实体保留 Overture GERS
  UUID。SaanSeoi 新增及未匹配的岛屿实体，以稳定的 fixture 键生成确定性的 `ss-`
  UUID。地理分区、面域及层级参照使用相同的标准标识码。
- 可用的点 `geometry`、`bbox`、`cartography`、`wikidata`、`identifiers` 及 `sources`
  按审核选择保留。

#### 审核及增补字段

- 我们审核并选定名称及别名。未获选为主名称的发布者名称通常会加入别名，方便以不同已知名称查找同一地理分区。
- SaanSeoi 审核分类独立于发布者层级，决定 `category`、`class` 及
  `level`。我们尊重行政区划的层级，并采用自己的邻里分类。
- 即使名称相同，行政地域、城市及岛屿地貌仍保留独立身份。三个行政地域为香港岛、九龙及新界；大屿山属岛屿地貌。
- `hierarchies` 包含经审核的 `administrative`、`locality`、`landform` 及 `full`
  上层路径。若地理分区有多个上层，各条路径会分别保留。层级关系以多边形相交判定，因此在新界所有地理分区均有多边形之前，其上层路径仍可能缺少最细致的邻里层级。

岛屿身份不明确、缺少上层记录、分类冲突及多边形环格式不正确均会阻止组合。分类或同名本身不能确立包含关系。原始 Overture 字段遵循来源版本的规范化及保留规则。

### 覆盖限制

- 层级关系依赖多边形相交。新界缺少多边形的地理分区，其上层路径可能缺少最细致的邻里层级。
- 具备名称或位置点不表示已有多边形。
- 同一地理分区可有多条获证据支持的上层路径。
- 本版并非香港所有具名地方或岛屿的完整或权威目录。

## 分区面域

### 几何及覆盖范围

本版本共有 **{{areaCount}} 笔 DivisionArea 记录，覆盖 {{coveredDivisionCount}}
个不同的地理分区**。每笔面域均属于本数据集的一个地理分区。一个地理分区可有多笔面域记录，因此面域记录数目并不等于有多边形的地理分区数目。

- **行政领土范围：**香港特别行政区及各区的多边形采用 Overture。三大地域的领土范围由所属区的范围合并，作为行政范围的参照。
- **陆地裁切面域：**另以行政领土范围与固定版本的 Protomaps 海岸线遮罩相交，产生支持陆地覆盖计算的多边形。领土及陆地裁切两种表示均保留来源记录。
- **聚落及邻里：**经审核的图形为缺少 Overture 几何的地方提供界线，包括衙前围及九龙南山尾。绘制范围覆盖香港岛及九龙；新界的覆盖范围仍未完整。
- **岛屿：**选定的岛屿轮廓采用经审核的海岸线及岛屿几何，保留一般岛屿及不相连的领土部分。

大型行政几何可沿现有多边形组成部分分成多笔面域记录，保留坐标及不相连的部分。

### 覆盖限制

经审核的聚落及邻里界线可以重叠。绘制的界线属近似范围，并非法定界线。没有面域记录的地理分区，在本版本中没有多边形覆盖。

岛群是具名地貌实体。成员关系本身不代表包围整个岛群的领土界线。岛群几何合并成员岛屿的多边形，保留岛屿之间的海域空隙；各成员岛屿亦保留独立多边形。
