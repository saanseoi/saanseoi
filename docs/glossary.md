# API

## v1

### EN

An API (application programming interface) is a documented way for software to request
data or services. SaanSeoi APIs let an application retrieve versioned geospatial data
with standard web requests.

### ZH-HANT

API（應用程式介面）是讓軟件請求資料或服務的文件化方式。SaanSeoi
API 讓應用程式可透過標準網絡請求，取得具版本控制的地理空間資料。

### ZH-HANS

API（应用程序接口）是让软件请求数据或服务的文档化方式。SaanSeoi
API 让应用程序可通过标准网络请求，获取受版本控制的地理空间数据。

# Basemap

## v1

### EN

A basemap is a map layer that provides geographic context, such as coastlines, roads and
places. SaanSeoi makes its basemaps freely available for use in compatible mapping
software.

### ZH-HANT

底圖是提供地理背景的地圖圖層，例如海岸線、道路和地點。SaanSeoi 的底圖可免費用於相容的製圖軟件。

### ZH-HANS

底图是提供地理背景的地图图层，例如海岸线、道路和地点。SaanSeoi 的底图可免费用于兼容的制图软件。

# Catalogue

## v1

### EN

A catalogue is the published index that resolves an API request to an exact release set.
It records which releases were available and selected at a particular point in knowledge
time.

### ZH-HANT

目錄是把 API 請求解析為確切發布集的已發布索引。它記錄在某個知識時間點可用及被選取的發布。

### ZH-HANS

目录是把 API 请求解析为确切发布集的已发布索引。它记录在某个知识时间点可用及被选取的发布。

# Catalogue revision

## v1

### EN

A catalogue revision is one immutable published checkpoint of an API catalogue. It
records what the catalogue knew when it was published, including later corrections and
backfills.

### ZH-HANT

目錄修訂是 API 目錄的一個不可變發布檢查點，記錄發布當刻目錄已知的內容，包括其後加入的更正及回填。

### ZH-HANS

目录修订是 API 目录的一个不可变发布检查点，记录发布当刻目录已知的内容，包括其后加入的更正及回填。

# Cohort

## v1

### EN

A cohort is the effective date or period that a snapshot describes. It is about the
data's real-world timing, not when SaanSeoi learned about or published it.

### ZH-HANT

cohort 是快照所描述的生效日期或期間，表示資料在現實世界中的時間，而非 SaanSeoi 得悉或發布資料的時間。

### ZH-HANS

cohort 是快照所描述的生效日期或期間，表示資料在現實世界中的時間，而非 SaanSeoi 得悉或發布資料的時間。

# Collection

## v1

### EN

A collection is a coherent named group of records within one domain and cohort. It is
not a release set: one release set can publish a primary collection together with
related resources.

### ZH-HANT

collection 是同一 domain 與 cohort 內一組連貫且具名稱的記錄。它不是 release
set；一個 release set 可發布主要 collection 及其相關資源。

### ZH-HANS

collection 是同一 domain 与 cohort 内一组连贯且具名称的记录。它不是 release
set；一个 release set 可发布主要 collection 及其相关资源。

# Companion resource

## v1

### EN

A companion resource is a separately modelled resource related to a primary record, such
as a division area or boundary. It remains identifiable by its own provenance and
variant rather than being merged into the primary collection.

### ZH-HANT

companion
resource 是與主要記錄相關、但獨立建模的資源，例如區劃面或邊界。它保留自己的來源與變體身分，而不會併入主要 collection。

### ZH-HANS

companion
resource 是与主要记录相关、但独立建模的资源，例如区划面或边界。它保留自己的来源与变体身份，而不会并入主要 collection。

# Composition policy

## v1

### EN

A composition policy is the published rule for selecting the releases and variants that
may form a release set. It makes required inputs, timing rules, and permitted fallbacks
auditable.

### ZH-HANT

composition policy 是選取可構成 release
set 的發布與變體的已發布規則。它使必要輸入、時間規則及允許的後備選項可供審核。

### ZH-HANS

composition policy 是选取可构成 release
set 的发布与变体的已发布规则。它使必要输入、时间规则及允许的后备选项可供审核。

# Domain

## v1

### EN

A domain is an independently versioned lineage of records with its own identity and
hierarchy rules. For example there are many ways to create 'divisions' in Hong Kong:
based on topographical names, planning units, or district council constituent areas.
These divisions are mutually exclusive and don't form part of the same hierarchy, so
each is relegated to their own domain. Records from different domains are never silently
combined.

### ZH-HANT

domain 是具有自身身分及層級規則、可獨立版本化的記錄譜系。例如，香港的「區劃」可按地名、規劃單元或區議會選區劃分。這些區劃互不相容，亦不屬於同一層級結構，因此各自歸入不同的 domain。不同 domain 的記錄絕不會被靜默合併。

### ZH-HANS

domain 是具有自身身份及层级规则、可独立版本化的记录谱系。例如，香港的「区划」可按地名、规划单元或区议会选区划分。这些区划互不相容，也不属于同一层级结构，因此各自归入不同的 domain。不同 domain 的记录绝不会被静默合并。

# Hong Kong extract

## v1

### EN

For our purposes, the scope of “Hong Kong” is clipped to Hong Kong's Overture division
identifier's boundaries, not a claim that the release covers every geography associated
with the Hong Kong SAR.

SaanSeoi uses `overturist` with that division identifier, the selected Overture release,
and the `divisions` theme. SaanSeoi retains that extracted release as the source input.
The scoped extract omits Overture's PRC country record, so SaanSeoi adds a reviewed
referent-only country anchor for hierarchy and boundary references. The anchor has names
and identity but no country geometry, and does not add a PRC coverage claim.

### ZH-HANT

就本詞彙表而言，「Hong Kong」的範圍會裁切至香港 Overture
division 識別碼的邊界，並不表示此 release 覆蓋與香港特區相關的所有地理範圍。

SaanSeoi 以該 division 識別碼、所選 Overture release 及 `divisions` theme 使用
`overturist`。SaanSeoi 會保留所得的摘錄 release 作為來源輸入。此範圍摘錄不包含 Overture 的中國國家記錄，因此 SaanSeoi 會加入經審核、僅作參照的國家 anchor，以解析層級及邊界參照。該 anchor 有名稱與身分但沒有國家幾何，並不構成中國覆蓋範圍的聲稱。

### ZH-HANS

就本词汇表而言，“Hong Kong”的范围会裁切至香港 Overture
division 标识符的边界，并不表示此 release 覆盖与香港特区相关的所有地理范围。

SaanSeoi 以该 division 标识符、所选 Overture release 及 `divisions` theme 使用
`overturist`。SaanSeoi 会保留所得的摘录 release 作为来源输入。此范围摘录不包含 Overture 的中国国家记录，因此 SaanSeoi 会加入经审核、仅作参照的国家 anchor，以解析层级及边界参照。该 anchor 有名称与身份但没有国家几何，并不构成中国覆盖范围的声称。

# Lineage

## v1

### EN

A lineage is the traceable chain from source releases through snapshots, processing
rules, and releases to an API response. It explains which inputs and decisions produced
a record or result.

### ZH-HANT

lineage 是從 source
release，經過 snapshot、處理規則和 release，直至 API 回應的可追溯鏈。它說明哪些輸入和決定產生一筆記錄或結果。

### ZH-HANS

lineage 是从 source
release，经过 snapshot、处理规则和 release，直至 API 响应的可追溯链。它说明哪些输入和决定产生一条记录或结果。

# Profile

## v1

### EN

A profile is a named API response shape. For divisions, `compact` is minimal, `default`
adds common descriptive fields, `map` adds the primary division geometry, and `full`
adds both geometry and provenance-rich fields.

### ZH-HANT

profile 是具名稱的 API 回應形狀。就區劃而言，`compact` 最精簡，`default`
加入常用描述欄位，`map` 加入主要區劃幾何，而 `full` 同時加入幾何及包含來源的欄位。

### ZH-HANS

profile 是具名称的 API 响应形状。就区划而言，`compact` 最精简，`default`
加入常用描述字段，`map` 加入主要区划几何，而 `full` 同时加入几何及包含来源的字段。

# Release

## v1

### EN

A release is an immutable published version of data and its metadata. A correction is
published as a new release; the original remains available for audit and replay.

### ZH-HANT

release 是資料及其 metadata 的不可變已發布版本。更正會作為新的 release 發布；原版本仍會保留，以供審核及重播。

### ZH-HANS

release 是数据及其 metadata 的不可变已发布版本。更正会作为新的 release 发布；原版本仍会保留，以供审核及重播。

# Release set

## v1

### EN

A release set is the exact immutable group of domain resources selected for one API
publication. Use its identifier when a request must resolve to that publication rather
than the latest eligible release.

### ZH-HANT

release
set 是為一次 API 發布而選取的確切、不可變 domain 資源組。當請求必須解析至該次發布而非最新合資格 release 時，請使用其識別碼。

### ZH-HANS

release
set 是为一次 API 发布而选取的确切、不可变 domain 资源组。当请求必须解析至该次发布而非最新合资格 release 时，请使用其标识符。

# Revision

## v1

### EN

A revision is the numbered correction or replacement of a release, snapshot, or
catalogue publication with the same scope. It creates a new immutable version; it does
not overwrite the earlier one.

### ZH-HANT

revision 是同一範圍的 release、snapshot 或 catalogue
publication 之編號更正或替代版本。它會建立新的不可變版本，而不會覆寫較早的版本。

### ZH-HANS

revision 是同一范围的 release、snapshot 或 catalogue
publication 之编号更正或替代版本。它会建立新的不可变版本，而不会覆盖较早的版本。

# Snapshot

## v1

### EN

A snapshot is an immutable materialisation of records selected from one or more source
releases for a cohort. It preserves the input lineage used to build a release.

### ZH-HANT

snapshot 是為一個 cohort 從一個或多個 source
release 選取並實體化的不可變記錄集合。它保留用以建立 release 的輸入譜系。

### ZH-HANS

snapshot 是为一个 cohort 从一个或多个 source
release 选取并实体化的不可变记录集合。它保留用以建立 release 的输入谱系。

# Source release

## v1

### EN

A source release is the immutable recorded publisher delivery from which SaanSeoi
processes data. It retains source artefacts, checksums, provenance, and release notes
independently of API publication.

### ZH-HANT

source
release 是 SaanSeoi 用以處理資料的、已記錄發布者交付物之不可變版本。它獨立於 API 發布，保留來源 artefact、校驗和、來源資訊及 release
notes。

### ZH-HANS

source
release 是 SaanSeoi 用以处理数据的、已记录发布者交付物之不可变版本。它独立于 API 发布，保留来源 artefact、校验和、来源信息及 release
notes。

# Variant

## v1

### EN

A variant distinguishes an alternative provider, transformation, or representation of
the same resource type. For example, a division area may be supplied by Overture, the
Home Affairs Department, or C&SD; a C&SD area may also have a `simplified` variant.
Selecting a variant is explicit, so an unavailable choice is not silently replaced by
another source.

### ZH-HANT

variant 用以區分同一資源類型的替代發布者、轉換或表示方式。例如，區劃面可由 Overture、民政事務總署或政府統計處提供；政府統計處的區劃面亦可有
`simplified` 變體。變體必須明確選取；不可用的選項不會被另一來源靜默取代。

### ZH-HANS

variant 用以区分同一资源类型的替代发布者、转换或表示方式。例如，区划面可由 Overture、民政事务总署或政府统计处提供；政府统计处的区划面亦可有
`simplified` 变体。变体必须明确选取；不可用的选项不会被另一来源静默取代。
