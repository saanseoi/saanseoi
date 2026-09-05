# locale

## v1

### EN

#### Tag normalisation

- Locale tags are normalised to lowercase BCP 47-like forms
- Underscores are converted to hyphens
- `language` and `lang` values are normalised, but missing locale information is not
  defaulted to `en`

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

- Unlabelled Han text is inferred as `zh-hant` for the Hong Kong Places feed when no
  stronger regional or script hint is available
- Unlabeled Latin alphanumeric names are inferred as `en`
- A supplied locale is retained when it agrees with the script. A conflicting supplied
  locale is resolved from strong script evidence and recorded with the source value in a
  release audit action; Chinese text is never silently kept under `en`
- Mixed-script values remain one source value unless the publisher supplies separate
  variants. `zh-hant` identifies Traditional Chinese script, not Cantonese
- Inferred rows are marked with `isLocaleInferred = true`; the raw publisher value is
  retained, and conflict evidence is recorded in the release audit

#### Release audit

Each affected source record is retained in `releaseProcessingActions` for investigation:

- `overture_division_locale_inferred` records source `names`, normalised i18n rows, and
  the inferred locales when unlabeled text requires script-based inference.
- `overture_division_api_locale_fallback_added` records the same source and normalised
  evidence when an API-facing `zh-hant` or `zh-hans` fallback row is added.
- `overture_division_name_ai_translated` and `overture_division_name_human_translated`
  record every generated name locale applied to the release, including source text,
  target text, locale, and parent-division context.
- `overture_place_locale_conflict` records the Place ID, field, source value, source
  locale, resolved locale, script, and conflict reason when strong script evidence
  overrides a publisher locale label.

No locale audit row is written when a division already has the required canonical locale
without inference or fallback.

#### Dataset translation memory

Overture uses dataset-scoped fixtures, including
`fixtures/i18n/datasets/ds-hk-overture-division.json` and
`fixtures/i18n/datasets/ds-hk-overture-place.json`, rather than one translation file per
source release. The identity key is
`(field, contextHash, sourceLocale, sourceTextHash, targetLocale)`. Division context
contains the parent division ID and English parent name, so equal source text is reused
only when it has the same parent context.

Each entry retains AI or human provenance plus `firstSeenRelease` and `lastSeenRelease`.
It also records the literal `sourceText` and sorted canonical `recordIds` that have used
the entry. Record IDs are editor-facing references; they are not part of the translation
key, so the importer can reuse a contextual term across records and releases. Place
fixtures contain the Place ID, field (`name` or `freeformAddress`), exact source locale
and text hash, target locale, translated text, provider, and verification status. They
never contain brand translations. Place translation is optional during import; a target
is translated only when its existing PlaceI18n row is already present, and no row is
created merely for a translation. Fixture generation is restricted to an explicitly
permitted local import. Translations have no validity-time dimension: fixture edits
affect later imports only. The release audit action remains the immutable evidence of
what was applied at the time. Locale coverage statistics categorise each name
exclusively as provided, inferred, AI-translated, or human-translated.

### Places reference labels

`referenceName` is a derived display projection, not a locale row or stable identifier.
It prefers Traditional Chinese followed by English, then Traditional Chinese, English,
and the best remaining value. The bilingual form is used only when the first value is
genuinely Han Traditional Chinese and the English value contains no Han characters.

### ZH-HANT

#### 標籤正規化

- 語言地區標籤會正規化為小寫、近似 BCP 47 的格式
- 下劃線會轉換為連字號
- 缺少語言地區資料的值不會默認為 `en`，會按文字腳本推斷

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
- 混合腳本值會保留為一個來源值，不會自行拆分；`zh-hant` 代表繁體中文腳本，不代表粵語
- 與腳本衝突的來源標籤會被修正，並將來源值及衝突證據記錄在發布審核動作中；推斷值會標記
  `isLocaleInferred = true`
- Places 翻譯是可選的，只會翻譯已有目標資料列中缺少的 `name` 或
  `freeformAddress`，不會翻譯品牌或只為翻譯新增資料列
- 語言標籤與強烈腳本證據衝突時，來源值及衝突證據會記錄在發布審核動作中

### ZH-HANS

#### 标签规范化

- 语言区域标签会规范化为小写、近似 BCP 47 的格式
- 下划线会转换为连字符
- 缺少语言区域资料的值不会默认为 `en`，会按文字脚本推断

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
- 混合脚本值会保留为一个源值，不会自行拆分；`zh-hant` 代表繁体中文脚本，不代表粤语
- 与脚本冲突的源标签会被修正，并将源值及冲突证据记录在发布审核动作中；推断值会标记
  `isLocaleInferred = true`
- Places 翻译是可选的，只会翻译已有目标资料列中缺少的 `name` 或
  `freeformAddress`，不会翻译品牌或只为翻译新增资料列
- 语言标签与强烈文字脚本证据冲突时，源值及冲突证据会记录在发布审核动作中
