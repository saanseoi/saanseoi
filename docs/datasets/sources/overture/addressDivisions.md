# address division normalization

## v1

### EN

SaanSeoi uses Overture `address_levels` to attach an address to canonical Hong Kong
division rows. The source array itself is not copied into the canonical address.

- The first level identifies the area. `HK`, `KLN`, and `NT` (and their name variants)
  are normalized to the retained source codes `HK`, `KL`, and `NT`, then resolved to
  canonical `areaId` values.
- The second level identifies the district. Its name is normalized to a retained source
  district code, then resolved to canonical `districtId`.
- Both references are resolved from the same-cohort published division snapshot, so an
  address release uses the division taxonomy published for that release's cohort.
- The normalized source `area` and `district` codes are retained for source audit. The
  canonical address only stores the resolved division IDs.

For the checked `2025-09-24.0` Hong Kong SAR file, every one of 182,155 rows has exactly
two levels: an area (`HK`, `KLN`, or `NT`) followed by one of the 18 district names.
There are no town, village, neighbourhood, or lower-level address entries in that file.

### ZH-HANT

SaanSeoi 使用 Overture 的 `address_levels`
將地址連結至標準香港區劃資料列。來源陣列本身不會複製到標準地址中。

- 第一層識別區域。`HK`、`KLN` 和 `NT`（以及其名稱變體）會正規化為保留的來源代碼
  `HK`、`KL` 和 `NT`，然後解析為標準的 `areaId` 值。
- 第二層識別地區。其名稱會正規化為保留的地區代碼，然後解析為標準的 `districtId`。
- 兩個參照都會從同一 cohort 的已發佈區劃快照中解析，因此地址版本會使用該 cohort 所發佈的區劃分類法。
- 正規化後的來源 `area` 和 `district`
  代碼會予以保留，以供來源稽核。標準地址只會儲存已解析的區劃 ID。

在已檢查的 `2025-09-24.0`
香港特別行政區檔案中，182,155 行資料每一行都恰好有兩個層級：一個區域（`HK`、`KLN` 或
`NT`），後接 18 個地區名稱之一。該檔案沒有城鎮、村落、鄰里或更低層級的地址資料。

### ZH-HANS

SaanSeoi 使用 Overture 的 `address_levels`
将地址关联至标准香港区划数据行。源数组本身不会复制到标准地址中。

- 第一层识别区域。`HK`、`KLN` 和 `NT`（以及其名称变体）会规范化为保留的源代码 `HK`、`KL`
  和 `NT`，然后解析为标准的 `areaId` 值。
- 第二层识别地区。其名称会规范化为保留的地区代码，然后解析为标准的 `districtId`。
- 两个引用都会从同一 cohort 的已发布区划快照中解析，因此地址版本会使用该 cohort 发布的区划分类法。
- 规范化后的源 `area` 和 `district`
  代码会予以保留，以供源审计。标准地址只会存储已解析的区划 ID。

在已检查的 `2025-09-24.0`
香港特别行政区文件中，182,155 行数据每一行都恰好有两个层级：一个区域（`HK`、`KLN` 或
`NT`），后接 18 个地区名称之一。该文件没有城镇、村庄、邻里或更低层级的地址数据。
