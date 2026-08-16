# API

## v1

### EN

APIs are how <i>software</i> talks to each other. Use code or an LLM to make requests to
our API and it will respond with data. The benefit of using APIs over raw data downloads
is that you won't need to download the full dataset or host it yourself. Just point your
map, app, or analysis to our APIs and the data is just a request away.

### ZH-HANT

API 是讓<i>軟件</i>彼此溝通的方式。你可使用程式碼或 LLM 向 SaanSeoi
API 發出請求，它會回傳資料。這表示你無須自行下載或託管資料；只需把地圖、應用程式或分析工具連接至我們的 API，便不用擔心資料庫或保持資料更新。

### ZH-HANS

API 是让<i>软件</i>彼此通信的方式。你可以使用代码或 LLM 向 SaanSeoi
API 发出请求，它会返回数据。这意味着无需自行下载或托管数据；只需将地图、应用程序或分析工具连接到我们的 API，就不必担心数据库或保持数据更新。

# API family

## v1

### EN

An API family groups together source data and makes it available in a unified schema: a
data structure with consistent names and conventions.

### ZH-HANT

API family 會把來源資料整合，並以統一的 schema 提供：即名稱與慣例一致的資料結構。

### ZH-HANS

API family 会整合来源数据，并以统一的 schema 提供：即名称与惯例一致的数据结构。

# Basemap

## v1

### EN

The <i>bottom background layer</i> of a map. It gives geographic context with features
like roads, water, land, and place names. You typically put layers on top of this
background to show a collection of markers or to study locations and patterns.

### ZH-HANT

底圖是地圖的<i>最底層背景圖層</i>。它以道路、水域、陸地和地名等要素提供地理背景。你通常會在這個背景之上加上其他圖層，以呈現一組標記，或研究地點和模式。

### ZH-HANS

底图是地图的<i>最底层背景图层</i>。它以道路、水域、陆地和地名等要素提供地理背景。你通常会在这个背景之上添加其他图层，以呈现一组标记，或研究地点和模式。

# Map style

## v1

### EN

A map style is the <i>set of visual rules</i> a map renderer follows. It decides which
layers are visible and how colours, lines, labels and symbols look. A style does not
contain the map data or tiles it draws.

### ZH-HANT

地圖樣式是地圖渲染器遵循的一組<i>視覺指令</i>。它決定哪些圖層可見，以及顏色、線條、標籤和符號的外觀。樣式並不包含它繪製的地圖資料或圖磚。

### ZH-HANS

地图样式是地图渲染器遵循的一组<i>视觉指令</i>。它决定哪些图层可见，以及颜色、线条、标签和符号的外观。样式并不包含它绘制的地图数据或图块。

# Render

## v1

### EN

To render a map is to <i>turn geographic data and visual instructions into pixels</i>
that people can see and interact with. A map renderer does this work in a browser, app,
or other display environment.

### ZH-HANT

渲染地圖是把<i>地理資料和視覺指令轉換成像素</i>，讓人看見並與之互動。地圖渲染器會在瀏覽器、應用程式或其他顯示環境中完成這項工作。

### ZH-HANS

渲染地图是把<i>地理数据和视觉指令转换成像素</i>，让人看见并与之互动。地图渲染器会在浏览器、应用程序或其他显示环境中完成这项工作。

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
hierarchy rules. When data sources aren't strictly compatible (for example, different
perspectives on a 'division'), sources are made available as a domain within the family.
For example, the Planning Unit domain in the Divisions API uses different boundaries
than the Census does, so they are offered as distinct domains within one family. Records
from different domains are never silently combined.

### ZH-HANT

domain 是具有自身身分及層級規則、可獨立版本化的記錄譜系。當來源資料並不完全相容（例如對「區劃」有不同的界定方式），它們會作為同一 API
family 內的 domain 提供。例如，Divisions
API 的規劃單元 domain 使用的邊界與人口普查不同，因此會在同一 family 中作為不同 domain 提供。不同 domain 的記錄絕不會被靜默合併。

### ZH-HANS

domain 是具有自身身份及层级规则、可独立版本化的记录谱系。当来源数据并不完全兼容（例如对“区划”有不同的界定方式）时，它们会作为同一 API
family 内的 domain 提供。例如，Divisions
API 的规划单元 domain 使用的边界与人口普查不同，因此会在同一 family 中作为不同 domain 提供。不同 domain 的记录绝不会被静默合并。

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

# Bun

## v1

### EN

Bun is a programme that lets you run JavaScript and TypeScript, install the libraries
your project needs, and use commands in a terminal. This guide uses Bun because it
combines these common tools in one place. If you are more familiar with Node.js, npm,
pnpm, Yarn, or Deno, you can use one of those instead; the examples in this guide should
work in much the same way.

### ZH-HANT

Bun 是 JavaScript 和 TypeScript 執行環境、套件管理器及命令列工具。本指南以它為方便的預設選項；Node.js 配合 npm、pnpm 或 Yarn，以及 Deno，在這裡都可發揮相近作用。若你已有慣用工具，可直接使用並相應調整指令。

### ZH-HANS

Bun 是 JavaScript 和 TypeScript 运行环境、包管理器及命令行工具。本指南以它为方便的默认选项；Node.js 配合 npm、pnpm 或 Yarn，以及 Deno，在这里都可发挥相近作用。如果你已有习惯的工具，可以直接使用并相应调整命令。

# Vite

## v1

### EN

Vite is a development tool for web projects. In this guide, it starts a local
development server so you can preview your map at <code>http://localhost:5173</code>
while you work. It also bundles your project files for deployment.

### ZH-HANT

Vite 是網頁專案的開發工具。本指南會用它啟動本機開發伺服器，讓你在工作期間於
<code>http://localhost:5173</code> 預覽地圖；它亦會把專案檔案打包以供部署。

### ZH-HANS

Vite 是网页项目的开发工具。本指南会用它启动本地开发服务器，让你在工作期间于
<code>http://localhost:5173</code> 预览地图；它也会将项目文件打包以供部署。

# TypeScript

## v1

### EN

TypeScript is JavaScript with more structured code, making bugs easier to catch and the
developer experience smoother. Behind the scenes, TypeScript is still transformed into
JavaScript before it is used, because browsers — where this code runs — support only
JavaScript.

### ZH-HANT

TypeScript 是加入可選型別檢查的 JavaScript。它可在編寫程式時找出不匹配之處，之後會轉換成瀏覽器可執行的普通 JavaScript。

### ZH-HANS

TypeScript 是加入可选类型检查的 JavaScript。它可在编写代码时找出不匹配之处，之后会转换成浏览器可执行的普通 JavaScript。

# Packages

## v1

### EN

Packages are code projects maintained by other people and made available — often for
free — to use in your own projects. There are so many packages that building something
often means choosing a few, then connecting them together. A package manager, such as
Bun, downloads the specific versions your project needs.

### ZH-HANT

套件是與專案分開維護、可重用的程式碼。套件管理器會下載專案所需版本並記錄下來，讓協作者和部署環境使用同一組套件。

### ZH-HANS

包是与项目分开维护、可重用的代码。包管理器会下载项目所需版本并记录下来，让协作者和部署环境使用同一组包。
