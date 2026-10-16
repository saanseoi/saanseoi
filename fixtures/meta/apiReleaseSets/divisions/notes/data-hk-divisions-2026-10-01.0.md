---
createdAt: "2026-10-11T04:00:00.000Z"
updatedAt: "2026-10-11T04:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.2"
apiReleaseSet: "data-hk-divisions-2026-10-01.0"
revision: "0"
regionCode: "hk"
cohortKey: "2026-10-01.0"
domainCode: "geographic"
---

# EN

## Changelog

- <orange>Upstream</orange> Uses Overture
  [`2026-09-23.0`](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-09-23.0?tab=changes).
  In the retained Hong Kong Division input, 199 existing records gain Wikidata IDs and
  eight records have point-geometry changes; five identities are added upstream and four
  are dropped.
- <orange>SaanSeoi</orange> Retains Hung Lung Hang (恐龍坑) as a rural area and Wan Tsai
  (灣仔) as a peninsula under their existing identifiers. Green Wood Villa (木棉山村) is
  excluded as a building, and Lau Fau Shan Market (流浮山墟) is removed while the
  separate Lau Fau Shan identity remains.
- <orange>SaanSeoi</orange> Includes Four Little Dragons (四小龍) as a microhood, Man
  Hang (蚊坑) and Fuk Lok Village (福樂村) as hamlets, and Shui Hau (水口) as a
  macrohood. 羅馬廣場 is excluded by the plaza/square coverage policy. See the
  [SaanSeoi changes](/sources/ds-hk-saanseoi-division/dr-hk-saanseoi-division-2026-10-01.0?tab=changes).
- <orange>Geometry</orange> Uses Protomaps
  [`2026-10-01.0`](/sources/ds-hk-protomaps-island/dr-hk-protomaps-island-2026-10-01.0?tab=changes).
  Accepted aliases for six islands are retained despite their removal from upstream name
  tags. Lands Department `2026-06-10.0` and RVD `2015-04-30.0` remain the pinned naming
  inputs.

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

- <orange>上游</orange> 使用 Overture
  [`2026-09-23.0`](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-09-23.0?tab=changes)。保留的香港 Division 輸入中，199 個現有記錄新增 Wikidata
  ID，八個記錄的點幾何有變動；上游新增五個識別對象並移除四個。
- <orange>山水</orange>
  恐龍坑保留為鄉郊地域，灣仔保留為半島，兩者沿用原有識別碼。木棉山村因屬建築物而排除；流浮山墟被移除，獨立的流浮山識別對象仍保留。
- <orange>山水</orange> 四小龍納入為 `microhood`，蚊坑及福樂村為 `hamlet`，水口為
  `macrohood`。羅馬廣場按廣場覆蓋政策排除。請參閱
  [山水變動](/sources/ds-hk-saanseoi-division/dr-hk-saanseoi-division-2026-10-01.0?tab=changes)。
- <orange>幾何</orange> 使用 Protomaps
  [`2026-10-01.0`](/sources/ds-hk-protomaps-island/dr-hk-protomaps-island-2026-10-01.0?tab=changes)。六個島嶼的已確認別名即使被上游名稱標籤移除，仍然保留。地政總署
  `2026-06-10.0` 及差餉物業估價署 `2015-04-30.0` 仍為固定的名稱輸入。

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

- <orange>上游</orange> 使用 Overture
  [`2026-09-23.0`](/sources/ds-hk-overture-division/dr-hk-overture-division-2026-09-23.0?tab=changes)。保留的香港 Division 输入中，199 个现有记录新增 Wikidata
  ID，八个记录的点几何有变动；上游新增五个标识对象并移除四个。
- <orange>山水</orange>
  恐龙坑保留为乡郊地域，湾仔保留为半岛，两者沿用原有标识符。木棉山村因属建筑物而排除；流浮山墟被移除，独立的流浮山标识对象仍保留。
- <orange>山水</orange> 四小龙纳入为 `microhood`，蚊坑及福乐村为 `hamlet`，水口为
  `macrohood`。罗马广场按广场覆盖政策排除。请参阅
  [山水变动](/sources/ds-hk-saanseoi-division/dr-hk-saanseoi-division-2026-10-01.0?tab=changes)。
- <orange>几何</orange> 使用 Protomaps
  [`2026-10-01.0`](/sources/ds-hk-protomaps-island/dr-hk-protomaps-island-2026-10-01.0?tab=changes)。六个岛屿的已确认别名即使被上游名称标签移除，仍然保留。地政总署
  `2026-06-10.0` 及差饷物业估价署 `2015-04-30.0` 仍为固定的名称输入。

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
