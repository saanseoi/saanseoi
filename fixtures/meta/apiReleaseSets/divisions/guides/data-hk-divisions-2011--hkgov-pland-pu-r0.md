---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2011--hkgov-pland-pu"
revision: "0"
regionCode: "hk"
cohortKey: "2011"
domainCode: "hkgov-pland-pu"
timeTravelEffectiveAt: "2025-10-01T00:00:00.000Z"
timeTravelKnownAt: "2026-08-24T04:00:46.011Z"
timeTravelCatalogRevision: "catalog-hk-divisions-v0.1-2026-08-24.11"
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

To inspect the source records behind this release, use the
[Divisions source-record endpoint](/docs#tag/Sources/operation/listDivisionSourceRecordsV0).
Pass the required `sourceRelease` query parameter. The response returns the retained
source object under `properties`; these fields are source provenance, not additional
canonical Division fields.

## Requesting data

{{experimentalApiWarning:en}}

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> to get a list of divisions:

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

Every division in the list has an <black>id</black>. Use it with <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> to get one division.

For the same release, keep the domain and cohort in the detail request:

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=full
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

Or you can select the published release directly:

```url
/{{apiFamily}}/{{ apiVersionPath }}?
                 releaseSet={{ apiReleaseSet }}
```

The collection and detail examples below include the cohort and domain for consistency,
even where they do not affect the feature being explained.

## Understanding this domain

This is an independently versioned <black>{{ domainCode }}</black> domain, not a filter
over the default geographic collection. It contains the Planning Department's Planning
Unit and subunit division snapshot and its exact area companion; collection and detail
responses do not mix in records from other domains.

Planning Units and subunits are planning geographies, not District Council districts.
Their identifiers are specific to the Planning Department. Matching provider codes
retain their identity across cohorts, while each cohort records its own hierarchy and
geometry.

The source does not assert every common Divisions field. Those values are null in this
dataset; use its identifiers, names, geometry, and provenance where available. Do not
infer a district relationship or filter on an empty <black>level</black>,
<black>divisionType</black>, or <black>parent</black> field.

## Searching for Divisions

Use <black>GET /{{apiFamily}}/{{ apiVersionPath }}/search</black> to find divisions by
name, alias, or code. The required <black>q</black> parameter accepts partial English
text and Chinese substrings, making it suitable for suggestions as someone types:

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=Sham%20Shui&
                 limit=20
```

Search uses the <black>latest published</black> release in each domain and searches
<black>all domains</black> unless you specify one. It does not select this guide's
<black>{{ cohortKey }}</black> cohort. To search only the domain shown in this guide,
add <black>domain={{ domainCode }}</black>.

Planning Units and subunits have no searchable names, aliases or curated
<black>divisionCode</black> values. Their publisher identifiers are not search codes.
The examples here therefore search across all domains; adding
<black>domain={{ domainCode }}</black> yields no matches for these code-only records.
For example, search for <black>水埗</black> within names such as <black>深水埗</black>
across domains:

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=%E6%B0%B4%E5%9F%97&
                 locale=zh-hant
```

Omit <black>locale</black> to search every available localisation, or supply one locale
to restrict matching. Search uses the singular <black>locale</black> parameter, rather
than the collection's <black>locales</black>. The default region is Hong Kong; use
<black>region=mo</black> for Macao. <black>region=gba</black> selects Hong Kong data.

**Choose what to match**

Names, alternate names and curated <black>divisionCode</black> values are always
searched. English matching is case-insensitive. Chinese queries can contain one or more
characters. Every word or Chinese substring in the query must match; punctuation
separates terms. Wildcards and full-text query operators are not supported.

Ancestor names are excluded by default. Add <black>ancestors=true</black> to also find
divisions through names in their stored hierarchy. The finest division type in this
domain is the planning subunit (<black>planning-subunit</black>). Its planning ancestors
also have no stored names, so <black>ancestors=true</black> cannot make these records
searchable. Use the collection endpoint with <black>domain={{ domainCode }}</black> to
retrieve the subunits and their publisher identifiers.

Direct name, alias and code matches appear before ancestor matches, with exact name/code
matches and name prefixes preferred. Each <black>results</black> entry identifies the
division, its domain and matched locale. <black>match=self</black> means that its own
name, alias or code matched; <black>match=ancestor</black> means that matching also used
ancestor names. Results contain one entry per division and domain, so the same division
can appear in more than one domain. Use its <black>divisionId</black> and
<black>domain</black> with the detail endpoint to retrieve the complete record.

Queries hold at most 120 characters and eight terms. Search returns 20 results by
default and at most 100; set <black>limit</black> to change this. It does not use
collection pagination, <black>profile</black>, or <black>include</black>. Release and
time-travel selectors are also unavailable on search; use the collection and detail
endpoints when selecting a historical release.

## Shaping the Response

{{responseProfilesSection:en}}

## Geometry

Set <black>profile=map</black> or <black>profile=full</black> to include the matching
geometry for this cohort. Unlike the <black>geographic</black> domain, this domain has
no companion geometry to select: when the selected profile asks for geometry, the API
returns its matching default area geometry.

## Adding languages

The original release provides Planning Unit and subunit codes, not names. The API
therefore has no English, Traditional Chinese, or Simplified Chinese names to return,
and does not machine-translate codes. Use <black>locales=null</black> to omit the empty
name value explicitly.

## Filters & Pagination

{{paginationSection:en}}

Filters only work when the selected domain supplies the field being filtered. In this
release, <black>level</black>, <black>divisionType</black>, and <black>parent</black>
are blank, so use the domain and cohort to select the data, then paginate the list.

## Time travel

{{timeTravelSection:en}}

## Switching domains

A [domain](saanseoi:en:definition/domain/v1) is a separate collection within the
Divisions API. Keep domains separate when comparing results: their identities, geometry,
and fields come from different sources.

{{domains:en}}

## Recover from Failure

The API returns a number of error codes. Here is how to recover from each one:

- `404` from a detail request means that the ID is not in the selected release. Recheck
  the ID and its domain, cohort, and time-travel selectors.
- `422` means that the request is invalid. Read the validation details, then correct the
  selector, filter, locale, search, or pagination value before trying again.
- `503` with <black>snapshot_not_ready</black> means that no active division snapshot
  matches the selection. Retry after it is published or choose a published release; do
  not treat the response as an empty result.
- `503` with <black>fts_not_ready</black> applies to search only: search is not ready
  for the latest published releases. Retry after search finalisation completes. An empty
  <black>results</black> array means that there are no matches in the selected published
  domains.

# ZH-HANT

## 使用 Divisions API

完整參考請見[Divisions API 文件](/docs#tag/divisions/GET/divisions/v0)。

本指南說明如何向 Divisions API 發出請求。API
<i>回應</i>的結構及內容，請參閱[回應 schema](?tab=schema)
和[回應範例](?tab=samples)。各節均可獨立閱讀，請直接前往所需內容。

{{apiKeyNote:zh-Hant}}

如要查看此版本背後的來源記錄，請使用
[Divisions 來源記錄端點](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)，並提供必要的
`sourceRelease` 查詢參數。回應會在 `properties`
下傳回保留的來源物件；這些欄位是來源溯源資料，並非額外的標準 Division 欄位。

## 要求資料

{{experimentalApiWarning:zh-Hant}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 取得區劃清單：

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

清單中的每個區劃均有 <black>id</black>。以 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> 取得單一區劃。

如需相同版本，請在詳情請求中保留 domain 及 cohort：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=full
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

下列集合及詳情範例均包含 cohort 及 domain，以保持一致，即使它們不影響正在說明的功能。

## 了解此 domain

此 <black>{{ domainCode }}</black>
domain 獨立進行版本控制，並非預設 geographic 集合的篩選結果。它包含 規劃署規劃單位及分區的區劃 snapshot，以及與其完全對應的面配套資源；集合及詳情回應不會混入其他 domain 的記錄。

規劃單位及分區是規劃地理範圍，並非區議會分區。其識別碼為規劃署專用。相同的發布者代碼會在不同 cohort 保持同一身份，而每個 cohort 各自記錄其層級及幾何資料。

來源並未提供所有常見的 Divisions 欄位。此資料集中相應的值為 null；請使用可用的識別碼、名稱、幾何及溯源資料。請勿推斷地區關係，或以空白的
<black>level</black>、<black>divisionType</black> 或 <black>parent</black> 欄位篩選。

## 搜尋區劃

使用 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/search</black>，按名稱、別名或代碼尋找區劃。必填的
<black>q</black> 參數接受部分英文文字及中文子字串，適合在使用者輸入時提供建議：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=Sham%20Shui&
                 limit=20
```

搜尋使用各 domain 的<black>最新已發布</black>版本，除非指定其中一個 domain，否則會搜尋<black>所有 domain</black>。它不會選取本指南的
<black>{{ cohortKey }}</black> cohort。如只想搜尋本指南所示的 domain，請加入
<black>domain={{ domainCode }}</black>。

規劃單位及分區沒有可供搜尋的名稱、別名或經整理的 <black>divisionCode</black>
值。其發布者識別碼並非搜尋代碼。因此，本節範例會搜尋所有 domain；加入
<black>domain={{ domainCode }}</black>
後，這些只有來源代碼的記錄不會有相符結果。例如，跨 domain 以 <black>水埗</black> 搜尋
<black>深水埗</black> 等名稱中的部分文字：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=%E6%B0%B4%E5%9F%97&
                 locale=zh-hant
```

省略 <black>locale</black>
可搜尋所有可用的語言版本，或指定一種語言以限制配對範圍。搜尋使用單數的
<black>locale</black> 參數，而非集合端點的
<black>locales</black>。預設地區為香港；如要搜尋澳門，請使用
<black>region=mo</black>。<black>region=gba</black> 會選取香港資料。

**選擇配對內容**

名稱、別名及經整理的 <black>divisionCode</black>
值一律納入搜尋。英文配對不區分大小寫。中文查詢可包含一個或多個字元。查詢中的每個詞或中文子字串都必須相符；標點符號會分隔搜尋詞。不支援萬用字元及全文查詢運算子。

預設不搜尋上層區劃的名稱。加入
<black>ancestors=true</black>，亦可透過已儲存層級中的名稱尋找區劃。此 domain 最細的區劃類型是規劃分區（<black>planning-subunit</black>）。其規劃上層區劃亦沒有已儲存的名稱，因此
<black>ancestors=true</black> 無法讓這些記錄變得可供搜尋。請使用集合端點並設定
<black>domain={{ domainCode }}</black>，取得分區及其發布者識別碼。

直接的名稱、別名及代碼相符結果會排在上層名稱相符結果之前，並優先顯示名稱或代碼完全相符及名稱前綴相符的結果。每個
<black>results</black>
項目會標示區劃、所屬 domain 及配對到的語言。<black>match=self</black>
表示其本身的名稱、別名或代碼相符；<black>match=ancestor</black>
表示配對亦使用了上層名稱。每個區劃在每個 domain 最多有一個結果，因此同一區劃可出現在多個 domain。使用其
<black>divisionId</black> 及 <black>domain</black> 呼叫詳情端點，即可取得完整記錄。

查詢最多可包含 120 個字元及八個搜尋詞。搜尋預設傳回 20 個結果，最多 100 個；使用
<black>limit</black> 調整數量。搜尋不使用集合端點的分頁、<black>profile</black> 或
<black>include</black>，亦不支援版本及時間旅行 selector；如要選取歷史版本，請使用集合及詳情端點。

## 設定回應形狀

{{responseProfilesSection:zh-Hant}}

## 幾何資料

設定 <black>profile=map</black> 或
<black>profile=full</black>，以包含此 cohort 的對應幾何資料。與
<black>geographic</black>
domain 不同，此 domain 沒有可供選取的配套幾何資料：當所選 profile 要求幾何資料時，API 會傳回對應的預設面幾何資料。

## 加入語言

原始版本提供規劃單位及分區代碼，而非名稱。因此 API 沒有英文、繁體中文或簡體中文名稱可供傳回，也不會以機器翻譯代碼。使用
<black>locales=null</black>，可明確省略空白的名稱值。

## 篩選及分頁

{{paginationSection:zh-Hant}}

只有所選 domain 提供被篩選的欄位時，篩選才有效。此版本的
<black>level</black>、<black>divisionType</black> 及 <black>parent</black>
均為空白，因此請以 domain 及 cohort 選取資料，再將清單分頁。

## 時間旅行

{{timeTravelSection:zh-Hant}}

## 切換 domain

[domain](saanseoi:zh-hant:definition/domain/v1) 是 Divisions
API 中獨立的集合。比較結果時，應將不同 domain 分開處理：它們的識別、幾何資料和欄位來自不同來源。

{{domains:zh-Hant}}

## 從失敗中復原

API 會傳回多種錯誤碼。以下說明各種情況的復原方法：

- 詳情請求的 `404`
  表示該 ID 不在所選版本中。請重新檢查 ID 及其 domain、cohort 和時間旅行 selector。
- `422`
  表示請求無效。請閱讀驗證詳情，然後修正 selector、篩選條件、locale、搜尋或分頁值，再次嘗試。
- 帶有 <black>snapshot_not_ready</black> 的 `503`
  表示沒有符合選擇條件的 active 區劃 snapshot。請在發布後重試，或選取已發布版本；請勿將此回應視為空結果。
- 帶有 <black>fts_not_ready</black> 的 `503`
  僅適用於搜尋：最新已發布版本的搜尋尚未就緒。請在搜尋準備完成後重試。空的
  <black>results</black> 陣列表示所選的已發布 domain 中沒有相符結果。

# ZH-HANS

## 使用 Divisions API

完整参考请见[Divisions API 文档](/docs#tag/divisions/GET/divisions/v0)。

本指南说明如何向 Divisions API 发出请求。API
<i>响应</i>的结构及内容，请参阅[响应 schema](?tab=schema)
和[响应示例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

如要查看此版本背后的源记录，请使用
[Divisions 源记录端点](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)，并提供必要的
`sourceRelease` 查询参数。响应会在 `properties`
下返回保留的源对象；这些字段是来源溯源数据，并非额外的标准 Division 字段。

## 请求数据

{{experimentalApiWarning:zh-Hans}}

使用 <black>GET /{{apiFamily}}/{{ apiVersionPath }}</black> 获取区划列表：

```url
/{{apiFamily}}/{{ apiVersionPath }}
```

列表中的每个区划均有 <black>id</black>。以 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/{id}</black> 获取单一区划。

如需相同版本，请在详情请求中保留 domain 及 cohort：

```url
/{{apiFamily}}/{{ apiVersionPath }}/{id}?
                 domain={{ domainCode }}&
                 cohort={{ cohortKey }}&
                 profile=full
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

下列集合及详情示例均包含 cohort 及 domain，以保持一致，即使它们不影响正在说明的功能。

## 了解此 domain

此 <black>{{ domainCode }}</black>
domain 独立进行版本控制，并非默认 geographic 集合的筛选结果。它包含 规划署规划单位及分区的区划 snapshot，以及与其完全对应的面配套资源；集合及详情响应不会混入其他 domain 的记录。

规划单位及分区是规划地理范围，并非区议会分区。其标识码为规划署专用。相同的发布者代码会在不同 cohort 保持同一身份，而每个 cohort 各自记录其层级及几何数据。

来源并未提供所有常见的 Divisions 字段。此数据集中相应的值为 null；请使用可用的标识码、名称、几何及溯源数据。请勿推断地区关系，或以空白的
<black>level</black>、<black>divisionType</black> 或 <black>parent</black> 字段筛选。

## 搜索区划

使用 <black>GET
/{{apiFamily}}/{{ apiVersionPath }}/search</black>，按名称、别名或代码查找区划。必填的
<black>q</black> 参数接受部分英文文本及中文子字符串，适合在用户输入时提供建议：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=Sham%20Shui&
                 limit=20
```

搜索使用各 domain 的<black>最新已发布</black>版本，除非指定其中一个 domain，否则会搜索<black>所有 domain</black>。它不会选取本指南的
<black>{{ cohortKey }}</black> cohort。如只想搜索本指南所示的 domain，请添加
<black>domain={{ domainCode }}</black>。

规划单位及分区没有可供搜索的名称、别名或经整理的 <black>divisionCode</black>
值。其发布者标识码并非搜索代码。因此，本节示例会搜索所有 domain；添加
<black>domain={{ domainCode }}</black>
后，这些只有来源代码的记录不会有匹配结果。例如，跨 domain 以 <black>水埗</black> 搜索
<black>深水埗</black> 等名称中的部分文字：

```url
/{{apiFamily}}/{{ apiVersionPath }}/search?
                 q=%E6%B0%B4%E5%9F%97&
                 locale=zh-hant
```

省略 <black>locale</black>
可搜索所有可用的语言版本，或指定一种语言以限制匹配范围。搜索使用单数的
<black>locale</black> 参数，而非集合端点的
<black>locales</black>。默认地区为香港；如要搜索澳门，请使用
<black>region=mo</black>。<black>region=gba</black> 会选取香港数据。

**选择匹配内容**

名称、别名及经整理的 <black>divisionCode</black>
值一律纳入搜索。英文匹配不区分大小写。中文查询可包含一个或多个字符。查询中的每个词或中文子字符串都必须匹配；标点符号会分隔搜索词。不支持通配符及全文查询运算符。

默认不搜索上层区划的名称。添加
<black>ancestors=true</black>，也可通过已存储层级中的名称查找区划。此 domain 最细的区划类型是规划分区（<black>planning-subunit</black>）。其规划上层区划也没有已存储的名称，因此
<black>ancestors=true</black> 无法让这些记录变得可供搜索。请使用集合端点并设置
<black>domain={{ domainCode }}</black>，获取分区及其发布者标识码。

直接的名称、别名及代码匹配结果会排在上层名称匹配结果之前，并优先显示名称或代码完全匹配及名称前缀匹配的结果。每个
<black>results</black>
条目会标示区划、所属 domain 及匹配到的语言。<black>match=self</black>
表示其本身的名称、别名或代码匹配；<black>match=ancestor</black>
表示匹配也使用了上层名称。每个区划在每个 domain 最多有一个结果，因此同一区划可出现在多个 domain。使用其
<black>divisionId</black> 及 <black>domain</black> 调用详情端点，即可获取完整记录。

查询最多可包含 120 个字符及八个搜索词。搜索默认返回 20 个结果，最多 100 个；使用
<black>limit</black> 调整数量。搜索不使用集合端点的分页、<black>profile</black> 或
<black>include</black>，也不支持版本及时间旅行 selector；如要选取历史版本，请使用集合及详情端点。

## 设置响应形状

{{responseProfilesSection:zh-Hans}}

## 几何数据

设置 <black>profile=map</black> 或
<black>profile=full</black>，以包含此 cohort 的对应几何数据。与
<black>geographic</black>
domain 不同，此 domain 没有可供选择的配套几何数据：当所选 profile 要求几何数据时，API 会返回对应的默认面几何数据。

## 添加语言

原始版本提供规划单位及分区代码，而非名称。因此 API 没有英文、繁体中文或简体中文名称可供返回，也不会以机器翻译代码。使用
<black>locales=null</black>，可明确省略空白的名称值。

## 筛选及分页

{{paginationSection:zh-Hans}}

只有所选 domain 提供被筛选的字段时，筛选才有效。此版本的
<black>level</black>、<black>divisionType</black> 及 <black>parent</black>
均为空白，因此请以 domain 及 cohort 选取数据，再将列表分页。

## 时间旅行

{{timeTravelSection:zh-Hans}}

## 切换 domain

[domain](saanseoi:zh-hans:definition/domain/v1) 是 Divisions
API 中独立的集合。比较结果时，应将不同 domain 分开处理：它们的标识、几何数据和字段来自不同来源。

{{domains:zh-Hans}}

## 从失败中恢复

API 会返回多种错误码。以下说明各种情况的恢复方法：

- 详情请求的 `404`
  表示该 ID 不在所选版本中。请重新检查 ID 及其 domain、cohort 和时间旅行 selector。
- `422`
  表示请求无效。请阅读验证详情，然后修正 selector、筛选条件、locale、搜索或分页值，再次尝试。
- 带有 <black>snapshot_not_ready</black> 的 `503`
  表示没有符合选择条件的 active 区划 snapshot。请在发布后重试，或选取已发布版本；请勿将此响应视为空结果。
- 带有 <black>fts_not_ready</black> 的 `503`
  仅适用于搜索：最新已发布版本的搜索尚未就绪。请在搜索准备完成后重试。空的
  <black>results</black> 数组表示所选的已发布 domain 中没有匹配结果。
