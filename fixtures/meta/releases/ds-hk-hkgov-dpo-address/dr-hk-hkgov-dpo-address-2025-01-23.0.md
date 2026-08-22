---
createdAt: "2026-07-21T00:00:00.000Z"
updatedAt: "2026-07-23T00:00:00.000Z"
dataset: "ds-hk-hkgov-dpo-address"
release: "dr-hk-hkgov-dpo-address-2025-01-23.0"
regionCode: "hk"
source: "hkgov-dpo"
sourceVersion: "2025-01-23.0"
releaseVersion: "2025-01-23.0"
sourceSchemaVersion: "3.2"
type: "address"
cohortKey: "2025-01-23.0"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=dpo_rcd_1629267205232_33603"
---

# EN

## Changelog

- Initial 山水 | SaanSeoi release
- <orange>Upstream</orange> Digital Policy Office Address Lookup Service (ALS)
  two-dimensional district GeoJSON delivery dated <black>2025-01-23</black>

## Compatibility

SaanSeoi's [Address](/docs#models/Address) imports the two-dimensional premises
addresses from ALS. The source model is the structured English and Traditional Chinese
<black>PremisesAddress</black> described by the
[ALS Data Dictionary](https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN.pdf). We
deviate from the ALS delivery schema (`{{sourceSchemaVersion}}`) in the following ways.
The separate public-rental-housing three-dimensional delivery is not part of this
two-dimensional resource.

### Directly Retained Fields

Fields that retain the ALS value directly:

- `geometry` - [Geometry](/docs#models/Geometry) - the delivery point geometry
- `CsuId` - retained as <black>identifiers.hkgovCsuId</black> when supplied
- `GeoAddress` - retained as source evidence and an ALS identity anchor
- `Easting` and `Northing` - retained in the source record as HK1980 Grid coordinates

### Enriched Fields

Fields which retain the source data with certain additions:

- `sources` - [Sources](/docs#models/Sources) - lineage, input-file metadata, and
  premise-normalisation evidence are wrapped under the <black>hkgovAls</black> key
- `bbox` - [BBox](/docs#models/BBox) - derived from the retained point geometry
- `id` - [Id](/docs#models/Id) - a stable <black>ss-</black> UUIDv5 derived from the
  complete premise representation; a reviewed identity-drift decision may retain an
  earlier identity
- division relationships - `country`, `area`, and `district` are resolved against the
  selected Overture division snapshot. The `town`, `macrohood`, `neighbourhood`,
  `microhood`, `village`, and `hamlet` relationships are present in the model and API,
  but are null until reliable boundary matching is available.

### Normalised Fields

Fields reorganised for storage, lookup, or API response shaping:

- `EngPremisesAddress` and `ChiPremisesAddress` - normalised by locale into
  [AddressI18n](/docs#models/AddressI18n), including <black>formattedAddress</black>,
  <black>buildingName</black>, <black>estateName</black>, and <black>streetName</black>
- `EngStreet.BuildingNoFrom`/`BuildingNoTo` and
  `ChiStreet.BuildingNoFrom`/`BuildingNoTo` - used as <black>buildingNumberFrom</black>
  and <black>buildingNumberTo</black> when a street is supplied
- `EngVillage.BuildingNoFrom`/`BuildingNoTo` and
  `ChiVillage.BuildingNoFrom`/`BuildingNoTo` - used as the same canonical building
  number fields when the address has no street. A synthetic <black>streetNumber</black>
  is not created.
- a singleton number is also represented as <black>buildingNumberExpression</black>. ALS
  does not supply the punctuation between different From/To values, so
  <black>buildingNumberConnector</black> is null for this release.
- `EngBlock`/`ChiBlock` - normalised to <black>blockExpression</black>, canonical
  <black>blockType</black>, <black>blockRef</black>, and
  <black>blockTypeBeforeNumber</black>. ALS <black>BlockNo</black> is not assumed to be
  numeric: it may be a label such as <black>A</black> or <black>EAST</black>.
- `EngPhase`/`ChiPhase` - normalised to <black>phaseExpression</black>,
  <black>phaseName</black>, and <black>phaseRef</black>; phase names and references
  remain distinct.
- canonical building-number lookup rows are locale-independent. Supplied endpoints use
  <black>source_endpoint</black> evidence and retain a separate
  <black>numericStem</black> for explicit partial matching. The bare stem is not an
  exact alias: <black>5</black> does not exactly match <black>5A-5C</black>.
- the source delivery has no 2D connector, so it produces endpoint lookups only. The
  shared model may derive members only from a future source with an explicit connector;
  for example, <black>5C-5E</black> can derive <black>5D</black>, while
  <black>56-60</black> derives alternating members when both endpoints share parity.

### Compatibility Fields

Fields retained in source-compatible storage and processing evidence:

- the complete English and Chinese <black>PremisesAddress</black> objects, including
  `Region`, district, street, village, estate, phase, block, building, and location
  components
- `LocationName` and `VillageName` - retained as source components. They are not copied
  into canonical address i18n; future reliable village division matching will supply
  their canonical relationship and localised name.
- publisher coordinates, source file, feature index, raw premise properties, `CsuId`,
  and `GeoAddress`

### Dropped Fields

Fields which are not exposed as part of the two-dimensional
[Address](/docs#models/Address):

- `Eng3dAddress` and `Chi3dAddress` - ALS exposes floor and unit information only for
  applicable public-rental-housing results when its <black>3d</black> option is enabled.
  They require [Address3d](/docs#models/Address3d) ingestion and remain
  <orange>FORTHCOMING</orange>.
- lookup-request and ranking wrappers, including request text, score, validation
  information, and suggested-address result containers - they describe a lookup
  response, not the delivered premise
- exact duplicate GeoJSON features and equivalent reviewed premise representations -
  consolidated during release preparation, with source evidence and decisions retained
  in processing records

# ZH-HANT

## 更新紀錄

- 山水 | SaanSeoi 初始版本
- <orange>上游</orange> 數字政策辦公室地址查詢服務（ALS）於 <black>2025-01-23</black>
  交付的二維地區 GeoJSON 資料

## 兼容性

SaanSeoi 的 [Address](/docs#models/Address) 匯入 ALS 二維樓宇地址。來源模型為
[ALS 資料字典](https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN.pdf)
所述的中英文結構化 <black>PremisesAddress</black>。相對於 ALS delivery
schema（`{{sourceSchemaVersion}}`），我們在以下方面有所偏離。獨立的公共租住房屋三維資料不屬於此二維資源。

### 直接保留欄位

直接保留 ALS 值的欄位：

- `geometry` - [Geometry](/docs#models/Geometry) - 交付資料的點幾何
- `CsuId` - 如有提供，保留為 <black>identifiers.hkgovCsuId</black>
- `GeoAddress` - 保留為來源證據及 ALS 身份錨點
- `Easting` 和 `Northing` - 在來源記錄中保留為 HK1980 Grid 座標

### 增補欄位

保留來源資料完整範圍並加以補充的欄位：

- `sources` -
  [Sources](/docs#models/Sources) - 來源鏈、輸入檔案 metadata 及樓宇地址正規化證據包裹於
  <black>hkgovAls</black> key 之下
- `bbox` - [BBox](/docs#models/BBox) - 由保留的點幾何衍生
- `id` - [Id](/docs#models/Id) - 由完整樓宇地址表示衍生的穩定 <black>ss-</black>
  UUIDv5；經審核的身份漂移決定可保留較早身份
- division 關係 - `country`、`area` 及 `district` 會按所選 Overture division
  snapshot 解析。模型及 API 已有
  `town`、`macrohood`、`neighbourhood`、`microhood`、`village` 及 `hamlet`
  關係，但在可靠的邊界匹配可用前均為 null。

### 正規化欄位

為了儲存、查詢或塑造 API 回應而重新整理的欄位：

- `EngPremisesAddress` 及 `ChiPremisesAddress` - 按 locale 正規化為
  [AddressI18n](/docs#models/AddressI18n)，包括 <black>formattedAddress</black>、
  <black>buildingName</black>、<black>estateName</black> 及 <black>streetName</black>
- 有街道時，`EngStreet`/`ChiStreet` 的 `BuildingNoFrom`/`BuildingNoTo` 會作為
  <black>buildingNumberFrom</black> 及 <black>buildingNumberTo</black>
- 沒有街道時，`EngVillage`/`ChiVillage` 的 `BuildingNoFrom`/`BuildingNoTo`
  使用相同的 canonical 欄位；不會建立合成的 <black>streetNumber</black>。
- 單一門牌號碼亦會作為
  <black>buildingNumberExpression</black>。ALS 不提供不同 From/To 值之間的標點，因此本版本的
  <black>buildingNumberConnector</black> 為 null。
- `EngBlock`/`ChiBlock` - 正規化為 <black>blockExpression</black>、canonical
  <black>blockType</black>、<black>blockRef</black> 及
  <black>blockTypeBeforeNumber</black>。ALS 的 <black>BlockNo</black>
  不假定為數字，亦可為 <black>A</black> 或 <black>EAST</black> 等標籤。
- `EngPhase`/`ChiPhase` - 正規化為 <black>phaseExpression</black>、
  <black>phaseName</black> 及 <black>phaseRef</black>；期名稱及期數參考保持區分。
- canonical 門牌 lookup row 不按 locale 區分。來源端點使用
  <black>source_endpoint</black> 證據，並保留獨立的 <black>numericStem</black>
  供明確的 partial matching 使用。裸 stem 不是 exact alias：<black>5</black> 不會 exact
  match <black>5A-5C</black>。
- 此來源交付沒有二維 connector，因此只產生端點 lookup。共用模型只會在未來來源提供明確 connector 時衍生中間成員；例如
  <black>5C-5E</black> 可衍生 <black>5D</black>，而 <black>56-60</black>
  在端點同一奇偶時會衍生交替成員。

### 兼容欄位

在來源兼容儲存及處理證據中保留的欄位：

- 完整的中英文 <black>PremisesAddress</black> 物件，包括
  `Region`、district、street、village、estate、phase、block、building 及 location 組成部分
- `LocationName` 及 `VillageName` - 保留為來源組成部分，不會複製至 canonical address
  i18n。未來可靠的 village division matching 將提供其 canonical 關係及本地化名稱。
- 發布者座標、來源檔案、feature index、原始 premise properties、`CsuId` 及 `GeoAddress`

### 不公開欄位

以下欄位不會作為二維 [Address](/docs#models/Address) 的一部分公開：

- `Eng3dAddress` 及 `Chi3dAddress` - ALS 僅在啟用 <black>3d</black>
  選項時，為適用的公共租住房屋結果提供樓層及單位資料。它們需要
  [Address3d](/docs#models/Address3d) ingestion，並仍然 <orange>即將推出</orange>。
- lookup request 及 ranking wrapper，包括 request text、score、validation
  information 及 suggested-address result container - 它們描述 lookup
  response，而非交付的 premise
- 完全重複的 GeoJSON feature 及經審核的等價 premise representation - 在 release
  preparation 期間合併，來源證據及決定則保留於 processing record

# ZH-HANS

## 更新记录

- 山水 | SaanSeoi 初始版本
- <orange>上游</orange> 数字政策办公室地址查询服务（ALS）于 <black>2025-01-23</black>
  交付的二维地区 GeoJSON 数据

## 兼容性

SaanSeoi 的 [Address](/docs#models/Address) 导入 ALS 二维楼宇地址。来源模型为
[ALS 数据字典](https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN.pdf)
所述的中英文结构化 <black>PremisesAddress</black>。相对于 ALS delivery
schema（`{{sourceSchemaVersion}}`），我们在以下方面有所偏离。独立的公共租赁房屋三维数据不属于此二维资源。

### 直接保留字段

直接保留 ALS 值的字段：

- `geometry` - [Geometry](/docs#models/Geometry) - 交付数据的点几何
- `CsuId` - 如有提供，保留为 <black>identifiers.hkgovCsuId</black>
- `GeoAddress` - 保留为源证据及 ALS 身份锚点
- `Easting` 和 `Northing` - 在源记录中保留为 HK1980 Grid 坐标

### 增补字段

保留源数据完整范围并加以补充的字段：

- `sources` -
  [Sources](/docs#models/Sources) - 源链、输入文件 metadata 及楼宇地址规范化证据包裹在
  <black>hkgovAls</black> key 下
- `bbox` - [BBox](/docs#models/BBox) - 由保留的点几何衍生
- `id` - [Id](/docs#models/Id) - 由完整楼宇地址表示衍生的稳定 <black>ss-</black>
  UUIDv5；经审核的身份漂移决定可保留较早身份
- division 关系 - `country`、`area` 及 `district` 会按所选 Overture division
  snapshot 解析。模型及 API 已有
  `town`、`macrohood`、`neighbourhood`、`microhood`、`village` 及 `hamlet`
  关系，但在可靠的边界匹配可用前均为 null。

### 规范化字段

为了存储、查询或塑造 API 响应而重新整理的字段：

- `EngPremisesAddress` 及 `ChiPremisesAddress` - 按 locale 规范化为
  [AddressI18n](/docs#models/AddressI18n)，包括 <black>formattedAddress</black>、
  <black>buildingName</black>、<black>estateName</black> 及 <black>streetName</black>
- 有街道时，`EngStreet`/`ChiStreet` 的 `BuildingNoFrom`/`BuildingNoTo` 会作为
  <black>buildingNumberFrom</black> 及 <black>buildingNumberTo</black>
- 没有街道时，`EngVillage`/`ChiVillage` 的 `BuildingNoFrom`/`BuildingNoTo`
  使用相同的 canonical 字段；不会建立合成的 <black>streetNumber</black>。
- 单一门牌号码亦会作为
  <black>buildingNumberExpression</black>。ALS 不提供不同 From/To 值之间的标点，因此本版本的
  <black>buildingNumberConnector</black> 为 null。
- `EngBlock`/`ChiBlock` - 规范化为 <black>blockExpression</black>、canonical
  <black>blockType</black>、<black>blockRef</black> 及
  <black>blockTypeBeforeNumber</black>。ALS 的 <black>BlockNo</black>
  不假定为数字，亦可为 <black>A</black> 或 <black>EAST</black> 等标签。
- `EngPhase`/`ChiPhase` - 规范化为 <black>phaseExpression</black>、
  <black>phaseName</black> 及 <black>phaseRef</black>；期名称及期数参考保持区分。
- canonical 门牌 lookup row 不按 locale 区分。来源端点使用
  <black>source_endpoint</black> 证据，并保留独立的 <black>numericStem</black>
  供明确的 partial matching 使用。裸 stem 不是 exact alias：<black>5</black> 不会 exact
  match <black>5A-5C</black>。
- 此源交付没有二维 connector，因此只产生端点 lookup。共用模型只会在未来来源提供明确 connector 时衍生中间成员；例如
  <black>5C-5E</black> 可衍生 <black>5D</black>，而 <black>56-60</black>
  在端点同一奇偶时会衍生交替成员。

### 兼容字段

在源兼容存储及处理证据中保留的字段：

- 完整的中英文 <black>PremisesAddress</black> 对象，包括
  `Region`、district、street、village、estate、phase、block、building 及 location 组成部分
- `LocationName` 及 `VillageName` - 保留为源组成部分，不会复制至 canonical address
  i18n。未来可靠的 village division matching 将提供其 canonical 关系及本地化名称。
- 发布者坐标、源文件、feature index、原始 premise properties、`CsuId` 及 `GeoAddress`

### 不公开字段

以下字段不会作为二维 [Address](/docs#models/Address) 的一部分公开：

- `Eng3dAddress` 及 `Chi3dAddress` - ALS 仅在启用 <black>3d</black>
  选项时，为适用的公共租赁房屋结果提供楼层及单元数据。它们需要
  [Address3d](/docs#models/Address3d) ingestion，并仍然 <orange>即将推出</orange>。
- lookup request 及 ranking wrapper，包括 request text、score、validation
  information 及 suggested-address result container - 它们描述 lookup
  response，而非交付的 premise
- 完全重复的 GeoJSON feature 及经审核的等价 premise representation - 在 release
  preparation 期间合并，源证据及决定则保留于 processing record
