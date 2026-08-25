# locale

## v1

### EN

#### Tag normalisation

- Locale tags are normalised to lowercase BCP 47-like forms
- Underscores are converted to hyphens
- Source locale `zh` is stored as `zh-hant`

#### API normalisation

- Canonical current/history division snapshots also add API-facing locale rows for:
  - `en`
  - `zh-hant`
  - `zh-hans`
- Those canonical rows are filled from preferred source variants when present:
  - `zh-hant` prefers `zh-hk`, then `zh-hant`, then `zh-mo`, then `zh-tw`
  - `zh-hans` prefers `zh-hans`, then `zh-cn`, then `zh-sg`
- Atlas request-time locale filters are matched case-insensitively after lowercasing
  input

#### Inference rules

- Unlabeled Chinese-only names, including locale-less alternate rules, are inferred as
  `zh-hant` for the Hong Kong division feed
- Unlabeled Latin alphanumeric names are inferred as `en`
- Mixed-script values in the form `<Chinese> <Latin>` are split into `zh-hant` and `en`
- Locale-less text may be inferred and marked with `isLocaleInferred = true`

#### Release audit

Each affected division is retained in `releaseProcessingActions` for investigation:

- `overture_division_locale_inferred` records source `names`, normalised i18n rows, and
  the inferred locales when unlabeled text requires script-based inference.
- `overture_division_api_locale_fallback_added` records the same source and normalised
  evidence when an API-facing `zh-hant` or `zh-hans` fallback row is added.
- `overture_division_name_ai_translated` and `overture_division_name_human_translated`
  record every generated name locale applied to the release, including source text,
  target text, locale, and parent-division context.

No locale audit row is written when a division already has the required canonical locale
without inference or fallback.

#### Dataset translation memory

Overture uses `fixtures/i18n/datasets/ds-hk-overture-division.json`, rather than one
translation file per source release. The identity key is
`(field, contextHash, sourceLocale, sourceTextHash, targetLocale)`. Division context
contains the parent division ID and English parent name, so equal source text is reused
only when it has the same parent context.

Each entry retains AI or human provenance plus `firstSeenRelease` and `lastSeenRelease`.
It also records the literal `sourceText` and sorted canonical `recordIds` that have used
the entry. Record IDs are editor-facing references; they are not part of the translation
key, so the importer can reuse a contextual term across records and releases.
Translations have no validity-time dimension: fixture edits affect later imports only.
The release audit action remains the immutable evidence of what was applied at the time.
Locale coverage statistics categorise each name exclusively as provided, inferred,
AI-translated, or human-translated.

### ZH-HANT

#### 標籤正規化

- 語言地區標籤會正規化為小寫、近似 BCP 47 的格式
- 下劃線會轉換為連字號
- 來源語言地區 `zh` 會儲存為 `zh-hant`

#### API 正規化

- 標準的目前／歷史區劃快照也會新增面向 API 的語言地區資料列：
  - `en`
  - `zh-hant`
  - `zh-hans`
- 如果有可用的偏好來源變體，這些標準資料列會從中填充：
  - `zh-hant` 優先使用 `zh-hk`，其次是 `zh-hant`、`zh-mo`，再其次是 `zh-tw`
  - `zh-hans` 優先使用 `zh-hans`，其次是 `zh-cn`、`zh-sg`
- Atlas 在請求時的語言地區篩選器會先將輸入轉為小寫，再以不分大小寫的方式比對

#### 推斷規則

- 沒有標籤且只有中文的名稱（包括沒有語言標籤的別名規則）會在香港區劃資料中推斷為
  `zh-hant`
- 沒有標籤且只包含拉丁字母及數字的名稱會推斷為 `en`
- 形如 `<中文> <拉丁文>` 的混合文字值會拆分為 `zh-hant` 和 `en`
- 沒有語言地區標籤的文字可以被推斷，並標記為 `isLocaleInferred = true`

### ZH-HANS

#### 标签规范化

- 语言区域标签会规范化为小写、近似 BCP 47 的格式
- 下划线会转换为连字符
- 源语言区域 `zh` 会存储为 `zh-hant`

#### API 规范化

- 标准的当前／历史区划快照也会新增面向 API 的语言区域数据行：
  - `en`
  - `zh-hant`
  - `zh-hans`
- 如果有可用的首选源变体，这些标准数据行会从中填充：
  - `zh-hant` 优先使用 `zh-hk`，其次是 `zh-hant`、`zh-mo`，再其次是 `zh-tw`
  - `zh-hans` 优先使用 `zh-hans`，其次是 `zh-cn`、`zh-sg`
- Atlas 在请求时的语言区域筛选器会先将输入转为小写，再以不区分大小写的方式匹配

#### 推断规则

- 没有标签且只有中文的名称（包括没有语言标签的别名规则）会在香港区划数据中推断为
  `zh-hant`
- 没有标签且只包含拉丁字母及数字的名称会推断为 `en`
- 形如 `<中文> <拉丁文>` 的混合文字值会拆分为 `zh-hant` 和 `en`
- 没有语言区域标签的文本可以被推断，并标记为 `isLocaleInferred = true`
