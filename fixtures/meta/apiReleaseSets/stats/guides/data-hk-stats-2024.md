---
createdAt: "2026-08-26T15:01:20.265Z"
updatedAt: "2026-08-26T15:01:20.265Z"
apiFamily: "stats"
apiVersion: "api-stats-v0.1"
apiReleaseSet: "data-hk-stats-2024"
revision: "0"
regionCode: "hk"
cohortKey: "2024"
---

# EN

## Using the Statistics API

For the full reference, see the
[Statistics API docs](/docs#tag/Statistics/operation/listDivisionStatisticsV01).

This guide explains how to make requests to the Statistics API. For the shape and
contents of API <i>responses</i>, see the [response schema](?tab=schema) and
[sample responses](?tab=samples). Each section stands on its own, so you can go straight
to the one you need.

{{apiKeyNote:en}}

{{experimentalApiWarning:en}}

### Latest release and observation

In Statistics, “latest” can mean two different things:

1. **Latest release revision** is the newest published edition of a release set. A
   permalink or catalogue revision can instead select an earlier edition.
2. **Latest statistical observation** is the most recent reference period available for
   one statistical series. A reference period is the time that a figure describes.

Unlike Divisions, Statistics contains many series that are updated on different
schedules. A population measure might be annual, another measure quarterly, and another
monthly. A census measure may not have a newer observation at all.

The official Statistics view is therefore:

```url
/stats/v0
```

It returns the latest available observation for each separate series, using the newest
revision of the release set for that observation’s period. It is not a complete history.
For example, if a monthly series has an observation for {{ cohortYear }}-08, a latest
request does not also return its observations for {{ cohortYear }}-01 through
{{ cohortYear }}-07.

Use an exact reference-period filter when you need a particular period:

```url
/stats/v0?
          filter[referencePeriod]={{ cohortKey }}
```

This returns records with the exact reference-period code in the selected release set.
The list endpoint accepts an exact period only; it does not accept date ranges. For
example, <black>{{ cohortYear }}</black> and <black>{{ cohortYear }}-Q1</black> are
separate codes: requesting <black>{{ cohortYear }}</black> does not also return the
first quarter of {{ cohortYear }}.

To retrieve the complete available history for one field, use the multi-period series
endpoint. It returns one geography-value map per reference period in
<black>valuesByReferencePeriod</black>:

```url
/stats/v0/series?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

<black>filter[field]</black> identifies the series to return.
<black>filter[dataset]</black> prevents a field with the same name in another dataset
from making the request ambiguous. The geography filters select one compatible geography
dimension when the field is available for more than one kind or level of geography. The
endpoint returns an ambiguity error instead of combining incompatible geography or
analytical dimensions.

To retrieve a geography-value map for one exact reference period, use the geography
endpoint. It returns the selected period's values keyed by the geography code in
<black>values</black>:

```url
/stats/v0/geographies?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

Unlike <black>/series</black>, <black>/geographies</black> requires
<black>filter[referencePeriod]</black> because it returns one map. Its dataset and
geography filters have the same disambiguation role, and its
<black>meta.geography</black> describes the codes used as keys. For comparison:

| Family                                            | What a request returns by default               |
| ------------------------------------------------- | ----------------------------------------------- |
| Divisions                                         | The latest cohort in the selected domain        |
| Statistics                                        | The latest observation for each separate series |
| Statistics with `referencePeriod={{ cohortKey }}` | Records for exactly that reference period       |

Without selectors, the endpoint uses the latest effective release in the current
[catalogue](saanseoi:en:definition/catalogue/v1). To request this exact release, specify
both <black>cohort</black> and <black>domain</black>:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}
```

To reproduce a result after the catalogue changes, save the fully qualified
<black>links.permalink</black> from a successful response. It records the selected
<black>releaseSet</black> and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1). You can also request
this release set directly with <black>releaseSet={{ apiReleaseSet }}</black>.

## Shaping the Response

A [profile](saanseoi:en:definition/profile/v1) controls how much detail the API returns.
Use <black>default</black> for the core record: its reference period, geography,
breakdowns, values, and any comparability note. Use <black>full</black> when you also
need source-release identity, the publisher's feature reference, and timestamps.

Use the [response schema](?tab=schema) for the complete field list, or the
[sample responses](?tab=samples) to select a profile and compare the response. For
example, request the full provenance view with:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          profile=full
```

### Statistics and related geography

Each statistic keeps its publisher’s reference period, breakdowns, value, precision,
observation status, and reviewed measure meaning. When its geography has been reviewed,
the statistic has a <black>divisionId</black> and a link at
<black>relationships.division</black>. An unreviewed geography has a null relationship;
this means that no division link is available, not that the value is zero.

To add the canonical division resource for each linked statistic:

```url
/stats/v0?
          include=divisions
```

To add the reviewed area variant for each observation’s own geography cohort:

```url
/stats/v0?
          include=areas
```

To request both the division and its area:

```url
/stats/v0?
          include=divisions,areas
```

To request one exact provider area [variant](saanseoi:en:definition/variant/v1):

```url
/stats/v0?
          include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> adds canonical division resources to
<black>included</black>. <black>include=areas</black> adds the reviewed area variant for
the statistic's geography cohort, such as <black>hkgov-censtatd:2016</black>,
<black>hkgov-censtatd:2021</black>, <black>hkgov-censtatd-area</black>, or
<black>hkgov-censtatd-hma</black>.

If a qualified area variant is unavailable, the API returns an error instead of silently
returning different geometry.

## Discovering Statistics

Use the Statistics Registry to find the datasets and exact field names that the records
endpoint accepts. It searches the available catalogue scope, rather than only the one
release resolved for a normal statistics request. Start by searching a word in a measure
or field name or description:

```url
/stats/v0/registry/search?
          q=household
```

A **measure** is the broad concept, such as domestic households. A **field** is the
exact value you can request; it may carry a particular aggregation, unit, or breakdown.
To browse the measures in this release's dataset:

```url
/stats/v0/registry/measures?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district
```

Then browse its fields, or narrow them to one measure:

```url
/stats/v0/registry/fields?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[measure]=domesticHouseholds
```

After choosing a field, inspect where it is available. This shows its reference periods
and geography coverage, and provides a ready-made geography request for each period:

```url
/stats/v0/registry/fields/ds-hk-hkgov-censtatd-division-statistic-population-households-district/domesticHouseholds/availability
```

Use the returned <black>datasetCode</black> and <black>fieldName</black> to request
statistics. For example:

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}
```

Use <black>cohort</black>, <black>releaseSet</black>, or another catalogue selector on a
registry request when you need discovery limited to a particular published view.

## Adding Languages (`I18n`)

The <black>values</black> object uses canonical field names and exact publisher values;
its numbers and codes are not translated. Request <black>include=fields</black> to add
the matching field definitions in <black>included</black>. They contain the localised
field names and descriptions, alongside units, aggregation, and dimensions.

By default, those definitions are returned in English and Traditional Chinese. This is
the same as requesting <black>locales=en,zh-hant</black>. Use <black>locales=*</black>
for every available language, or provide a supported comma-separated list of languages:

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          include=fields&
          locales=en,zh-hant
```

## Filters & Pagination

{{paginationSection:en}}

Filters narrow a statistics list before it is split into pages. Use
<black>filter[dataset]</black> for one source dataset, <black>filter[field]</black> for
one exact field, <black>filter[division]</black> for one canonical division ID, and
<black>filter[referencePeriod]</black> for one exact period code. A record-list request
uses <black>field</black>, not the broader <black>measure</black> code returned by the
Registry.

For example, this requests one field for one division in the {{ cohortKey }} release:

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[division]=106de92f-8a6d-44ba-b2c6-488d181a0deb
```

## Time Travel

Use <black>effectiveAt</black> to select the release that was effective at a particular
time. Use <black>knownAt</black> to select what the API
[catalogue](saanseoi:en:definition/catalogue/v1) knew at that time, or use
<black>catalogRevision</black> for one exact published checkpoint.

Records come from the source releases selected by that immutable release set. A later
source compilation therefore cannot change the result returned by a saved permalink.

## Domains

A [domain](saanseoi:en:definition/domain/v1) is a separate collection within an API
family. <black>{{ domainCode }}</black> is currently the only domain offered within the
Statistics family, so there are no other domains to explore.

# ZH-HANT

## 使用 Statistics API

完整參考請見
[Statistics API 文件](/docs#tag/Statistics/operation/listDivisionStatisticsV01)。

本指南說明如何向 Statistics API 發出請求。API
<i>回應</i>的結構及內容，請參閱[回應 schema](?tab=schema)和[回應範例](?tab=samples)。各節均可獨立閱讀，請直接前往所需內容。

{{apiKeyNote:zh-Hant}}

{{experimentalApiWarning:zh-Hant}}

### 最新發布及觀測

在 Statistics 中，「最新」可以指兩種不同的事物：

1. **最新發布修訂版**是發布集最新發布的版本。永久連結或目錄修訂版也可選取較早的版本。
2. **最新統計觀測**是某個統計序列可用的最近參考期。參考期是數值所描述的時間。

與 Divisions 不同，Statistics 包含許多按不同時間表更新的序列。人口指標可能每年更新，其他指標則可能每季或每月更新。人口普查指標甚至可能完全沒有較新的觀測。

因此，官方 Statistics 檢視為：

```url
/stats/v0
```

它會傳回每個獨立序列最新可用的觀測，採用該觀測所屬參考期之發布集的最新修訂版，而非完整歷史。例如，若某個月度序列有
{{ cohortYear }}-08 的觀測，latest 請求不會同時傳回 {{ cohortYear }}-01 至
{{ cohortYear }}-07 的觀測。

如需特定期間，請使用精確的參考期篩選條件：

```url
/stats/v0?
          filter[referencePeriod]={{ cohortKey }}
```

這會傳回所選發布集中參考期代碼完全相符的記錄。清單端點只接受精確期間，不接受日期範圍。例如，<black>{{ cohortYear }}</black>
和 <black>{{ cohortYear }}-Q1</black> 是不同的代碼：請求 <black>{{ cohortYear }}</black>
不會同時傳回 {{ cohortYear }} 年第一季。

如要取得某個欄位所有可用的歷史資料，請使用多期間序列端點。它會在
<black>valuesByReferencePeriod</black> 中為每個參考期傳回一組地理代碼與數值的對應：

```url
/stats/v0/series?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

<black>filter[field]</black> 指定要傳回的序列。<black>filter[dataset]</black>
可避免其他資料集的同名欄位令請求產生歧義。當欄位適用於多種地理類別或層級時，地理篩選條件會選取一個相容的地理維度。端點會傳回歧義錯誤，而不會合併不相容的地理或分析維度。

如要取得某個精確參考期的地理代碼與數值對應，請使用地理端點。它會在 <black>values</black>
中以地理代碼為鍵，傳回所選期間的數值：

```url
/stats/v0/geographies?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

與 <black>/series</black> 不同，<black>/geographies</black> 必須提供
<black>filter[referencePeriod]</black>，因為它只傳回一組對應。其資料集及地理篩選條件同樣用於消除歧義，而
<black>meta.geography</black> 會說明作為鍵的代碼。比較如下：

| API 系列                                          | 請求預設傳回的內容          |
| ------------------------------------------------- | --------------------------- |
| Divisions                                         | 所選 domain 中最新的 cohort |
| Statistics                                        | 每個獨立序列的最新觀測      |
| Statistics 使用 `referencePeriod={{ cohortKey }}` | 該精確參考期的記錄          |

未提供 selector 時，端點會使用目前[目錄](saanseoi:zh-hant:definition/catalogue/v1)中最新生效的發布。如要請求此確切版本，請同時指定
<black>cohort</black> 及 <black>domain</black>：

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}
```

如要在目錄變更後重現結果，請儲存成功回應中完整限定的
<black>links.permalink</black>。它記錄所選的 <black>releaseSet</black>
及[目錄修訂版](saanseoi:zh-hant:definition/catalogue-revision/v1)。亦可直接使用
<black>releaseSet={{ apiReleaseSet }}</black> 請求此發布集。

## 設定回應形狀

[profile](saanseoi:zh-hant:definition/profile/v1) 控制 API 傳回的詳細程度。使用
<black>default</black>
取得核心記錄：參考期、地理範圍、細分項目、數值及任何可比性備註。如同時需要來源發布識別、發布者的要素參考及時間戳記，請使用
<black>full</black>。

完整欄位清單請見[回應 schema](?tab=schema)，或在[回應範例](?tab=samples)選取 profile 並比較回應。例如，可如此請求完整溯源檢視：

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          profile=full
```

### 統計資料及相關地理範圍

每項統計資料均保留發布者的參考期、細分項目、數值、精確度、觀測狀態及經審核的指標含義。地理範圍經審核後，統計資料會有
<black>divisionId</black>，並在 <black>relationships.division</black>
提供連結。未審核地理範圍的關係為 null；這表示沒有可用的區劃連結，而非數值為零。

為每項已連結的統計資料加入標準區劃資源：

```url
/stats/v0?
          include=divisions
```

為每項觀測加入其自身地理 cohort 已審核的面 variant：

```url
/stats/v0?
          include=areas
```

同時請求區劃及其面資源：

```url
/stats/v0?
          include=divisions,areas
```

請求某個提供者的確切面 [variant](saanseoi:zh-hant:definition/variant/v1)：

```url
/stats/v0?
          include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> 會將標準區劃資源加入
<black>included</black>。<black>include=areas</black>
會加入該統計資料之地理 cohort 已審核的面 variant，例如
<black>hkgov-censtatd:2016</black>、<black>hkgov-censtatd:2021</black>、<black>hkgov-censtatd-area</black>
或 <black>hkgov-censtatd-hma</black>。

如限定的面 variant 不可用，API 會傳回錯誤，不會默默傳回其他幾何資料。

## 尋找統計資料

使用 Statistics
Registry 尋找記錄端點接受的資料集及確切欄位名稱。它會搜尋可用的目錄範圍，而不只限於一般統計請求所解析的單一版本。首先，可搜尋指標或欄位名稱或描述中的字詞：

```url
/stats/v0/registry/search?
          q=household
```

**measure** 是廣義概念，例如家庭住戶。**field**
是可以請求的確切數值，可能包含特定的匯總方式、單位或細分項目。如要瀏覽此版本資料集的指標：

```url
/stats/v0/registry/measures?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district
```

然後瀏覽其欄位，或縮小至某個指標：

```url
/stats/v0/registry/fields?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[measure]=domesticHouseholds
```

選取欄位後，請檢查其可用範圍。這會顯示參考期及地理涵蓋範圍，並為每個期間提供可直接使用的地理請求：

```url
/stats/v0/registry/fields/ds-hk-hkgov-censtatd-division-statistic-population-households-district/domesticHouseholds/availability
```

使用傳回的 <black>datasetCode</black> 及 <black>fieldName</black> 請求統計資料。例如：

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}
```

如需將搜尋範圍限於某個已發布檢視，請在 registry 請求中使用
<black>cohort</black>、<black>releaseSet</black> 或其他目錄 selector。

## 加入語言（`I18n`）

<black>values</black>
物件使用標準欄位名稱及發布者的確切數值；其中的數字及代碼不會翻譯。請求
<black>include=fields</black> 可在 <black>included</black>
加入對應的欄位定義，其中包含本地化欄位名稱及描述，以及單位、匯總方式和維度。

這些定義預設以英文及繁體中文傳回，等同請求 <black>locales=en,zh-hant</black>。使用
<black>locales=*</black> 可取得所有可用語言，或提供以逗號分隔的受支援語言清單：

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          include=fields&
          locales=en,zh-hant
```

## 篩選及分頁

{{paginationSection:zh-Hant}}

篩選會先縮小統計清單，再分頁。使用 <black>filter[dataset]</black>
選取單一來源資料集、<black>filter[field]</black>
選取確切欄位、<black>filter[division]</black> 選取標準區劃 ID，以及
<black>filter[referencePeriod]</black> 選取精確期間代碼。記錄清單請求使用
<black>field</black>，而非 Registry 傳回的較廣義 <black>measure</black> 代碼。

例如，以下請求 {{ cohortKey }} 版本中某個區劃的單一欄位：

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[division]=106de92f-8a6d-44ba-b2c6-488d181a0deb
```

## 時間旅行

使用 <black>effectiveAt</black> 選取某個時間生效的發布。使用 <black>knownAt</black>
選取 API [目錄](saanseoi:zh-hant:definition/catalogue/v1)在該時間已知的內容，或以
<black>catalogRevision</black> 選取某個確切的已發布檢查點。

記錄來自該不可變發布集所選取的來源發布。因此，之後的來源編整不會改變已儲存永久連結所傳回的結果。

## Domains

[domain](saanseoi:zh-hant:definition/domain/v1)
是某個 API 系列內的獨立集合。<black>{{ domainCode }}</black>
目前是 Statistics 系列唯一提供的 domain，因此沒有其他 domain 可供探索。

# ZH-HANS

## 使用 Statistics API

完整参考请见
[Statistics API 文档](/docs#tag/Statistics/operation/listDivisionStatisticsV01)。

本指南说明如何向 Statistics API 发出请求。API
<i>响应</i>的结构及内容，请参阅[响应 schema](?tab=schema)和[响应示例](?tab=samples)。各节均可独立阅读，请直接前往所需内容。

{{apiKeyNote:zh-Hans}}

{{experimentalApiWarning:zh-Hans}}

### 最新发布及观测

在 Statistics 中，“最新”可以指两种不同的事物：

1. **最新发布修订版**是发布集最新发布的版本。永久链接或目录修订版也可选取较早的版本。
2. **最新统计观测**是某个统计序列可用的最近参考期。参考期是数值所描述的时间。

与 Divisions 不同，Statistics 包含许多按不同时间表更新的序列。人口指标可能每年更新，其他指标则可能每季或每月更新。人口普查指标甚至可能完全没有较新的观测。

因此，官方 Statistics 视图为：

```url
/stats/v0
```

它会返回每个独立序列最新可用的观测，采用该观测所属参考期之发布集的最新修订版，而非完整历史。例如，若某个月度序列有
{{ cohortYear }}-08 的观测，latest 请求不会同时返回 {{ cohortYear }}-01 至
{{ cohortYear }}-07 的观测。

如需特定期间，请使用精确的参考期筛选条件：

```url
/stats/v0?
          filter[referencePeriod]={{ cohortKey }}
```

这会返回所选发布集中参考期代码完全相符的记录。列表端点只接受精确期间，不接受日期范围。例如，<black>{{ cohortYear }}</black>
和 <black>{{ cohortYear }}-Q1</black> 是不同的代码：请求 <black>{{ cohortYear }}</black>
不会同时返回 {{ cohortYear }} 年第一季。

如要获取某个字段所有可用的历史数据，请使用多期间序列端点。它会在
<black>valuesByReferencePeriod</black> 中为每个参考期返回一组地理代码与数值的对应：

```url
/stats/v0/series?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

<black>filter[field]</black> 指定要返回的序列。<black>filter[dataset]</black>
可避免其他数据集的同名字段令请求产生歧义。当字段适用于多种地理类别或层级时，地理筛选条件会选取一个兼容的地理维度。端点会返回歧义错误，而不会合并不兼容的地理或分析维度。

如要获取某个精确参考期的地理代码与数值对应，请使用地理端点。它会在 <black>values</black>
中以地理代码为键，返回所选期间的数值：

```url
/stats/v0/geographies?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          filter[geographyKind]=division&
          filter[geographyLevel]=2
```

与 <black>/series</black> 不同，<black>/geographies</black> 必须提供
<black>filter[referencePeriod]</black>，因为它只返回一组对应。其数据集及地理筛选条件同样用于消除歧义，而
<black>meta.geography</black> 会说明作为键的代码。比较如下：

| API 系列                                          | 请求默认返回的内容          |
| ------------------------------------------------- | --------------------------- |
| Divisions                                         | 所选 domain 中最新的 cohort |
| Statistics                                        | 每个独立序列的最新观测      |
| Statistics 使用 `referencePeriod={{ cohortKey }}` | 该精确参考期的记录          |

未提供 selector 时，端点会使用当前[目录](saanseoi:zh-hans:definition/catalogue/v1)中最新生效的发布。如要请求此确切版本，请同时指定
<black>cohort</black> 及 <black>domain</black>：

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}
```

如要在目录变更后重现结果，请保存成功响应中完整限定的
<black>links.permalink</black>。它记录所选的 <black>releaseSet</black>
及[目录修订版](saanseoi:zh-hans:definition/catalogue-revision/v1)。也可直接使用
<black>releaseSet={{ apiReleaseSet }}</black> 请求此发布集。

## 设置响应形状

[profile](saanseoi:zh-hans:definition/profile/v1) 控制 API 返回的详细程度。使用
<black>default</black>
获取核心记录：参考期、地理范围、细分项目、数值及任何可比性备注。如同时需要源发布标识、发布者的要素参考及时间戳，请使用
<black>full</black>。

完整字段列表请见[响应 schema](?tab=schema)，或在[响应示例](?tab=samples)选取 profile 并比较响应。例如，可如此请求完整溯源视图：

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          profile=full
```

### 统计数据及相关地理范围

每项统计数据均保留发布者的参考期、细分项目、数值、精确度、观测状态及经审核的指标含义。地理范围经审核后，统计数据会有
<black>divisionId</black>，并在 <black>relationships.division</black>
提供链接。未审核地理范围的关系为 null；这表示没有可用的区划链接，而非数值为零。

为每项已链接的统计数据添加标准区划资源：

```url
/stats/v0?
          include=divisions
```

为每项观测添加其自身地理 cohort 已审核的面 variant：

```url
/stats/v0?
          include=areas
```

同时请求区划及其面资源：

```url
/stats/v0?
          include=divisions,areas
```

请求某个提供者的确切面 [variant](saanseoi:zh-hans:definition/variant/v1)：

```url
/stats/v0?
          include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> 会将标准区划资源添加到
<black>included</black>。<black>include=areas</black>
会添加该统计数据之地理 cohort 已审核的面 variant，例如
<black>hkgov-censtatd:2016</black>、<black>hkgov-censtatd:2021</black>、<black>hkgov-censtatd-area</black>
或 <black>hkgov-censtatd-hma</black>。

如限定的面 variant 不可用，API 会返回错误，不会默默返回其他几何数据。

## 查找统计数据

使用 Statistics
Registry 查找记录端点接受的数据集及确切字段名称。它会搜索可用的目录范围，而不只限于一般统计请求所解析的单一版本。首先，可搜索指标或字段名称或描述中的字词：

```url
/stats/v0/registry/search?
          q=household
```

**measure** 是广义概念，例如家庭住户。**field**
是可以请求的确切数值，可能包含特定的汇总方式、单位或细分项目。如要浏览此版本数据集的指标：

```url
/stats/v0/registry/measures?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district
```

然后浏览其字段，或缩小至某个指标：

```url
/stats/v0/registry/fields?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[measure]=domesticHouseholds
```

选取字段后，请检查其可用范围。这会显示参考期及地理涵盖范围，并为每个期间提供可直接使用的地理请求：

```url
/stats/v0/registry/fields/ds-hk-hkgov-censtatd-division-statistic-population-households-district/domesticHouseholds/availability
```

使用返回的 <black>datasetCode</black> 及 <black>fieldName</black> 请求统计数据。例如：

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}
```

如需将搜索范围限于某个已发布视图，请在 registry 请求中使用
<black>cohort</black>、<black>releaseSet</black> 或其他目录 selector。

## 添加语言（`I18n`）

<black>values</black>
对象使用标准字段名称及发布者的确切数值；其中的数字及代码不会翻译。请求
<black>include=fields</black> 可在 <black>included</black>
添加对应的字段定义，其中包含本地化字段名称及描述，以及单位、汇总方式和维度。

这些定义默认以英文及繁体中文返回，等同请求 <black>locales=en,zh-hant</black>。使用
<black>locales=*</black> 可获取所有可用语言，或提供以逗号分隔的受支持语言列表：

```url
/stats/v0?
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[referencePeriod]={{ cohortKey }}&
          include=fields&
          locales=en,zh-hant
```

## 筛选及分页

{{paginationSection:zh-Hans}}

筛选会先缩小统计列表，再分页。使用 <black>filter[dataset]</black>
选取单一源数据集、<black>filter[field]</black>
选取确切字段、<black>filter[division]</black> 选取标准区划 ID，以及
<black>filter[referencePeriod]</black> 选取精确期间代码。记录列表请求使用
<black>field</black>，而非 Registry 返回的较广义 <black>measure</black> 代码。

例如，以下请求 {{ cohortKey }} 版本中某个区划的单一字段：

```url
/stats/v0?
          domain={{ domainCode }}&
          cohort={{ cohortKey }}&
          filter[dataset]=ds-hk-hkgov-censtatd-division-statistic-population-households-district&
          filter[field]=domesticHouseholds&
          filter[division]=106de92f-8a6d-44ba-b2c6-488d181a0deb
```

## 时间旅行

使用 <black>effectiveAt</black> 选取某个时间生效的发布。使用 <black>knownAt</black>
选取 API [目录](saanseoi:zh-hans:definition/catalogue/v1)在该时间已知的内容，或以
<black>catalogRevision</black> 选取某个确切的已发布检查点。

记录来自该不可变发布集所选取的源发布。因此，之后的来源编整不会改变已保存永久链接所返回的结果。

## Domains

[domain](saanseoi:zh-hans:definition/domain/v1)
是某个 API 系列内的独立集合。<black>{{ domainCode }}</black>
目前是 Statistics 系列唯一提供的 domain，因此没有其他 domain 可供探索。
