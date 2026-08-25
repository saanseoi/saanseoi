# division hierarchy normalisation

## v1

### EN

SaanSeoi unwrap Overture's nested <black>hierarchies</black> payload into a singleton
`hierarchy` list, with the following process:

- The country ancestor and the entry for the division itself are omitted: both are
  implicit in a Hong Kong division record and add no useful hierarchy information.
- For each remaining ancestor, SaanSeoi first looks up the referenced canonical
  division. When found, it uses that row's canonical `level`, `type`, and localised
  names rather than trusting Overture's locale-less hierarchy label.
- The lookup is built from the complete division file before rows are normalised. For a
  raw <black>locality</black> ancestor, the matching division row therefore supplies the
  omitted <black>class</black>: its canonical `level`, `type`, and localised names are
  copied into the normalised hierarchy entry.
- If an ancestor has no canonical lookup row, SaanSeoi can still derive its level and
  type from supported raw subtype hints and infer a label from the supplied name. A raw
  <black>locality</black> ancestor is the exception: it requires the lookup row because
  the hierarchy payload omits the <black>class</black> needed to distinguish city, town,
  village, and hamlet. If that lookup row is missing, normalisation fails with an
  explicit error.
- The original Overture payload is retained under <black>overture.hierarchies</black>.
- For a district, and for every division that has a district ancestor, SaanSeoi inserts
  Hong Kong Island, Kowloon, or the New Territories immediately after Hong Kong SAR. The
  release audit records one automatic action for each area with its assigned division
  count.

### ZH-HANT

SaanSeoi 會將 Overture 巢狀的 <black>hierarchies</black> 資料解包為只包含一個項目的
`hierarchy` 清單，流程如下：

- 國家祖先及代表該區劃本身的項目會被省略：兩者在香港區劃資料列中都是隱含的，並不會提供有用的層級資訊。
- 對於每個其餘的祖先，SaanSeoi 會先查找所參照的標準區劃。找到後，會使用該資料列的標準
  `level`、`type` 和本地化名稱，而不是依賴 Overture 沒有語言地區資訊的層級標籤。
- 查找表會在資料列正規化前，根據完整的區劃檔案建立。因此，對於原始的
  <black>locality</black> 祖先，相符的區劃資料列會提供已省略的
  <black>class</black>；其標準 `level`、`type`
  和本地化名稱會複製到正規化後的層級項目中。
- 如果祖先沒有相符的標準查找資料列，仍可根據受支援的原始 subtype 提示推導其層級和類型，並從所提供的名稱推斷標籤。原始的
  <black>locality</black>
  祖先是例外：由於層級資料省略了用來區分 city、town、village 和 hamlet 的
  <black>class</black>，因此必須有查找資料列。如果缺少該資料列，正規化會因明確的錯誤而失敗。
- 原始 Overture 資料會保留在 <black>overture.hierarchies</black> 下。
- 對於地區，以及層級中有地區祖先的每個區劃，SaanSeoi 會在香港特別行政區之後立即加入香港島、九龍或新界。發布審計會為每個地區記錄一項自動操作及其獲指派的區劃數目。

### ZH-HANS

SaanSeoi 会将 Overture 嵌套的 <black>hierarchies</black> 数据解包为只包含一个项目的
`hierarchy` 列表，流程如下：

- 国家祖先以及代表该区划本身的项目会被省略：两者在香港区划数据行中都是隐含的，不会提供有用的层级信息。
- 对于每个其余的祖先，SaanSeoi 会先查找所引用的标准区划。找到后，会使用该数据行的标准
  `level`、`type` 和本地化名称，而不是依赖 Overture 没有语言区域信息的层级标签。
- 查找表会在数据行规范化前，根据完整的区划文件建立。因此，对于原始的
  <black>locality</black> 祖先，相符的区划数据行会提供被省略的
  <black>class</black>；其标准 `level`、`type`
  和本地化名称会复制到规范化后的层级项目中。
- 如果祖先没有相符的标准查找数据行，仍可根据受支持的原始 subtype 提示推导其层级和类型，并从所提供的名称推断标签。原始的
  <black>locality</black>
  祖先是例外：由于层级数据省略了用于区分 city、town、village 和 hamlet 的
  <black>class</black>，因此必须有查找数据行。如果缺少该数据行，规范化会因明确的错误而失败。
- 原始 Overture 数据会保留在 <black>overture.hierarchies</black> 下。
- 对于地区，以及层级中有地区祖先的每个区划，SaanSeoi 会在香港特别行政区之后立即加入香港岛、九龙或新界。发布审计会为每个地区记录一项自动操作及其获指派的区划数目。
