---
createdAt: "2026-09-06T00:00:00.000Z"
updatedAt: "2026-10-15T00:00:00.000Z"
apiFamily: "places"
apiVersion: "api-places-v0.1"
apiReleaseSet: "data-hk-places-2025-09-24.0"
revision: "0"
regionCode: "hk"
cohortKey: "2025-09-24.0"
domainCode: "overture"
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

Places describe venues and points of interest, with names, categories, contact details
and geographic relationships where available.

## Requesting Data

{{experimentalApiWarning:en}}

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> to get a list of places.

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

**Version Selection**

Unless you specify a [cohort](saanseoi:en:definition/cohort/v1) or
[domain](saanseoi:en:definition/domain/v1), the API returns the latest published cohort
in the default <black>overture</black> domain. Select this guide's release with:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

Or select the published release directly:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

The collection response records its resolved release in
<black>meta.apiReleaseSet</black> and <black>meta.apiCatalogRevision</black>. Save
<black>links.permalink</black> when you need to repeat the same request later.

## Filtering Places

Filters narrow the collection before pagination. Combine filters to require every
condition to match:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[basicCategory]=chinese_restaurant&
                 profile=map
```

In this release, <black>attributes.basicCategory</black> and
<black>attributes.taxonomy.primary</black> contain the same primary category, supplied
by the publisher's <black>categories.primary</black>. Both
<black>filter[basicCategory]</black> and <black>filter[taxonomyPrimary]</black> match
that value. For example, <black>chinese_restaurant</black> selects Chinese restaurants;
<black>restaurant</black> selects only records with that category, rather than all
specialised restaurant categories. There is no separate broad basic category.

<black>attributes.taxonomy.hierarchy</black> is null in this release. Alternate
classifications in <black>attributes.taxonomy.alternates</black> come from
<black>categories.alternate</black>. The API uses these canonical field names; there is
no <black>categories</black> response field or category filter.

The [Places API reference](/docs#tag/Places/operation/listPlacesV01) lists category,
taxonomy and operating-status values. Availability depends on the selected release.

## Filtering by Geographic Division

**Use a Division ID**

Find the Division through the [Divisions API](/docs#tag/divisions/GET/divisions/v0.2).
For example, search for Sha Tin:

```url
/divisions/v0.2/search?
                 q=Sha%20Tin
```

Choose the intended result and copy its <black>divisionId</black>. Pass it as
<black>filter[division]</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[division]={divisionId}&
                 filter[basicCategory]=chinese_restaurant&
                 include=divisions&
                 profile=map
```

Use the ID of a district, town, neighbourhood or island to find places associated with
that area. A place can match at several geographic levels: for example, a restaurant in
a neighbourhood can also match its town and district. Places are assigned to geographic
divisions using their coordinates. Filtering matches these assignments, including the
place’s administrative hierarchy.

**Use a geographic code**

For example, find places in Sai Ying Pun using its neighbourhood code,
<black>SYP</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[hoodCode]=SYP
```

For a named geographic area and its stored hierarchy, use one of these code filters:

| Filter                              | Division classes                                |
| ----------------------------------- | ----------------------------------------------- |
| <black>filter[adminCode]</black>    | SAR, area, district                             |
| <black>filter[localityCode]</black> | City, town, rural area, village, hamlet         |
| <black>filter[hoodCode]</black>     | Macrohood, neighbourhood, microhood             |
| <black>filter[landformCode]</black> | Major island, minor island, islet, island group |

The filter name distinguishes codes used for different kinds of area. For example,
<black>ST</black> identifies both Sha Tin District and Sha Tin town. To select the
administrative district, use:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[adminCode]=ST
```

To select the town, use:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[localityCode]=ST
```

These identify distinct Divisions, so their results can differ even though the code is
the same. Use the filter for the kind of area you mean.

Obtain <black>attributes.divisionCode</black> from the geographic Divisions API using
<black>inventory=saanseoi</black> and <black>profile=full</black>. Supply one uppercase
code per filter. A code selects the named Division and descendants in that geographic
release's hierarchy, then matches the Place's recorded Division associations. Different
code filters combine to require all conditions. <black>adminCode=HKSAR</black> adds no
geographic restriction.

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[adminCode]={districtCode}&
                 geographicReleaseSet={geographicReleaseSet}&
                 profile=map
```

Replace <black>{districtCode}</black> with the returned district code and
<black>{geographicReleaseSet}</black> with its published geographic release code or ID.
The Places <black>releaseSet</black> selects the venue data;
<black>geographicReleaseSet</black> selects the geography used to interpret code
membership. If omitted, geography resolves to the latest compatible selection. The
response's <black>X-Geographic-Release-Set</black> header identifies that selection;
collection links retain it. Pin both releases for repeatable geographic filtering.

**Retrieve related Divisions**

Each collection resource carries <black>relationships.address</black> and
<black>relationships.divisions</black>. The address is null when no canonical address
link is recorded. <black>include=divisions</black> adds related Division resources to
the top-level <black>included</black> array.

## Shaping the Response

{{responseProfilesSection:en}}

<black>attributes.geometry</black> is a GeoJSON Point in longitude, latitude order,
included with <black>profile=map</black> and <black>profile=full</black>. Use
<black>profile=map</black> when plotting venues:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 profile=map&
                 locales=en,zh-hant
```

## Adding Languages (`I18n`)

{{localeSelectionSection:en}}

Names and brand names are localised values under <black>attributes.i18n</black>, keyed
by locale. Coverage and upstream locale assignments can be incomplete. Choose a fallback
name for display and handle records with no requested translation. The full profile's
<black>attributes.i18n.{locale}.meta</black> describes field-level language provenance;
a Chinese name alone does not establish that it is a Cantonese transliteration.

## Searching for Places

Use the search endpoint with a required <black>q</black>:

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=coffee&
                 locale=en&
                 limit=25
```

Search indexes localised names and brands, taxonomy, address, Division and street text.
Omit <black>locale</black> to search all available localisations, or supply one locale
to restrict matching. Each <black>results</black> entry provides a
<black>placeId</black>, release ID, matched locale, name and brand text. Retrieve the
<black>placeId</black> through the detail endpoint for the complete current record.
Queries hold at most 200 characters; the default limit is 20 and the maximum is 100.

## Getting One Current Place

Every Place has an <black>id</black>. Retrieve one with:

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 locale=zh-hant
```

The response contains <black>place</black>, an <black>i18n</black> object keyed by
locale, and a <black>divisions</black> array. The singular <black>locale</black>
parameter selects localised entries in the latter two; it differs from the collection's
<black>locales</black> parameter.

## Getting Places in a Map Cell

Places are indexed at [H3 resolutions](https://h3geo.org/docs/core-library/restable/)
<black>5</black>, <black>7</black> and <black>9</black>. Convert a map selection to a
cell at one of those resolutions, then request:

```url
/{{apiFamily}}/{{ apiVersionPath }}/by-cell/9/{h3Cell}?
                 limit=50
```

The compact <black>places</black> array contains IDs, category, taxonomy, operating
status, Point geometry and the matched cell. The default limit is 50 and the maximum
is 100. Results are ordered by Place ID. Follow <black>links.next</black> until it is
absent to retrieve every page in the cell. <black>meta.page</black> reports the
<black>limit</black>, <black>offset</black> and <black>hasMore</black> flag; no total
count is returned. To start at a specific position, supply <black>offset</black>
(default 0). Geographic code filters are retained in continuation links. H3 membership
comes from point geometry.

Each page uses the latest active snapshot. If a new release is published while you are
paging, the results can change; use the collection with a pinned release for a
reproducible export.

Search is available only for the latest published release; historical releases cannot be
searched. The single-Place and H3-cell endpoints also return current data. To read a
historical release, use the collection endpoint with <black>releaseSet</black> or the
time-travel parameters described below.

You can restrict search or H3-cell results to a geographic area by adding a code filter,
such as <black>filter[hoodCode]=SYP</black> for Sai Ying Pun. To filter by a Division ID
(<black>filter[division]</black>), basic category, primary taxonomy or operating status,
use the collection endpoint, <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black>,
with the filters shown above. For example, use the collection to list open restaurants
in a district; use search to find places by text.

The collection also supports <black>profile</black> to choose response fields and
<black>include=divisions</black> to return related Division resources. Search,
single-Place and H3-cell responses each have a fixed format.

## Pagination

{{paginationSection:en}}

## Time travel

{{timeTravelSection:en}}

## Provenance

Use <black>profile=full</black> for snapshot and release IDs, linked address identifiers
and publisher attribution in <black>attributes.sources</black>. These fields describe
the canonical record's evidence. <black>firstSeenMonth</black> and
<black>lastSeenMonth</black> describe publication observations, not opening or closing
dates.

## Recover from Failure

- `404` from a detail request means that the ID is not in the active snapshot. Recheck
  the ID; use the collection to query a published historical release.
- `422` means that the request is invalid. Read the validation details and correct the
  selector, filter, locale, search or pagination value. Geographic codes must resolve
  unambiguously in the selected geographic release.
- `400` with <black>invalid_h3_level</black> means the cell path's level is not an
  integer. Use an indexed resolution and a cell at that resolution.
- `503` with <black>snapshot_not_ready</black> means the selected snapshot is
  unavailable. Retry after publication or choose a published collection release.
- `503` with <black>fts_not_ready</black> means the search index is unavailable.
- `503` with <black>geographic_filter_not_ready</black> means the geographic release
  needed for code filtering is unavailable. Check <black>geographicReleaseSet</black>.

An unavailable snapshot or index is different from a successful response with no
matches.

# ZH-HANT

## 使用 Places API

完整參考請見 [Places API 文件](/docs#tag/Places/operation/listPlacesV01)。

本指南說明如何向 Places API 發出請求。API <i>回應</i>的結構及內容，請參閱
[回應結構](?tab=schema)和[回應範例](?tab=samples)。各節均可獨立閱讀，請直接前往所需內容。

{{apiKeyNote:zh-Hant}}

Places 描述場所及興趣點，並在有資料時提供名稱、類別、聯絡方式及地理關係。請參閱此版本的來源說明，了解資料覆蓋範圍；缺少某個值並不代表場所沒有名稱、地址或網站。

## 要求資料

{{experimentalApiWarning:zh-Hant}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 取得地點清單。

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

**選取版本**

除非指定[批次](saanseoi:zh-hant:definition/cohort/v1)或
[網域](saanseoi:zh-hant:definition/domain/v1)，否則 API 會傳回預設
<black>overture</black> 網域中最新發布的批次。以下請求選取本指南的版本：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

亦可直接選取已發布的版本：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

清單回應在 <black>meta.apiReleaseSet</black> 及 <black>meta.apiCatalogRevision</black>
記錄實際選取的版本。如需日後重複同一請求，請儲存 <black>links.permalink</black>。

## 篩選地點

篩選會先於分頁套用。合併多個篩選條件時，記錄必須全部符合：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[basicCategory]=chinese_restaurant&
                 filter[operatingStatus]=open&
                 profile=map
```

此版本的 <black>attributes.basicCategory</black> 及
<black>attributes.taxonomy.primary</black> 使用同一個主要類別，來自發布者的
<black>categories.primary</black>。<black>filter[basicCategory]</black> 及
<black>filter[taxonomyPrimary]</black> 均匹配該值。例如，
<black>chinese_restaurant</black> 選取中式餐廳；<black>restaurant</black>
只選取該類別的記錄，不會涵蓋所有細分類別的餐廳。此版本沒有獨立的廣義基本類別。

此版本的 <black>attributes.taxonomy.hierarchy</black> 為 null。
<black>attributes.taxonomy.alternates</black> 的替代分類來自
<black>categories.alternate</black>。API 使用上述標準欄位名稱，不提供
<black>categories</black> 回應欄位或 category 篩選參數。

[Places API 文件](/docs#tag/Places/operation/listPlacesV01)列出類別、分類及營運狀態的值。實際資料取決於所選版本。

## 按地理區劃篩選

**使用區劃 ID**

先透過 [Divisions API](/docs#tag/divisions/GET/divisions/v0.2) 尋找區劃。例如搜尋沙田：

```url
/divisions/v0.2/search?
                 q=Sha%20Tin
```

選擇所需結果，複製其
<black>divisionId</black>。同一名稱可能對應不同類型的地方，使用 ID 前請檢查區劃的分類。將 ID 傳入
<black>filter[division]</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[division]={divisionId}&
                 filter[basicCategory]=chinese_restaurant&
                 include=divisions&
                 profile=map
```

使用分區、市鎮、鄰里或島嶼的 ID，尋找與該地區相關的地點。同一地點可在多個地理層級匹配：例如，某鄰里的餐廳亦可匹配其所屬市鎮及分區。結果取決於每個地點可用的地理資料，因此可能遺漏部分場所。

**使用地理代碼**

例如，使用西營盤的鄰里代碼 <black>SYP</black> 尋找該處的地點：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[hoodCode]=SYP
```

如要按具名地理區域及其儲存的層級篩選，可使用以下代碼：

| 篩選參數                            | 區劃類別                           |
| ----------------------------------- | ---------------------------------- |
| <black>filter[adminCode]</black>    | 特別行政區、大區、分區             |
| <black>filter[localityCode]</black> | 城市、市鎮、鄉郊地區、村落、小村落 |
| <black>filter[hoodCode]</black>     | 大鄰里、鄰里、微鄰里               |
| <black>filter[landformCode]</black> | 大島、小島、島礁、島群             |

篩選參數的名稱用來區分不同類型地區的代碼。例如，<black>ST</black>
同時代表沙田區及沙田市鎮。如要選取行政分區，請使用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[adminCode]=ST
```

如要選取市鎮，請使用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[localityCode]=ST
```

兩者是不同的區劃，因此即使代碼相同，結果亦可能不同。請按所需地區的類型選擇篩選參數。

透過 geographic 網域的 Divisions API，使用 <black>inventory=saanseoi</black> 及
<black>profile=full</black> 取得
<black>attributes.divisionCode</black>。每個篩選參數只接受一個大寫代碼。代碼選取該地理版本中的具名區劃及其層級下的區劃，再匹配地點已記錄的區劃關聯。使用不同代碼篩選時，記錄必須全部符合。
<black>adminCode=HKSAR</black> 不會增加地理限制。

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[adminCode]={districtCode}&
                 geographicReleaseSet={geographicReleaseSet}&
                 profile=map
```

將 <black>{districtCode}</black> 換成取得的分區代碼，並將
<black>{geographicReleaseSet}</black> 換成其已發布地理版本的代碼或 ID。Places 的
<black>releaseSet</black> 選取場所資料； <black>geographicReleaseSet</black>
選取解讀代碼歸屬的地理版本。省略時會選用最新的相容地理版本。回應的
<black>X-Geographic-Release-Set</black>
標頭記錄該選擇，清單連結亦會保留它。要重現地理篩選結果，請固定兩個版本。

**取得相關區劃**

每個清單資源均有 <black>relationships.address</black> 及
<black>relationships.divisions</black>。沒有記錄標準地址連結時，address 為 null。
<black>include=divisions</black> 將相關區劃資源加入頂層 <black>included</black>
陣列；它不會建立缺少的連結，也不會要求區劃多邊形。

## 設定回應內容

{{responseProfilesSection:zh-Hant}}

<black>attributes.geometry</black> 是按經度、緯度排列的 GeoJSON Point，使用
<black>profile=map</black> 或 <black>profile=full</black>
時會包含它。在地圖上顯示場所時，可使用 <black>profile=map</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 profile=map&
                 locales=en,zh-hant
```

## 加入語言（`I18n`）

{{localeSelectionSection:zh-Hant}}

名稱及品牌名稱位於
<black>attributes.i18n</black>，以語言代碼為鍵。覆蓋範圍及上游語言標記未必完整。請為顯示名稱選擇備用值，並處理沒有所需翻譯的記錄。完整設定中的
<black>attributes.i18n.{locale}.meta</black>
說明各欄位的語言溯源；只有中文名稱並不足以確認它是粵語音譯。

## 搜尋地點

使用搜尋端點，並提供必需的 <black>q</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=coffee&
                 locale=en&
                 limit=25
```

搜尋索引包括本地化名稱及品牌、分類、地址、區劃及街道文字。省略 <black>locale</black>
會搜尋所有可用語言，或指定一種語言限制匹配。每個 <black>results</black> 項目提供
<black>placeId</black>、版本 ID、匹配的語言、名稱及品牌文字。以 <black>placeId</black>
呼叫詳細資料端點，取得完整的目前記錄。查詢最多 200 個字元；預設回傳 20 筆，最多 100 筆。

## 取得單一目前地點

每個地點均有 <black>id</black>，可用以下請求取得：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 locale=zh-hant
```

回應包括 <black>place</black>、以語言代碼為鍵的 <black>i18n</black> 物件，以及
<black>divisions</black> 陣列。單數 <black>locale</black>
參數選取後兩者中的本地化項目，有別於清單的 <black>locales</black> 參數。

## 取得地圖網格內的地點

地點按 [H3 解析度](https://h3geo.org/docs/core-library/restable/)
<black>5</black>、<black>7</black> 及 <black>9</black>
建立索引。將地圖選擇轉為其中一種解析度的網格後，發出請求：

```url
/{{apiFamily}}/{{ apiVersionPath }}/by-cell/9/{h3Cell}?
                 limit=50
```

精簡的 <black>places</black>
陣列包含 ID、類別、分類、營運狀態、Point 幾何及匹配網格。預設上限為 50，最多 100。結果按 Place
ID 排序。持續跟隨
<black>links.next</black>，直到連結不再出現，即可取得網格內的所有分頁。
<black>meta.page</black> 提供 <black>limit</black>、<black>offset</black> 及
<black>hasMore</black>，不提供總筆數。若要從指定位置開始，請提供
<black>offset</black>（預設為 0）。後續分頁連結會保留地理代碼篩選。H3 歸屬來自點幾何。

每頁均使用最新的 active
snapshot。若分頁期間發布新版本，結果可能改變；如需可重現的匯出，請使用清單並固定版本。

搜尋只適用於最新發布的版本，無法搜尋歷史版本。單一地點及 H3 網格端點亦只傳回目前資料。如要讀取歷史版本，請使用清單端點，並提供
<black>releaseSet</black> 或下文說明的時間旅行參數。

您可以在搜尋或 H3 網格請求中加入地理代碼篩選，限制結果的地理範圍，例如使用
<black>filter[hoodCode]=SYP</black>
選取西營盤。如要按區劃 ID（<black>filter[division]</black>）、基本類別、主要分類或營運狀態篩選，請使用清單端點
<black>GET
/{{apiFamily}}/{{ apiVersionPath }}</black>，並加入上文所示的篩選參數。例如，要列出某分區內營業中的餐廳，請使用清單；要按文字尋找地點，請使用搜尋。

清單亦支援 <black>profile</black> 選擇回應欄位，以及 <black>include=divisions</black>
取得相關區劃資源。搜尋、單一地點及 H3 網格回應各有固定格式。

## 分頁

{{paginationSection:zh-Hant}}

## 時間旅行

{{timeTravelSection:zh-Hant}}

## 溯源

使用 <black>profile=full</black> 取得 snapshot 和版本 ID、連結的地址識別碼，以及
<black>attributes.sources</black> 中的發布者歸屬。這些欄位描述標準記錄的來源證據。
<black>identifiers.wikidata.brandId</black> 識別品牌，而非個別場所。
<black>firstSeenMonth</black> 及 <black>lastSeenMonth</black>
表示發布中的觀察月份，並非開業或結業日期。

## 從失敗中復原

- 詳細資料請求的 `404` 表示 ID 不在 active
  snapshot。請核對 ID；查詢已發布的歷史版本時，請使用清單。
- `422`
  表示請求無效。請閱讀驗證詳情，修正選擇器、篩選、語言、搜尋或分頁值。地理代碼必須能在所選地理版本中明確解析。
- 帶 <black>invalid_h3_level</black> 的 `400`
  表示網格路徑的層級不是整數。請使用已建立索引的解析度及該解析度的網格。
- 帶 <black>snapshot_not_ready</black> 的 `503`
  表示所選 snapshot 無法使用。請於發布後重試，或選取已發布的清單版本。
- 帶 <black>fts_not_ready</black> 的 `503` 表示搜尋索引無法使用。
- 帶 <black>geographic_filter_not_ready</black> 的 `503`
  表示代碼篩選所需的地理版本無法使用。請檢查 <black>geographicReleaseSet</black>。

Snapshot 或索引無法使用，有別於成功回應但沒有匹配結果。

# ZH-HANS

## 使用 Places API

完整参考请见 [Places API 文件](/docs#tag/Places/operation/listPlacesV01)。

本指南说明如何向 Places API 发出请求。API <i>回应</i>的结构及内容，请参阅
[回应结构](?tab=schema)和[回应范例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

Places 描述场所及兴趣点，并在有资料时提供名称、类别、联系方式及地理关系。请参阅此版本的来源说明，了解资料覆盖范围；缺少某个值并不代表场所没有名称、地址或网站。

## 要求资料

{{experimentalApiWarning:zh-Hans}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 取得地点清单。

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

**选取版本**

除非指定[批次](saanseoi:zh-hans:definition/cohort/v1)或
[域](saanseoi:zh-hans:definition/domain/v1)，否则 API 会传回预设 <black>overture</black>
域中最新发布的批次。以下请求选取本指南的版本：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

亦可直接选取已发布的版本：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

清单回应在 <black>meta.apiReleaseSet</black> 及 <black>meta.apiCatalogRevision</black>
记录实际选取的版本。如需日后重复同一请求，请保存 <black>links.permalink</black>。

## 筛选地点

筛选会先于分页套用。合并多个筛选条件时，记录必须全部符合：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[basicCategory]=chinese_restaurant&
                 filter[operatingStatus]=open&
                 profile=map
```

此版本的 <black>attributes.basicCategory</black> 及
<black>attributes.taxonomy.primary</black> 使用同一个主要类别，来自发布者的
<black>categories.primary</black>。<black>filter[basicCategory]</black> 及
<black>filter[taxonomyPrimary]</black> 均匹配该值。例如，
<black>chinese_restaurant</black> 选取中式餐厅；<black>restaurant</black>
只选取该类别的记录，不会涵盖所有细分类别的餐厅。此版本没有独立的广义基本类别。

此版本的 <black>attributes.taxonomy.hierarchy</black> 为 null。
<black>attributes.taxonomy.alternates</black> 的替代分类来自
<black>categories.alternate</black>。API 使用上述标准字段名称，不提供
<black>categories</black> 响应字段或 category 筛选参数。

[Places API 文件](/docs#tag/Places/operation/listPlacesV01)列出类别、分类及营运状态的值。实际资料取决于所选版本。

## 按地理区划筛选

**使用区划 ID**

先透过 [Divisions API](/docs#tag/divisions/GET/divisions/v0.2) 寻找区划。例如搜寻沙田：

```url
/divisions/v0.2/search?
                 q=Sha%20Tin
```

选择所需结果，复制其
<black>divisionId</black>。同一名称可能对应不同类型的地方，使用 ID 前请检查区划的分类。将 ID 传入
<black>filter[division]</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[division]={divisionId}&
                 filter[basicCategory]=chinese_restaurant&
                 include=divisions&
                 profile=map
```

使用分区、市镇、邻里或岛屿的 ID，查找与该地区相关的地点。同一地点可在多个地理层级匹配：例如，某邻里的餐厅也可匹配其所属市镇及分区。结果取决于每个地点可用的地理数据，因此可能遗漏部分场所。

**使用地理代码**

例如，使用西营盘的邻里代码 <black>SYP</black> 查找该处的地点：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[hoodCode]=SYP
```

如要按具名地理区域及其保存的层级筛选，可使用以下代码：

| 筛选参数                            | 区划类别                           |
| ----------------------------------- | ---------------------------------- |
| <black>filter[adminCode]</black>    | 特别行政区、大区、分区             |
| <black>filter[localityCode]</black> | 城市、市镇、乡郊地区、村落、小村落 |
| <black>filter[hoodCode]</black>     | 大邻里、邻里、微邻里               |
| <black>filter[landformCode]</black> | 大岛、小岛、岛礁、岛群             |

筛选参数的名称用于区分不同类型地区的代码。例如，<black>ST</black>
同时代表沙田区及沙田市镇。如要选取行政分区，请使用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[adminCode]=ST
```

如要选取市镇，请使用：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[localityCode]=ST
```

两者是不同的区划，因此即使代码相同，结果也可能不同。请按所需地区的类型选择筛选参数。

透过 geographic 域的 Divisions API，使用 <black>inventory=saanseoi</black> 及
<black>profile=full</black> 取得
<black>attributes.divisionCode</black>。每个筛选参数只接受一个大写代码。代码选取该地理版本中的具名区划及其层级下的区划，再匹配地点已记录的区划关联。使用不同代码筛选时，记录必须全部符合。
<black>adminCode=HKSAR</black> 不会增加地理限制。

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[adminCode]={districtCode}&
                 geographicReleaseSet={geographicReleaseSet}&
                 profile=map
```

将 <black>{districtCode}</black> 换成取得的分区代码，并将
<black>{geographicReleaseSet}</black> 换成其已发布地理版本的代码或 ID。Places 的
<black>releaseSet</black> 选取场所资料； <black>geographicReleaseSet</black>
选取解读代码归属的地理版本。省略时会选用最新的相容地理版本。回应的
<black>X-Geographic-Release-Set</black>
标头记录该选择，清单连结亦会保留它。要重现地理筛选结果，请固定两个版本。

**取得相关区划**

每个清单资源均有 <black>relationships.address</black> 及
<black>relationships.divisions</black>。没有记录标准地址连结时，address 为 null。
<black>include=divisions</black> 将相关区划资源加入顶层 <black>included</black>
数组；它不会建立缺少的连结，也不会要求区划多边形。

## 设定回应内容

{{responseProfilesSection:zh-Hans}}

<black>attributes.geometry</black> 是按经度、纬度排列的 GeoJSON Point，使用
<black>profile=map</black> 或 <black>profile=full</black>
时会包含它。在地图上显示场所时，可使用 <black>profile=map</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 profile=map&
                 locales=en,zh-hant
```

## 加入语言（`I18n`）

{{localeSelectionSection:zh-Hans}}

名称及品牌名称位于
<black>attributes.i18n</black>，以语言代码为键。覆盖范围及上游语言标记未必完整。请为显示名称选择备用值，并处理没有所需翻译的记录。完整设定中的
<black>attributes.i18n.{locale}.meta</black>
说明各字段的语言溯源；只有中文名称并不足以确认它是粤语音译。

## 搜寻地点

使用搜寻端点，并提供必需的 <black>q</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=coffee&
                 locale=en&
                 limit=25
```

搜寻索引包括本地化名称及品牌、分类、地址、区划及街道文字。省略 <black>locale</black>
会搜寻所有可用语言，或指定一种语言限制匹配。每个 <black>results</black> 项目提供
<black>placeId</black>、版本 ID、匹配的语言、名称及品牌文字。以 <black>placeId</black>
呼叫详细资料端点，取得完整的目前记录。查询最多 200 个字元；预设返回 20 笔，最多 100 笔。

## 取得单一目前地点

每个地点均有 <black>id</black>，可用以下请求取得：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 locale=zh-hant
```

回应包括 <black>place</black>、以语言代码为键的 <black>i18n</black> 物件，以及
<black>divisions</black> 数组。单数 <black>locale</black>
参数选取后两者中的本地化项目，有别于清单的 <black>locales</black> 参数。

## 取得地图网格内的地点

地点按 [H3 解析度](https://h3geo.org/docs/core-library/restable/)
<black>5</black>、<black>7</black> 及 <black>9</black>
建立索引。将地图选择转为其中一种解析度的网格后，发出请求：

```url
/{{apiFamily}}/{{ apiVersionPath }}/by-cell/9/{h3Cell}?
                 limit=50
```

精简的 <black>places</black>
数组包含 ID、类别、分类、营运状态、Point 几何及匹配网格。预设上限为 50，最多 100。结果按 Place
ID 排序。持续跟随
<black>links.next</black>，直到链接不再出现，即可取得网格内的所有分页。
<black>meta.page</black> 提供 <black>limit</black>、<black>offset</black> 及
<black>hasMore</black>，不提供总笔数。若要从指定位置开始，请提供
<black>offset</black>（默认为 0）。后续分页链接会保留地理代码筛选。H3 归属来自点几何。

每页均使用最新的 active
snapshot。若分页期间发布新版本，结果可能改变；如需可重现的导出，请使用清单并固定版本。

搜索只适用于最新发布的版本，无法搜索历史版本。单一地点及 H3 网格端点也只返回当前数据。如要读取历史版本，请使用清单端点，并提供
<black>releaseSet</black> 或下文说明的时间旅行参数。

您可以在搜索或 H3 网格请求中加入地理代码筛选，限制结果的地理范围，例如使用
<black>filter[hoodCode]=SYP</black>
选取西营盘。如要按区划 ID（<black>filter[division]</black>）、基本类别、主要分类或营运状态筛选，请使用清单端点
<black>GET
/{{apiFamily}}/{{ apiVersionPath }}</black>，并加入上文所示的筛选参数。例如，要列出某分区内营业中的餐厅，请使用清单；要按文字查找地点，请使用搜索。

清单也支持 <black>profile</black> 选择响应字段，以及 <black>include=divisions</black>
获取相关区划资源。搜索、单一地点及 H3 网格响应各有固定格式。

## 分页

{{paginationSection:zh-Hans}}

## 时间旅行

{{timeTravelSection:zh-Hans}}

## 溯源

使用 <black>profile=full</black> 取得 snapshot 和版本 ID、连结的地址识别码，以及
<black>attributes.sources</black> 中的发布者归属。这些字段描述标准记录的来源证据。
<black>identifiers.wikidata.brandId</black> 识别品牌，而非个别场所。
<black>firstSeenMonth</black> 及 <black>lastSeenMonth</black>
表示发布中的观察月份，并非开业或结业日期。

## 从失败中复原

- 详细资料请求的 `404` 表示 ID 不在 active
  snapshot。请核对 ID；查询已发布的历史版本时，请使用清单。
- `422`
  表示请求无效。请阅读验证详情，修正选择器、筛选、语言、搜寻或分页值。地理代码必须能在所选地理版本中明确解析。
- 带 <black>invalid_h3_level</black> 的 `400`
  表示网格路径的层级不是整数。请使用已建立索引的解析度及该解析度的网格。
- 带 <black>snapshot_not_ready</black> 的 `503`
  表示所选 snapshot 无法使用。请于发布后重试，或选取已发布的清单版本。
- 带 <black>fts_not_ready</black> 的 `503` 表示搜寻索引无法使用。
- 带 <black>geographic_filter_not_ready</black> 的 `503`
  表示代码筛选所需的地理版本无法使用。请检查 <black>geographicReleaseSet</black>。

Snapshot 或索引无法使用，有别于成功回应但没有匹配结果。
