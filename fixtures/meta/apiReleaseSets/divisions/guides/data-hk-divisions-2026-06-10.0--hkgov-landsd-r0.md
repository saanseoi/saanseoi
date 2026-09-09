---
createdAt: "2026-08-20T00:00:00.000Z"
updatedAt: "2026-08-25T00:00:00.000Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2026-06-10.0--hkgov-landsd"
revision: "0"
regionCode: "hk"
cohortKey: "2026-06-10.0"
domainCode: "hkgov-landsd"
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
source object under `rawProperties`; these fields are source provenance, not additional
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

The examples below include the cohort and domain for consistency, even where they do not
affect the feature being explained.

## Understanding this domain

This is an independently versioned <black>{{ domainCode }}</black> domain, not a filter
over the default geographic collection. It contains the Lands Department settlement
place-name division snapshot; records from other domains are never mixed into the
result.

This domain contains settlement place names only. Hydrographic and Topographic source
records remain outside the Divisions projection.

The source does not assert every common Divisions field. Those values are null in this
dataset; use its identifiers, names, geometry, and provenance where available. Do not
infer a district relationship or filter on an empty <black>level</black>,
<black>divisionType</black>, or <black>parent</black> field.

## Shaping the Response

{{responseProfilesSection:en}}

## Geometry

Each published settlement has Point geometry. Set <black>profile=map</black> or
<black>profile=full</black> to include the matching geometry for this cohort. Unlike the
<black>geographic</black> domain, this domain has no companion geometry to select: when
the selected profile asks for geometry, the API returns its matching default Point
geometry.

## Adding languages

The publisher provides English and Traditional Chinese names. Simplified Chinese names
are machine-translated during local import and remain unverified until reviewed. The
default name selection is <black>locales=en,zh-hant</black>; request
<black>locales=en,zh-hant,zh-hans</black> to include Simplified Chinese.
<black>locales=*</black> returns every available locale, while
<black>locales=null</black> omits names.

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

如要查看此版本背後的來源記錄，請使用
[Divisions 來源記錄端點](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)，並提供必要的
`sourceRelease` 查詢參數。回應會在 `rawProperties`
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

下列範例一律包含 cohort 及 domain，以保持一致，即使它們不影響正在說明的功能。

## 了解此 domain

此 <black>{{ domainCode }}</black>
domain 獨立進行版本控制，並非預設 geographic 集合的篩選結果。它包含 地政總署居住地地名的區劃 snapshot；結果絕不混入其他 domain 的記錄。

此 domain 只包含居住地地名。水文及地形來源記錄不屬於 Divisions 投影。

來源並未提供所有常見的 Divisions 欄位。此資料集中相應的值為 null；請使用可用的識別碼、名稱、幾何及溯源資料。請勿推斷地區關係，或以空白的
<black>level</black>、<black>divisionType</black> 或 <black>parent</black> 欄位篩選。

## 設定回應形狀

{{responseProfilesSection:zh-Hant}}

## 幾何資料

每個已發布居住地均有 Point 幾何資料。設定 <black>profile=map</black> 或
<black>profile=full</black>，以包含此 cohort 的對應幾何資料。與
<black>geographic</black>
domain 不同，此 domain 沒有可供選取的配套幾何資料：當所選 profile 要求幾何資料時，API 會傳回對應的預設 Point 幾何資料。

## 加入語言

發布者提供英文及繁體中文名稱。簡體中文名稱在本地匯入時以機器翻譯產生，審核前仍屬未驗證。預設名稱選擇為
<black>locales=en,zh-hant</black>；請求 <black>locales=en,zh-hant,zh-hans</black>
可包含簡體中文。<black>locales=*</black> 傳回所有可用語言，而
<black>locales=null</black> 則省略名稱。

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
  表示請求無效。請閱讀驗證詳情，然後修正 selector、篩選條件、locale 或分頁值，再次嘗試。
- 帶有 <black>snapshot_not_ready</black> 的 `503`
  表示沒有符合選擇條件的 active 區劃 snapshot。請在發布後重試，或選取已發布版本；請勿將此回應視為空結果。

# ZH-HANS

## 使用 Divisions API

完整参考请见[Divisions API 文档](/docs#tag/divisions/GET/divisions/v0)。

本指南说明如何向 Divisions API 发出请求。API
<i>响应</i>的结构及内容，请参阅[响应 schema](?tab=schema)
和[响应示例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

如要查看此版本背后的源记录，请使用
[Divisions 源记录端点](/docs#tag/Sources/operation/listDivisionSourceRecordsV0)，并提供必要的
`sourceRelease` 查询参数。响应会在 `rawProperties`
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

下列示例一律包含 cohort 及 domain，以保持一致，即使它们不影响正在说明的功能。

## 了解此 domain

此 <black>{{ domainCode }}</black>
domain 独立进行版本控制，并非默认 geographic 集合的筛选结果。它包含 地政总署居住地地名的区划 snapshot；结果绝不混入其他 domain 的记录。

此 domain 只包含居住地地名。水文及地形源记录不属于 Divisions 投影。

来源并未提供所有常见的 Divisions 字段。此数据集中相应的值为 null；请使用可用的标识码、名称、几何及溯源数据。请勿推断地区关系，或以空白的
<black>level</black>、<black>divisionType</black> 或 <black>parent</black> 字段筛选。

## 设置响应形状

{{responseProfilesSection:zh-Hans}}

## 几何数据

每个已发布居住地均有 Point 几何数据。设置 <black>profile=map</black> 或
<black>profile=full</black>，以包含此 cohort 的对应几何数据。与
<black>geographic</black>
domain 不同，此 domain 没有可供选择的配套几何数据：当所选 profile 要求几何数据时，API 会返回对应的默认 Point 几何数据。

## 添加语言

发布者提供英文及繁体中文名称。简体中文名称在本地导入时以机器翻译生成，审核前仍属未验证。默认名称选择为
<black>locales=en,zh-hant</black>；请求 <black>locales=en,zh-hant,zh-hans</black>
可包含简体中文。<black>locales=*</black> 返回所有可用语言，而
<black>locales=null</black> 则省略名称。

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
  表示请求无效。请阅读验证详情，然后修正 selector、筛选条件、locale 或分页值，再次尝试。
- 带有 <black>snapshot_not_ready</black> 的 `503`
  表示没有符合选择条件的 active 区划 snapshot。请在发布后重试，或选取已发布版本；请勿将此响应视为空结果。
