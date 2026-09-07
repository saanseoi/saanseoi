---
createdAt: "2026-09-06T00:00:00.000Z"
updatedAt: "2026-09-06T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2025-09-24.0"
revision: "0"
regionCode: "hk"
cohortKey: "2025-09-24.0"
domainCode: "overture"
timeTravelEffectiveAt: "2025-10-01T00:00:00.000Z"
timeTravelKnownAt: "2026-08-24T04:00:46.011Z"
timeTravelCatalogRevision: "catalog-hk-places-v0.1-2026-08-24.11"
---

# EN

## Using the Places API

For the full reference, see the
[Places API docs](/docs#tag/Places/operation/listPlacesV01).

This guide explains how to make requests to the Places API. For the shape and contents
of API <i>responses</i>, see the [response schema](?tab=schema) and
[sample responses](?tab=samples). Each section stands on its own, so you can go straight
to the one you need.

{{apiKeyNote:en}}

The Places API does not expose original Overture source objects. To research one, hand
the following instruction to an LLM that can access the Overture release:

```text
I need the original Overture Places source object for a SaanSeoi result.

- SaanSeoi release set: {{ apiReleaseSet }}
- Overture domain: {{ domainCode }}
- Cohort: {{ cohortKey }}
- Canonical Place ID: [paste data[].id]
- Overture record ID: [paste attributes.sources[].record_id from profile=full]

Use this exact Overture Places release. Verify both IDs, then return the unmodified
source object, a source URL, and any uncertainty. Do not infer missing source fields
from SaanSeoi's canonical response.
```

## Requesting Data

{{experimentalApiWarning:en}}

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}/</black> to get a list of places.

```url
/{{apiFamily}}/{{ apiVersionPath }}/
```

**Version Selection**

Unless you specify a [cohort](saanseoi:en:definition/cohort/v1) or
[domain](saanseoi:en:definition/domain/v1), the API returns records from the
<black>latest</black> cohort in the default <black>overture</black> domain.

To request records from this specific release, include both selectors:

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

The examples below include the cohort and domain for consistency, even where they do not
affect the feature being explained.

You can select a published release directly:

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 releaseSet={{ apiReleaseSet }}
```

The collection response records its resolved release in
<black>meta.apiReleaseSet</black> and <black>meta.apiCatalogRevision</black>.

## Search for Places by Text and Map Cells

These endpoints use the current active Place snapshot. They do not accept collection
<black>releaseSet</black>, <black>profile</black>, <black>include</black>, or
time-travel selectors (<black>effectiveAt</black>, <black>knownAt</black>, and
<black>catalogRevision</black>), so use the collection when you need a reproducible
release view.

**Get one current Place**

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 locale=zh-hant
```

The response contains <black>place</black>, an <black>i18n</black> array, and a
<black>divisions</black> array. <black>locale</black> filters the latter two arrays.

**Get Places in an H3 cell**

Places are indexed at [H3 resolutions](https://h3geo.org/docs/core-library/restable/)
<black>5</black>, <black>7</black>, and <black>9</black>. After converting a map
selection to H3, request one of these cells:

```url
/{{apiFamily}}/{{ apiVersionPath }}/by-cell/9/{h3Cell}?
                 limit=50
```

The compact <black>places</black> array contains ID, release ID, category, taxonomy,
operating status, Point geometry, and the matched cell. The default limit is 50 and the
maximum is 100. H3 membership comes from geometry, not an address or Division link.

**Search current Places**

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=coffee&
                 locale=en&
                 limit=25
```

Search indexes localised names and brands, taxonomy, address, Division, and street text.
Each <black>results</black> entry has a Place ID, release ID, matched locale, name, and
brand text. Retrieve its <black>placeId</black> through the current Place endpoint for
the complete record. Queries hold at most 200 characters; result limits are at most 100.

## Shaping the Response

{{responseProfilesSection:en}}

<black>attributes.geometry</black> is a GeoJSON Point in longitude, latitude order. It
is included when using <black>profile=map</black> and <black>profile=full</black>. It is
not a boundary or a claim that a Place belongs to a Division.

## Adding Languages (`I18n`)

{{localeSelectionSection:en}}

Names and brand names are localised values. The upstream data sadly is not always
consistent in assigning the correct locale to the names, so you may still need to verify
the values if that is important to you. Also, don't assume an unverified Chinese name is
a Cantonese transliteration; inspect <black>i18n.{locale}.provenance</black> in the full
profile when that distinction matters. Finally, names coverage is incomplete, so you may
need to coalesce <black>en</black> and <black>zh-hant</black> to be guaranteed a name.

## Filters & Pagination

{{paginationSection:en}}

The [Places API reference](/docs#tag/Places/operation/listPlacesV01) publishes the full
basic-category, primary-taxonomy and operating-status lists under their filter
parameters. Category availability depends on the selected release and region. Division
IDs identify resources; obtain them from the Divisions API.

Filters narrow the list before it is split into pages. Use
<black>filter[basicCategory]</black> for a basic category,
<black>filter[taxonomyPrimary]</black> for a primary taxonomy,
<black>filter[operatingStatus]</black> for an operating status, and
<black>filter[division]</black> for a canonical Division ID:

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[basicCategory]=restaurant&
                 filter[operatingStatus]=open&
                 filter[division]={divisionId}
```

The Division filter uses reviewed, address-derived relationships rather than a
point-in-polygon calculation. Every collection resource has
<black>relationships.address</black> and <black>relationships.divisions</black>. Address
is null when no ALS link exists, and a Place without such an address has an empty
Division relationship; we do not infer one from its geometry.

Use <black>include=divisions</black> to add the related canonical Division resources to
the top-level <black>included</black> array. It does not create missing relationships:

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=divisions&
                 profile=map
```

## Time travel

{{timeTravelSection:en}}

## Provenance

Use <black>profile=full</black> for Place snapshot and release IDs, linked address IDs
and snapshot, and publisher attribution in <black>attributes.sources</black>. These
provenance fields do not replace canonical address or Division resources.

## Recover from Failure

The API returns a number of error codes. Here is how to recover from each one:

- `404` from the current Place endpoint means that the ID is not in the active snapshot.
  Recheck the ID or choose a published collection release.
- `400` with <black>invalid_h3_level</black> applies to the H3-cell endpoint only. Make
  sure <black>{h3Level}</black> is an integer, then retry.
- `422` means that the request is invalid. Read the validation details, then correct the
  selector, filter, locale, H3, search, or pagination value before trying again.
- `503` with <black>snapshot_not_ready</black> means that no active Place snapshot is
  published. Retry after it is published or choose a published collection release; do
  not treat the response as an empty result.
- `503` with <black>fts_not_ready</black> applies to search only: the full-text index is
  not ready, not empty.

# ZH-HANT

## 使用 Places API

完整參考請見[Places API 文件](/docs#tag/Places/operation/listPlacesV01)。

本指南說明如何向 Places API 發出請求。API <i>回應</i>的結構及內容，請參閱
[回應 schema](?tab=schema)和[回應範例](?tab=samples)。各節均可獨立閱讀，請直接前往所需內容。

{{apiKeyNote:zh-Hant}}

Places
API 不會公開原始 Overture 來源物件。如需研究，請把下列指示交給可存取 Overture 發布版本的 LLM：

```text
我需要 SaanSeoi Place 結果對應的原始 Overture Places 來源物件。

- SaanSeoi release set: {{ apiReleaseSet }}
- Overture domain: {{ domainCode }}
- Cohort: {{ cohortKey }}
- Canonical Place ID: [貼上 data[].id]
- Overture record ID: [貼上 profile=full 中的 attributes.sources[].record_id]

請使用這個確切的 Overture Places release。驗證兩個 ID，然後返回未修改的 source object、
source URL 及任何不確定之處。請勿從 SaanSeoi 的 canonical response 推測缺失的 source field。
```

## 要求資料

{{experimentalApiWarning:zh-Hant}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}/</black> 取得地點清單。

```url
/{{apiFamily}}/{{ apiVersionPath }}/
```

**選取版本**

除非指定 [cohort](saanseoi:zh-hant:definition/cohort/v1) 或
[domain](saanseoi:zh-hant:definition/domain/v1)，否則 API 會傳回預設
<black>overture</black> domain 中<black>最新</black> cohort 的記錄。

如要取得此特定發布，請同時提供兩個 selector：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

以下範例均為保持一致而包括 cohort 和 domain，即使它們不影響所說明的功能。

亦可直接選取已發布的 release：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 releaseSet={{ apiReleaseSet }}
```

Collection 回應會在 <black>meta.apiReleaseSet</black> 及
<black>meta.apiCatalogRevision</black> 記錄已解析的發布。

## 設定回應形狀

{{responseProfilesSection:zh-Hant}}

<black>attributes.geometry</black> 是按經度、緯度排列的 GeoJSON Point。使用
<black>profile=map</black> 及 <black>profile=full</black>
時會包含它；它不是邊界，也不表示 Place 屬於某個 Division。

## 加入語言（`I18n`）

{{localeSelectionSection:zh-Hant}}

名稱和品牌是本地化值。不要假定未驗證的中文名稱是粵語音譯；如有需要，請檢查 full
profile 的 <black>i18n.{locale}.provenance</black>。

## 篩選及分頁

{{paginationSection:zh-Hant}}

[Places API 文件](/docs#tag/Places/operation/listPlacesV01)在各篩選參數下列出完整的基本類別、主要 taxonomy 及營運狀態值。類別是否有資料取決於所選版本及地區。Division
ID 是資源識別碼，請從 Divisions API 取得。

篩選會先於分頁套用。使用 <black>filter[basicCategory]</black> 篩選基本類別、
<black>filter[taxonomyPrimary]</black>
篩選主要 taxonomy、<black>filter[operatingStatus]</black>
篩選營運狀態，以及使用 canonical Division ID 的 <black>filter[division]</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[basicCategory]=restaurant&
                 filter[operatingStatus]=open&
                 filter[division]={divisionId}
```

Division 篩選採用已審核、由地址衍生的 relationship，並非 point-in-polygon 計算。每個 collection 資源均有
<black>relationships.address</black> 和
<black>relationships.divisions</black>。沒有 ALS 連結時 address 為 null；沒有連結地址的 Place 其 Division
relationship 為空，請勿由 geometry 推斷。

使用 <black>include=divisions</black> 將相關 canonical Division 資源加入頂層
<black>included</black> 陣列；它不會建立缺少的 relationship：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=divisions&
                 profile=map
```

## 時間旅行

{{timeTravelSection:zh-Hant}}

## 目前 Place、地圖 cell 及文字搜尋端點

下列端點查詢目前 active Place
snapshot，不接受 collection 的 release、profile、include 或時間旅行 selector；如需可重現的發布檢視，請使用 collection。

**取得一個目前 Place**

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 locale=zh-hant
```

回應包括 <black>place</black>、<black>i18n</black> 陣列和 <black>divisions</black>
陣列； <black>locale</black> 會篩選後兩者。

**取得 H3 cell 中的 Place**

Place 以 H3 resolution <black>5</black>、<black>7</black> 和 <black>9</black>
建立索引。將地圖選擇轉為 H3 後，要求其中一個 cell：

```url
/{{apiFamily}}/{{ apiVersionPath }}/by-cell/9/{h3Cell}?
                 limit=50
```

精簡的 <black>places</black> 陣列包含 ID、release ID、類別、taxonomy、營運狀態、Point
geometry 和匹配 cell。預設 limit 是 50，最多 100。H3
membership 來自 geometry，無需地址或 Division link。

**搜尋目前 Place**

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=coffee&
                 locale=en&
                 limit=25
```

搜尋會索引本地化名稱和品牌、taxonomy、地址、Division 和街道文字。每個
<black>results</black> 項目有 Place ID、release ID、匹配 locale、名稱和品牌文字。以
<black>placeId</black>
呼叫目前 Place 端點取得完整記錄。查詢最多 200 個字元，結果 limit 最多 100。

## 溯源

以 <black>profile=full</black> 取得 Place snapshot 和 release
ID、連結的地址 ID 和 snapshot，以及 <black>attributes.sources</black>
中的發布者歸屬。這些溯源欄位並非 canonical 地址或 Division 資源的替代品。

## 從失敗中復原

API 會返回多種錯誤代碼。以下說明如何逐一復原：

- 目前 Place 端點的 `404` 表示 ID 不在 active
  snapshot。請重新檢查 ID，或選取已發布的 collection release。
- 帶 <black>invalid_h3_level</black> 的 `400` 只適用於 H3 cell endpoint。請確認
  <black>{h3Level}</black> 是整數，然後重試。
- `422`
  表示請求無效。請閱讀驗證詳情，然後修正 selector、filter、locale、H3、搜尋或分頁值再重試。
- 帶 <black>snapshot_not_ready</black> 的 `503` 表示沒有已發布的 active Place
  snapshot。請於發布後重試，或選取已發布的 collection release；不要將回應視為空結果。
- 帶 <black>fts_not_ready</black> 的 `503`
  只適用於搜尋：全文索引尚未準備好，並非空結果。

# ZH-HANS

## 使用 Places API

完整参考请见[Places API 文档](/docs#tag/Places/operation/listPlacesV01)。

本指南说明如何向 Places API 发出请求。API <i>响应</i>的结构及内容，请参阅
[响应 schema](?tab=schema)和[响应示例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

Places
API 不会公开原始 Overture 源对象。如需研究，请将以下指示交给可访问 Overture 发布版本的 LLM：

```text
我需要 SaanSeoi Place 结果对应的原始 Overture Places 源对象。

- SaanSeoi release set: {{ apiReleaseSet }}
- Overture domain: {{ domainCode }}
- Cohort: {{ cohortKey }}
- Canonical Place ID: [粘贴 data[].id]
- Overture record ID: [粘贴 profile=full 中的 attributes.sources[].record_id]

请使用这个确切的 Overture Places release。验证两个 ID，然后返回未修改的 source object、
source URL 及任何不确定之处。请勿从 SaanSeoi 的 canonical response 推测缺失的 source field。
```

## 请求数据

{{experimentalApiWarning:zh-Hans}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}/</black> 获取地点列表。

```url
/{{apiFamily}}/{{ apiVersionPath }}/
```

**选择版本**

除非指定 [cohort](saanseoi:zh-hans:definition/cohort/v1) 或
[domain](saanseoi:zh-hans:definition/domain/v1)，否则 API 会返回默认
<black>overture</black> domain 中<black>最新</black> cohort 的记录。

要获取此特定发布，请同时提供两个 selector：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

以下示例均为保持一致而包括 cohort 和 domain，即使它们不影响所说明的功能。

也可直接选择已发布的 release：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 releaseSet={{ apiReleaseSet }}
```

Collection 响应会在 <black>meta.apiReleaseSet</black> 及
<black>meta.apiCatalogRevision</black> 记录已解析的发布。

## 设置响应形状

{{responseProfilesSection:zh-Hans}}

<black>attributes.geometry</black> 是按经度、纬度排列的 GeoJSON Point。使用
<black>profile=map</black> 和 <black>profile=full</black>
时会包含它；它不是边界，也不表示 Place 属于某个 Division。

## 添加语言（`I18n`）

{{localeSelectionSection:zh-Hans}}

名称和品牌是本地化值。不要假定未验证的中文名称是粤语音译；如有需要，请检查 full
profile 的 <black>i18n.{locale}.provenance</black>。

## 筛选及分页

{{paginationSection:zh-Hans}}

[Places API 文档](/docs#tag/Places/operation/listPlacesV01)在各筛选参数下列出完整的基本类别、主要 taxonomy 及营业状态值。类别是否有数据取决于所选版本及地区。Division
ID 是资源标识码，请从 Divisions API 获取。

筛选会先于分页套用。使用 <black>filter[basicCategory]</black> 筛选基本类别、
<black>filter[taxonomyPrimary]</black>
筛选主要 taxonomy、<black>filter[operatingStatus]</black>
筛选营业状态，以及使用 canonical Division ID 的 <black>filter[division]</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 filter[basicCategory]=restaurant&
                 filter[operatingStatus]=open&
                 filter[division]={divisionId}
```

Division 筛选采用已审核、由地址衍生的 relationship，并非 point-in-polygon 计算。每个 collection 资源均有
<black>relationships.address</black> 和
<black>relationships.divisions</black>。没有 ALS 链接时 address 为 null；没有链接地址的 Place 其 Division
relationship 为空，请勿由 geometry 推断。

使用 <black>include=divisions</black> 将相关 canonical Division 资源加入顶层
<black>included</black> 数组；它不会建立缺少的 relationship：

```url
/{{apiFamily}}/{{ apiVersionPath }}/?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 include=divisions&
                 profile=map
```

## 时间旅行

{{timeTravelSection:zh-Hans}}

## 当前 Place、地图 cell 及文本搜索端点

以下端点查询当前 active Place
snapshot，不接受 collection 的 release、profile、include 或时间旅行 selector；如需可重现的发布视图，请使用 collection。

**获取一个当前 Place**

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 locale=zh-hant
```

响应包括 <black>place</black>、<black>i18n</black> 数组和 <black>divisions</black>
数组； <black>locale</black> 会筛选后两者。

**获取 H3 cell 中的 Place**

Place 以 H3 resolution <black>5</black>、<black>7</black> 和 <black>9</black>
建立索引。将地图选择转为 H3 后，请求其中一个 cell：

```url
/{{apiFamily}}/{{ apiVersionPath }}/by-cell/9/{h3Cell}?
                 limit=50
```

精简的 <black>places</black> 数组包含 ID、release ID、类别、taxonomy、营业状态、Point
geometry 和匹配 cell。默认 limit 是 50，最多 100。H3
membership 来自 geometry，无需地址或 Division link。

**搜索当前 Place**

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=coffee&
                 locale=en&
                 limit=25
```

搜索会索引本地化名称和品牌、taxonomy、地址、Division 和街道文本。每个
<black>results</black> 项目有 Place ID、release ID、匹配 locale、名称和品牌文本。以
<black>placeId</black>
调用当前 Place 端点取得完整记录。查询最多 200 个字符，结果 limit 最多 100。

## 溯源

以 <black>profile=full</black> 获取 Place snapshot 和 release
ID、链接的地址 ID 和 snapshot，以及 <black>attributes.sources</black>
中的发布者归属。这些溯源字段并非 canonical 地址或 Division 资源的替代品。

## 从失败中恢复

API 会返回多种错误代码。以下说明如何逐一恢复：

- 当前 Place 端点的 `404` 表示 ID 不在 active
  snapshot。请重新检查 ID，或选择已发布的 collection release。
- 带 <black>invalid_h3_level</black> 的 `400` 只适用于 H3 cell endpoint。请确认
  <black>{h3Level}</black> 是整数，然后重试。
- `422`
  表示请求无效。请阅读验证详情，然后修正 selector、filter、locale、H3、搜索或分页值再重试。
- 带 <black>snapshot_not_ready</black> 的 `503` 表示没有已发布的 active Place
  snapshot。请在发布后重试，或选择已发布的 collection release；不要将响应视为空结果。
- 带 <black>fts_not_ready</black> 的 `503`
  只适用于搜索：全文索引尚未准备好，并非空结果。
