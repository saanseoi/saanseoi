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

    const markdown = expandTimeTravelSections(fixture.body, frontmatter).replace(
      /\{\{\s*([a-z][A-Za-z0-9_-]*(?::[A-Za-z-]+)?)\s*\}\}/g,
      (tag, key: string) => resolveMarkdownTemplateValue(tag, key, frontmatter),
    )

    const renderedApiKeyNotes = renderApiKeyNotes(markdown)
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
    /^(apiKeyNote|apiProfileTable|domains|apiReleaseSetCompanions|experimentalApiWarning|apiReleaseSetSources|hkgovCenstatdMeasureTable):/.test(
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
  const warningTemplatesByFamily = {
    divisions: {
      en: `The <black>${apiVersionPath}</black> contract is experimental. The API contract might
change before the <black>v1</black> release, after which prior versions will be retired.`,
      'zh-Hant': `<black>${apiVersionPath}</black> 合約仍屬實驗性質。API 合約可能在 v1
發布前變更；屆時將淘汰舊版本。`,
      'zh-Hans': `<black>${apiVersionPath}</black> 合约仍处于实验阶段。API 合约可能在 v1
发布前变更；届时将淘汰旧版本。`,
    },
    stats: {
      en: `The <black>${apiVersionPath}</black> API is experimental. Use <black>GET /stats/v0</black> to list
statistics, or <black>GET /stats/v0/{id}</black> to retrieve one statistic by its ID.`,
      'zh-Hant': `<black>${apiVersionPath}</black> API 仍屬實驗性質。使用 <black>GET /stats/v0</black> 列出
統計資料，或使用 <black>GET /stats/v0/{id}</black> 以 ID 取得一筆統計資料。`,
      'zh-Hans': `<black>${apiVersionPath}</black> API 仍处于实验阶段。使用 <black>GET /stats/v0</black> 列出
统计数据，或使用 <black>GET /stats/v0/{id}</black> 通过 ID 获取一项统计数据。`,
    },
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
