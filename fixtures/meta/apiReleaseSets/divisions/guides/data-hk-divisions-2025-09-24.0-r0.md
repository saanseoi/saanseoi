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
---

# EN

## Using the Divisions API

For the full reference, see the
[Divisions API docs](/docs#tag/divisions/GET/divisions/v0).

This guide covers <i>calling</i> the Divisions API. To understand the shape and contents
of API <i>responses</i>, check the [response schema](?tab=schema) and
[sample responses](?tab=samples). Sections are written independently from each other, so
you can skip to any one you are interested in.

{{apiKeyNote:en}}

### Requesting Data

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> to list divisions.

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

Each list resource has an <black>id</black>. Use it with <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> to retrieve one division, carrying over
the same release, response-shape, locale, and geometry selectors (explained below) when
you need the same view:

```url
/{{apiFamily}}/{{ apiVersionPath }}/e70ad27b-857b-45f9-b94f-2168550591da?
                 profile=full&
                 include=areas:hkgov-had
```

### Shaping the Response

Profiles select a response shape, letting you request only the fields needed. Set one
with <black>profile=</black>; omitting it uses <black>default</black>.

{{apiProfileTable:en}}

For a map-ready response, set <black>profile=map</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
```

### Adding Geometry

Each division has point geometry for positioning a map label; it is not necessarily the
geometrical centre. It is included by <black>profile=map</black> and
<black>profile=full</black>.

<note title="Geometry quality">
Overture geometry has known quality issues. While it is one of SaanSeoi's project goals to provide extensive
consensus geometry for Hong Kong neighbourhoods, for the time being, please select a companion dataset
where the geometry best fits your purpose; for example, <black>include=areas:hkgov-had</black> provides official district-area geometry.
</note>

The following is a list of the companion datasets from which you can select geometry by
setting the <black>include=</black> value:

{{apiReleaseSetCompanions:en}}

So <black>area</black> and <black>boundary</black> companions are selectable with

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=areas:hkgov-had
```

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=boundaries
```

Specifying specific companions is optional:

1. A qualified selector wins: `include=boundaries:overture`.
2. An unqualified geometry selector (i.e. <i>areas</i>, <i>boundaries</i>) in
   `geographic` defaults to `overture`.

#### Simplify Geometry

For division-level displays where high-precision boundaries are not essential, use
<black>transform=simplified</black> to request land-clipped display geometry. It is
available only for the 2016 and 2021 C&SD area companions:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=areas:hkgov-censtatd:2021&
                 transform=simplified
```

Do not use this transform for analyses that depend on the original high-precision
boundary.

### Adding Hierarchies

Every division's <black>relationships.hierarchy</black> identifies its ancestor
divisions, all the way up to Hong Kong SAR. Use <black>include=hierarchy</black> to add
those ancestor resources to the top-level <black>included</black> array as well:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy
```

You can include multiple companions by separating their codes by a <black>,</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy,areas,boundaries
```

Use <black>include=none</black> when you do not need additional related resources in
<black>included</black>. It does not remove the hierarchy identifiers from
<black>relationships.hierarchy</black>.

### Adding Languages (`I18n`)

Unless you select <black>profile=full</black>, names are provided in English and
Traditional Chinese by default, equivalent to <black>locales=en,zh-hant</black>.
<black>profile=full</black> defaults to every available locale. To add Simplified
Chinese to the usual default selection, call

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
```

Use <black>locales=*</black> for every available locale or pass another supported
comma-separated list. Use <black>locales=null</black> to omit <black>i18n</black> from
the response.

### Filters & Pagination

Filters narrow a list before pagination. Use `filter[level]` for a
[hierarchy level](saanseoi:en:note/division-hierarchy-levels/v1), `filter[divisionType]`
for a canonical [division type](saanseoi:en:note/canonical-division-types/v1), and
`filter[parent]` for descendants of one division. Its value is the parent Division's
<black>id</black>. For example, this lists level-3 towns whose parent is Sha Tin
District:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[level]=3&
                 filter[divisionType]=town&
                 filter[parent]=e70ad27b-857b-45f9-b94f-2168550591da
```

Use <black>page[limit]</black> and <black>page[offset]</black> to page through the
filtered result. The maximum page size is 100:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
```

For a consumer, follow the response's <black>links.next</black>,
<black>links.prev</black>, and <black>links.first</black> rather than constructing the
next offset yourself. Use <black>meta.page.total</black> to show or plan the complete
filtered result.

### Selecting a Version

{{experimentalApiWarning:en}}

If no [cohort](saanseoi:en:definition/cohort/v1) or
[domain](saanseoi:en:definition/domain/v1) is specified, the API returns records from
the <black>latest</black> cohort in the default <black>geographic</black> domain. To get
records from this specific release, specify

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

### Time travel

Time travel lets you reproduce a historical analysis, explain an earlier response, or
separate a later backfill from what the catalogue knew when a decision was made.

Use <black>effectiveAt</black> to select the release effective at an instant:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt=2025-10-01T00:00:00.000Z
```

Use <black>knownAt</black> to resolve the newest catalogue checkpoint known at an
instant, which excludes later backfills:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt=2026-08-24T04:00:46.011Z
```

Use <black>catalogRevision</black> to pin one immutable published checkpoint. Combine it
with <black>releaseSet</black> when replaying a recorded result:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision=catalog-hk-divisions-v0.1-2026-08-24.11&
                 releaseSet={{ apiReleaseSet }}
```

Every successful response also provides <black>links.permalink</black>: a permanent link
to the resources you loaded. It contains the resolved
[release set](saanseoi:en:definition/release-set/v1) and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1) selectors, so save it
to replay that exact result later.

### Switching Domains

A [domain](saanseoi:en:definition/domain/v1) is a grouping within an API family where
the records cannot logically be combined. In the {{apiFamily}} API, the following
domains are available:

{{domains:en}}

### Recover from Failure

- <black>404</black> from a detail request means that the ID is not in the resolved
  release. Recheck the ID and its domain, cohort, and time-travel selectors.
- <black>409</black> with <black>variant_unavailable</black> means the requested area or
  boundary variant is not available in that release. Choose an available qualified
  companion from the list above, or use a release that contains the required variant;
  the API does not substitute another publisher.
- <black>422</black> means the request is invalid. Read the validation details, then
  correct the selector, filter, locale, or pagination value before retrying.
- <black>503</black> with <black>snapshot_not_ready</black> means that no active
  division snapshot matches the selection. Retry after it is published or choose a
  published release; do not treat the response as an empty result.

# ZH-HANT

## 使用 Divisions API

{{apiKeyNote:zh-Hant}}

<black>v0.1</black> 合約仍屬實驗性質。請使用 <black>GET /{{apiFamily}}/v0</black> 或
<black>GET /{{apiFamily}}/v0/{id}</black>

使用以下 selector 選取此確切 domain 及 cohort：

```url
/{{apiFamily}}/v0?domain={{ domainCode }}&cohort={{ cohortKey }}
```

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
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=boundaries
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-had
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd:2021
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd-area
```

指定但不可用的 variant 會回傳錯誤，不會改用另一發布者。使用
<black>include=hierarchy</black> 取得層級關係。

### 語言（`I18n`）

名稱預設以英文及繁體中文提供，相當於 <black>locales=en,zh-hant</black>。使用
<black>locales=*</black> 取得所有可用語言地區，或傳入另一個受支援的逗號分隔清單。

### 回應形狀

預設 profile 回傳常用區劃欄位；<black>compact</black> 較小，<black>map</black>
加入標準幾何，而 <black>full</black> 加入幾何及豐富的來源追溯欄位。使用
[`filter[level]`](saanseoi:zh-hant:note/division-hierarchy-levels/v1)、
[`filter[divisionType]`](saanseoi:zh-hant:note/canonical-division-types/v1) 或
`filter[parent]` 縮窄清單；其值為父區劃的 <black>id</black>。分頁使用
<black>page[limit]</black> 及 <black>page[offset]</black>，每頁最多 100 筆。

### 時間旅行

使用 <black>effectiveAt</black> 選取某時刻生效的發布、<black>knownAt</black>
選取 catalogue 當時已知的內容，以及 <black>catalogRevision</black>
固定一個已發布 checkpoint。這些 selector 可區分後來的 backfill 與較早請求當時可用的視圖。

每個成功回應亦會在 <black>links.permalink</black>
提供所載入資源的永久連結。它包含已解析的
[release set](saanseoi:zh-hant:definition/release-set/v1) 及
[catalogue revision](saanseoi:zh-hant:definition/catalogue-revision/v1)
selector；保留它即可在日後重播相同結果。

# ZH-HANS

## 使用 Divisions API

{{apiKeyNote:zh-Hans}}

<black>v0.1</black> 合同仍属实验性质。请使用 <black>GET /{{apiFamily}}/v0</black> 或
<black>GET /{{apiFamily}}/v0/{id}</black>

使用以下 selector 选取此确切 domain 及 cohort：

```url
/{{apiFamily}}/v0?domain={{ domainCode }}&cohort={{ cohortKey }}
```

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
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=boundaries
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-had
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd:2021
/{{apiFamily}}/v0?domain=geographic&cohort={{ cohortKey }}&include=areas:hkgov-censtatd-area
```

指定但不可用的 variant 会返回错误，不会改用另一发布者。使用
<black>include=hierarchy</black> 取得层级关系。

### 语言（`I18n`）

名称默认以英文及繁体中文提供，相当于 <black>locales=en,zh-hant</black>。使用
<black>locales=*</black> 取得所有可用语言区域，或传入另一个受支持的逗号分隔列表。

### 响应形状

默认 profile 返回常用区划字段；<black>compact</black> 较小，<black>map</black>
加入规范几何，而 <black>full</black> 加入几何及丰富的来源追溯字段。使用
[`filter[level]`](saanseoi:zh-hans:note/division-hierarchy-levels/v1)、
[`filter[divisionType]`](saanseoi:zh-hans:note/canonical-division-types/v1) 或
`filter[parent]` 缩小列表；其值为父区划的 <black>id</black>。分页使用
<black>page[limit]</black> 及 <black>page[offset]</black>，每页最多 100 条。

### 时间旅行

使用 <black>effectiveAt</black> 选取某时刻生效的发布、<black>knownAt</black>
选取 catalogue 当时已知的内容，以及 <black>catalogRevision</black>
固定一个已发布 checkpoint。这些 selector 可区分后来的 backfill 与较早请求当时可用的视图。

每个成功响应亦会在 <black>links.permalink</black>
提供所载入资源的永久链接。它包含已解析的
[release set](saanseoi:zh-hans:definition/release-set/v1) 及
[catalogue revision](saanseoi:zh-hans:definition/catalogue-revision/v1)
selector；保留它即可在日后重播相同结果。
