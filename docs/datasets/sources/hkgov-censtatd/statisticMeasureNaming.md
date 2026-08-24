# Statistic measure naming

## v1

### EN

`fieldName` is the stable lower-camel-case identifier for a published C&SD statistic
measure. It expands the publisher's abbreviated `sourceField` into the smallest useful
description that a reader can understand without consulting the publisher's data
definition. It describes the subject and its meaningful qualifiers, rather than copying
the source-field abbreviation or the way the value is represented.

Use established statistical terms where they are the measure's public identity, such as
`populationDensity`, `sexRatio`, `age`, or `labourForceParticipationRate`. Spell out
abbreviations unless the abbreviation is independently clear and conventional, e.g.
`exclFDH` for _excluding foreign domestic helpers_. Use lower camel case, singular
concepts where possible, and concise conventional qualifiers for ranges: `aged15To39`,
`aged65AndOver`, rather than opaque source-field suffixes.

`measureCode` never includes the unit, aggregation, reference period,
percentage/proportion representation, or a publisher-specific table heading. Those
details belong to reviewed measure metadata and its localised description. A qualifier
needed to distinguish publisher values belongs in `fieldName`; aggregation is recorded
in its dedicated metadata. Reviewed historical codes remain stable identifiers; this
convention guides new curation and does not silently rename a published measure.

`measureCode` identifies the dimension-free statistical concept. `fieldName` identifies
one publisher field and may include the smallest qualifier needed to distinguish it;
`dimensions` encode reusable analytical qualifiers. For example, a male labour-force
median age uses `measureCode: age`, `fieldName: medianAgeOfMaleLabourForce`, unit
`year`, and dimensions for `population-group: labour-force` and `sex: male`. It is not a
`labourForce` measure in `person` merely because the measured population is the labour
force.

Derive the metadata from the value described, not from the nouns surrounding it:

- _Median age of the labour force_ is a `quantity`, aggregated as `median`, measured in
  `year`, and mapped to `age`.
- _Median monthly employment income_ is a `quantity`, aggregated as `median`, measured
  in `hong-kong-dollar`, and mapped to `monthlyEmploymentIncome`.
- _Number of occupied quarters with subdivided units_ counts `occupiedQuarters` in
  `living-quarter`; _number of occupied subdivided units_ counts `subdividedUnits` in
  `subdivided-unit`. Similar wording does not make the units interchangeable.

A `proportion` is a part-to-whole share: the numerator is a subset of its denominator,
such as people aged 65 and over as a share of the total population. A `rate` relates a
quantity or event count to an eligible or exposed population, often with a time or
eligibility basis. Labour-force participation is conventionally a rate because the
labour force is related to the eligible population aged 15 and over, even though its
arithmetic is also a proportion. Use the established public statistical identity when it
is unambiguous. Neither proportions nor rates are additive, so their aggregation is
`none`, never `total`.

Encode every meaningful qualifier stated by the publisher. A description that excludes
both foreign domestic helpers and unpaid family workers requires both
`foreign-domestic-helper: excluded` and `unpaid-family-worker: excluded`. Do not leave a
qualifier only in `fieldName` or prose, because analytical filtering uses `dimensions`.

Positive and negative identifier examples:

- Use `aged0To14`, `aged15To39`, `hkd6000To9999`, and `exclFDH`; do not use `aged014`,
  `aged1539`, `hkd60009999`, `HK6000To9999`, or an unexplained `excluded` suffix.
- Use `domesticHouseholds1PersonProportion`; do not copy a table heading into
  `percentageShareOfDomesticHouseholdsInRespectiveDistrictHouseholdSize1Person`.
- Keep the unit and representation in metadata: use `populationAged65AndOver`, not
  `percentagePopulationAged65AndOver` or `populationAged65AndOverPercent`.

Canonical measure localisations must be identical wherever the same `measureCode` is
used. Publisher-field localisations may retain genuinely different scope or terminology.
For example, Chinese `收入` and `入息` both mean _income_ and do not create distinct
measures; a trailing `(%)` is a unit annotation, not a different definition. Names must
be sentence-cased, balanced, plain text. Preserve a complete valid source description
rather than deriving a broken name with unmatched parentheses or encoded HTML entities.
When fields in separate datasets have the same measure and dimensions, their field
localisations must be identical too. Normalise superficial source variants such as a
trailing `(%)` or `收入` versus `入息`; retain a difference only when it expresses a
different scope or qualifier. Within one dataset, each localised field name must
distinguish its field: use _Non-working population: Unpaid carers_, not the unqualified
_Non-working population_, and distinguish a count from its proportion. Write numeric
intervals as _aged 15 to 24_ or _HK$10,000 to 29,999_, not _aged 15: 24_ or _HK$10,000:
29,999_.

Treat `schemaSpecification.sha256` drift as a new review event. Re-read the current
publisher definitions and verify the field, measure, unit, dimensions, and localisations
before replacing the hash; do not update the hash alone.

### ZH-HANT

`fieldName` 是已發布 C&SD 統計指標的穩定 lower camel case 識別碼。它會把發布者縮寫的
`sourceField`
擴展為無須查閱發布者資料定義也能理解的最精簡描述。它描述統計對象及有意義的限定，而不是複製來源欄位縮寫或數值的呈現方式。

沿用具既定公共含義的統計術語，例如 `populationDensity`、`sexRatio`、`age` 和
`labourForceParticipationRate`。除非縮寫本身清晰且屬慣例，否則應完整拼寫。使用 lower
camel case、盡量採用單數概念，並以簡潔而通用的限定詞表示範圍和排除條件，例如
`aged15To39`、 `aged65AndOver` 及 `exclFDH`，而非使用不透明的來源欄位後綴。

`measureCode`
不包含單位、匯總方式、參考時段、百分比／比例的呈現方式或發布者表格標題。這些細節屬於經審核的指標中繼資料及其在地化描述。區分發布者數值所需的限定詞屬於
`fieldName`；匯總方式則記錄在專用中繼資料中。已審核的歷史代碼仍為穩定識別碼；本慣例用於新的整理，不會悄然重新命名已發布的指標。

`measureCode` 表示不含維度的統計概念；`fieldName`
表示一個發布者欄位，並只加入區分該欄位所需的最少限定；`dimensions`
則記錄可重用的分析限定。例如，男性勞動人口的年齡中位數使用 `measureCode: age`、
`fieldName: medianAgeOfMaleLabourForce`、單位 `year`，以及
`population-group: labour-force` 和 `sex: male`
維度。不能因統計對象是勞動人口，便把它記成以 `person` 為單位的 `labourForce` 指標。

中繼資料應按數值所描述的內容推導，而非按描述附近的名詞推導：

- 「勞動人口年齡中位數」是以 `year` 為單位、`median` 匯總的 `quantity`，並對應 `age`。
- 「每月主要職業收入中位數」是以 `hong-kong-dollar` 為單位、`median` 匯總的
  `quantity`，並對應 `monthlyEmploymentIncome`。
- 「有分間樓宇單位且有人居住的屋宇單位數目」以 `living-quarter` 計算
  `occupiedQuarters`；「有人居住的分間樓宇單位數目」則以 `subdivided-unit` 計算
  `subdividedUnits`。字眼相似不代表單位可以互換。

`proportion` 是部分佔整體的份額，例如65歲及以上人口佔總人口的比例。`rate`
則把數量或事件數目與合資格或承受風險的人口相聯，通常包含時間或資格基礎。勞動人口參與率按慣例屬
`rate`，因為它把勞動人口與15歲及以上合資格人口相聯，即使其算式亦是比例。概念清楚時應沿用既定公共統計名稱。比例和率均不可相加，所以匯總方式必須是
`none`，不能是 `total`。

發布者明示的每項重要限定均須編碼。若描述同時排除外籍家庭傭工和無酬家庭從業員，便須同時設定
`foreign-domestic-helper: excluded` 和
`unpaid-family-worker: excluded`。不可只把限定留在 `fieldName`
或文字中，因為分析篩選使用 `dimensions`。

正面和反面識別碼例子：

- 使用 `aged0To14`、`aged15To39`、`hkd6000To9999` 和 `exclFDH`；不要使用
  `aged014`、`aged1539`、`hkd60009999`、`HK6000To9999` 或意思不明的 `excluded` 後綴。
- 使用 `domesticHouseholds1PersonProportion`；不要把發布者表頭複製成
  `percentageShareOfDomesticHouseholdsInRespectiveDistrictHouseholdSize1Person`。
- 單位和呈現方式應留在中繼資料：使用 `populationAged65AndOver`，不要使用
  `percentagePopulationAged65AndOver` 或 `populationAged65AndOverPercent`。

同一 `measureCode`
的標準在地化內容必須完全一致。若發布者欄位的範圍或術語確有差異，欄位在地化內容則可保留差異。例如中文「收入」和「入息」均指 income，不會構成不同指標；末尾的
`(%)`
是單位標註，也不是不同定義。名稱須使用一致句式、括號配對的純文字。與其從來源描述產生括號殘缺或含 HTML 實體的名稱，應保留完整而有效的來源描述。若不同資料集的欄位具有相同指標和維度，其欄位在地化內容亦必須完全一致。應統一
`(%)` 結尾或 `收入`／`入息`
等表面差異；只有表達不同範圍或限定時才保留差異。在同一資料集內，每個在地化欄位名稱都必須能區分其欄位：應使用
_Non-working population: Unpaid carers_，而非沒有類別限定的 _Non-working
population_，並須區分數目和比例。數值區間應寫成 _aged 15 to 24_ 或
_HK$10,000 to 29,999_，不應寫成 _aged 15: 24_ 或
_HK$10,000: 29,999_。

`schemaSpecification.sha256`
若有變動，須視為一次新的審核。替換雜湊前，必須重新讀取發布者目前的定義，並核對欄位、指標、單位、維度和在地化內容；不可只更新雜湊。

### ZH-HANS

`fieldName` 是已发布 C&SD 统计指标的稳定 lower camel case 标识符。它会把发布者缩写的
`sourceField`
扩展为无需查阅发布者数据定义也能理解的最精简描述。它描述统计对象及有意义的限定，而不是复制来源字段缩写或数值的呈现方式。

沿用具有既定公共含义的统计术语，例如 `populationDensity`、`sexRatio`、`age` 和
`labourForceParticipationRate`。除非缩写本身清晰且属惯例，否则应完整拼写。使用 lower
camel case、尽量采用单数概念，并以简洁而通用的限定词表示范围和排除条件，例如
`aged15To39`、 `aged65AndOver` 及 `exclFDH`，而非使用不透明的来源字段后缀。

`measureCode`
不包含单位、汇总方式、参考时段、百分比／比例的呈现方式或发布者表格标题。这些细节属于经审核的指标元数据及其本地化描述。区分发布者数值所需的限定词属于
`fieldName`；汇总方式则记录在专用元数据中。已审核的历史代码仍为稳定标识符；本惯例用于新的整理，不会悄然重命名已发布的指标。

`measureCode` 表示不含维度的统计概念；`fieldName`
表示一个发布者字段，并只加入区分该字段所需的最少限定；`dimensions`
则记录可重用的分析限定。例如，男性劳动人口的年龄中位数使用 `measureCode: age`、
`fieldName: medianAgeOfMaleLabourForce`、单位 `year`，以及
`population-group: labour-force` 和 `sex: male`
维度。不能因统计对象是劳动人口，便把它记成以 `person` 为单位的 `labourForce` 指标。

元数据应按数值所描述的内容推导，而非按描述附近的名词推导：

- “劳动人口年龄中位数”是以 `year` 为单位、`median` 汇总的 `quantity`，并对应 `age`。
- “每月主要职业收入中位数”是以 `hong-kong-dollar` 为单位、`median` 汇总的
  `quantity`，并对应 `monthlyEmploymentIncome`。
- “有分间楼宇单位且有人居住的屋宇单位数目”以 `living-quarter` 计算
  `occupiedQuarters`；“有人居住的分间楼宇单位数目”则以 `subdivided-unit` 计算
  `subdividedUnits`。字眼相似不代表单位可以互换。

`proportion` 是部分占整体的份额，例如65岁及以上人口占总人口的比例。`rate`
则把数量或事件数目与合资格或承受风险的人口相联，通常包含时间或资格基础。劳动人口参与率按惯例属
`rate`，因为它把劳动人口与15岁及以上合资格人口相联，即使其算式也是比例。概念清楚时应沿用既定公共统计名称。比例和率均不可相加，所以汇总方式必须是
`none`，不能是 `total`。

发布者明示的每项重要限定均须编码。若描述同时排除外籍家庭佣工和无酬家庭从业员，便须同时设置
`foreign-domestic-helper: excluded` 和
`unpaid-family-worker: excluded`。不可只把限定留在 `fieldName`
或文字中，因为分析筛选使用 `dimensions`。

正面和反面标识符示例：

- 使用 `aged0To14`、`aged15To39`、`hkd6000To9999` 和 `exclFDH`；不要使用
  `aged014`、`aged1539`、`hkd60009999`、`HK6000To9999` 或意思不明的 `excluded` 后缀。
- 使用 `domesticHouseholds1PersonProportion`；不要把发布者表头复制成
  `percentageShareOfDomesticHouseholdsInRespectiveDistrictHouseholdSize1Person`。
- 单位和呈现方式应留在元数据：使用 `populationAged65AndOver`，不要使用
  `percentagePopulationAged65AndOver` 或 `populationAged65AndOverPercent`。

同一 `measureCode`
的标准本地化内容必须完全一致。若发布者字段的范围或术语确有差异，字段本地化内容则可保留差异。例如中文“收入”和“入息”均指 income，不会构成不同指标；末尾的
`(%)`
是单位标注，也不是不同定义。名称须使用一致句式、括号配对的纯文本。与其从来源描述产生括号残缺或含 HTML 实体的名称，应保留完整而有效的来源描述。若不同数据集的字段具有相同指标和维度，其字段本地化内容也必须完全一致。应统一
`(%)` 结尾或 `收入`／`入息`
等表面差异；只有表达不同范围或限定时才保留差异。在同一数据集内，每个本地化字段名称都必须能区分其字段：应使用
_Non-working population: Unpaid carers_，而非没有类别限定的 _Non-working
population_，并须区分数目和比例。数值区间应写成 _aged 15 to 24_ 或
_HK$10,000 to 29,999_，不应写成 _aged 15: 24_ 或
_HK$10,000: 29,999_。

`schemaSpecification.sha256`
若有变动，须视为一次新的审核。替换哈希前，必须重新读取发布者目前的定义，并核对字段、指标、单位、维度和本地化内容；不可只更新哈希。
