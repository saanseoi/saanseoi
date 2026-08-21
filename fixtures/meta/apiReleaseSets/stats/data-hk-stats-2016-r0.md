---
createdAt: "2026-08-21T00:00:00.000Z"
updatedAt: "2026-08-21T00:00:00.000Z"
apiFamily: "stats"
apiVersion: "api-stats-v0.1"
apiReleaseSet: "data-hk-stats-2016-r0"
revision: "0"
regionCode: "hk"
cohortKey: "2016"
domainCode: "default"
primarySourceRelease: "dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016"
primarySourceReleaseUrl: "/sources/ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district/dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi Statistics API release set for <black>{{cohortKey}}</black> in
  Hong Kong.

## Revision Log

- Intial revisions <black>r{{revision}}</black>.

## Release Scope

This [release](saanseoi:en:definition/release/v1) establishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for the Hong
Kong Statistics API. This first [release set](saanseoi:en:definition/release-set/v1)
contains the independently versioned Census Subdivided Units by District Council
District dataset [snapshot](saanseoi:en:definition/snapshot/v1) for reference period
<black>{{ cohortKey }}</black>.

Its [composition policy](saanseoi:en:definition/composition-policy/v1) treats registered
dataset variants as optional exact-reference members because not every dataset publishes
every period. A later dataset or corrected compilation for 2016 creates a new immutable
revision of this period's release set; it does not alter this saved revision.

## Constituent source releases

{{apiReleaseSetSources:en}}

## Using the Statistics API

The <black>v0.1</black> contract is experimental. Use either <black>GET
/v0.1/stats</black> or <black>GET /v0.1/stats/{id}</black>; the <black>/v0</black>
aliases resolve to the same contract today.

Start with the default statistics collection:

```url
/v0.1/stats
```

### Latest release and observation

There are two independent meanings of “latest”:

1. **Latest release revision** selects the newest revision of a release set, unless a
   permalink or catalogue revision pins an older revision.
2. **Latest statistical observation** selects the newest reference period for one
   statistical series.

Divisions has effectively one temporal series in each domain, so its default selects one
latest cohort or release set. Statistics has many independent series: a population
measure may be annual, another quarterly, another monthly, and a census measure may have
no later observation.

The default Statistics view is therefore:

```url
/v0.1/stats
```

It selects the latest native observation for each independent statistical series from
the newest revision of that observation’s period release set. It is not a complete
history: when a monthly series has a 2026-08 observation, its 2026-01 through 2026-07
observations are older and are not returned by a latest selection.

Temporal selectors make the requested scope explicit:

```url
/v0.1/stats?filter[period]=2026
```

This selects each series’ latest native observation in 2026: an annual 2026 observation
where the series is annual, the latest available quarter where it is quarterly, and the
latest available month where it is monthly.

```url
/v0.1/stats?filter[period]=all
```

This selects all published native periods.

```url
/v0.1/stats?filter[periodCode]=2026-Q1
```

This selects one exact period release set.

| Family                        | Default temporal selection                           |
| ----------------------------- | ---------------------------------------------------- |
| Divisions                     | Latest cohort for the selected domain                |
| Statistics                    | Latest observation of each independent native series |
| Statistics with `period=2026` | Latest native 2026 observation of each series        |
| Statistics with `period=all`  | Complete published history                           |

Without selectors, the endpoint resolves the latest effective release in the current
[catalogue](saanseoi:en:definition/catalogue/v1). To select this exact release, set
<black>cohort</black> and <black>domain</black>:

```url
/v0.1/stats?domain={{ domainCode }}&cohort={{ cohortKey }}
```

To reproduce a result after the catalogue changes, retain the successful response's
fully qualified <black>links.permalink</black>. It records the resolved
<black>releaseSet</black> and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1). You can also select
this release set explicitly with <black>releaseSet={{ apiReleaseSet }}</black>.

### Domains

A [domain](saanseoi:en:definition/domain/v1) is one independently versioned lineage, not
a filter over unrelated releases.

- <black>{{ domainCode }}</black> is the only Statistics domain in v0.1. It contains the
  C&SD dataset snapshots published for this exact reference period and revision.

Every primary resource identifies its <black>datasetCode</black>, so datasets remain
distinguishable inside the domain. Use <black>filter[dataset]</black>,
<black>filter[division]</black>, <black>filter[referencePeriod]</black>, or
<black>filter[measure]</black> to narrow a list:

```url
/v0.1/stats?filter[division]=division-hk-18&filter[referencePeriod]=2016
```

Use <black>page[limit]</black> and <black>page[offset]</black> for pagination. The
maximum page size is 100.

### Statistics and related geography

Each statistic retains its exact publisher reference period, dimensions, values,
precision, observation status, and reviewed measure semantics. A reviewed
<black>divisionId</black> is exposed as <black>relationships.division</black>; records
whose geography has not been reviewed keep that relationship null.

Related resources are opt-in and separately selectable:

```url
/v0.1/stats?include=divisions
/v0.1/stats?include=areas
/v0.1/stats?include=divisions,areas
/v0.1/stats?include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> returns the canonical division resources in
<black>included</black>. <black>include=areas</black> has explicit default handling:
each linked observation resolves the reviewed area variant for its own geography cohort,
such as <black>hkgov-censtatd:2016</black>, <black>hkgov-censtatd:2021</black>,
<black>hkgov-censtatd-area</black>, or <black>hkgov-censtatd-hma</black>. A qualified
area include requests that exact provider [variant](saanseoi:en:definition/variant/v1);
an unavailable variant returns an error rather than silently substituting other
geometry.

### Languages (`I18n`)

By default, reviewed measure names and descriptions are provided in English and
Traditional Chinese. This is equivalent to <black>locales=en,zh-hant</black>. Set
<black>locales=*</black> to request every available locale, or pass another supported
comma-separated list.

### Response Shape

A [profile](saanseoi:en:definition/profile/v1) is a named response shape. The default
profile returns reference periods, dimensions, values, units, statistic kinds,
aggregations, and localised measure definitions. <black>compact</black> is smaller,
while <black>full</black> adds publisher field names, source literals, source-release
identity, and timestamps. See the
[Statistics endpoint documentation](/docs#tag/Statistics/operation/listDivisionStatisticsV01)
for the current parameter and field contract.

### Time Travel

Use <black>effectiveAt</black> to select the release effective at a time. Use
<black>knownAt</black> to select what the API
[catalogue](saanseoi:en:definition/catalogue/v1) knew at a time, and
<black>catalogRevision</black> for one exact published checkpoint. Records are read from
the source releases selected by that immutable release set, so a later source
compilation does not alter a saved permalink.

## Notes and limitations

- This revision contains the Census Subdivided Units by District Council District
  observations whose exact reference period is 2016.
- Division and area includes are returned only for reviewed canonical
  <black>divisionId</black> links. Building groups, major housing estates, and new towns
  without a reviewed Divisions-domain identity remain unlinked.
- Values are exact decimal text or categorical codes, not floating-point approximations.
  The <black>full</black> profile also preserves the original publisher literal.
- Consult the [source-release notes]({{ primarySourceReleaseUrl }}) for
  <black>{{ primarySourceRelease }}</black> and the other contributing source releases
  for publisher-specific definitions and quality decisions.

# ZH-HANT

## 更新紀錄

- 香港山水 | SaanSeoi Statistics API 的首個
  [發布](saanseoi:zh-hant:definition/release/v1)。
- 發布參考期 <black>{{ cohortKey }}</black> 的第一個不可變
  <black>{{ domainCode }}</black> domain 視圖。
- 提供精確的發布者觀測值、經審核的指標定義，以及可分別選取的相關區劃和面
  [配套資源](saanseoi:zh-hant:definition/companion-resource/v1)。

## 發布範圍

此[發布](saanseoi:zh-hant:definition/release/v1)為香港 Statistics API 建立
<black>{{ domainCode }}</black> [domain](saanseoi:zh-hant:definition/domain/v1)。首個
[release set](saanseoi:zh-hant:definition/release-set/v1) 包含參考期
<black>{{ cohortKey }}</black> 的按區議會分區劃分的分間單位人口普查資料集
[snapshot](saanseoi:zh-hant:definition/snapshot/v1)。

其[組合政策](saanseoi:zh-hant:definition/composition-policy/v1)把已登記資料集 variant 列為可選的精確參考期成員，因為並非每個資料集都會發布每個時期。其後加入 2016 資料集或修訂彙編時，只會建立此參考期 release
set 的新不可變 revision，不會改變本 revision。

## 組成來源發布

{{apiReleaseSetSources:zh-Hant}}

## 使用 Statistics API

<black>v0.1</black> 合約仍屬實驗性質。請使用 <black>GET /v0.1/stats</black> 或
<black>GET /v0.1/stats/{id}</black>；現時 <black>/v0</black> 別名解析至相同合約。

先從預設統計 collection 開始：

```url
/v0.1/stats
```

### 最新發布與觀測值

「最新」有兩個獨立的意義：

1. **最新 release revision** 會選取 release
   set 的最新 revision，除非 permalink 或 catalogue revision 固定了較早的 revision。
2. **最新統計觀測值** 會選取一個統計序列的最新參考期。

Divisions 在每個 domain 實際上只有一個時間序列，因此預設會選取一個最新 cohort 或 release
set。Statistics 則有多個獨立序列：人口指標可以是年度、季度或月度，而人口普查指標未必有較新的觀測值。

Statistics 的預設檢視因此是：

```url
/v0.1/stats
```

它會從該觀測期 release
set 的最新 revision，為每個獨立統計序列選取最新的原生觀測值。這不是完整歷史：若月度序列已有 2026-08 觀測值，2026-01 至 2026-07 均屬較早觀測值，不會由最新選取回傳。

時間 selector 會清楚表明所要求的範圍：

```url
/v0.1/stats?filter[period]=2026
```

此選項會為每個序列選取 2026 年內最新的原生觀測值：年度序列選取 2026 年觀測值；季度序列選取最新可用季度；月度序列選取最新可用月份。

```url
/v0.1/stats?filter[period]=all
```

此選項會選取所有已發布的原生參考期。

```url
/v0.1/stats?filter[periodCode]=2026-Q1
```

此選項會選取一個確切的參考期 release set。

| Family                      | 預設時間選取                   |
| --------------------------- | ------------------------------ |
| Divisions                   | 所選 domain 的最新 cohort      |
| Statistics                  | 每個獨立原生序列的最新觀測值   |
| `period=2026` 的 Statistics | 每個序列最新的 2026 原生觀測值 |
| `period=all` 的 Statistics  | 完整已發布歷史                 |

沒有 selector 時，端點會在目前 [catalogue](saanseoi:zh-hant:definition/catalogue/v1)
中解析至最新有效 release。要選取此確切 release，請設定 <black>cohort</black> 和
<black>domain</black>：

```url
/v0.1/stats?domain={{ domainCode }}&cohort={{ cohortKey }}
```

如要在 catalogue 改變後重現結果，請保留成功回應中完整的
<black>links.permalink</black>。它會記錄已解析的 <black>releaseSet</black> 和
[catalogue revision](saanseoi:zh-hant:definition/catalogue-revision/v1)。你亦可用
<black>releaseSet={{ apiReleaseSet }}</black> 明確選取這個 release set。

### Domains

[domain](saanseoi:zh-hant:definition/domain/v1)是一條可獨立版本化的譜系，並非對無關 release 的篩選器。

- <black>{{ domainCode }}</black> 是 v0.1 唯一的 Statistics
  domain，包含本精確參考期及 revision 已發布的政府統計處資料集 snapshot。

每個主要資源均標示 <black>datasetCode</black>，因此 domain 內的資料集仍可清楚區分。使用
<black>filter[dataset]</black>、<black>filter[division]</black>、
<black>filter[referencePeriod]</black> 或 <black>filter[measure]</black> 縮小列表：

```url
/v0.1/stats?filter[division]=division-hk-18&filter[referencePeriod]=2016
```

使用 <black>page[limit]</black> 和 <black>page[offset]</black> 分頁；每頁上限為 100。

### 統計與相關地理

每項統計保留精確的發布者參考期、維度、數值、精度、觀測狀態及經審核的指標語義。經審核的
<black>divisionId</black> 會以 <black>relationships.division</black>
公開；尚未完成地理審核的記錄會保留 null relationship。

相關資源須明確選取，並可分別請求：

```url
/v0.1/stats?include=divisions
/v0.1/stats?include=areas
/v0.1/stats?include=divisions,areas
/v0.1/stats?include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> 在 <black>included</black> 回傳標準區劃資源。
<black>include=areas</black>
具明確預設處理：每項已連結觀測會按本身的地理 cohort 解析至經審核的面 variant，例如
<black>hkgov-censtatd:2016</black>、<black>hkgov-censtatd:2021</black>、
<black>hkgov-censtatd-area</black> 或 <black>hkgov-censtatd-hma</black>。限定的 area
include 會請求該確切發布者
[variant](saanseoi:zh-hant:definition/variant/v1)；如不可用會回傳錯誤，絕不靜默改用其他幾何。

### 語言（`I18n`）

預設提供英文及繁體中文的經審核指標名稱和描述，等同
<black>locales=en,zh-hant</black>。設定 <black>locales=*</black>
可請求所有可用語言地區，或傳入另一個受支援的逗號分隔清單。

### 回應形狀

[profile](saanseoi:zh-hant:definition/profile/v1)是具名稱的回應形狀。預設 profile 回傳參考期、維度、數值、單位、統計類型、聚合方式及本地化指標定義。
<black>compact</black> 較精簡；<black>full</black>
會加入發布者欄位名稱、來源原文值、來源發布識別及時間戳。請參閱
[Statistics endpoint documentation](/docs#tag/Statistics/operation/listDivisionStatisticsV01)
了解目前的參數及欄位合約。

### 時間旅行

使用 <black>effectiveAt</black> 選取某時間有效的 release；使用 <black>knownAt</black>
選取 API [catalogue](saanseoi:zh-hant:definition/catalogue/v1) 在某時間所知的內容；使用
<black>catalogRevision</black> 選取確切的已發布 checkpoint。記錄會從該不可變 release
set 所選的來源發布讀取，因此較後的來源彙編不會改變已保存的 permalink。

## 備註與限制

- 本 revision 包含精確參考期為 2016 的按區議會分區劃分的分間單位人口普查觀測值。
- 只有具經審核標準 <black>divisionId</black> 連結的記錄才會回傳 division 和 area
  include。未有經審核 Divisions-domain 識別的屋宇組別、大型屋苑及新市鎮仍不會連結。
- 數值是精確十進制文字或分類代碼，並非浮點近似值。<black>full</black>
  profile 亦保留發布者原文值。
- 請參閱 <black>{{ primarySourceRelease }}</black>
  的[來源發布說明]({{ primarySourceReleaseUrl }})及其他貢獻來源發布，了解發布者特有的定義及品質決定。

# ZH-HANS

## 更新记录

- 香港山水 | SaanSeoi Statistics API 的首个
  [发布](saanseoi:zh-hans:definition/release/v1)。
- 发布参考期 <black>{{ cohortKey }}</black> 的第一个不可变
  <black>{{ domainCode }}</black> domain 视图。
- 提供精确的发布者观测值、经审核的指标定义，以及可分别选取的相关区划和面
  [配套资源](saanseoi:zh-hans:definition/companion-resource/v1)。

## 发布范围

此[发布](saanseoi:zh-hans:definition/release/v1)为香港 Statistics API 建立
<black>{{ domainCode }}</black> [domain](saanseoi:zh-hans:definition/domain/v1)。首个
[release set](saanseoi:zh-hans:definition/release-set/v1) 包含参考期
<black>{{ cohortKey }}</black> 的按区议会分区划分的分间单位人口普查数据集
[snapshot](saanseoi:zh-hans:definition/snapshot/v1)。

其[组合政策](saanseoi:zh-hans:definition/composition-policy/v1)把已登记数据集 variant 列为可选的精确参考期成员，因为并非每个数据集都会发布每个时期。其后加入 2016 数据集或修订汇编时，只会建立此参考期 release
set 的新不可变 revision，不会改变本 revision。

## 组成来源发布

{{apiReleaseSetSources:zh-Hans}}

## 使用 Statistics API

<black>v0.1</black> 合约仍属实验性质。请使用 <black>GET /v0.1/stats</black> 或
<black>GET /v0.1/stats/{id}</black>；现时 <black>/v0</black> 别名解析至相同合约。

先从默认统计 collection 开始：

```url
/v0.1/stats
```

### 最新发布与观测值

“最新”有两个独立的含义：

1. **最新 release revision** 会选取 release
   set 的最新 revision，除非 permalink 或 catalogue revision 固定了较早的 revision。
2. **最新统计观测值** 会选取一个统计序列的最新参考期。

Divisions 在每个 domain 实际上只有一个时间序列，因此默认会选取一个最新 cohort 或 release
set。Statistics 则有多个独立序列：人口指标可以是年度、季度或月度，而人口普查指标未必有较新的观测值。

Statistics 的默认视图因此是：

```url
/v0.1/stats
```

它会从该观测期 release
set 的最新 revision，为每个独立统计序列选取最新的原生观测值。这不是完整历史：若月度序列已有 2026-08 观测值，2026-01 至 2026-07 均属较早观测值，不会由最新选取返回。

时间 selector 会清楚表明所要求的范围：

```url
/v0.1/stats?filter[period]=2026
```

此选项会为每个序列选取 2026 年内最新的原生观测值：年度序列选取 2026 年观测值；季度序列选取最新可用季度；月度序列选取最新可用月份。

```url
/v0.1/stats?filter[period]=all
```

此选项会选取所有已发布的原生参考期。

```url
/v0.1/stats?filter[periodCode]=2026-Q1
```

此选项会选取一个确切的参考期 release set。

| Family                      | 默认时间选取                   |
| --------------------------- | ------------------------------ |
| Divisions                   | 所选 domain 的最新 cohort      |
| Statistics                  | 每个独立原生序列的最新观测值   |
| `period=2026` 的 Statistics | 每个序列最新的 2026 原生观测值 |
| `period=all` 的 Statistics  | 完整已发布历史                 |

没有 selector 时，端点会在目前 [catalogue](saanseoi:zh-hans:definition/catalogue/v1)
中解析至最新有效 release。要选取此确切 release，请设置 <black>cohort</black> 和
<black>domain</black>：

```url
/v0.1/stats?domain={{ domainCode }}&cohort={{ cohortKey }}
```

如要在 catalogue 改变后重现结果，请保留成功响应中完整的
<black>links.permalink</black>。它会记录已解析的 <black>releaseSet</black> 和
[catalogue revision](saanseoi:zh-hans:definition/catalogue-revision/v1)。你也可用
<black>releaseSet={{ apiReleaseSet }}</black> 明确选取这个 release set。

### Domains

[domain](saanseoi:zh-hans:definition/domain/v1)是一条可独立版本化的谱系，并非对无关 release 的筛选器。

- <black>{{ domainCode }}</black> 是 v0.1 唯一的 Statistics
  domain，包含本精确参考期及 revision 已发布的政府统计处数据集 snapshot。

每个主要资源均标示 <black>datasetCode</black>，因此 domain 内的数据集仍可清楚区分。使用
<black>filter[dataset]</black>、<black>filter[division]</black>、
<black>filter[referencePeriod]</black> 或 <black>filter[measure]</black> 缩小列表：

```url
/v0.1/stats?filter[division]=division-hk-18&filter[referencePeriod]=2016
```

使用 <black>page[limit]</black> 和 <black>page[offset]</black> 分页；每页上限为 100。

### 统计与相关地理

每项统计保留精确的发布者参考期、维度、数值、精度、观测状态及经审核的指标语义。经审核的
<black>divisionId</black> 会以 <black>relationships.division</black>
公开；尚未完成地理审核的记录会保留 null relationship。

相关资源须明确选取，并可分别请求：

```url
/v0.1/stats?include=divisions
/v0.1/stats?include=areas
/v0.1/stats?include=divisions,areas
/v0.1/stats?include=areas:hkgov-censtatd:2021
```

<black>include=divisions</black> 在 <black>included</black> 返回标准区划资源。
<black>include=areas</black>
具明确默认处理：每项已链接观测会按本身的地理 cohort 解析至经审核的面 variant，例如
<black>hkgov-censtatd:2016</black>、<black>hkgov-censtatd:2021</black>、
<black>hkgov-censtatd-area</black> 或 <black>hkgov-censtatd-hma</black>。限定的 area
include 会请求该确切发布者
[variant](saanseoi:zh-hans:definition/variant/v1)；如不可用会返回错误，绝不静默改用其他几何。

### 语言（`I18n`）

默认提供英文及繁体中文的经审核指标名称和描述，等同
<black>locales=en,zh-hant</black>。设置 <black>locales=*</black>
可请求所有可用语言地区，或传入另一个受支持的逗号分隔清单。

### 响应形状

[profile](saanseoi:zh-hans:definition/profile/v1)是具名称的响应形状。默认 profile 返回参考期、维度、数值、单位、统计类型、聚合方式及本地化指标定义。
<black>compact</black> 较精简；<black>full</black>
会加入发布者字段名称、来源原文值、来源发布标识及时间戳。请参阅
[Statistics endpoint documentation](/docs#tag/Statistics/operation/listDivisionStatisticsV01)
了解目前的参数及字段合约。

### 时间旅行

使用 <black>effectiveAt</black> 选取某时间有效的 release；使用 <black>knownAt</black>
选取 API [catalogue](saanseoi:zh-hans:definition/catalogue/v1) 在某时间所知的内容；使用
<black>catalogRevision</black> 选取确切的已发布 checkpoint。记录会从该不可变 release
set 所选的来源发布读取，因此较后的来源汇编不会改变已保存的 permalink。

## 备注与限制

- 本 revision 包含精确参考期为 2016 的按区议会分区划分的分间单位人口普查观测值。
- 只有具经审核标准 <black>divisionId</black> 链接的记录才会返回 division 和 area
  include。未有经审核 Divisions-domain 标识的屋宇组别、大型屋苑及新市镇仍不会链接。
- 数值是精确十进制文本或分类代码，并非浮点近似值。<black>full</black>
  profile 亦保留发布者原文值。
- 请参阅 <black>{{ primarySourceRelease }}</black>
  的[来源发布说明]({{ primarySourceReleaseUrl }})及其他贡献来源发布，了解发布者特有的定义及质量决定。
