# Statistic measure naming

## v1

### EN

`fieldName` is the stable lower-camel-case identifier for a published C&SD statistic
measure. It expands the publisher's abbreviated `sourceField` into the smallest useful
description that a reader can understand without consulting the publisher's data
definition. It describes the subject and its meaningful qualifiers, rather than copying
the source-field abbreviation or the way the value is represented.

Use established statistical terms where they are the measure's public identity, such as
`populationDensity`, `sexRatio`, `medianAge`, or `labourForceParticipationRate`. Spell
out abbreviations unless the abbreviation is independently clear and conventional, e.g.
`exclFDH` for _excluding foreign domestic helpers_. Use lower camel case, singular
concepts where possible, and concise conventional qualifiers for ranges: `aged15To39`,
`aged65AndOver`, rather than opaque source-field suffixes.

The code does not include the unit, aggregation, reference period, percentage/proportion
representation, or a publisher-specific table heading unless that detail distinguishes
the statistical concept. Those details belong to the reviewed measure metadata and its
localised description. Reviewed historical codes remain stable identifiers; this
convention guides new curation and does not silently rename a published measure.

### ZH-HANT

`fieldName` 是已發布 C&SD 統計指標的穩定 lower camel case 識別碼。它會把發布者縮寫的
`sourceField`
擴展為無須查閱發布者資料定義也能理解的最精簡描述。它描述統計對象及有意義的限定，而不是複製來源欄位縮寫或數值的呈現方式。

沿用具既定公共含義的統計術語，例如 `populationDensity`、`sexRatio`、`medianAge` 和
`labourForceParticipationRate`。除非縮寫本身清晰且屬慣例，否則應完整拼寫。使用 lower
camel case、盡量採用單數概念，並以簡潔而通用的限定詞表示範圍和排除條件，例如
`aged15To39`、 `aged65AndOver` 及 `exclFDH`，而非使用不透明的來源欄位後綴。

代碼不包含單位、匯總方式、參考時段、百分比／比例的呈現方式，或非用不可的發布者表格標題。這些細節屬於經審核的指標中繼資料及其在地化描述。已審核的歷史代碼仍為穩定識別碼；本慣例用於新的整理，不會悄然重新命名已發布的指標。

### ZH-HANS

`fieldName` 是已发布 C&SD 统计指标的稳定 lower camel case 标识符。它会把发布者缩写的
`sourceField`
扩展为无需查阅发布者数据定义也能理解的最精简描述。它描述统计对象及有意义的限定，而不是复制来源字段缩写或数值的呈现方式。

沿用具有既定公共含义的统计术语，例如 `populationDensity`、`sexRatio`、`medianAge` 和
`labourForceParticipationRate`。除非缩写本身清晰且属惯例，否则应完整拼写。使用 lower
camel case、尽量采用单数概念，并以简洁而通用的限定词表示范围和排除条件，例如
`aged15To39`、 `aged65AndOver` 及 `exclFDH`，而非使用不透明的来源字段后缀。

代码不包含单位、汇总方式、参考时段、百分比／比例的呈现方式，或非用不可的发布者表格标题。这些细节属于经审核的指标元数据及其本地化描述。已审核的历史代码仍为稳定标识符；本惯例用于新的整理，不会悄然重命名已发布的指标。
