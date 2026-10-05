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

- Initial 山水 | SaanSeoi release
- Compiles several authoritative, but non-exhaustive, sources for divisions in Hong Kong
  into a unified catalogue of divisions.
- Unlike most other sources, this source does not have an upstream publisher as we
  publish it ourselves. We decide to publish our own sources when the list of
  modifications to upstream sources becomes so substantial that they no longer count as
  <i>corrections</i> or <i>supplementary</i>.
- The majority of the divisions are taken from Overture's Division release, which itself
  is populated by all the divisions from OpenStreetMap. These are supplemented by the
  "Lands Department Place Names" database, and all the named islands from Protomaps
  (also taken from OpenStreetMap).
- The companion geometry release
  [DivisionArea](/sources/ds-hk-saanseoi-division-area/dr-hk-saanseoi-division-area-{{releaseVersion}})
  includes hand-drawn geometry for all divisions in Hong Kong Island & Kowloon,
  alongside divisions codes. Divisions in the New Territories will be completed over
  time.

## Introduction

Hong Kong's everyday geography is only partly represented in existing datasets.
Overture, drawing on OpenStreetMap, leaves gaps and assigns classifications that do not
always reflect local usage. The government's place-name records provide official naming
evidence, but do not capture every informal name used by residents. SaanSeoi brings
these sources together in a catalogue of <black>divisions</black>, adding places where
evidence supports their common use.

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

The companion DivisionArea release provides polygons for **{{coveredDivisionCount}}
divisions**. The other **{{uncoveredDivisionCount}} divisions** retain their identities
and available point locations without asserting an area boundary. This will be improved
in future releases.

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
  accepted only where it corresponds to a named island or the mainland. There is no
  separate source release published for this ingredient, but the source data can be
  obtained from the
  [SaanSeoi basemap](/basemaps/releases/{{regionCode}}/{{basemapRelease}}).
- <orange>SaanSeoi</orange> Supplementary identities, bilingual names and aliases,
  classifications, hierarchy paths, exclusions, and handcrafted area drawings for
  divisions which lack Overture geometry.

We match Lands Department entries with Overture Divisions if their English and
Traditional Chinese names and/or alias matches within 5,000 metres of their respective
Point coordinates. Hong Kong Island and Kowloon have been 100% resolved, but for the New
Territories, ambiguous and unmatched records remain unresolved.

## Compatibility

A [Division](/docs#models/Division) describes a geographic identity, its names and
ancestry. This edition uses SaanSeoi schema `{{sourceSchemaVersion}}`. The DivisionArea
companion supplies territorial and land-clipped polygon coverage.

### Retained Fields

- `id` retains an Overture GERS UUID for a confirmed matching identity. SaanSeoi
  additions and unmatched island identities use deterministic `ss-` UUIDs from stable
  fixture keys. Division, area and hierarchy references use the same canonical
  identifiers.
- Available point `geometry`, `bbox`, `cartography`, `wikidata`, `identifiers` and
  `sources` are carried forward subject to curated choices.

### Curated and Enriched Fields

- We curate the ultimate list of names and aliases. Unselected publisher names will
  often be added as aliases, so a division can be retrieved by all its known names.
- Curated SaanSeoi classification determines `category`, `class` and `level`
  independently of publisher levels. In practice we respect the administrative division
  hierarchies, but have completely revamped the Overture neighbourhood classification.
- Administrative areas, cities and island landforms remain distinct identities even when
  names coincide. Hong Kong Island, Kowloon and New Territories are the three
  administrative areas; Lantau is an island landform.
- `hierarchies` are populated with curated `administrative`, `locality`, `landform` and
  `full` ancestor paths. If a division has multiple parents, the paths are preserved
  separately. Hierarchies are determined by polygon intersection, so until all the
  Divisions in the New Territories have polygons, their ancestor paths will miss the
  most local neighbourhood levels.

Ambiguous island identities, missing ancestors, conflicting classes and malformed rings
block assembly. Classification or a shared name alone does not establish containment.
Raw Overture fields follow the source release's normalisation and retention rules.

### Coverage Limits

The companion release contains **{{areaCount}} area records covering
{{coveredDivisionCount}} distinct divisions**. A division can have several records
because territorial and land-clipped coverage are offered separately. Area-record counts
therefore differ from the number of divisions with polygons.

- Hierarchies are determined by polygon intersection, so until all the Divisions in the
  New Territories have polygons, their ancestor paths will miss the most local
  neighbourhood levels.
- A name or point does not imply polygon coverage.
- Curated locality boundaries can overlap, and a division can have more than one
  supported ancestry path. Drawn locality and neighbourhood boundaries are curated
  approximations, not statutory boundaries.
- This edition is not an exhaustive or authoritative catalogue of every named place or
  island in Hong Kong.

# ZH-HANT

## 編製理念

現有資料集未能完整呈現香港人在日常生活中認識的地方。Overture 採用包括 OpenStreetMap 在內的來源，但仍有遺漏，部分分類亦未能反映本地用法。政府地名記錄提供官方名稱證據，卻未能涵蓋居民使用的所有非正式地名。SaanSeoi 整合這些來源，建立經審核的<black>地理分區</black>目錄，並在有證據支持通行用法時加入地方。

地理分區代表一個有名稱的地域。即使界線只有大概範圍或尚未確定，地方本身仍可明確識別。本版本共有
**{{divisionCount}} 個地理分區**，分為四類：

- **行政地理：**香港特別行政區、{{classCount_area}} 個<black>地域</black>及
  {{classCount_district}} 個<black>區</black>，另加作為層級起點的中國國家記錄，共
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
  個<black>島群</black>：果洲群島、蒲台群島、索罟群島、大小磨刀及甕缸群島。

配套 DivisionArea 版本為 **{{coveredDivisionCount}} 個地理分區**提供多邊形。其餘
**{{uncoveredDivisionCount}} 個**保留實體及可用的位置點，但不提供面域界線。

## 更新紀錄

- <orange>SaanSeoi</orange> 首個版本包含 {{divisionCount}}
  個經審核的香港地理分區，以及雙語名稱及別名、分類、排除項目及層級。
- 與大多數其他來源不同，此資料來源由我們自行發布，並無上游發布者。當我們對上游資料的修改幅度大到已不能僅視為<i>修正</i>或<i>補充</i>時，我們便會將其作為獨立來源發布。
- 包含衙前圍及九龍南山尾，以及經審核的幾何範圍。
- 香港特別行政區及十八區的領土範圍採用 Overture；三大地域由所屬區的範圍合併。陸地裁切版本採用固定版本的 Protomaps 海岸線。
- 大型行政範圍沿現有多邊形組成部分分成多筆記錄，保留座標、島嶼及不相連的領土部分。

## 來源及涵蓋範圍

此 SaanSeoi 月度版本日期為
{{releaseDate:zh-Hant}}。版本按香港時間於每月首日編定，選用版本日期或之前最新保留的來源版本；更新較慢的來源沿用可用版本。本版採用 Overture
`{{overtureVersion}}`、Protomaps `{{protomapsVersion}}` 及地政總署
`{{landsdVersion}}`。確切來源檔案鍵、校驗值及輸入快照參照保留於版本清單。

- <orange>Overture</orange>
  香港 Division 及 DivisionArea 投影提供基礎識別碼、本地化名稱、來源分類、上層關係及可用面域。這些是包含香港專用受保護修正的 SaanSeoi 正規化資料。
- <orange>地政總署</orange>
  地名資料提供官方名稱及位置證據。位置點用於識別具名地物，並不界定島嶼邊界。排除項目仍保留於上游資料集。四筆官方島群記錄分別為果洲群島、蒲台群島、索罟群島及大小磨刀；甕缸群島採用經審核的 OpenStreetMap 證據。
- <orange>OpenStreetMap</orange>
  海岸線及島嶼地物，包括經 Protomaps 取得的審核幾何資料，支援多邊形選取。只有能代表經審核島嶼的海岸線連通部分才會獲採用。
- <orange>SaanSeoi</orange>
  經審核的身分配對、雙語名稱及別名、分類、上層路徑、新增及排除項目、島嶼輪廓及已儲存面域圖形共同決定組合結果。圖形可保留或編輯來源幾何。

經審核的原生識別碼，或 5,000 米內唯一的英文及繁體中文名稱或別名配對，用於確立地政總署來源成員關係。不明確及未配對記錄維持未解決狀態。來源成員關係及貢獻證據與標準身分分別保留；不會單憑別名配對合併地方。

按來源統計的清單數目代表審核輸入，並非組合記錄的互斥來源歸屬。政府統計處、民政事務總署及規劃署的統計、選舉及規劃面域屬於獨立資料集。

Division 及 DivisionArea 均列明採用 ODbL，署名為 SaanSeoi、© OpenStreetMap
contributors 及 Overture Maps
Foundation。保留的證據記錄支援提供者（包括地政總署名稱證據）及來源版本。

## 兼容性

[Division](/docs#models/Division) 描述地理實體、名稱及上層關係。本版本採用 SaanSeoi
schema
`{{sourceSchemaVersion}}`。配套 DivisionArea 版本提供領土及陸地裁切多邊形覆蓋，並保留來源記錄。

### 保留欄位

- `id` 為已確認配對的實體保留 Overture GERS
  UUID。SaanSeoi 新增及未配對島嶼身分由穩定 fixture 鍵產生確定性的 `ss-`
  UUID。Division、area 及層級參照使用相同的標準識別碼。
- 可用的點 `geometry`、`bbox`、`cartography`、`wikidata`、`identifiers` 及 `sources`
  按審核選擇保留。保留身分不表示保留其面域多邊形。

### 審核及增補欄位

- 經審核的名稱及別名描述選定實體。發布者名稱及分類保留為來源證據；SaanSeoi 審核分類獨立於發布者層級，決定
  `category`、`class` 及 `level`。
- 即使名稱相同，行政地域、城市及島嶼地貌仍保留獨立身分。三個行政地域為香港島、九龍及新界；大嶼山屬島嶼地貌。
- `hierarchies` 保留經審核的 `administrative`、`locality`、`landform` 及 `full`
  上層路徑，各條有證據支持的路徑分別保留。
- 新增島嶼身分獲配可用的英文及繁體中文名稱、代表點、清單識別碼及來源資料。
- North Rock 及 Kap Ma Kum
  Tong 不在涵蓋範圍內。馬屎洲保留具名島嶼輪廓；輪廓以外的審核位置點不能將該島列為上層。

島嶼身分不明確、缺少上層記錄、分類衝突及多邊形環格式不正確均會阻止組合。分類或同名本身不能確立包含關係。原始 Overture 欄位遵循來源版本的正規化及保留規則。

### 涵蓋限制

配套版本共有 **{{areaCount}} 筆面域記錄，涵蓋 {{coveredDivisionCount}}
個不同的地理分區**。領土及陸地裁切範圍分別保留，而大型行政範圍沿現有多邊形組成部分分割，因此一個地理分區可有多筆面域記錄。面域記錄數目並不等於有多邊形的地理分區數目。

具備名稱或位置點不表示已有多邊形覆蓋。保留一般島嶼及不相連的領土部分。經審核的地方界線可以重疊，同一地理分區亦可有多條獲證據支持的上層路徑。繪製的鄰里範圍屬審核近似值，並非法定界線。本版並非香港所有具名地方或島嶼的完整或權威目錄。

# ZH-HANS

## 编制理念

现有数据集未能完整呈现香港人在日常生活中认识的地方。Overture 采用包括 OpenStreetMap 在内的来源，但仍有遗漏，部分分类亦未能反映本地用法。政府地名记录提供官方名称证据，却未能覆盖居民使用的所有非正式地名。SaanSeoi 整合这些来源，建立经审核的<black>地理分区</black>目录，并在有证据支持通行用法时加入地方。

地理分区代表一个有名称的地域。即使界线只有大概范围或尚未确定，地方本身仍可明确识别。本版本共有
**{{divisionCount}} 个地理分区**，分为四类：

- **行政地理：**香港特别行政区、{{classCount_area}} 个<black>地域</black>及
  {{classCount_district}} 个<black>区</black>，另加作为层级起点的中国国家记录，共
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
  个<black>岛群</black>：果洲群岛、蒲台群岛、索罟群岛、大小磨刀及瓮缸群岛。

配套 DivisionArea 版本为 **{{coveredDivisionCount}} 个地理分区**提供多边形。其余
**{{uncoveredDivisionCount}} 个**保留实体及可用的位置点，但不提供面域界线。

## 更新记录

- <orange>SaanSeoi</orange> 首个版本包含 {{divisionCount}}
  个经审核的香港地理分区，以及双语名称及别名、分类、排除项目及层级。
- 与大多数其他来源不同，此数据来源由我们自行发布，并无上游发布者。当我们对上游数据的修改幅度大到已不能仅视为<i>修正</i>或<i>补充</i>时，我们便会将其作为独立来源发布。
- 包含衙前围及九龙南山尾，以及经审核的几何范围。
- 香港特别行政区及十八区的领土范围采用 Overture；三大地域由所属区的范围合并。陆地裁切版本采用固定版本的 Protomaps 海岸线。
- 大型行政范围沿现有多边形组成部分分成多笔记录，保留坐标、岛屿及不相连的领土部分。

## 来源及覆盖范围

此 SaanSeoi 月度版本日期为
{{releaseDate:zh-Hans}}。版本按香港时间于每月首日编定，选用版本日期或之前最新保留的来源版本；更新较慢的来源沿用可用版本。本版采用 Overture
`{{overtureVersion}}`、Protomaps `{{protomapsVersion}}` 及地政总署
`{{landsdVersion}}`。确切来源档案键、校验值及输入快照参照保留于版本清单。

- <orange>Overture</orange>
  香港 Division 及 DivisionArea 投影提供基础标识码、本地化名称、来源分类、上层关系及可用面域。这些是包含香港专用受保护修正的 SaanSeoi 规范化数据。
- <orange>地政总署</orange>
  地名数据提供官方名称及位置证据。位置点用于识别具名地物，并不界定岛屿边界。排除项目仍保留于上游数据集。四笔官方岛群记录分别为果洲群岛、蒲台群岛、索罟群岛及大小磨刀；瓮缸群岛采用经审核的 OpenStreetMap 证据。
- <orange>OpenStreetMap</orange>
  海岸线及岛屿地物，包括经 Protomaps 取得的审核几何数据，支持多边形选取。只有能代表经审核岛屿的海岸线连通部分才会获采用。
- <orange>SaanSeoi</orange>
  经审核的身份匹配、双语名称及别名、分类、上层路径、新增及排除项目、岛屿轮廓及已保存面域图形共同决定组合结果。图形可保留或编辑来源几何。

经审核的原生标识码，或 5,000 米内唯一的英文及繁体中文名称或别名匹配，用于确立地政总署来源成员关系。不明确及未匹配记录维持未解决状态。来源成员关系及贡献证据与标准身份分别保留；不会单凭别名匹配合并地方。

按来源统计的清单数目代表审核输入，并非组合记录的互斥来源归属。政府统计处、民政事务总署及规划署的统计、选举及规划面域属于独立数据集。

Division 及 DivisionArea 均列明采用 ODbL，署名为 SaanSeoi、© OpenStreetMap
contributors 及 Overture Maps
Foundation。保留的证据记录支持提供者（包括地政总署名称证据）及来源版本。

## 兼容性

[Division](/docs#models/Division) 描述地理实体、名称及上层关系。本版本采用 SaanSeoi
schema
`{{sourceSchemaVersion}}`。配套 DivisionArea 版本提供领土及陆地裁切多边形覆盖，并保留来源记录。

### 保留字段

- `id` 为已确认匹配的实体保留 Overture GERS
  UUID。SaanSeoi 新增及未匹配岛屿身份由稳定 fixture 键生成确定性的 `ss-`
  UUID。Division、area 及层级参照使用相同的标准标识码。
- 可用的点 `geometry`、`bbox`、`cartography`、`wikidata`、`identifiers` 及 `sources`
  按审核选择保留。保留身份不表示保留其面域多边形。

### 审核及增补字段

- 经审核的名称及别名描述选定实体。发布者名称及分类保留为来源证据；SaanSeoi 审核分类独立于发布者层级，决定
  `category`、`class` 及 `level`。
- 即使名称相同，行政地域、城市及岛屿地貌仍保留独立身份。三个行政地域为香港岛、九龙及新界；大屿山属岛屿地貌。
- `hierarchies` 保留经审核的 `administrative`、`locality`、`landform` 及 `full`
  上层路径，各条有证据支持的路径分别保留。
- 新增岛屿身份获配可用的英文及繁体中文名称、代表点、清单标识码及来源数据。
- North Rock 及 Kap Ma Kum
  Tong 不在覆盖范围内。马屎洲保留具名岛屿轮廓；轮廓以外的审核位置点不能将该岛列为上层。

岛屿身份不明确、缺少上层记录、分类冲突及多边形环格式不正确均会阻止组合。分类或同名本身不能确立包含关系。原始 Overture 字段遵循来源版本的规范化及保留规则。

### 覆盖限制

配套版本共有 **{{areaCount}} 笔面域记录，覆盖 {{coveredDivisionCount}}
个不同的地理分区**。领土及陆地裁切范围分别保留，而大型行政范围沿现有多边形组成部分分割，因此一个地理分区可有多笔面域记录。面域记录数目并不等于有多边形的地理分区数目。

具备名称或位置点不表示已有多边形覆盖。保留一般岛屿及不相连的领土部分。经审核的地方界线可以重叠，同一地理分区亦可有多条获证据支持的上层路径。绘制的邻里范围属审核近似值，并非法定界线。本版并非香港所有具名地方或岛屿的完整或权威目录。
