---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-24T19:32:35.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2026-01-21.0"
apiReleaseSetRevision: "0"
regionCode: "hk"
cohortKey: "2026-01-21.0"
domainCode: "geographic"
---

# EN

## Using the Divisions API

For the full reference, see the
[Divisions API docs](/docs#tag/divisions/GET/divisions/v0).

This guide explains how to make requests to the Divisions API. For the shape and
contents of API <i>responses</i>, see the [response schema](?tab=schema) and
[sample responses](?tab=samples). Each section stands on its own, so you can go straight
to the one you need.

{{apiKeyNote:en}}

## Requesting Data

{{experimentalApiWarning:en}}

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> to get a list of divisions.

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

Every division in the list has an <black>id</black>. Use it with <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> to get one division. If you need the
same view, use the same release, response-shape, language, and geometry selectors
(explained below):

```url
/{{apiFamily}}/{{ apiVersionPath }}/e70ad27b-857b-45f9-b94f-2168550591da?
                 profile=full&
                 include=areas:hkgov-had
```

**Version Selection**

Unless you specify a [cohort](saanseoi:en:definition/cohort/v1) or
[domain](saanseoi:en:definition/domain/v1), the API returns records from the
<black>latest</black> cohort in the default <black>geographic</black> domain.

To request records from this specific release, include both selectors:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

The examples below include the cohort and domain for consistency, even where they do not
affect the feature being explained.

## Shaping the Response

Profiles control how much information each response contains. You can try the different
profiles in the [Samples tab](?tab=samples). Set one with <black>profile=</black>; if
you omit it, the API uses <black>default</black>.

{{apiProfileTable:en}}

For a map-ready response, set <black>profile=map</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
```

## Adding Geometry

Each division has point geometry (i.e. latitude, longitude coordinates) for positioning
a map label. It is included when using <black>profile=map</black> and
<black>profile=full</black>.

<note title="Geometry quality">
Overture geometry has known quality issues. While it is one of SaanSeoi's project goals to provide extensive
consensus geometry for Hong Kong neighbourhoods, for the time being, please select a companion dataset
where the geometry best fits your purpose; for example, <black>include=areas:hkgov-had</black> provides official district-area geometry.
</note>

Choose additional geometry from the following companion datasets by setting
<black>include=</black>:

{{apiReleaseSetCompanions:en}}

For example, request <black>area</black> or <black>boundary</black> companions with

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

You can name a specific companion, or let the API choose the usual one:

1. A qualified selector wins: <black>include=boundaries:overture</black>.
2. An unqualified geometry selector (i.e. <i>areas</i>, <i>boundaries</i>) in
   <black>geographic</black> defaults to <black>overture</black>.

**Simplify Geometry**

For division-level maps, detailed boundaries are often unnecessary. Use
<black>transform=simplified</black> for land-clipped display geometry. It is available
only for the 2016 and 2021 C&SD area companions, as the originals are highly detailed:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=areas:hkgov-censtatd:2021&
                 transform=simplified
```

Do not use this transform when your analysis depends on the original detailed boundary.

## Adding Hierarchies

Every primary division resource always contains a <black>relationships.hierarchy</black>
relationship, whatever <black>include</black> you select. Its <black>data</black> lists
the identifiers of its parent divisions, all the way up to Hong Kong SAR; a division
with no parents has an empty <black>data</black> array. Use
<black>include=hierarchy</black> only when you also need those parent division resources
in the top-level <black>included</black> array:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy
```

Request more than one companion by separating their codes with a <black>,</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy,areas,boundaries
```

Use <black>include=none</black> when you do not need any related resources in
<black>included</black>. It leaves <black>relationships.hierarchy</black> unchanged;
only the expansion of its identifiers into resources is omitted.

## Adding Languages (`I18n`)

Unless you select <black>profile=full</black>, names are returned in English and
Traditional Chinese by default: <black>locales=en,zh-hant</black>. With
<black>profile=full</black>, every available locale is returned by default. To add
Simplified Chinese to the usual default selection, call

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
```

Use <black>locales=*</black> for every available locale, or provide another supported
comma-separated list. Use <black>locales=null</black> to leave <black>i18n</black> out
of the response.

## Filters & Pagination

Filters narrow the list before it is split into pages. Use `filter[level]` for a
[hierarchy level](saanseoi:en:note/division-hierarchy-levels/v1), `filter[divisionType]`
for a canonical [division type](saanseoi:en:note/canonical-division-types/v1), and
`filter[parent]` for the direct children of one division. Its value is the parent
Division's <black>id</black>. For example, this lists level-3 towns whose parent is Sha
Tin District:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[level]=3&
                 filter[divisionType]=town&
                 filter[parent]=e70ad27b-857b-45f9-b94f-2168550591da
```

Use <black>page[limit]</black> and <black>page[offset]</black> to work through the
filtered results. A page can contain at most 100 items:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
```

Follow the response's <black>links.next</black>, <black>links.prev</black>, and
<black>links.first</black> instead of calculating the next offset yourself. Use
<black>meta.page.total</black> to show or plan for the complete filtered result.

## Time travel

Time travel lets you reproduce an earlier analysis, explain a past response, or separate
a later backfill from what the catalogue knew when a decision was made.

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

When selectors overlap, <black>catalogRevision</black> takes precedence over
<black>knownAt</black>, and <black>releaseSet</black> takes precedence over
<black>cohort</black> and <black>effectiveAt</black>.

Every successful response also provides <black>links.permalink</black>: a permanent link
to the resources you loaded. It contains the resolved
[release set](saanseoi:en:definition/release-set/v1) and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1) selectors, so save it
to replay that exact result later.

## Switching Domains

A [domain](saanseoi:en:definition/domain/v1) is a separate collection within an API
family. Records from different domains cannot sensibly be combined. In the {{apiFamily}}
API, the following domains are available:

{{domains:en}}

## Recover from Failure

The API returns a number of error codes. Here is how to recover from each one:

- `404` from a detail request means that the ID is not in the selected release. Recheck
  the ID and its domain, cohort, and time-travel selectors.
- `409` with <black>variant_unavailable</black> means the requested area or boundary
  variant is not available in that release. Choose an available qualified companion from
  the list above, or use a release that contains the required variant; the API does not
  substitute another publisher.
- `422` means that the request is invalid. Read the validation details, then correct the
  selector, filter, locale, or pagination value before trying again.
- `503` with <black>snapshot_not_ready</black> means that no active division snapshot
  matches the selection. Retry after it is published or choose a published release; do
  not treat the response as an empty result.

# ZH-HANT

## 使用 Divisions API

完整參考請見[Divisions API 文件](/docs#tag/divisions/GET/divisions/v0)。

本指南說明如何向 Divisions API 發出請求。API
<i>回應</i>的結構及內容，請參閱[回應 schema](?tab=schema)
和[回應範例](?tab=samples)。各節均可獨立閱讀，請直接前往所需內容。

{{apiKeyNote:zh-Hant}}

## 要求資料

{{experimentalApiWarning:zh-Hant}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 取得區劃清單。

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

清單中的每個區劃均有 <black>id</black>。以 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black>
取得單一區劃。如需相同視圖，請使用相同的發布、回應形狀、語言及幾何資料 selector（詳見下文）：

```url
/{{apiFamily}}/{{ apiVersionPath }}/e70ad27b-857b-45f9-b94f-2168550591da?
                 profile=full&
                 include=areas:hkgov-had
```

**選取版本**

除非指定 [cohort](saanseoi:zh-hant:definition/cohort/v1) 或
[domain](saanseoi:zh-hant:definition/domain/v1)，否則 API 會傳回預設
<black>geographic</black> domain 中<black>最新</black> cohort 的記錄。

如要要求這個特定發布的記錄，請同時提供兩個 selector：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

下列範例一律包含 cohort 及 domain，以保持一致，即使它們不影響正在說明的功能。

## 設定回應形狀

profile 控制每個回應所含資料的多寡。可在[範例分頁](?tab=samples)試用各個 profile。以
<black>profile=</black> 設定；省略時，API 使用 <black>default</black>。

{{apiProfileTable:zh-Hant}}

如需適合地圖使用的回應，請設定 <black>profile=map</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
```

## 加入幾何資料

每個區劃均有點幾何資料（即緯度、經度座標），供放置地圖標籤之用。使用
<black>profile=map</black> 或 <black>profile=full</black> 時會包含此資料。

<note title="幾何資料品質">
Overture 的幾何資料有已知品質問題。SaanSeoi 的目標之一，是為香港鄰里提供廣泛的共識幾何資料；現階段請按用途選擇最合適的配套資料集。例如，<black>include=areas:hkgov-had</black> 提供官方地區面積幾何資料。
</note>

以 <black>include=</black> 設定，從下列配套資料集選取額外幾何資料：

{{apiReleaseSetCompanions:zh-Hant}}

例如，以下分別要求 <black>area</black> 或 <black>boundary</black> 配套資源：

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

可指定配套資源，或讓 API 選取慣常資源：

1. 限定 selector 優先，例如：<black>include=boundaries:overture</black>。
2. 在 <black>geographic</black> domain 中，未限定的幾何資料 selector（即
   <i>areas</i>、<i>boundaries</i>）預設為 <black>overture</black>。

**簡化幾何資料**

區劃層級地圖通常不需要精細邊界。請使用 <black>transform=simplified</black>
取得經陸地裁切、供顯示用的幾何資料。原始資料非常精細，因此這項功能只適用於 2016 及 2021 年 C&SD 面積配套資源：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=areas:hkgov-censtatd:2021&
                 transform=simplified
```

如分析依賴原有的詳細邊界，請勿使用此轉換。

## 加入層級關係

每個主要區劃資源一律包含 <black>relationships.hierarchy</black> 關係，不受
<black>include</black> 選擇影響。其 <black>data</black>
列出所有上層區劃的識別碼，直至香港特別行政區；沒有上層區劃的資源，其 <black>data</black>
陣列為空。只有在同時需要於頂層 <black>included</black>
陣列取得這些上層區劃資源時，才使用 <black>include=hierarchy</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy
```

以 <black>,</black> 分隔代碼，即可要求多個配套資源：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy,areas,boundaries
```

如不需要 <black>included</black> 中的任何相關資源，請使用
<black>include=none</black>。它不會改變
<black>relationships.hierarchy</black>；只會略過將其識別碼展開為資源。

## 加入語言（`I18n`）

除非選取
<black>profile=full</black>，否則名稱預設以英文及繁體中文傳回：<black>locales=en,zh-hant</black>。使用
<black>profile=full</black>
時，預設傳回所有可用 locale。如要在一般預設選擇中加入簡體中文，請呼叫：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
```

使用 <black>locales=*</black>
取得所有可用 locale，或提供另一個受支援的逗號分隔清單。使用 <black>locales=null</black>
可使回應不包含 <black>i18n</black>。

## 篩選及分頁

篩選會先縮小清單，再分頁。使用 `filter[level]`
篩選[層級](saanseoi:zh-hant:note/division-hierarchy-levels/v1)，使用
`filter[divisionType]`
篩選標準[區劃類型](saanseoi:zh-hant:note/canonical-division-types/v1)，以及使用
`filter[parent]` 篩選某一區劃的直接下層區劃。其值為父區劃的
<black>id</black>。例如，下列要求傳回父區劃為沙田區的第 3 級城鎮：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[level]=3&
                 filter[divisionType]=town&
                 filter[parent]=e70ad27b-857b-45f9-b94f-2168550591da
```

使用 <black>page[limit]</black> 及 <black>page[offset]</black>
瀏覽篩選結果。每頁最多可含 100 項：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
```

請跟隨回應中的 <black>links.next</black>、<black>links.prev</black> 及
<black>links.first</black>，而非自行計算下一個 offset。使用
<black>meta.page.total</black> 顯示或規劃完整的篩選結果。

## 時間旅行

時間旅行可讓你重現較早的分析、解釋過往回應，或區分稍後的回填資料與作出決定時目錄已知的內容。

使用 <black>effectiveAt</black> 選取某一時刻生效的發布：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt=2025-10-01T00:00:00.000Z
```

使用 <black>knownAt</black>
解析某一時刻已知的最新目錄 checkpoint，從而排除較後的回填資料：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt=2026-08-24T04:00:46.011Z
```

使用 <black>catalogRevision</black>
固定一個不可變的已發布 checkpoint。重播已記錄的結果時，請與 <black>releaseSet</black>
一併使用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision=catalog-hk-divisions-v0.1-2026-08-24.11&
                 releaseSet={{ apiReleaseSet }}
```

當 selector 重疊時，<black>catalogRevision</black> 優先於 <black>knownAt</black>，而
<black>releaseSet</black> 優先於 <black>cohort</black> 及 <black>effectiveAt</black>。

每個成功回應亦提供 <black>links.permalink</black>：所載入資源的永久連結。它包含已解析的
[release set](saanseoi:zh-hant:definition/release-set/v1) 及
[catalogue revision](saanseoi:zh-hant:definition/catalogue-revision/v1)
selector；請保存它，以便日後重播完全相同的結果。

## 切換 domain

[domain](saanseoi:zh-hant:definition/domain/v1) 是 API
family 內獨立的集合。不同 domain 的記錄無法合理地合併。在 {{apiFamily}}
API 中，可使用以下 domain：

{{domains:zh-Hant}}

## 從失敗中復原

API 會傳回多種錯誤碼。以下說明各種情況的復原方法：

- 詳情要求的 `404`
  表示該 ID 不在所選發布中。請重新檢查 ID，以及其 domain、cohort 和時間旅行 selector。
- 帶有 <black>variant_unavailable</black> 的 `409`
  表示所要求的面或邊界 variant 不在該發布中。請從上表選取可用的限定配套資源，或改用包含所需 variant 的發布；API 不會改用其他發布者。
- `422`
  表示要求無效。請閱讀驗證詳情，然後修正 selector、篩選條件、locale 或分頁值，再次嘗試。
- 帶有 <black>snapshot_not_ready</black> 的 `503`
  表示沒有已發布的有效區劃 snapshot 符合選擇條件。請在發布後重試，或選取已發布的 release；請勿將此回應視為空結果。

# ZH-HANS

## 使用 Divisions API

完整参考请见[Divisions API 文档](/docs#tag/divisions/GET/divisions/v0)。

本指南说明如何向 Divisions API 发出请求。API
<i>响应</i>的结构及内容，请参阅[响应 schema](?tab=schema)
和[响应示例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

## 请求数据

{{experimentalApiWarning:zh-Hans}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 获取区划列表。

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

列表中的每个区划均有 <black>id</black>。以 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black>
获取单一区划。如需相同视图，请使用相同的发布、响应形状、语言及几何数据 selector（详见下文）：

```url
/{{apiFamily}}/{{ apiVersionPath }}/e70ad27b-857b-45f9-b94f-2168550591da?
                 profile=full&
                 include=areas:hkgov-had
```

**选择版本**

除非指定 [cohort](saanseoi:zh-hans:definition/cohort/v1) 或
[domain](saanseoi:zh-hans:definition/domain/v1)，否则 API 会返回默认
<black>geographic</black> domain 中<black>最新</black> cohort 的记录。

如要请求这个特定发布的记录，请同时提供两个 selector：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

下列示例一律包含 cohort 及 domain，以保持一致，即使它们不影响正在说明的功能。

## 设置响应形状

profile 控制每个响应所含数据的多少。可在[示例分页](?tab=samples)试用各个 profile。以
<black>profile=</black> 设置；省略时，API 使用 <black>default</black>。

{{apiProfileTable:zh-Hans}}

如需适合地图使用的响应，请设置 <black>profile=map</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=map
```

## 添加几何数据

每个区划均有点几何数据（即纬度、经度坐标），供放置地图标签之用。使用
<black>profile=map</black> 或 <black>profile=full</black> 时会包含此数据。

<note title="几何数据质量">
Overture 的几何数据有已知质量问题。SaanSeoi 的目标之一，是为香港邻里提供广泛的共识几何数据；现阶段请按用途选择最合适的配套数据集。例如，<black>include=areas:hkgov-had</black> 提供官方地区面积几何数据。
</note>

以 <black>include=</black> 设置，从下列配套数据集选择额外几何数据：

{{apiReleaseSetCompanions:zh-Hans}}

例如，以下分别请求 <black>area</black> 或 <black>boundary</black> 配套资源：

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

可指定配套资源，或让 API 选择惯常资源：

1. 限定 selector 优先，例如：<black>include=boundaries:overture</black>。
2. 在 <black>geographic</black> domain 中，未限定的几何数据 selector（即
   <i>areas</i>、<i>boundaries</i>）默认为 <black>overture</black>。

**简化几何数据**

区划层级地图通常不需要精细边界。请使用 <black>transform=simplified</black>
获取经陆地裁切、供显示用的几何数据。原始数据非常精细，因此这项功能只适用于 2016 及 2021 年 C&SD 面积配套资源：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=areas:hkgov-censtatd:2021&
                 transform=simplified
```

如分析依赖原有的详细边界，请勿使用此转换。

## 添加层级关系

每个主要区划资源一律包含 <black>relationships.hierarchy</black> 关系，不受
<black>include</black> 选择影响。其 <black>data</black>
列出所有上层区划的标识符，直至香港特别行政区；没有上层区划的资源，其 <black>data</black>
数组为空。只有在同时需要于顶层 <black>included</black>
数组获取这些上层区划资源时，才使用 <black>include=hierarchy</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy
```

以 <black>,</black> 分隔代码，即可请求多个配套资源：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=hierarchy,areas,boundaries
```

如不需要 <black>included</black> 中的任何相关资源，请使用
<black>include=none</black>。它不会改变
<black>relationships.hierarchy</black>；只会略过将其标识符展开为资源。

## 添加语言（`I18n`）

除非选择
<black>profile=full</black>，否则名称默认以英文及繁体中文返回：<black>locales=en,zh-hant</black>。使用
<black>profile=full</black>
时，默认返回所有可用 locale。如要在一般默认选择中加入简体中文，请调用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 locales=en,zh-hant,zh-hans
```

使用 <black>locales=*</black>
获取所有可用 locale，或提供另一个受支持的逗号分隔列表。使用 <black>locales=null</black>
可使响应不包含 <black>i18n</black>。

## 筛选及分页

筛选会先缩小列表，再分页。使用 `filter[level]`
筛选[层级](saanseoi:zh-hans:note/division-hierarchy-levels/v1)，使用
`filter[divisionType]`
筛选规范[区划类型](saanseoi:zh-hans:note/canonical-division-types/v1)，以及使用
`filter[parent]` 筛选某一区划的直接下层区划。其值为父区划的
<black>id</black>。例如，下列请求返回父区划为沙田区的第 3 级城镇：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[level]=3&
                 filter[divisionType]=town&
                 filter[parent]=e70ad27b-857b-45f9-b94f-2168550591da
```

使用 <black>page[limit]</black> 及 <black>page[offset]</black>
浏览筛选结果。每页最多可含 100 项：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 page[limit]=25&
                 page[offset]=50
```

请跟随响应中的 <black>links.next</black>、<black>links.prev</black> 及
<black>links.first</black>，而非自行计算下一个 offset。使用
<black>meta.page.total</black> 显示或规划完整的筛选结果。

## 时间旅行

时间旅行可让你重现较早的分析、解释过往响应，或区分稍后的回填数据与作出决定时目录已知的内容。

使用 <black>effectiveAt</black> 选择某一时刻生效的发布：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 effectiveAt=2025-10-01T00:00:00.000Z
```

使用 <black>knownAt</black>
解析某一时刻已知的最新目录 checkpoint，从而排除较后的回填数据：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 knownAt=2026-08-24T04:00:46.011Z
```

使用 <black>catalogRevision</black>
固定一个不可变的已发布 checkpoint。重放已记录的结果时，请与 <black>releaseSet</black>
一并使用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 catalogRevision=catalog-hk-divisions-v0.1-2026-08-24.11&
                 releaseSet={{ apiReleaseSet }}
```

当 selector 重叠时，<black>catalogRevision</black> 优先于 <black>knownAt</black>，而
<black>releaseSet</black> 优先于 <black>cohort</black> 及 <black>effectiveAt</black>。

每个成功响应亦提供 <black>links.permalink</black>：所载入资源的永久链接。它包含已解析的
[release set](saanseoi:zh-hans:definition/release-set/v1) 及
[catalogue revision](saanseoi:zh-hans:definition/catalogue-revision/v1)
selector；请保存它，以便日后重放完全相同的结果。

## 切换 domain

[domain](saanseoi:zh-hans:definition/domain/v1) 是 API
family 内独立的集合。不同 domain 的记录无法合理地合并。在 {{apiFamily}}
API 中，可使用以下 domain：

{{domains:zh-Hans}}

## 从失败中恢复

API 会返回多种错误码。以下说明各种情况的恢复方法：

- 详情请求的 `404`
  表示该 ID 不在所选发布中。请重新检查 ID，以及其 domain、cohort 和时间旅行 selector。
- 带有 <black>variant_unavailable</black> 的 `409`
  表示所请求的面或边界 variant 不在该发布中。请从上表选择可用的限定配套资源，或改用包含所需 variant 的发布；API 不会改用其他发布者。
- `422`
  表示请求无效。请阅读验证详情，然后修正 selector、筛选条件、locale 或分页值，再次尝试。
- 带有 <black>snapshot_not_ready</black> 的 `503`
  表示没有已发布的有效区划 snapshot 符合选择条件。请在发布后重试，或选择已发布的 release；请勿将此响应视为空结果。
