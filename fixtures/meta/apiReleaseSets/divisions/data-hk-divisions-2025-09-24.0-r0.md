---
createdAt: "2026-07-06T14:47:17.924Z"
updatedAt: "2026-07-06T14:47:17.924Z"
apiFamily: "divisions"
apiVersion: "api-divisions-v0.1"
apiReleaseSet: "data-hk-divisions-2025-09-24.0"
regionCode: "hk"
cohortKey: "2025-09-24.0"
domainCode: "geographic"
primarySourceRelease: "dr-hk-overture-division-2025-09-24.0"
primarySourceReleaseUrl: "/sources/ds-hk-overture-division/dr-hk-overture-division-2025-09-24.0"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi Divisions API release for Hong Kong
- Publishes the first immutable `{{ domainCode }}` domain view for cohort
  `{{ cohortKey }}`.
- Provides canonical division records with separately selectable area and boundary
  [companion resources](saanseoi:en:definition/companion-resource/v1). Geometry remains
  provider-specific; it is never silently merged or substituted.

## Release scope

This [release](saanseoi:en:definition/release/v1) establishes the
<black>{{ domainCode }}</black> [domain](saanseoi:en:definition/domain/v1) for the Hong
Kong Divisions API. Its primary [collection](saanseoi:en:definition/collection/v1) is
the Overture division [snapshot](saanseoi:en:definition/snapshot/v1) for this
[cohort](saanseoi:en:definition/cohort/v1). It is one
[release set](saanseoi:en:definition/release-set/v1), not a claim that all division
datasets form one collection.

Its [composition policy](saanseoi:en:definition/composition-policy/v1) requires Overture
geometry from the same Overture release version. Independently published district-area
[variants](saanseoi:en:definition/variant/v1) may instead select an earlier eligible
date. The [Hong Kong extract](saanseoi:en:note/hong-kong-extract/v1) also adds the
reviewed PRC country anchor required for parent and boundary references. The
referent-only record has names and identity but no country geometry, so it does not add
a PRC coverage claim.

## Constituent source releases

{{apiReleaseSetSources:en}}

## Using the Divisions API

The <black>v0.1</black> contract is experimental. Use either <black>GET
/v0.1/divisions</black> or <black>GET /v0.1/divisions/{id}</black>; the
<black>/v0</black> aliases resolve to the same contract today.

Start with the default Overture collection:

```url
/v0.1/divisions
```

Without selectors, the endpoint resolves the latest effective release in the current
[catalogue](saanseoi:en:definition/catalogue/v1). To select this exact effective cohort,
set <black>cohort</black> and <black>domain</black>:

```url
/v0.1/divisions?domain={{ domainCode }}&cohort={{ cohortKey }}
```

To reproduce a result after the catalogue changes, retain the successful response's
fully qualified <black>links.permalink</black>. It records the resolved
<black>releaseSet</black> and
[catalogue revision](saanseoi:en:definition/catalogue-revision/v1), so the same request
can be replayed rather than resolving to a newer release. You can also select this
release set explicitly with <black>releaseSet={{ apiReleaseSet }}</black>.

### Domains

A [domain](saanseoi:en:definition/domain/v1) is one independently versioned lineage of
division records, not a filter over a combined table. Records and hierarchy
relationships from different domains are not mixed.

- <black>{{ domainCode }}</black> is the default geographical/administrative collection.
  Use it for the release documented here.
- <black>hkgov-pland-pu</black> is the Planning Department's _Planning Unit_ collection.
- <black>hkgov-pland-new-town</black> is the Planning Department's _New Town_
  collection.

You may select a planning collection explicitly, for example:

```url
/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021
/v0.1/divisions?domain=hkgov-pland-new-town&cohort=2021
```

Those domains have their own cohorts and release sets; they are not members of this
Overture release. A request succeeds only where the selected catalogue contains a
release for that domain and cohort.

### Geometry and hierarchy

Division (point) geometry belongs to the division record itself: request
<black>profile=map</black> or <black>profile=full</black> to include it. Areas and
boundaries are different, separately stored companion resources, and are opt-in through
plural <black>include</black> values:

```url
/v0.1/divisions?include=hierarchy
/v0.1/divisions?include=areas
/v0.1/divisions?include=boundaries
/v0.1/divisions?include=areas:hkgov-had
/v0.1/divisions?include=areas:hkgov-censtatd:2021&transform=simplified
```

An unqualified area or boundary uses the selected domain's configured default. A
qualified value requests that exact provider variant; unavailable variants return an
error rather than falling back to another source. Area and boundary resources are
returned in <black>included</black>, with relationships from their primary divisions.

Use <black>filter[level]</black>, <black>filter[divisionType]</black>, or
<black>filter[parent]</black> to narrow a list, and <black>page[limit]</black> and
<black>page[offset]</black> for pagination. The maximum page size is 100.

### Languages (`I18n`)

By default, names are provided in English and Traditional Chinese. This is equivalent to
<black>locales=en,zh-hant</black>. Set <black>locales=*</black> to request every
available locale, or pass another supported comma-separated list.

### Response Shape

A [profile](saanseoi:en:definition/profile/v1) is a named response shape. The default
profile returns common division fields; <black>compact</black> is smaller,
<black>map</black> adds point geometry, and <black>full</black> adds both geometry and
provenance-rich fields. See the
[Divisions endpoint documentation](/docs#tag/Divisions/operation/listDivisions) for the
current parameter and field contract. Keep the returned permalink when the resolved
profile matters to a saved result.

### Time Travel

Use <black>effectiveAt</black> to select the release effective at a time. Use
<black>knownAt</black> to select what the API
[catalogue](saanseoi:en:definition/catalogue/v1) knew at a time, and
<black>catalogRevision</black> for one exact published checkpoint. Together, these
selectors distinguish a later backfill from the view that was available when an earlier
request was made.

## Notes and limitations

- This release establishes the Overture domain; it does not make planning units or new
  towns interchangeable with Overture divisions.
- The primary division geometry is available through the <black>map</black> and
  <black>full</black> profiles. Area and boundary companion resources are separately
  selected with <black>include</black>; their coverage and availability vary by variant.
- The release preserves source provenance and exposes the selected domain, cohort, and
  catalogue in response metadata. Consult the [source-release
  notes]({{ primarySourceReleaseUrl }}) for <black>{{ primarySourceRelease }}</black>
  for field compatibility and provider-specific quality decisions.

# ZH-HANT

## 更新紀錄

- 香港山水 | SaanSeoi Divisions
  API 的首個[發布](saanseoi:zh-hant:definition/release/v1)。
- 發布 cohort <black>{{ cohortKey }}</black> 的第一個不可變
  <black>{{ domainCode }}</black> domain 視圖。
- 提供標準區劃記錄，以及可分別選取的面和邊界
  [配套資源](saanseoi:zh-hant:definition/companion-resource/v1)。幾何保持發布者特有；絕不會被靜默合併或替代。

## 發布範圍

此[發布](saanseoi:zh-hant:definition/release/v1)為香港 Divisions API 建立
<black>{{ domainCode }}</black> [domain](saanseoi:zh-hant:definition/domain/v1)。其主要
[collection](saanseoi:zh-hant:definition/collection/v1)是此
[cohort](saanseoi:zh-hant:definition/cohort/v1)的 Overture 區劃
[snapshot](saanseoi:zh-hant:definition/snapshot/v1)。它是一個
[release set](saanseoi:zh-hant:definition/release-set/v1)，並不表示所有區劃資料集都構成同一 collection。

其
[composition policy](saanseoi:zh-hant:definition/composition-policy/v1)要求 Overture 幾何必須來自同一 Overture
release version。獨立發布的地區面
[variants](saanseoi:zh-hant:definition/variant/v1)則可選取較早而合資格的日期。
[Hong Kong extract](saanseoi:zh-hant:note/hong-kong-extract/v1)亦加入用於解析父層級與邊界參照的經審核中國國家 anchor。這個只作參照的記錄有名稱和身分，卻沒有國家幾何，因此不構成中國覆蓋範圍的聲稱。

## 組成來源發布

{{apiReleaseSetSources:zh-Hant}}

## 使用 Divisions API

<black>v0.1</black> 合約仍屬實驗性質。請使用 <black>GET /v0.1/divisions</black> 或
<black>GET /v0.1/divisions/{id}</black>；現時 <black>/v0</black> 別名解析至相同合約。

先從預設 Overture collection 開始：

```url
/v0.1/divisions
```

沒有 selector 時，端點會在目前的
[catalogue](saanseoi:zh-hant:definition/catalogue/v1)解析至最新的有效 release。要選取此確切有效 cohort，請設定
<black>cohort</black> 和 <black>domain</black>：

```url
/v0.1/divisions?domain={{ domainCode }}&cohort={{ cohortKey }}
```

如要在 catalogue 改變後重現結果，請保留成功回應中完整的
<black>links.permalink</black>。它會記錄已解析的 <black>releaseSet</black> 和
[catalogue revision](saanseoi:zh-hant:definition/catalogue-revision/v1)，因此可重播相同請求，而非解析到較新的 release。你亦可用
<black>releaseSet={{ apiReleaseSet }}</black> 明確選取這個 release set。

### Domains

[domain](saanseoi:zh-hant:definition/domain/v1)是一條可獨立版本化的區劃記錄譜系，並非對合併資料表的篩選器。不同 domain 的記錄及層級關係不會混合。

- <black>{{ domainCode }}</black>
  是預設的地理／行政 collection。請用於本發布所記載的 release。
- <black>hkgov-pland-pu</black> 是規劃署的 _Planning Unit_ collection。
- <black>hkgov-pland-new-town</black> 是規劃署的 _New Town_ collection。

你可明確選取 planning collection，例如：

```url
/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021
/v0.1/divisions?domain=hkgov-pland-new-town&cohort=2021
```

這些 domain 各有自己的 cohort 和 release set；它們不是這個 Overture
release 的成員。請求只有在所選 catalogue 包含該 domain 和 cohort 的 release 時才會成功。

### 幾何與層級

區劃（點）geometry 屬於區劃記錄本身：請求 <black>profile=map</black> 或
<black>profile=full</black> 以包含它。面和邊界則是獨立儲存的配套資源，必須透過複數
<black>include</black> 值選取：

```url
/v0.1/divisions?include=hierarchy
/v0.1/divisions?include=areas
/v0.1/divisions?include=boundaries
/v0.1/divisions?include=areas:hkgov-had
/v0.1/divisions?include=areas:hkgov-censtatd:2021&transform=simplified
```

未限定的 area 或 boundary 會使用所選 domain 配置的預設值。限定值會請求該確切 provider
variant；不可用的 variant 會回傳錯誤，而不會後備至另一來源。area 和 boundary 資源會在
<black>included</black> 中回傳，並與其主要區劃建立關係。

使用 <black>filter[level]</black>、<black>filter[divisionType]</black> 或
<black>filter[parent]</black> 縮小列表；使用 <black>page[limit]</black> 和
<black>page[offset]</black> 分頁。每頁上限為 100。

### 語言（`I18n`）

預設提供英文和繁體中文名稱，等同於 <black>locales=en,zh-hant</black>。設定
<black>locales=*</black> 可請求所有可用語言地區，或傳入另一個受支援的逗號分隔清單。

### 回應形狀

[profile](saanseoi:zh-hant:definition/profile/v1)是具名稱的回應形狀。預設 profile 會回傳常用區劃欄位；<black>compact</black>
較精簡，<black>map</black> 加入主要 geometry，而 <black>full</black>
同時加入 geometry 和包含來源資訊的欄位。請參閱
[Divisions endpoint documentation](/docs#tag/Divisions/operation/listDivisions)
了解目前的參數及欄位合約。當已解析的 profile 對已保存結果很重要時，請保留回傳的 permalink。

### 時間旅行

使用 <black>effectiveAt</black> 選取某個時間有效的 release；使用 <black>knownAt</black>
選取 API [catalogue](saanseoi:zh-hant:definition/catalogue/v1)
在某個時間所知的內容；使用 <black>catalogRevision</black>
選取一個確切的已發布 checkpoint。這些 selector 合用時，可分辨後來的 backfill 與較早請求時可見的視圖。

## 備註與限制

- 此發布建立 Overture domain；它不會令 planning unit 或 new town 與 Overture
  divisions 可以互換。
- 主要 division geometry 可透過 <black>map</black> 和 <black>full</black>
  profile 取得。area 和 boundary 配套資源會以 <black>include</black>
  分別選取；其 coverage 和可用性因 variant 而異。
- 此發布保留 source provenance，並在 response
  metadata 中公開所選 domain、cohort 及 catalogue。請參閱
  <black>{{ primarySourceRelease }}</black>
  的[來源發布說明]({{ primarySourceReleaseUrl }})，了解欄位相容性及發布者特有的品質決定。

# ZH-HANS

## 更新记录

- 香港山水 | SaanSeoi Divisions
  API 的首个[发布](saanseoi:zh-hans:definition/release/v1)。
- 发布 cohort <black>{{ cohortKey }}</black> 的第一个不可变
  <black>{{ domainCode }}</black> domain 视图。
- 提供标准区划记录，以及可分别选取的面和边界
  [配套资源](saanseoi:zh-hans:definition/companion-resource/v1)。几何保持发布者特有；绝不会被静默合并或替代。

## 发布范围

此[发布](saanseoi:zh-hans:definition/release/v1)为香港 Divisions API 建立
<black>{{ domainCode }}</black> [domain](saanseoi:zh-hans:definition/domain/v1)。其主要
[collection](saanseoi:zh-hans:definition/collection/v1)是此
[cohort](saanseoi:zh-hans:definition/cohort/v1)的 Overture 区划
[snapshot](saanseoi:zh-hans:definition/snapshot/v1)。它是一个
[release set](saanseoi:zh-hans:definition/release-set/v1)，并不表示所有区划数据集都构成同一 collection。

其
[composition policy](saanseoi:zh-hans:definition/composition-policy/v1)要求 Overture 几何必须来自同一 Overture
release version。独立发布的地区面
[variants](saanseoi:zh-hans:definition/variant/v1)则可选取较早而合资格的日期。
[Hong Kong extract](saanseoi:zh-hans:note/hong-kong-extract/v1)亦加入用于解析父级与边界参照的经审核中国国家 anchor。这个只作参照的记录有名称和身份，却没有国家几何，因此不构成中国覆盖范围的声称。

## 组成来源发布

{{apiReleaseSetSources:zh-Hans}}

## 使用 Divisions API

<black>v0.1</black> 合约仍属实验性质。请使用 <black>GET /v0.1/divisions</black> 或
<black>GET /v0.1/divisions/{id}</black>；现时 <black>/v0</black> 别名解析至相同合约。

先从默认 Overture collection 开始：

```url
/v0.1/divisions
```

没有 selector 时，端点会在目前的
[catalogue](saanseoi:zh-hans:definition/catalogue/v1)解析至最新的有效 release。要选取此确切有效 cohort，请设置
<black>cohort</black> 和 <black>domain</black>：

```url
/v0.1/divisions?domain={{ domainCode }}&cohort={{ cohortKey }}
```

如要在 catalogue 改变后重现结果，请保留成功响应中完整的
<black>links.permalink</black>。它会记录已解析的 <black>releaseSet</black> 和
[catalogue revision](saanseoi:zh-hans:definition/catalogue-revision/v1)，因此可重放相同请求，而非解析到较新的 release。你也可用
<black>releaseSet={{ apiReleaseSet }}</black> 明确选取这个 release set。

### Domains

[domain](saanseoi:zh-hans:definition/domain/v1)是一条可独立版本化的区划记录谱系，并非对合并数据表的筛选器。不同 domain 的记录及层级关系不会混合。

- <black>{{ domainCode }}</black>
  是默认的地理／行政 collection。请用于本发布所记载的 release。
- <black>hkgov-pland-pu</black> 是规划署的 _Planning Unit_ collection。
- <black>hkgov-pland-new-town</black> 是规划署的 _New Town_ collection。

你可明确选取 planning collection，例如：

```url
/v0.1/divisions?domain=hkgov-pland-pu&cohort=2021
/v0.1/divisions?domain=hkgov-pland-new-town&cohort=2021
```

这些 domain 各有自己的 cohort 和 release set；它们不是这个 Overture
release 的成员。请求只有在所选 catalogue 包含该 domain 和 cohort 的 release 时才会成功。

### 几何与层级

区划（点）geometry 属于区划记录本身：请求 <black>profile=map</black> 或
<black>profile=full</black> 以包含它。面和边界则是独立储存的配套资源，必须透过复数
<black>include</black> 值选取：

```url
/v0.1/divisions?include=hierarchy
/v0.1/divisions?include=areas
/v0.1/divisions?include=boundaries
/v0.1/divisions?include=areas:hkgov-had
/v0.1/divisions?include=areas:hkgov-censtatd:2021&transform=simplified
```

未限定的 area 或 boundary 会使用所选 domain 配置的默认值。限定值会请求该确切 provider
variant；不可用的 variant 会返回错误，而不会后备至另一来源。area 和 boundary 资源会在
<black>included</black> 中返回，并与其主要区划建立关系。

使用 <black>filter[level]</black>、<black>filter[divisionType]</black> 或
<black>filter[parent]</black> 缩小列表；使用 <black>page[limit]</black> 和
<black>page[offset]</black> 分页。每页上限为 100。

### 语言（`I18n`）

默认提供英文和繁体中文名称，等同于 <black>locales=en,zh-hant</black>。设置
<black>locales=*</black> 可请求所有可用语言地区，或传入另一个受支持的逗号分隔清单。

### 响应形状

[profile](saanseoi:zh-hans:definition/profile/v1)是具名称的响应形状。默认 profile 会返回常用区划字段；<black>compact</black>
较精简，<black>map</black> 加入主要 geometry，而 <black>full</black>
同时加入 geometry 和包含来源信息的字段。请参阅
[Divisions endpoint documentation](/docs#tag/Divisions/operation/listDivisions)
了解目前的参数及字段合约。当已解析的 profile 对已保存结果很重要时，请保留返回的 permalink。

### 时间旅行

使用 <black>effectiveAt</black> 选取某个时间有效的 release；使用 <black>knownAt</black>
选取 API [catalogue](saanseoi:zh-hans:definition/catalogue/v1)
在某个时间所知的内容；使用 <black>catalogRevision</black>
选取一个确切的已发布 checkpoint。这些 selector 合用时，可分辨后来的 backfill 与较早请求时可见的视图。

## 备注与限制

- 此发布建立 Overture domain；它不会令 planning unit 或 new town 与 Overture
  divisions 可以互换。
- 主要 division geometry 可透过 <black>map</black> 和 <black>full</black>
  profile 取得。area 和 boundary 配套资源会以 <black>include</black>
  分别选取；其 coverage 和可用性因 variant 而异。
- 此发布保留 source provenance，并在 response
  metadata 中公开所选 domain、cohort 及 catalogue。请参阅
  <black>{{ primarySourceRelease }}</black>
  的[来源发布说明]({{ primarySourceReleaseUrl }})，了解字段兼容性及发布者特有的质量决定。
