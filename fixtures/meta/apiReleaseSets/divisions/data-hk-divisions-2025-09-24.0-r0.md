---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-20T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2025-09-24.0"
apiReleaseSetRevision: "0"
regionCode: "hk"
cohortKey: "2025-09-24.0"
domainCode: "geographic"
primarySourceRelease: "dr-hk-overture-division-2025-09-24.0"
primarySourceReleaseUrl: "/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi Divisions API release for Hong Kong.
- Publishes the first immutable `{{ domainCode }}` domain view for cohort
  `{{ cohortKey }}`.
- Provides canonical division records with separately selectable area and boundary
  [companion resources](saanseoi:en:definition/companion-resource/v1). Geometry remains
  provider-specific; it is never silently merged or substituted.
- <orange>Upstream</orange> Overture added licence information to `sources` and
  refreshed OSM data through <black>2025-08-29</black>.

## Revision log

- Revision r{{ apiReleaseSetRevision }} consists of 7 required composition members; no
  incomplete Divisions release is exposed.

## Release scope

This immutable [release set](saanseoi:en:definition/release-set/v1) publishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for cohort
<black>{{ cohortKey }}</black>. Its exact manifest contains one Overture division
snapshot, its exact Overture area and boundary companions, Home Affairs Department
district areas, 2016 and 2021 C&SD district areas, and the C&SD Area/type companion
geometry. Each snapshot retains its own publisher lineage; the domain does not merge
provider geometry into one collection.

## Constituent source releases

### Primary · Division

| Publisher                                        | Source dataset                                                                     | Release                                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Overture Maps Foundation](/publishers/overture) | [Divisions](/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0) | [2025-09-24.0](/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0) |

### Supporting · Division Area

| Publisher                                                      | Source dataset                                                                                                                      | Release                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Overture Maps Foundation](/publishers/overture)               | [Division Areas](/sources/ds-hk-overture-division-area/dr-hk-overture-division-area-2025-09-24.0)                                   | [2025-09-24.0](/sources/ds-hk-overture-division-area/dr-hk-overture-division-area-2025-09-24.0)               |
| [Home Affairs Department](/publishers/hkgov-had)               | [District Boundary](/sources/ds-hk-hkgov-had-division-area-district/dr-hk-hkgov-had-division-area-district-2022)                    | [2022](/sources/ds-hk-hkgov-had-division-area-district/dr-hk-hkgov-had-division-area-district-2022)           |
| [Census and Statistics Department](/publishers/hkgov-censtatd) | [Census District Boundaries](/sources/ds-hk-hkgov-censtatd-division-area-district/dr-hk-hkgov-censtatd-division-area-district-2021) | [2021](/sources/ds-hk-hkgov-censtatd-division-area-district/dr-hk-hkgov-censtatd-division-area-district-2021) |
| [Census and Statistics Department](/publishers/hkgov-censtatd) | [Census District Boundaries](/sources/ds-hk-hkgov-censtatd-division-area-district/dr-hk-hkgov-censtatd-division-area-district-2016) | [2016](/sources/ds-hk-hkgov-censtatd-division-area-district/dr-hk-hkgov-censtatd-division-area-district-2016) |

### Supporting · Division Boundary

| Publisher                                        | Source dataset                                                                                                 | Release                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [Overture Maps Foundation](/publishers/overture) | [Division Boundaries](/sources/ds-hk-overture-division-boundary/dr-hk-overture-division-boundary-2025-09-24.0) | [2025-09-24.0](/sources/ds-hk-overture-division-boundary/dr-hk-overture-division-boundary-2025-09-24.0) |

Its [composition policy](saanseoi:en:definition/composition-policy/v1) requires Overture
geometry from the same Overture release version. Independently published district-area
[variants](saanseoi:en:definition/variant/v1) may instead select an earlier eligible
date. The [Hong Kong extract](saanseoi:en:note/hong-kong-extract/v1) also adds the
reviewed PRC country anchor required for parent and boundary references. The
referent-only record has names and identity but no country geometry, so it does not add
a PRC coverage claim.

## Using the Divisions API

The <black>v0.1</black> contract is experimental. Use <black>GET /v0.1/divisions</black>
or <black>GET /v0.1/divisions/{id}</black>; the <black>/v0</black> aliases currently
resolve to the same contract.

Select this exact domain and cohort with:

```url
/v0.1/divisions?domain={{ domainCode }}&cohort={{ cohortKey }}
```

To replay the exact immutable release, use <black>releaseSet={{ apiReleaseSet }}</black>
or retain the successful response's fully qualified <black>links.permalink</black>. The
permalink also pins the resolved
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1).

### Domains

A [domain](saanseoi:en:definition/domain/v1) is an independently versioned lineage, not
a filter over a combined table. Records and hierarchy relationships from different
domains are never mixed.

- <black>geographic</black>: default Overture-led geographical and administrative
  collection — this release.
- <black>hkgov-censtatd-hma</black>: C&SD Housing Market Areas.
- <black>hkgov-pland-pu</black>: Planning Department Planning Units and subunits.
- <black>hkgov-pland-new-town</black>: Planning Department New Towns.
- <black>hkgov-landsd</black>: Lands Department settlement place names.

### Geometry and hierarchy

Point geometry belongs to each division and is included by <black>profile=map</black> or
<black>profile=full</black>. Area and boundary companions remain separately selectable
even though every configured variant is required before this release set can publish:

```url
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=boundaries
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-had
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd:2021
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd-area
```

An unavailable qualified variant returns an error rather than falling back to another
publisher. Use <black>include=hierarchy</black> for hierarchy relationships.

### Languages (`I18n`)

Names are provided in English and Traditional Chinese by default, equivalent to
<black>locales=en,zh-hant</black>. Use <black>locales=*</black> for every available
locale or pass another supported comma-separated list.

### Response shape

The default profile returns common division fields; <black>compact</black> is smaller,
<black>map</black> adds canonical geometry, and <black>full</black> adds geometry and
provenance-rich fields. Use <black>filter[level]</black>,
<black>filter[divisionType]</black>, or <black>filter[parent]</black> to narrow a list.
Pagination uses <black>page[limit]</black> and <black>page[offset]</black>, with a
maximum page size of 100.

### Time travel

Use <black>effectiveAt</black> to select the release effective at a time,
<black>knownAt</black> to select what the catalogue knew at a time, and
<black>catalogRevision</black> to pin one published checkpoint. These selectors
distinguish later backfills from the view available to an earlier request.

## Notes and limitations

- Provider-specific areas and boundaries remain distinct. Their presence in the
  immutable release manifest does not make them interchangeable or merge their geometry.
- The response exposes the resolved domain, cohort, release set, and catalogue revision
  in metadata.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> for publisher-specific compatibility and
  quality decisions.

# ZH-HANT

## 更新紀錄

- 香港山水 | SaanSeoi Divisions API 的首個發布。
- <orange>上游</orange> Overture 在 `sources` 新增授權資訊，並更新 OSM 資料至
  <black>2025-08-29</black>。
- 只會在全部 7 個必要 composition member
  slot 均可用後發布 r{{ apiReleaseSetRevision }}；不會公開不完整的 Divisions 發布。

## 發布範圍

此不可變的 [release set](saanseoi:zh-hant:definition/release-set/v1) 發布 cohort
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hant:definition/domain/v1)。其確切 manifest 包含一個 Overture 區劃 snapshot、與其完全配對的 Overture 面及邊界、民政事務總署地區面、2016 及 2021 年政府統計處地區面，以及政府統計處 Area/type 配套幾何。每個 snapshot 均保留本身的發布者譜系；domain 不會把發布者幾何合併成單一 collection。

## 組成來源發布

完整的 manifest 來源發布清單會在[來源分頁](?tab=sources)中生成；每個必要 snapshot 均會連結至其來源發布版本及已發布的 snapshot。

Area/type snapshot 亦保留經審核的 Overture <black>2026-07-22.0</black> lookup
dependency，用以提供穩定的香港島、九龍及新界區劃識別。

## 使用 Divisions API

<black>v0.1</black> 合約仍屬實驗性質。請使用 <black>GET /v0.1/divisions</black> 或
<black>GET /v0.1/divisions/{id}</black>；<black>/v0</black> 別名目前解析至相同合約。

使用以下 selector 選取此確切 domain 及 cohort：

```url
/v0.1/divisions?domain={{ domainCode }}&cohort={{ cohortKey }}
```

如要重播確切的不可變發布，請使用
<black>releaseSet={{ apiReleaseSet }}</black>，或保留成功回應中完整的
<black>links.permalink</black>。Permalink 亦會固定已解析的
[catalogue revision](saanseoi:zh-hant:definition/catalogue-revision/v1)。

### Domains

[domain](saanseoi:zh-hant:definition/domain/v1)
是可獨立版本化的譜系，而非對合併資料表的篩選器。不同 domain 的記錄及層級關係絕不會混合。

- <black>geographic</black>: 預設的 Overture 地理及行政 collection — 本發布.
- <black>hkgov-censtatd-hma</black>: 政府統計處房屋市場區域.
- <black>hkgov-pland-pu</black>: 規劃署規劃單元及分區.
- <black>hkgov-pland-new-town</black>: 規劃署新市鎮.
- <black>hkgov-landsd</black>: 地政總署居住地名稱.

### 幾何與層級

點幾何屬於各區劃本身，並可由 <black>profile=map</black> 或 <black>profile=full</black>
包含。雖然所有已設定 variant 均須存在，此 release
set 才可發布，但面及邊界配套資源仍須分別選取：

```url
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=boundaries
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-had
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd:2021
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd-area
```

指定但不可用的 variant 會回傳錯誤，不會改用另一發布者。使用
<black>include=hierarchy</black> 取得層級關係。

### 語言（`I18n`）

名稱預設以英文及繁體中文提供，相當於 <black>locales=en,zh-hant</black>。使用
<black>locales=*</black> 取得所有可用語言地區，或傳入另一個受支援的逗號分隔清單。

### 回應形狀

預設 profile 回傳常用區劃欄位；<black>compact</black> 較小，<black>map</black>
加入標準幾何，而 <black>full</black> 加入幾何及豐富的來源追溯欄位。使用
<black>filter[level]</black>、<black>filter[divisionType]</black> 或
<black>filter[parent]</black> 縮窄清單。分頁使用 <black>page[limit]</black> 及
<black>page[offset]</black>，每頁最多 100 筆。

### 時間旅行

使用 <black>effectiveAt</black> 選取某時刻生效的發布、<black>knownAt</black>
選取 catalogue 當時已知的內容，以及 <black>catalogRevision</black>
固定一個已發布 checkpoint。這些 selector 可區分後來的 backfill 與較早請求當時可用的視圖。

## 備註與限制

- 發布者特有的面及邊界仍彼此獨立。它們存在於不可變發布 manifest，不代表可互換，亦不會合併其幾何。
- 回應 metadata 會公開已解析的 domain、cohort、release set 及 catalogue revision。
- 請參閱 <black>{{ primarySourceRelease }}</black>
  的[來源發布說明]({{ primarySourceReleaseUrl }})，了解發布者特有的兼容性及品質決定。

# ZH-HANS

## 更新记录

- 香港山水 | SaanSeoi Divisions API 的首个发布。
- <orange>上游</orange> Overture 在 `sources` 新增许可信息，并更新 OSM 数据至
  <black>2025-08-29</black>。
- 只会在全部 7 个必要 composition member
  slot 均可用后发布 r{{ apiReleaseSetRevision }}；不会公开不完整的 Divisions 发布。

## 发布范围

此不可变的 [release set](saanseoi:zh-hans:definition/release-set/v1) 发布 cohort
<black>{{ cohortKey }}</black> 的 <black>{{ domainCode }}</black>
[domain](saanseoi:zh-hans:definition/domain/v1)。其确切 manifest 包含一个 Overture 区划 snapshot、与其完全配对的 Overture 面及边界、民政事务总署地区面、2016 及 2021 年政府统计处地区面，以及政府统计处 Area/type 配套几何。每个 snapshot 均保留本身的发布者谱系；domain 不会把发布者几何合并成单一 collection。

## 组成来源发布

完整的 manifest 来源发布清单会在[来源分页](?tab=sources)中生成；每个必要 snapshot 都会链接到其来源发布版本及已发布的 snapshot。

Area/type snapshot 亦保留经审核的 Overture <black>2026-07-22.0</black> lookup
dependency，用以提供稳定的香港岛、九龙及新界区划标识。

## 使用 Divisions API

<black>v0.1</black> 合同仍属实验性质。请使用 <black>GET /v0.1/divisions</black> 或
<black>GET /v0.1/divisions/{id}</black>；<black>/v0</black> 别名目前解析至相同合同。

使用以下 selector 选取此确切 domain 及 cohort：

```url
/v0.1/divisions?domain={{ domainCode }}&cohort={{ cohortKey }}
```

如要重播确切的不可变发布，请使用
<black>releaseSet={{ apiReleaseSet }}</black>，或保留成功响应中完整的
<black>links.permalink</black>。Permalink 亦会固定已解析的
[catalogue revision](saanseoi:zh-hans:definition/catalogue-revision/v1)。

### Domains

[domain](saanseoi:zh-hans:definition/domain/v1)
是可独立版本化的谱系，而非对合并数据表的筛选器。不同 domain 的记录及层级关系绝不会混合。

- <black>geographic</black>: 默认的 Overture 地理及行政 collection — 本发布.
- <black>hkgov-censtatd-hma</black>: 政府统计处房屋市场区域.
- <black>hkgov-pland-pu</black>: 规划署规划单元及分区.
- <black>hkgov-pland-new-town</black>: 规划署新市镇.
- <black>hkgov-landsd</black>: 地政总署居住地名称.

### 几何与层级

点几何属于各区划本身，并可由 <black>profile=map</black> 或 <black>profile=full</black>
包含。虽然所有已配置 variant 均须存在，此 release
set 才可发布，但面及边界配套资源仍须分别选取：

```url
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=boundaries
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-had
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd:2021
/v0.1/divisions?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd-area
```

指定但不可用的 variant 会返回错误，不会改用另一发布者。使用
<black>include=hierarchy</black> 取得层级关系。

### 语言（`I18n`）

名称默认以英文及繁体中文提供，相当于 <black>locales=en,zh-hant</black>。使用
<black>locales=*</black> 取得所有可用语言区域，或传入另一个受支持的逗号分隔列表。

### 响应形状

默认 profile 返回常用区划字段；<black>compact</black> 较小，<black>map</black>
加入规范几何，而 <black>full</black> 加入几何及丰富的来源追溯字段。使用
<black>filter[level]</black>、<black>filter[divisionType]</black> 或
<black>filter[parent]</black> 缩小列表。分页使用 <black>page[limit]</black> 及
<black>page[offset]</black>，每页最多 100 条。

### 时间旅行

使用 <black>effectiveAt</black> 选取某时刻生效的发布、<black>knownAt</black>
选取 catalogue 当时已知的内容，以及 <black>catalogRevision</black>
固定一个已发布 checkpoint。这些 selector 可区分后来的 backfill 与较早请求当时可用的视图。

## 备注与限制

- 发布者特有的面及边界仍彼此独立。它们存在于不可变发布 manifest，不代表可互换，也不会合并其几何。
- 响应 metadata 会公开已解析的 domain、cohort、release set 及 catalogue revision。
- 请参阅 <black>{{ primarySourceRelease }}</black>
  的[来源发布说明]({{ primarySourceReleaseUrl }})，了解发布者特有的兼容性及质量决定。
