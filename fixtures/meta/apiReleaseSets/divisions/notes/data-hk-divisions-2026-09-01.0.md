---
createdAt: "2026-10-11T04:00:00.000Z"
updatedAt: "2026-10-11T04:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.2"
apiVersionNumber: "0.2"
apiReleaseSet: "data-hk-divisions-2026-09-01.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-09-01.0"
domainCode: "geographic"
---

# EN

## Changelog

- First 山水 | SaanSeoi Divisions API v`{{apiVersionNumber}}` release for
  {{regionName:en}}.
- <orange>SaanSeoi</orange> We fundamentally changed how the <code>geographic</code>
  division domain is assembled: instead of behaving like a heavily patched projection of
  the <black>Overture Divisions</black> dataset, we now maintain our own inventory of
  divisions, drawing on multiple sources and pre-processing it before ingestion. This
  reduces the number of patches needed to correct Overture as the ground truth is
  directly authored by us. Swapping the primary source for divisions necessitated that
  we bumped the API by a minor version. The request/response shape remains unchanged,
  but the composition of the underlying data has fundamentally changed.
- <orange>SaanSeoi</orange> In short; it is now a curated <code>geographic</code>
  inventory which supplies Division identities, names, classification and hierarchy from
  multiple sources. Select <black>inventory=saanseoi</black> (the default) or the
  separate <black>inventory=overture</black> inventory.
- <orange>API services</orange> <black>GET /divisions/v0.2/inventories</black> lists the
  selected release's inventories and geometry defaults. <black>GET
  /divisions/v0.2/geocode</black> resolves coordinates, place names or addresses to
  division membership. <black>GET /divisions/v0.2/changes</black> compares published
  releases, and <black>GET /divisions/v0.2/changes/definitions/{id}</black> retrieves
  exact before/after definitions. See the [guide](?tab=guide) for examples, selectors
  and coverage limits. Collection, detail and name search are also available under
  <black>/divisions/v0.2</black>.
- <orange>SaanSeoi</orange> Introducing a new hierarchy taxonomy which distinguishes
  <black>administrative</black>, <black>locality</black>, and <black>landform</black>
  ancestry.
- <orange>Geometry</orange> Drawing `DivisionAreas` for each of the SaanSeoi Divisions.
  This first release offers coverage for all of Hong Kong Island and Kowloon, while
  leaving the New Territories for future releases.
- <orange>Crosswalks</orange> `GET /divisions/v0.2/crosswalk` exposes release-pinned
  polygon overlaps between this SaanSeoi geographic edition and published TPU, Housing
  Market Area and New Town cohorts, including New Towns for 2006, 2011, 2016 and 2021.
  Results include overlap area, whole-source-area fraction, containment, geometry hashes
  and exact snapshot pins, with pagination and filtering in either direction.
  Native-domain geographic code filters use the same memberships. Crosswalks retain
  overlaps below the separate 5% hierarchy threshold; fractions are not population
  weights.

## Revision log

- `r{{ revision }}` contains 8 snapshots: two Division inventories and six geometry
  companions.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for
[cohort](saanseoi:en:definition/cohort/v1) <black>{{ cohortKey }}</black> in
{{regionName:en}}. The following source releases are assembled into this release set.

{{apiReleaseSetSources:en}}

## Notes and limitations

- See the [SaanSeoi source notes]({{primarySourceReleaseUrl}}) for the edition's
  curation decisions, coverage and ingredient pins. Record-level <black>sources</black>
  is available with <black>profile=full</black>; the Audit tab describes processing
  evidence.
- The default <black>inventory=saanseoi</black> supplies the Division identities, names,
  classification and hierarchy. <black>inventory=overture</black> selects the separate
  Overture inventory retained in this release; it does not add Overture rows to the
  curated inventory.
- SaanSeoi retains a GERS identifier for a confirmed matching identity. Curated
  additions use <black>ss-</black> identifiers.
- A known division or hierarchy relationship does not guarantee a polygon. Curated
  neighbourhood drawings may be approximate; use official government companions where a
  legal or census boundary is required.
- Bare <black>include=areas</black> selects the inventory's default area variant; for
  SaanSeoi this is <black>saanseoi</black>. Bare <black>include=boundaries</black>
  selects Overture district boundaries. Qualified providers remain separate
  alternatives.
- C&SD companions describe their census reference years. Do not treat a 2016 or 2021
  census geometry as a permanently current administrative boundary.

# ZH-HANT

## 更新紀錄

- 山水 Divisions API v`{{apiVersionNumber}}` 首次為{{regionName:zh-Hant}}發布。
- <orange>山水</orange> 我們從根本上改變了 <code>geographic</code>
  區劃 domain 的組裝方式：不再以經大量修補的 <black>Overture Divisions</black>
  資料集投影為基礎，而是自行維護區劃 inventory，整合多個來源，並在匯入前完成預處理。由於作為準據的資料由我們直接編製，修正 Overture 所需的補丁亦隨之減少。更換區劃的主要來源，因此需要提升 API 的次版本號。請求及回應的結構保持不變，但底層資料的組成已從根本上改變。
- <orange>山水</orange> 簡而言之，現在由經整理的 <code>geographic</code>
  inventory 整合多個來源，提供區劃識別碼、名稱、分類及層級。可選取預設的
  <black>inventory=saanseoi</black>，或獨立的 <black>inventory=overture</black>。
- <orange>API 服務</orange> <black>GET /divisions/v0.2/inventories</black>
  列出所選發布的 inventory 及幾何預設值。 <black>GET /divisions/v0.2/geocode</black>
  將座標、地名或地址解析為區劃歸屬。 <black>GET /divisions/v0.2/changes</black>
  比較已發布版本； <black>GET /divisions/v0.2/changes/definitions/{id}</black>
  取得確切的前後定義。範例、選擇參數及覆蓋限制請參閱[指南](?tab=guide)。
  <black>/divisions/v0.2</black> 亦提供列表、詳情及名稱搜尋。
- <orange>山水</orange> 引入新的層級分類，區分
  <black>administrative</black>（行政）、<black>locality</black>（聚落）及
  <black>landform</black>（地貌）祖先關係。
- <orange>幾何</orange> 為各個山水區劃繪製
  `DivisionAreas`。首版涵蓋整個香港島及九龍，新界則留待日後版本處理。
- <orange>對照表</orange> `GET /divisions/v0.2/crosswalk`
  提供本山水地理版本與已發布 TPU、房屋市場區及新市鎮 cohort 之間的固定版本多邊形重疊，包括 2006、2011、2016 及 2021 年新市鎮。結果包含重疊面積、完整來源面積比例、包含關係、幾何雜湊及精確 snapshot
  ID，並支援分頁及雙向篩選。原生 domain 的地理代碼篩選使用相同關係。對照表保留低於獨立階層百分之五門檻的重疊；比例並非人口權重。

## 修訂紀錄

- `r{{ revision }}` 包含 8 個 snapshot：兩個 Division inventory 及六個幾何配套。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 在
{{regionName:zh-Hant}}發布 [cohort](saanseoi:zh-hant:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。以下來源發布組裝成此 release set。

{{apiReleaseSetSources:zh-Hant}}

## 備註與限制

- 本版整理決定、覆蓋及輸入版本，請參閱
  [山水來源附註]({{primarySourceReleaseUrl}})。記錄層級的 <black>sources</black> 透過
  <black>profile=full</black> 提供；Audit 分頁描述處理證據。
- 預設 <black>inventory=saanseoi</black>
  提供 Division 識別碼、名稱、分類及層級。<black>inventory=overture</black>
  選取此發布保留的獨立 Overture inventory，不會將 Overture 記錄加入經整理的 inventory。
- 已確認配對的識別對象保留 GERS 識別碼；新增的整理記錄使用 <black>ss-</black> 識別碼。
- 已知區劃或層級關係不保證有多邊形。經整理的鄰里繪圖可能為概略範圍；如需法定或人口普查邊界，請使用官方政府配套。
- 未限定的 <black>include=areas</black> 選取 inventory 的預設面，山水的預設為
  <black>saanseoi</black>。<black>include=boundaries</black>
  選取 Overture 地區邊界。限定的提供者仍為獨立選項。
- 政府統計處配套描述其人口普查參考年份。請勿將 2016 或 2021 年人口普查幾何視為持續有效的行政邊界。

# ZH-HANS

## 更新记录

- 山水 Divisions API v`{{apiVersionNumber}}` 首次为{{regionName:zh-Hans}}发布。
- <orange>山水</orange> 我们从根本上改变了 <code>geographic</code>
  区划 domain 的组装方式：不再以经大量修补的 <black>Overture Divisions</black>
  数据集投影为基础，而是自行维护区划 inventory，整合多个来源，并在导入前完成预处理。由于作为依据的数据由我们直接编制，修正 Overture 所需的补丁亦随之减少。更换区划的主要来源，因此需要提升 API 的次版本号。请求及响应的结构保持不变，但底层数据的组成已从根本上改变。
- <orange>山水</orange> 简而言之，现在由经整理的 <code>geographic</code>
  inventory 整合多个来源，提供区划标识符、名称、分类及层级。可选择默认的
  <black>inventory=saanseoi</black>，或独立的 <black>inventory=overture</black>。
- <orange>API 服务</orange> <black>GET /divisions/v0.2/inventories</black>
  列出所选发布的 inventory 及几何默认值。 <black>GET /divisions/v0.2/geocode</black>
  将坐标、地名或地址解析为区划归属。 <black>GET /divisions/v0.2/changes</black>
  比较已发布版本； <black>GET /divisions/v0.2/changes/definitions/{id}</black>
  获取确切的前后定义。示例、选择参数及覆盖限制请参阅[指南](?tab=guide)。
  <black>/divisions/v0.2</black> 亦提供列表、详情及名称搜索。
- <orange>山水</orange> 引入新的层级分类，区分
  <black>administrative</black>（行政）、<black>locality</black>（聚落）及
  <black>landform</black>（地貌）祖先关系。
- <orange>几何</orange> 为各个山水区划绘制
  `DivisionAreas`。首版涵盖整个香港岛及九龙，新界则留待日后版本处理。
- <orange>对照表</orange> `GET /divisions/v0.2/crosswalk`
  提供本山水地理版本与已发布 TPU、房屋市场区及新市镇 cohort 之间的固定版本多边形重叠，包括 2006、2011、2016 及 2021 年新市镇。结果包含重叠面积、完整来源面积比例、包含关系、几何哈希及精确 snapshot
  ID，并支持分页及双向筛选。原生 domain 的地理代码筛选使用相同关系。对照表保留低于独立层级百分之五门槛的重叠；比例并非人口权重。

## 修订记录

- `r{{ revision }}` 包含 8 个 snapshot：两个 Division inventory 及六个几何配套。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 在
{{regionName:zh-Hans}}发布 [cohort](saanseoi:zh-hans:definition/cohort/v1)
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。以下来源发布组装成此 release set。

{{apiReleaseSetSources:zh-Hans}}

## 备注与限制

- 本版整理决定、覆盖及输入版本，请参阅
  [山水源说明]({{primarySourceReleaseUrl}})。记录层级的 <black>sources</black> 通过
  <black>profile=full</black> 提供；Audit 选项卡描述处理证据。
- 默认 <black>inventory=saanseoi</black>
  提供 Division 标识符、名称、分类及层级。<black>inventory=overture</black>
  选取此发布保留的独立 Overture inventory，不会将 Overture 记录加入经整理的 inventory。
- 已确认匹配的标识对象保留 GERS 标识符；新增的整理记录使用 <black>ss-</black> 标识符。
- 已知区划或层级关系不保证有多边形。经整理的邻里绘图可能为概略范围；如需法定或人口普查边界，请使用官方政府配套。
- 未限定的 <black>include=areas</black> 选取 inventory 的默认面，山水的默认为
  <black>saanseoi</black>。<black>include=boundaries</black>
  选取 Overture 地区边界。限定的提供方仍为独立选项。
- 政府统计处配套描述其人口普查参考年份。请勿将 2016 或 2021 年人口普查几何视为持续有效的行政边界。
