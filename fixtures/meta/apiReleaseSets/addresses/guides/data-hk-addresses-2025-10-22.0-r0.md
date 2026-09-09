---
createdAt: "2026-09-09T00:26:38.567Z"
updatedAt: "2026-09-09T00:26:38.567Z"
apiFamily: "addresses"
apiVersion: "api-addresses-v0.1"
apiReleaseSet: "data-hk-addresses-2025-10-22.0"
revision: "0"
regionCode: "hk"
cohortKey: "2025-10-22.0"
domainCode: "saanseoi"
timeTravelEffectiveAt: "2025-10-22T00:00:00.000Z"
timeTravelKnownAt: "2026-09-09T07:09:47.762Z"
timeTravelCatalogRevision: "catalog-hk-addresses-v0.1-2026-09-09.32"
---

# EN

## Using the Addresses API

For the full reference, see the
[Addresses API docs](/docs#tag/Addresses/operation/listAddressesV01).

This guide explains how to make requests to the Addresses API. For the shape and
contents of API <i>responses</i>, see the [response schema](?tab=schema) and
[sample responses](?tab=samples). Each section stands on its own, so you can go straight
to the one you need.

{{apiKeyNote:en}}

To inspect the original ALS object behind this release, use the
[Addresses source-record endpoint](/docs#tag/Sources/operation/listAddressSourceRecordsV0)
with the required `sourceRelease` query parameter. The response returns the retained
object under `rawProperties`.

## Requesting Data

{{experimentalApiWarning:en}}

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> to get a list of addresses.

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

Every address has an <black>id</black>. Use it with <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> to get one address:

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 profile=full&
                 locales=en,zh-hant&
                 include=hierarchy
```

**Version Selection**

Unless you specify a [cohort](saanseoi:en:definition/cohort/v1) or
[domain](saanseoi:en:definition/domain/v1), the API returns records from the
<black>latest</black> cohort in the default <black>saanseoi</black> domain.

To request records from this specific release, include both selectors:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

Or you can select the published release directly:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

The collection response records its resolved release in
<black>meta.apiReleaseSet</black> and <black>meta.apiCatalogRevision</black>.

The examples below include the cohort and domain for consistency, even where they do not
affect the feature being explained.

## Searching for Addresses

Use the search endpoint with a required query and matching mode. Search accepts the same
release, domain, cohort, time-travel, profile, locale, hierarchy, and Division filters
as the collection, so a search can reproduce an archived release view.

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=427%20KING%27S%20ROAD&
                 match=full-text&
                 locales=en&
                 page[limit]=25
```

Choose the matching mode for the question you are asking:

- <black>full-text</black> finds all indexed query tokens in formatted address and
  component text. Common English abbreviations such as <i>BLK</i>, <i>TWR</i>, and
  <i>HSE</i> are matched with their expanded forms.
- <black>prefix</black> matches the start of each indexed token.
- <black>component</black> searches only one named component. Supply
  <black>component=formatted|building|number|block|phase|estate|street</black>.
- <black>exact</black> accepts one building-number token, such as <black>427</black> or
  <black>6A</black>, and matches source number assertions.
- <black>range</black> also matches an address whose published number range contains
  that token. It does not claim that the queried number exists independently.

For example, search only estate names:

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=WHAMPOA%20ESTATE&
                 match=component&
                 component=estate&
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

Queries hold at most 200 characters. Search returns 25 records by default and at most
50; offsets are capped at 1,000. An empty result is different from
<black>fts_not_ready</black>, which means that the search index is unavailable.

## Shaping the Response

{{responseProfilesSection:en}}

## Getting Units

The Address resource's <black>attributes.address3dCoverage</black> tells you whether an
Address3D unit collection is available directly or through an established or unresolved
ancestor. Request it with:

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}/units?
                 releaseSet={{ apiReleaseSet }}
```

The response contains floor and unit references and localised formatted parts when a
collection is available. A null <black>data</black> value means no applicable collection
is published in the selected release. Do not infer a unit's membership from ancestor
coverage marked <black>unresolved</black>.

## Adding Languages (`I18n`)

{{localeSelectionSection:en}}

Localised address data includes a complete <black>formattedAddress</black> and, where
supplied, structured building, number, block, phase, estate, and street components.
Missing components are null or omitted.

## Filters & Pagination

{{paginationSection:en}}

Filters narrow the list or search before pagination. Use <black>filter[dataset]</black>
for one contributing dataset, or use <black>filter[country]</black>,
<black>filter[area]</black>, and <black>filter[district]</black> with canonical Division
IDs:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[dataset]=ds-hk-hkgov-dpo-address&
                 filter[district]={divisionId}&
                 profile=map
```

Every Address resource carries its canonical Division relationship identifiers. Use
<black>include=hierarchy</black> when you also need the related Division resources in
the top-level <black>included</black> array.

## Time travel

{{timeTravelSection:en}}

## Provenance

Use <black>profile=full</black> for the Address snapshot ID, government identifiers, and
publisher attribution in <black>attributes.sources</black>. The supporting Division
snapshot supplies canonical geographic relationships.

## Recover from Failure

The API returns a number of error codes. Here is how to recover from each one:

- `404` from a detail or units request means that the ID is not in the selected release.
  Recheck the ID and its release, domain, cohort, and time-travel selectors.
- `422` means that the request is invalid. Read the validation details, then correct the
  selector, filter, locale, matching mode, component, search, or pagination value.
- `503` with <black>snapshot_not_ready</black> means that no Address snapshot matches
  the selection. Retry after it is published or choose a published release; do not treat
  the response as an empty result.
- `503` with <black>fts_not_ready</black> applies to indexed search only: the search
  index is not ready, not empty.

# ZH-HANT

## 使用地址 API

完整參考請見[地址 API 文件](/docs#tag/Addresses/operation/listAddressesV01)。

本指南說明如何向地址 API 發出請求。API <i>回應</i>的結構及內容，請參閱
[回應結構](?tab=schema)和[回應範例](?tab=samples)。各節均可獨立閱讀，請直接前往所需內容。

{{apiKeyNote:zh-Hant}}

## 要求資料

{{experimentalApiWarning:zh-Hant}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 取得地址清單。

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

每個地址均有 <black>id</black>。以 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> 取得單一地址：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 profile=full&
                 locales=en,zh-hant&
                 include=hierarchy
```

**選取版本**

除非指定[批次](saanseoi:zh-hant:definition/cohort/v1)或
[網域](saanseoi:zh-hant:definition/domain/v1)，否則 API 會傳回預設
<black>saanseoi</black> 網域中<black>最新</black>批次的記錄。

如要取得此特定發布，請同時提供兩個選擇器：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

亦可直接選取已發布的發布集：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

集合回應會在 <black>meta.apiReleaseSet</black> 及 <black>meta.apiCatalogRevision</black>
記錄解析出的發布。

## 搜尋地址

搜尋端點必須提供查詢及配對模式。搜尋接受與集合相同的發布、網域、批次、時間回溯、設定檔、語言、階層及 Division 篩選條件，因此可重現已封存的發布視圖。

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=427%20KING%27S%20ROAD&
                 match=full-text&
                 locales=en&
                 page[limit]=25
```

請按問題選擇配對模式：

- <black>full-text</black> 在格式化地址及組成部分文字中尋找所有查詢詞元。常見英文縮寫如
  <i>BLK</i>、<i>TWR</i> 及 <i>HSE</i> 會與完整寫法互相配對。
- <black>prefix</black> 配對每個索引詞元的開首。
- <black>component</black> 只搜尋一個指定組成部分，須提供
  <black>component=formatted|building|number|block|phase|estate|street</black>。
- <black>exact</black> 接受一個樓宇號碼詞元，例如 <black>427</black> 或
  <black>6A</black>，並配對來源號碼斷言。
- <black>range</black>
  亦會配對已發布號碼範圍包含該 token 的地址，但不表示該查詢號碼獨立存在。

例如只搜尋屋苑名稱：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=WHAMPOA%20ESTATE&
                 match=component&
                 component=estate&
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

查詢最多 200 個字元。搜尋預設傳回 25 筆記錄，最多 50 筆；offset 上限為 1,000。空白結果與
<black>fts_not_ready</black> 不同，後者表示搜尋索引不可用。

## 調整回應

{{responseProfilesSection:zh-Hant}}

<black>attributes.geometry</black> 是 GeoJSON 地址位置，使用 <black>profile=map</black>
或 <black>profile=full</black> 時提供。如需不可變的snapshot
ID、發布者識別碼及來源證據，請使用 <black>profile=full</black>。
<black>attributes.granularity</black> 說明記錄識別的範圍，並非品質評分。

## 加入語言（`I18n`）

{{localeSelectionSection:zh-Hant}}

本地化地址資料包括完整的
<black>formattedAddress</black>，以及來源有提供的樓宇、號碼、座、期、屋苑及街道組成部分。缺失的組成部分會是 null 或省略；請勿從另一種語言重建。

## 篩選及分頁

{{paginationSection:zh-Hant}}

篩選條件會在分頁前收窄清單或搜尋結果。使用 <black>filter[dataset]</black>
選擇一個貢獻資料集，或以標準 Division ID 配合
<black>filter[country]</black>、<black>filter[area]</black> 及
<black>filter[district]</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[dataset]=ds-hk-hkgov-dpo-address&
                 filter[district]={divisionId}&
                 profile=map
```

每個地址資源均帶有標準 Division 關係識別碼。如亦需要頂層 <black>included</black>
陣列中的相關 Division 資源，請使用 <black>include=hierarchy</black>。

## 取得單位

地址資源的 <black>attributes.address3dCoverage</black>
說明 Address3D 單位集合是直接可用，還是透過已確立或未解析的祖先可用。使用以下請求取得：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}/units?
                 releaseSet={{ apiReleaseSet }}
```

如有集合，回應會包含樓層及單位參照和本地化格式化部分。<black>data</black>
為 null 表示所選發布沒有適用 collection。請勿從標示為 <black>unresolved</black>
的祖先 coverage 推斷單位成員關係。

## 時間回溯

{{timeTravelSection:zh-Hant}}

## 溯源

使用 <black>profile=full</black> 取得地址快照 ID、政府識別碼及
<black>attributes.sources</black> 中的發布者資料。支援的 Division
snapshot 提供標準地理關係，不會覆寫 ALS 地址文字或座標。

## 從錯誤中復原

API 會傳回多種錯誤代碼。可按以下方法處理：

- detail 或 units 請求傳回
  `404`，表示所選發布沒有該 ID。請重新檢查 ID 及其發布、網域、批次和時間回溯選擇器。
- `422`
  表示請求無效。請閱讀驗證詳情，再更正選擇器、篩選條件、語言、配對模式、組成部分、搜尋或分頁值。
- `503` 及 <black>snapshot_not_ready</black>
  表示沒有符合選擇的 Address 快照。請在發布後重試或選擇已發布的發布集；不要視作空白結果。
- `503` 及 <black>fts_not_ready</black>
  只適用於索引搜尋，表示搜尋索引未準備好，而非沒有結果。

# ZH-HANS

## 使用地址 API

完整参考请见[地址 API 文档](/docs#tag/Addresses/operation/listAddressesV01)。

本指南说明如何向地址 API 发出请求。API <i>响应</i>的结构及内容，请参阅
[响应结构](?tab=schema)和[响应示例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

## 请求数据

{{experimentalApiWarning:zh-Hans}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 获取地址列表。

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

每个地址均有 <black>id</black>。以 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> 获取单一地址：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 profile=full&
                 locales=en,zh-hant&
                 include=hierarchy
```

**选择版本**

除非指定[批次](saanseoi:zh-hans:definition/cohort/v1)或
[域](saanseoi:zh-hans:definition/domain/v1)，否则 API 会返回默认 <black>saanseoi</black>
域中<black>最新</black>批次的记录。

如要获取此特定发布，请同时提供两个选择器：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

也可直接选择已发布的发布集：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

集合响应会在 <black>meta.apiReleaseSet</black> 及 <black>meta.apiCatalogRevision</black>
记录解析出的发布。

## 搜索地址

搜索端点必须提供查询及匹配模式。搜索接受与集合相同的发布、域、批次、时间回溯、配置文件、语言、层级及 Division 筛选条件，因此可重现已归档的发布视图。

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=427%20KING%27S%20ROAD&
                 match=full-text&
                 locales=en&
                 page[limit]=25
```

请按问题选择匹配模式：

- <black>full-text</black> 在格式化地址及组成部分文本中查找所有查询词元。常见英文缩写如
  <i>BLK</i>、<i>TWR</i> 及 <i>HSE</i> 会与完整写法相互匹配。
- <black>prefix</black> 匹配每个索引词元的开头。
- <black>component</black> 只搜索一个指定组成部分，须提供
  <black>component=formatted|building|number|block|phase|estate|street</black>。
- <black>exact</black> 接受一个楼宇号码词元，例如 <black>427</black> 或
  <black>6A</black>，并匹配源号码断言。
- <black>range</black>
  也会匹配已发布号码范围包含该 token 的地址，但不表示该查询号码独立存在。

例如只搜索屋苑名称：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=WHAMPOA%20ESTATE&
                 match=component&
                 component=estate&
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}
```

查询最多 200 个字符。搜索默认返回 25 条记录，最多 50 条；offset 上限为 1,000。空白结果与
<black>fts_not_ready</black> 不同，后者表示搜索索引不可用。

## 调整响应

{{responseProfilesSection:zh-Hans}}

<black>attributes.geometry</black> 是 GeoJSON 地址位置，使用 <black>profile=map</black>
或 <black>profile=full</black> 时提供。如需不可变的snapshot
ID、发布者标识符及源证据，请使用 <black>profile=full</black>。
<black>attributes.granularity</black> 说明记录识别的范围，并非质量评分。

## 添加语言（`I18n`）

{{localeSelectionSection:zh-Hans}}

本地化地址数据包括完整的
<black>formattedAddress</black>，以及源有提供的楼宇、号码、座、期、屋苑及街道组成部分。缺失的组成部分会是 null 或省略；请勿从另一种语言重建。

## 筛选及分页

{{paginationSection:zh-Hans}}

筛选条件会在分页前缩小列表或搜索结果。使用 <black>filter[dataset]</black>
选择一个贡献数据集，或以标准 Division ID 配合
<black>filter[country]</black>、<black>filter[area]</black> 及
<black>filter[district]</black>：

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}&
                 filter[dataset]=ds-hk-hkgov-dpo-address&
                 filter[district]={divisionId}&
                 profile=map
```

每个地址资源均带有标准 Division 关系标识符。如也需要顶层 <black>included</black>
数组中的相关 Division 资源，请使用 <black>include=hierarchy</black>。

## 获取单位

地址资源的 <black>attributes.address3dCoverage</black>
说明 Address3D 单位集合是直接可用，还是通过已确立或未解析的祖先可用。使用以下请求获取：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}/units?
                 releaseSet={{ apiReleaseSet }}
```

如有集合，响应会包含楼层及单位引用和本地化格式化部分。<black>data</black>
为 null 表示所选发布没有适用 collection。请勿从标示为 <black>unresolved</black>
的祖先 coverage 推断单位成员关系。

## 时间回溯

{{timeTravelSection:zh-Hans}}

## 溯源

使用 <black>profile=full</black> 获取地址快照 ID、政府标识符及
<black>attributes.sources</black> 中的发布者数据。支持的 Division
snapshot 提供标准地理关系，不会覆盖 ALS 地址文本或坐标。

## 从错误中恢复

API 会返回多种错误代码。可按以下方法处理：

- detail 或 units 请求返回
  `404`，表示所选发布没有该 ID。请重新检查 ID 及其发布、域、批次和时间回溯选择器。
- `422`
  表示请求无效。请阅读验证详情，再更正选择器、筛选条件、语言、匹配模式、组成部分、搜索或分页值。
- `503` 及 <black>snapshot_not_ready</black>
  表示没有符合选择的 Address 快照。请在发布后重试或选择已发布的发布集；不要视作空白结果。
- `503` 及 <black>fts_not_ready</black>
  只适用于索引搜索，表示搜索索引未准备好，而非没有结果。
