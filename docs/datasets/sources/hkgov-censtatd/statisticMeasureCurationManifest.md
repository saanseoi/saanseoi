# Measure curation manifest

## v1

### EN

A document that defines the canonical metadata for every publisher statistic field in
one SaanSeoi dataset. There is one manifest per `datasetCode`; then each of the
measure's retains the publisher's `sourceField` and assigns its stable `fieldName`,
statistic kind, aggregation, percentile rank where applicable, unit, optional
denominator, source null option, and localised name and description. Our statistics
pipeline requires this to be reviewed before it publishes an observation.

### ZH-HANT

C&SD 指標整理清單是一份文件，為一個山水資料集內每個發布者統計欄位定義標準中繼資料。每個
`datasetCode` 各有一份清單；每項指標均保留發布者的 `sourceField`，並指定其穩定的
`fieldName`、統計種類、匯總方式、百分位數排名（如適用）、單位、可選分母、來源空值選項，以及在地化名稱和描述。我們的統計處理流程要求先完成審核，才會發布觀測。

版本說明會使用同一份清單產生指標對應表。它是表中名稱和描述的唯一審核來源，並不是發布者綱要或觀測值的另一份副本。

### ZH-HANS

C&SD 指标整理清单是一份文件，为一个山水数据集内每个发布者统计字段定义标准元数据。每个
`datasetCode` 各有一份清单；每项指标均保留发布者的 `sourceField`，并指定其稳定的
`fieldName`、统计种类、汇总方式、百分位数排名（如适用）、单位、可选分母、来源空值选项，以及本地化名称和描述。我们的统计处理流程要求先完成审核，才会发布观测。

版本说明会使用同一份清单产生指标对应表。它是表中名称和描述的唯一审核来源，并不是发布者架构或观测值的另一份副本。
