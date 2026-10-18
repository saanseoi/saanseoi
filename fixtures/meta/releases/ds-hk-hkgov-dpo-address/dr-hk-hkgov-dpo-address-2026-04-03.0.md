---
createdAt: "2026-07-21T00:00:00.000Z"
updatedAt: "2026-10-18T05:19:12.219Z"
dataset: "ds-hk-hkgov-dpo-address"
release: "dr-hk-hkgov-dpo-address-2026-04-03.0"
regionCode: "hk"
source: "hkgov-dpo"
sourceVersion: "2026-04-03.0"
publisherReleaseDate: "2026-04-03"
releaseVersion: "2026-04-03.0"
sourceSchemaVersion: "3.2"
type: "address"
cohortKey: "2026-04-03.0"
releaseNotesUrl: "https://portal.csdi.gov.hk/geoportal/?lang=en&datasetId=dpo_rcd_1629267205232_33603"
---

# EN

## Changelog

- <orange>Upstream</orange> Digital Policy Office Address Lookup Service (ALS)
  two-dimensional district GeoJSON delivery dated
  <black>{{publisherReleaseDate}}</black>
- <orange>Upstream</orange> Widespread coordinate revision in the publisher's original
  GeoJSON explains the high volume of changed addresses. Compared with `2026-02-04.0`,
  148,990 of 177,985 uniquely matched points with identical non-coordinate properties
  (83.7%) have different coordinates. Across all matched points, the median grid
  displacement is 1.4 metres and 95.3% are within 10 metres. Both longitude/latitude and
  the publisher's easting/northing evidence change upstream of SaanSeoi processing.
- Of the moved points, 141,175 land exactly on the grid position encoded in the CSU
  identifier. This suggests a bulk reconciliation to CSU-associated positions, rather
  than a uniform geographic offset; the publisher's reason has not been established. The
  `2026-04-22.0` delivery retains these positions: only one of 181,951 otherwise
  identical, uniquely matched points changes coordinates.

## Compatibility

This release imports the ALS two-dimensional district GeoJSON deliveries. The separate
public-rental-housing three-dimensional file is not part of this address resource. Each
retained premise is represented as a point and is associated with the selected same-year
Overture division snapshot.

### Directly Retained Fields

- `geometry` - retained as the source point geometry
- Chinese and English premise-address components - included in localized source records
- `Easting` and `Northing` - included with the source record
- `CsuId` and `GeoAddress` - retained as source identifiers and source evidence

### Enriched Fields

- `sources` - attribution lineage of the source, delivery file, and
  premise-normalization evidence are retained under the <black>hkgovAls</black> key
- `bbox` - calculated from the canonical point geometry

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
  <black>blockTypeBeforeNumber</black>. Recognised English descriptor variants use
  <black>BLK</black>, <black>BLDG</black>, <black>TWR</black>, <black>HSE</black>, or
  <black>APT</black>; Traditional Chinese puts the reference before its descriptor. ALS
  <black>BlockNo</black> is not assumed to be numeric: it may be a label such as
  <black>A</black> or <black>EAST</black>. The original descriptor remains in the
  retained premise object.
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

- The original Chinese and English premise-address objects are retained through the
  <black>hkgovAls</black> source profile.
- Publisher coordinates, `CsuId`, `GeoAddress`, source file, and feature index remain
  available as source data.

### Dropped Fields

- The separate ALS three-dimensional public-rental-housing delivery is not imported into
  the two-dimensional address dataset.
- Exact duplicate source features and equivalent premise variants are consolidated;
  their source evidence is retained in release processing records.

## Limitations

### Curation policy

{{addressCurationPolicy:en}}

### Known Quality Issues

{{addressKnownQualityIssues:en}}

# ZH-HANT

## 更新紀錄

- <orange>上游</orange> 數字政策辦公室地址查詢服務（ALS）於
  <black>{{publisherReleaseDate}}</black> 交付的二維地區 GeoJSON 資料
- <orange>上游</orange> 發布者原始 GeoJSON 的大規模座標修訂，解釋了大量地址變更。與
  `2026-02-04.0`
  比較，在非座標屬性完全相同且可唯一配對的 177,985 個地址點中，148,990 個（83.7%）的座標不同。所有配對點的網格位移中位數為 1.4 米，95.3% 的位移不超過 10 米。經緯度及發布者的東向／北向座標均已在 SaanSeoi 處理前於上游變更。
- 其中 141,175 個移動點的新網格位置，與 CSU 識別碼所編碼的位置完全一致。這顯示可能是批量將座標與 CSU 關聯位置對齊，而非統一的地理偏移；尚未確立發布者作此修訂的原因。
  `2026-04-22.0`
  交付保留了這批位置：在其餘屬性相同且可唯一配對的 181,951 個點中，只有一個點的座標變更。

## 兼容性

此版本匯入 ALS 的二維地區 GeoJSON 資料。獨立的公共租住房屋三維檔案不屬於此地址資源。每個保留的樓宇地址均表示為點，並關聯至所選取的同年 Overture 區劃 snapshot。

### 直接保留欄位

- `geometry` 作為來源點幾何保留
- 中英文樓宇地址組成部分作為本地化來源記錄保留
- `Easting` 及 `Northing` 隨來源記錄保留
- `CsuId` 及 `GeoAddress` 保留為來源識別碼及來源證據

### 增補欄位

- `sources` 會在 <black>hkgovAls</black> key 下保留來源鏈、交付檔案和樓宇正規化證據
- `bbox` 由標準點幾何計算

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
  <black>blockTypeBeforeNumber</black>。已識別的英文類型變體使用
  <black>BLK</black>、<black>BLDG</black>、<black>TWR</black>、<black>HSE</black> 或
  <black>APT</black>；繁體中文會把參考值放在類型之前。ALS 的 <black>BlockNo</black>
  不假定為數字，亦可為 <black>A</black> 或 <black>EAST</black>
  等標籤。原始類型保留於已保存的樓宇物件。
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

- 原始中英文樓宇地址物件透過 <black>hkgovAls</black> 來源 profile 保留。
- 發布者座標、`CsuId`、`GeoAddress`、來源檔案和 feature index 仍可作為來源資料取得。

### 不公開欄位

- 獨立的 ALS 公共租住房屋三維資料不會匯入二維地址資料集。
- 完全重複的來源 feature 及等價的樓宇變體會合併，其來源證據保留於版本處理記錄。

## 限制

### 整理政策

{{addressCurationPolicy:zh-Hant}}

### 已知品質問題

{{addressKnownQualityIssues:zh-Hant}}

# ZH-HANS

## 更新记录

- <orange>上游</orange> 数字政策办公室地址查询服务（ALS）于
  <black>{{publisherReleaseDate}}</black> 交付的二维地区 GeoJSON 数据
- <orange>上游</orange> 发布者原始 GeoJSON 的大规模坐标修订，解释了大量地址变更。与
  `2026-02-04.0`
  比较，在非坐标属性完全相同且可唯一配对的 177,985 个地址点中，148,990 个（83.7%）的坐标不同。所有配对点的网格位移中位数为 1.4 米，95.3% 的位移不超过 10 米。经纬度及发布者的东向／北向坐标均已在 SaanSeoi 处理前于上游变更。
- 其中 141,175 个移动点的新网格位置，与 CSU 标识码所编码的位置完全一致。这显示可能是批量将坐标与 CSU 关联位置对齐，而非统一的地理偏移；尚未确立发布者作此修订的原因。
  `2026-04-22.0`
  交付保留了这批位置：在其余属性相同且可唯一配对的 181,951 个点中，只有一个点的坐标变更。

## 兼容性

此版本导入 ALS 的二维地区 GeoJSON 数据。独立的公共租赁房屋三维文件不属于此地址资源。每个保留的楼宇地址均表示为点，并关联至所选取的同年 Overture 区划 snapshot。

### 直接保留字段

- `geometry` 作为源点几何保留
- 中英文楼宇地址组成部分作为本地化源记录保留
- `Easting` 及 `Northing` 随源记录保留
- `CsuId` 及 `GeoAddress` 保留为源标识码及源证据

### 增补字段

- `sources` 会在 <black>hkgovAls</black> key 下保留源链、交付文件和楼宇规范化证据
- `bbox` 由标准点几何计算

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
  <black>blockTypeBeforeNumber</black>。已识别的英文类型变体使用
  <black>BLK</black>、<black>BLDG</black>、<black>TWR</black>、<black>HSE</black> 或
  <black>APT</black>；繁体中文会把参考值放在类型之前。ALS 的 <black>BlockNo</black>
  不假定为数字，亦可为 <black>A</black> 或 <black>EAST</black>
  等标签。原始类型保留于已保存的楼宇对象。
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

- 原始中英文楼宇地址对象通过 <black>hkgovAls</black> 源 profile 保留。
- 发布者坐标、`CsuId`、`GeoAddress`、源文件和 feature index 仍可作为源数据取得。

### 不公开字段

- 独立的 ALS 公共租赁房屋三维数据不会导入二维地址数据集。
- 完全重复的源 feature 及等价的楼宇变体会合并，其源证据保留于版本处理记录。

## 限制

### 整理政策

{{addressCurationPolicy:zh-Hans}}

### 已知质量问题

{{addressKnownQualityIssues:zh-Hans}}
