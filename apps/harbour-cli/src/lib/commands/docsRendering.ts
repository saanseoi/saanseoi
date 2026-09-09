import { apiProfileDocumentationByFamily, apiProfileNames } from '@repo/core/apiLocales'
import { ensureTrailingNewline, parseSimpleYaml } from './docsFixtures.ts'
import type { ApiReleaseSetSourceDocsRow } from './docsTypes.ts'
import {
  renderApiFamilyDomains,
  renderApiReleaseSetCompanionResources,
  renderApiReleaseSetSourcesTables,
  renderCenstatdMeasureTables,
  type ApiReleaseSetSourceDocsLocale,
} from './docsResources.ts'
import { API_RELEASE_SET_NOTES_DIRECTORY } from './docsConfig.ts'
import { escapeMarkdownTableCell } from './docsMeasures.ts'
import { expandTimeTravelSections } from './docsTimeTravel.ts'
import { expandGuideSections } from './docsGuideSections.ts'

export function parseMarkdownFixture(content: string) {
  if (!content.startsWith('---\n')) {
    return {
      frontmatter: {},
      body: ensureTrailingNewline(content),
    }
  }

  const endIndex = content.indexOf('\n---\n', 4)

  if (endIndex === -1) {
    throw new Error('Markdown fixture has an opening frontmatter fence but no close.')
  }

  const frontmatterText = content.slice(4, endIndex)
  const body = content.slice(endIndex + '\n---\n'.length)

  return {
    frontmatter: parseSimpleYaml(frontmatterText),
    body: ensureTrailingNewline(body),
  }
}

export function serialiseMarkdownFixture(
  frontmatter: Record<string, string>,
  body: string,
) {
  return `---\n${Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n${ensureTrailingNewline(body)}`
}

export async function renderMarkdownFixtureBody(
  fixture: {
    body: string
    frontmatter: Record<string, string>
  },
  frontmatterOverride: Record<string, string> = {},
  apiReleaseSources: ApiReleaseSetSourceDocsRow[] = [],
  fixturePath?: string,
) {
  try {
    const frontmatter = {
      ...fixture.frontmatter,
      ...frontmatterOverride,
    }

    const markdown = expandTimeTravelSections(
      expandGuideSections(fixture.body, frontmatter),
      frontmatter,
    ).replace(
      /\{\{\s*([a-z][A-Za-z0-9_-]*(?::[A-Za-z-]+)?)\s*\}\}/g,
      (tag, key: string) => resolveMarkdownTemplateValue(tag, key, frontmatter),
    )

    const renderedAddressNotesAndLimitations =
      renderAddressNotesAndLimitations(markdown)
    const renderedAddressCurationPolicy = renderAddressCurationPolicy(
      renderedAddressNotesAndLimitations,
    )
    const renderedAddressKnownQualityIssues = renderAddressKnownQualityIssues(
      renderedAddressCurationPolicy,
    )
    const renderedApiKeyNotes = renderApiKeyNotes(renderedAddressKnownQualityIssues)
    const renderedExperimentalApiWarnings = renderExperimentalApiWarnings(
      renderedApiKeyNotes,
      frontmatter,
    )
    const renderedApiProfileTables = renderApiProfileTables(
      renderedExperimentalApiWarnings,
      frontmatter,
    )
    const renderedDomains = await renderApiFamilyDomains(
      renderedApiProfileTables,
      frontmatter,
    )
    const renderedCenstatdTables = await renderCenstatdMeasureTables(
      renderedDomains,
      frontmatter,
    )
    const renderedCompanionResources = renderApiReleaseSetCompanionResources(
      renderedCenstatdTables,
      apiReleaseSources,
    )
    return renderApiReleaseSetSourcesTables(
      renderedCompanionResources,
      apiReleaseSources,
      !fixturePath || fixturePath.includes(`/${API_RELEASE_SET_NOTES_DIRECTORY}/`),
    )
  } catch (error) {
    if (!fixturePath) throw error

    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nFixture: ${fixturePath}`, { cause: error })
  }
}

function resolveMarkdownTemplateValue(
  tag: string,
  key: string,
  frontmatter: Record<string, string>,
) {
  if (
    /^(addressCurationPolicy|addressKnownQualityIssues|addressNotesAndLimitations|apiKeyNote|apiProfileTable|domains|apiReleaseSetCompanions|experimentalApiWarning|apiReleaseSetSources|hkgovCenstatdMeasureTable):/.test(
      key,
    )
  ) {
    return tag
  }

  if (key === 'apiVersionPath') {
    const apiVersion = frontmatter.apiVersion
    const path = apiVersion?.match(/^api-[a-z-]+-(v\d+(?:\.\d+)*)$/)?.[1]
    if (path) return path
    throw new Error(
      `Cannot derive API version path from apiVersion: ${apiVersion ?? '-'}`,
    )
  }

  if (key === 'cohortYear') {
    const cohortYear = frontmatter.cohortKey?.match(/^\d{4}/)?.[0]
    if (cohortYear) return cohortYear
    throw new Error(
      `Cannot derive cohort year from cohortKey: ${frontmatter.cohortKey ?? '-'}`,
    )
  }

  const regionName = /^regionName:(en|zh-Hant|zh-Hans)$/.exec(key)
  if (regionName) {
    const names = {
      hk: { en: 'Hong Kong', 'zh-Hant': '香港', 'zh-Hans': '香港' },
      mo: { en: 'Macao', 'zh-Hant': '澳門', 'zh-Hans': '澳门' },
    } as const
    const value =
      names[frontmatter.regionCode as keyof typeof names]?.[
        regionName[1] as 'en' | 'zh-Hant' | 'zh-Hans'
      ]
    if (value) return value
    throw new Error(`Cannot localise region code: ${frontmatter.regionCode ?? '-'}`)
  }

  const value = frontmatter[key]
  if (value === undefined) {
    throw new Error(`Unknown markdown fixture frontmatter tag: ${tag}`)
  }
  return value
}

function renderAddressNotesAndLimitations(markdown: string) {
  const directive = /\{\{addressNotesAndLimitations:(en|zh-Hant|zh-Hans)\}\}/g
  const notes = {
    en: `- The Address collection is anchored to the Government Address Lookup Service source
  release for this cohort. Address IDs are canonical SaanSeoi identifiers, not ALS CSU
  IDs; use <black>profile=full</black> when you need the retained identifiers and source
  evidence.
- The supporting Overture Division snapshot supplies canonical geographic relationships.
  Where a reviewed matching division or street has a divergent spelling, SaanSeoi uses
  the Overture canonical name and retains the ALS form as an alternative name. ALS
  building, estate and unit wording, and its published coordinates, remain source data.
- <black>Address3D</black> coverage currently extends only to the ALS
  <black>public-rental-housing</black> delivery; ALS has supplied no
  <black>Address3D</black> inventory for other address classes. Coverage describes the
  unit collection attached to an <black>Address2D</black> record. A value of
  <black>none</black> means no such source collection is available, not that the
  building has no units. <black>ancestor</black> coverage means the collection belongs
  to a parent <black>Address2D</black> record, not to the child whose coverage is being
  read. For example, <black>MODEL HOUSING ESTATE</black> is a complex; <black>MAN HONG
  HOUSE</black> is its <black>762–774</black> building parent with one
  <black>422-unit</black> collection, and <black>762</black>, <black>764</black>,
  <black>766</black>, <black>768</black>, <black>770</black> and <black>774</black> are
  distinct section children. ALS does not identify a unit's section, so a section's
  <black>ancestor</black> coverage does not assign any of the <black>422</black> units
  to it. That membership remains unresolved until the source explicitly provides it.
- Building-number ranges preserve the source assertion. They do not imply that every
  intervening number exists, or establish a parent-child relationship between addresses.
- Coordinates identify an address position. They are not a building footprint or a
  postal-delivery guarantee.
- Full-text and building-number search indexes are derived projections of this immutable
  release set. Read the source release notes linked in the
  [Release scope table](#source-heading-release-scope) for publisher-specific quality,
  provenance, and compatibility details.`,
    'zh-Hant': `- Address collection 以此 cohort 的政府地址查詢服務來源發布為基礎。Address
  ID 是 SaanSeoi 標準識別碼，並非 ALS CSU ID；如需保留的識別碼及來源證據，請使用
  <black>profile=full</black>。
- 支援的 Overture Division
  snapshot 提供標準地理關係，不會取代 ALS 發布的地址文字或座標。
- Address3D coverage 說明 Address2D 記錄可用的單位 collection。coverage 為
  <black>none</black>
  並不證明樓宇沒有單位。祖先 coverage 在關係明確解析前亦不確立成員關係。
- 樓宇號碼範圍保留來源斷言，不表示每個中間號碼均存在，亦不建立地址之間的父子關係。
- 座標標示地址位置，並非樓宇輪廓或郵遞保證。
- 全文及樓宇號碼搜尋索引是此不可變 release set 的衍生 projection。請參閱
  [發布範圍表](#source-heading-release-scope)連結的來源發布附註，以了解發布者特有的資料品質、溯源及相容性資料。`,
    'zh-Hans': `- Address collection 以此 cohort 的政府地址查询服务源发布为基础。Address
  ID 是 SaanSeoi 标准标识符，并非 ALS CSU ID；如需保留的标识符及源证据，请使用
  <black>profile=full</black>。
- 支持的 Overture Division
  snapshot 提供标准地理关系，不会取代 ALS 发布的地址文本或坐标。
- Address3D coverage 说明 Address2D 记录可用的单位 collection。coverage 为
  <black>none</black>
  并不证明楼宇没有单位。祖先 coverage 在关系明确解析前也不确立成员关系。
- 楼宇号码范围保留源断言，不表示每个中间号码均存在，也不建立地址之间的父子关系。
- 坐标标示地址位置，并非楼宇轮廓或邮递保证。
- 全文及楼宇号码搜索索引是此不可变 release set 的派生 projection。请参阅
  [发布范围表](#source-heading-release-scope)链接的源发布说明，以了解发布者特有的数据质量、溯源及兼容性资料。`,
  } as const

  return markdown.replace(
    directive,
    (_tag, locale: keyof typeof notes) => notes[locale],
  )
}

function renderAddressCurationPolicy(markdown: string) {
  const directive = /\{\{addressCurationPolicy:(en|zh-Hant|zh-Hans)\}\}/g
  const policies = {
    en: `- SaanSeoi normalises bilingual formatting and premise components, then applies only
  reviewed, source- and release-bounded curation to identity continuity, canonical
  naming, hierarchy and granularity, duplicate assertions, inventories, retentions and
  coordinate corrections.
- Every curation has exact evidence guards for the affected source assertions and
  releases. The raw ALS feature and replaced components, identifiers, inventories and
  coordinates remain provenance.
- SaanSeoi does not infer a missing premise, unit membership, hierarchy relationship or
  historical record from shared names, coordinates, CSU IDs or similar-looking
  inventories. A missing <black>Address2D</black> or <black>Address3D</black> record is
  reconstructed only by an explicit, reviewed rule.`,
    'zh-Hant': `- SaanSeoi 會正規化雙語格式及處所組成部分，然後只對身份延續、canonical 名稱、層級及
  粒度、重複斷言、單位清單、保留項目及座標修正，套用已審核且有來源和發布範圍限制的整理。
- 每項整理均有受影響來源斷言及發布的精確證據 guard。原始 ALS feature，以及被取代的
  組成部分、識別碼、單位清單及座標均會保留為 provenance。
- SaanSeoi 不會根據相同名稱、座標、CSU ID 或相似的單位清單，推斷缺失處所、單位成員、
  層級關係或歷史記錄。缺失的 <black>Address2D</black> 或 <black>Address3D</black>
  記錄只會按明確且已審核的規則重建。`,
    'zh-Hans': `- SaanSeoi 会规范化双语格式及场所组成部分，然后只对身份延续、canonical 名称、层级及
  粒度、重复断言、单元清单、保留项目及坐标修正，应用已审核且有来源和发布范围限制的整理。
- 每项整理均有受影响源断言及发布的精确证据 guard。原始 ALS feature，以及被替换的
  组成部分、标识符、单元清单及坐标均会保留为 provenance。
- SaanSeoi 不会根据相同名称、坐标、CSU ID 或相似的单元清单，推断缺失场所、单元成员、
  层级关系或历史记录。缺失的 <black>Address2D</black> 或 <black>Address3D</black>
  记录只会按明确且已审核的规则重建。`,
  } as const

  return markdown.replace(
    directive,
    (_tag, locale: keyof typeof policies) => policies[locale],
  )
}

function renderAddressKnownQualityIssues(markdown: string) {
  const directive = /\{\{addressKnownQualityIssues:(en|zh-Hant|zh-Hans)\}\}/g
  const issues = {
    en: `- The <b>Building CSU-ID</b> (Common Spatial Unit ID) identifies a publisher spatial
  unit. It is formed by concatenating <black>GEO_REFNO</black>, <black>POLY_TYPE</black>
  and <black>CREATE_DATE</black>. <black>GEO_REFNO</black> is the ten-digit Hong Kong
  1980 Grid reference of the label point inside the building polygon: its two five-digit
  halves are the easting and northing with decimals and the preceding \`8\` omitted. Here,
  \`3372511726\` represents E \`833725\`, N \`811726\`. <black>POLY_TYPE</black> \`T\` is
  unclear what it means, but its consistent throughout. <black>CREATE_DATE</black>
  \`20141201\` is the automatically generated label-creation date, 1 December 2014.
  Together they form \`3372511726T20141201\`. The label-point reference need not match the
  delivered ALS representative point: this example's easting/northing are \`833734\`,
  \`811742\`. The retained ALS GeoJSON exposes only the composite \`CsuId\`.
- A <black>CSU-ID</black> is <u>not</u> a durable one-to-one address identifier across
  ALS releases. ALS can update a premise to a different CSU without changing its
  building, address or inventory, and change other source assertions while retaining the
  CSU. SaanSeoi therefore retains it as source evidence; but to track cross-release
  identity we use a combination of GeoAddress and bilingual premise components, with a
  [guarded review](?tab=audit) for ambiguity or change. A repeated CSU is not
  necessarily co-located: e.g. six \`HUNG FOOK BUILDING\` assertions share
  \`2092834041P20050609\`; five are at E \`820929\`, N \`834040\`, while \`38 FOOK TAK STREET\`
  is at E \`821279\`, N \`833717\`, 476.3 metres away. Treat the <black>CSU-ID</black> as
  indicative of identity and location at best.
- The upstream ALS source is inconsistent in its coverage between releases and will
  often drop <black>Address2D</black> and <black>Address3D</black> only for them to
  later appear again. SaanSeoi reconstructs an omission only where a reviewed rule
  identifies the exact source records, release interval and corroborating evidence.`,
    'zh-Hant': `- <b>Building CSU-ID</b>（Common Spatial Unit ID）識別發布者的空間單元。它由
  <black>GEO_REFNO</black>、<black>POLY_TYPE</black> 及 <black>CREATE_DATE</black>
  串接而成。<black>GEO_REFNO</black> 是建築物 polygon 內 label point 的十位香港
  1980 Grid 參考：其兩個五位數分別為 easting 及 northing，省略小數及前置的 \`8\`。
  此處 \`3372511726\` 表示 E \`833725\`、N \`811726\`。<black>POLY_TYPE</black> \`T\`
  的確切含義未明，但一直一致。<black>CREATE_DATE</black> \`20141201\` 是系統自動
  產生的 label 建立日期，即 2014 年 12 月 1 日。三者組成
  \`3372511726T20141201\`。label-point 參考不一定與交付的 ALS representative point
  相同：此例的 easting/northing 為 \`833734\`、\`811742\`。保留的 ALS GeoJSON 只提供
  複合的 \`CsuId\`。
- <black>CSU-ID</black> <u>不是</u> ALS 發布之間耐用的一對一地址識別碼。ALS 可在
  不改變樓宇、地址或單位清單的情況下，將處所更新為另一個 CSU；亦可在保留 CSU 時改變
  其他來源斷言。因此 SaanSeoi 將其保留為來源證據；但跨發布追蹤身份會結合 GeoAddress
  及雙語處所組成部分，並在含糊或改變時進行[受保護審核](?tab=audit)。重複的 CSU 不一定
  位於同一位置：例如六個 \`HUNG FOOK BUILDING\` 斷言共用 \`2092834041P20050609\`；其中
  五個位於 E \`820929\`、N \`834040\`，而 \`38 FOOK TAK STREET\` 位於 E \`821279\`、
  N \`833717\`，相距 476.3 米。<black>CSU-ID</black> 至多只能視為身份及位置的指示。
- 上游 ALS 來源在不同發布之間的覆蓋並不一致，經常暫時移除
  <black>Address2D</black> 及 <black>Address3D</black>，其後才再次出現。SaanSeoi 只會
  在已審核規則識別精確來源記錄、發布區間及佐證證據時，重建遺漏項目。`,
    'zh-Hans': `- <b>Building CSU-ID</b>（Common Spatial Unit ID）标识发布者的空间单元。它由
  <black>GEO_REFNO</black>、<black>POLY_TYPE</black> 及 <black>CREATE_DATE</black>
  串接而成。<black>GEO_REFNO</black> 是建筑物 polygon 内 label point 的十位香港
  1980 Grid 参考：其两个五位数分别为 easting 及 northing，省略小数及前置的 \`8\`。
  此处 \`3372511726\` 表示 E \`833725\`、N \`811726\`。<black>POLY_TYPE</black> \`T\`
  的确切含义未明，但一直一致。<black>CREATE_DATE</black> \`20141201\` 是系统自动
  生成的 label 创建日期，即 2014 年 12 月 1 日。三者组成
  \`3372511726T20141201\`。label-point 参考不一定与交付的 ALS representative point
  相同：此例的 easting/northing 为 \`833734\`、\`811742\`。保留的 ALS GeoJSON 只提供
  复合的 \`CsuId\`。
- <black>CSU-ID</black> <u>不是</u> ALS 发布之间耐用的一对一地址标识符。ALS 可在
  不改变楼宇、地址或单元清单的情况下，将场所更新为另一个 CSU；亦可在保留 CSU 时改变
  其他源断言。因此 SaanSeoi 将其保留为源证据；但跨发布追踪身份会结合 GeoAddress
  及双语场所组成部分，并在含糊或改变时进行[受保护审核](?tab=audit)。重复的 CSU 不一定
  位于同一位置：例如六个 \`HUNG FOOK BUILDING\` 断言共用 \`2092834041P20050609\`；其中
  五个位于 E \`820929\`、N \`834040\`，而 \`38 FOOK TAK STREET\` 位于 E \`821279\`、
  N \`833717\`，相距 476.3 米。<black>CSU-ID</black> 至多只能视为身份及位置的指示。
- 上游 ALS 源在不同发布之间的覆盖并不一致，经常暂时移除
  <black>Address2D</black> 及 <black>Address3D</black>，其后才再次出现。SaanSeoi 只会
  在已审核规则标识精确源记录、发布区间及佐证证据时，重建遗漏项目。`,
  } as const

  return markdown.replace(
    directive,
    (_tag, locale: keyof typeof issues) => issues[locale],
  )
}

function renderApiKeyNotes(markdown: string) {
  const directive = /\{\{apiKeyNote:(en|zh-Hant|zh-Hans)\}\}/g
  const notes = {
    en: `<note title="API key required" action-href="/guides/api-keys" action-label="Get API key">
    All example URLs below require authentication by sending an API key with the request. Provide it as an <black>x-api-key</black> header or as an
<black>access_token=</black> URL parameter.
</note>`,
    'zh-Hant': `<note title="需要 API 金鑰" action-href="/guides/api-keys" action-label="取得 API 金鑰">
所有範例均假定你透過
<black>x-api-key</black> 標頭提供金鑰，或以 <black>access_token=</black> URL
參數提供。
</note>`,
    'zh-Hans': `<note title="需要 API 密钥" action-href="/guides/api-keys" action-label="获取 API 密钥">
所有示例均假定你通过
<black>x-api-key</black> 请求标头提供密钥，或以 <black>access_token=</black> URL
参数提供。
</note>`,
  } as const

  return markdown.replace(
    directive,
    (_tag, locale: keyof typeof notes) => notes[locale],
  )
}

function renderExperimentalApiWarnings(
  markdown: string,
  frontmatter: Record<string, string>,
) {
  const directive = /\{\{experimentalApiWarning:(en|zh-Hant|zh-Hans)\}\}/g
  if (!markdown.includes('{{experimentalApiWarning:')) return markdown

  const apiVersionPath = resolveMarkdownTemplateValue(
    '{{apiVersionPath}}',
    'apiVersionPath',
    frontmatter,
  )
  const contractWarningTemplates = {
    en: `The <black>${apiVersionPath}</black> contract is experimental. The API contract might
change before the <black>v1</black> release, after which prior versions will be retired.`,
    'zh-Hant': `<black>${apiVersionPath}</black> 合約仍屬實驗性質。API 合約可能在 v1
發布前變更；屆時將淘汰舊版本。`,
    'zh-Hans': `<black>${apiVersionPath}</black> 合约仍处于实验阶段。API 合约可能在 v1
发布前变更；届时将淘汰旧版本。`,
  }
  const warningTemplatesByFamily = {
    addresses: contractWarningTemplates,
    divisions: contractWarningTemplates,
    places: contractWarningTemplates,
    stats: {
      en: `The <black>${apiVersionPath}</black> API is experimental. Use <black>GET /stats/v0</black> to list
statistics, or <black>GET /stats/v0/{id}</black> to retrieve one statistic by its ID.`,
      'zh-Hant': `<black>${apiVersionPath}</black> API 仍屬實驗性質。使用 <black>GET /stats/v0</black> 列出
統計資料，或使用 <black>GET /stats/v0/{id}</black> 以 ID 取得一筆統計資料。`,
      'zh-Hans': `<black>${apiVersionPath}</black> API 仍处于实验阶段。使用 <black>GET /stats/v0</black> 列出
统计数据，或使用 <black>GET /stats/v0/{id}</black> 通过 ID 获取一项统计数据。`,
    },
    streets: contractWarningTemplates,
  } as const
  const warnings =
    warningTemplatesByFamily[
      frontmatter.apiFamily as keyof typeof warningTemplatesByFamily
    ]
  if (!warnings) {
    throw new Error(
      `Experimental API warning directives are not configured for apiFamily: ${frontmatter.apiFamily ?? '-'}`,
    )
  }

  return markdown.replace(
    directive,
    (_tag, locale: keyof typeof warnings) => warnings[locale],
  )
}

function renderApiProfileTables(markdown: string, frontmatter: Record<string, string>) {
  const directive = /\{\{apiProfileTable:(en|zh-Hant|zh-Hans)\}\}/g
  if (!markdown.includes('{{apiProfileTable:')) return markdown

  const profiles =
    apiProfileDocumentationByFamily[
      frontmatter.apiFamily as keyof typeof apiProfileDocumentationByFamily
    ]
  if (!profiles) {
    throw new Error(
      `API profile-table directives are not configured for apiFamily: ${frontmatter.apiFamily ?? '-'}`,
    )
  }

  const headings = {
    en: ['Profile', 'Use it when you need', 'Adds to the response'],
    'zh-Hant': ['設定檔', '適用情況', '回應新增內容'],
    'zh-Hans': ['配置文件', '适用情形', '响应新增内容'],
  } as const

  return markdown.replace(directive, (_tag, locale: keyof typeof headings) => {
    const [profile, useCase, coverage] = headings[locale]
    const rows = apiProfileNames
      .map(profileName => {
        const documentation = profiles[profileName][locale]
        return `| \`${profileName}\` | ${documentation.useCase} | ${documentation.coverage} |`
      })
      .join('\n')

    return `| ${profile} | ${useCase} | ${coverage} |\n| --- | --- | --- |\n${rows}`
  })
}

export function humaniseResourceType(value: string) {
  return value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

export function selectDocsLocalisedName(
  rows: Array<{ locale: string; name: string; nameShort?: string | null }>,
  locale: ApiReleaseSetSourceDocsLocale,
  fallback: string,
) {
  const normalisedLocale = locale.toLowerCase()
  const relatedChineseLocale =
    locale === 'zh-Hant' ? 'zh-hans' : locale === 'zh-Hans' ? 'zh-hant' : null
  return (
    rows.find(row => row.locale.toLowerCase() === normalisedLocale)?.name ??
    (relatedChineseLocale
      ? rows.find(row => row.locale.toLowerCase() === relatedChineseLocale)?.name
      : undefined) ??
    rows.find(row => row.locale.toLowerCase() === 'en')?.name ??
    rows[0]?.name ??
    fallback
  )
}

export function selectDocsLocalisedDescription(
  rows: Array<{ description?: string | null; locale: string; name: string }>,
  locale: ApiReleaseSetSourceDocsLocale,
  fallback: string,
) {
  const normalisedLocale = locale.toLowerCase()
  const relatedChineseLocale =
    locale === 'zh-Hant' ? 'zh-hans' : locale === 'zh-Hans' ? 'zh-hant' : null
  const localised =
    rows.find(row => row.locale.toLowerCase() === normalisedLocale) ??
    (relatedChineseLocale
      ? rows.find(row => row.locale.toLowerCase() === relatedChineseLocale)
      : undefined) ??
    rows.find(row => row.locale.toLowerCase() === 'en') ??
    rows[0]

  return localised?.description ?? localised?.name ?? fallback
}

export function selectDocsLocalisedShortName(
  rows: Array<{ locale: string; name: string; nameShort?: string | null }>,
  locale: ApiReleaseSetSourceDocsLocale,
  fallback: string,
) {
  const normalisedLocale = locale.toLowerCase()
  const relatedChineseLocale =
    locale === 'zh-Hant' ? 'zh-hans' : locale === 'zh-Hans' ? 'zh-hant' : null
  return (
    rows.find(row => row.locale.toLowerCase() === normalisedLocale)?.nameShort ??
    (relatedChineseLocale
      ? rows.find(row => row.locale.toLowerCase() === relatedChineseLocale)?.nameShort
      : undefined) ??
    rows.find(row => row.locale.toLowerCase() === 'en')?.nameShort ??
    rows[0]?.nameShort ??
    fallback
  )
}

export function markdownLink(label: string, href: string, title?: string) {
  const escapedLabel = label.replaceAll(']', '\\]')
  const escapedTitle = title?.replaceAll('"', '\\"')
  return escapeMarkdownTableCell(
    `[${escapedLabel}](${href}${escapedTitle ? ` "${escapedTitle}"` : ''})`,
  )
}
