import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { API_COMPOSITIONS_ROOT } from './docsConfig.ts'
import type { ApiReleaseSetSourceDocsRow } from './docsTypes.ts'
import {
  humaniseResourceType,
  markdownLink,
  selectDocsLocalisedDescription,
  selectDocsLocalisedName,
  selectDocsLocalisedShortName,
} from './docsRendering.ts'
import { resolveCurationFixturePath } from './docsFixtures.ts'
import {
  parseCenstatdMeasureTableManifest,
  renderCenstatdMeasureTable,
  type CenstatdMeasureTableLocale,
} from './docsMeasures.ts'

type ApiCompositionDomainFixture = {
  code: string
  isDefault?: boolean
  i18n: Array<{
    description?: string
    descriptionShort?: string
    locale: string
    name: string
  }>
}

type ApiCompositionDocumentationFixture = {
  apiVersion: string
  domains?: ApiCompositionDomainFixture[]
  status: string
}

export async function renderApiFamilyDomains(
  markdown: string,
  frontmatter: Record<string, string>,
) {
  const directive = /\{\{domains:(en|zh-Hant|zh-Hans)\}\}/g
  if (!markdown.includes('{{domains:')) return markdown

  const apiVersion = frontmatter.apiVersion
  if (!apiVersion) {
    throw new Error('Domain directives require apiVersion in fixture frontmatter.')
  }

  const fixtures = await Promise.all(
    (await readdir(API_COMPOSITIONS_ROOT))
      .filter(fileName => fileName.endsWith('.json'))
      .map(
        async fileName =>
          JSON.parse(
            await readFile(resolve(API_COMPOSITIONS_ROOT, fileName), 'utf8'),
          ) as ApiCompositionDocumentationFixture,
      ),
  )
  const composition = fixtures.find(
    fixture => fixture.apiVersion === apiVersion && fixture.status === 'current',
  )

  if (!composition?.domains?.length) {
    throw new Error(`No current domain composition is configured for ${apiVersion}.`)
  }
  const domains = composition.domains

  const labels = {
    en: { default: 'DEFAULT', release: 'THIS RELEASE' },
    'zh-Hant': { default: '預設', release: '本發布' },
    'zh-Hans': { default: '默认', release: '本发布' },
  } as const
  const compositionLocale = {
    en: 'en',
    'zh-Hant': 'zh-hant',
    'zh-Hans': 'zh-hans',
  } as const

  return markdown.replace(directive, (_tag, locale: keyof typeof labels) => {
    const rows = domains.map(domain => {
      const translation = domain.i18n.find(
        value => value.locale === compositionLocale[locale],
      )
      if (!translation) {
        throw new Error(
          `Domain ${domain.code} is missing ${compositionLocale[locale]} localisation.`,
        )
      }

      const markers = [
        domain.isDefault ? `<blue>${labels[locale].default}</blue>` : null,
        domain.code === frontmatter.domainCode
          ? `<blue>${labels[locale].release}</blue>`
          : null,
      ].filter((marker): marker is string => marker !== null)
      const summary = translation.descriptionShort ?? translation.description
      if (!summary) {
        throw new Error(`Domain ${domain.code} is missing a summary.`)
      }

      return `- \`${domain.code}\`${markers.length ? ` ${markers.join(' ')}` : ''} — ${summary}`
    })

    return rows.join('\n')
  })
}

export function renderApiReleaseSetCompanionResources(
  markdown: string,
  sources: ApiReleaseSetSourceDocsRow[],
) {
  const directive = /\{\{apiReleaseSetCompanions:(en|zh-Hant|zh-Hans)\}\}/g
  if (!markdown.includes('{{apiReleaseSetCompanions:')) return markdown

  const companionSources = sources.filter(
    source =>
      source.resourceType === 'divisionArea' ||
      source.resourceType === 'divisionBoundary',
  )
  if (companionSources.length === 0) {
    throw new Error(
      'API release-set companion directives require division-area or division-boundary sources.',
    )
  }

  return markdown.replace(directive, (_tag, locale: ApiReleaseSetSourceDocsLocale) =>
    renderApiReleaseSetCompanionTable(companionSources, locale),
  )
}

function renderApiReleaseSetCompanionTable(
  sources: ApiReleaseSetSourceDocsRow[],
  locale: ApiReleaseSetSourceDocsLocale,
) {
  const headings = {
    en: ['Code', 'Type', 'Publisher', 'Description'],
    'zh-Hant': ['代碼', '類型', '發布者', '說明'],
    'zh-Hans': ['代码', '类型', '发布者', '说明'],
  } as const
  const [code, type, publisher, description] = headings[locale]
  const rows = [...sources]
    .sort(
      (left, right) =>
        companionResourceOrder(left.resourceType) -
          companionResourceOrder(right.resourceType) ||
        left.publisherCode.localeCompare(right.publisherCode) ||
        left.sourceVersion.localeCompare(right.sourceVersion, undefined, {
          numeric: true,
        }) ||
        companionIncludeCode(left).localeCompare(companionIncludeCode(right)),
    )
    .map(source => {
      const publisherName = selectDocsLocalisedName(
        source.publisherI18n,
        locale,
        source.publisherCode,
      )
      const publisherNameShort = selectDocsLocalisedShortName(
        source.publisherI18n,
        locale,
        publisherName,
      )
      const datasetDescription = companionResourceShortDescription(source, locale)
      return `| \`${companionIncludeCode(source)}\` | ${companionResourceTypeLabel(source.resourceType, locale)} | ${markdownLink(publisherNameShort, `/publishers/${source.publisherCode}`, publisherName)} | ${datasetDescription} |`
    })

  return `| ${code} | ${type} | ${publisher} | ${description} |\n| --- | --- | --- | --- |\n${rows.join('\n')}`
}

function companionIncludeCode(source: ApiReleaseSetSourceDocsRow) {
  const base = source.resourceType === 'divisionArea' ? 'areas' : 'boundaries'
  return source.variant === 'default' ? base : `${base}:${source.variant}`
}

function companionResourceOrder(resourceType: string) {
  return resourceType === 'divisionArea' ? 0 : 1
}

function companionResourceTypeLabel(
  resourceType: string,
  locale: ApiReleaseSetSourceDocsLocale,
) {
  if (locale === 'zh-Hant') return resourceType === 'divisionArea' ? '面' : '邊界'
  if (locale === 'zh-Hans') return resourceType === 'divisionArea' ? '面' : '边界'
  return resourceType === 'divisionArea' ? 'Area' : 'Boundary'
}

function companionResourceShortDescription(
  source: ApiReleaseSetSourceDocsRow,
  locale: ApiReleaseSetSourceDocsLocale,
) {
  const descriptions = {
    'areas:hkgov-censtatd': {
      en: 'C&SD annual district and Area/type statistical geometry.',
      'zh-Hant': '政府統計處按年區議會分區及地區／類別統計地理資料。',
      'zh-Hans': '政府统计处年度区议会分区及地区／类别统计地理数据。',
    },
    'areas:hkgov-censtatd-landclipped': {
      en: 'C&SD census land-clipped district areas.',
      'zh-Hant': '政府統計處人口普查經土地裁切的區議會分區範圍。',
      'zh-Hans': '政府统计处人口普查经土地裁切的区议会分区范围。',
    },
    'areas:hkgov-had': {
      en: 'Official district areas.',
      'zh-Hant': '官方地區範圍。',
      'zh-Hans': '官方地区范围。',
    },
    'areas:overture': {
      en: 'Division area polygons.',
      'zh-Hant': '區劃範圍多邊形。',
      'zh-Hans': '区划范围多边形。',
    },
    'boundaries:overture': {
      en: 'District boundaries.',
      'zh-Hant': '區級分區邊界。',
      'zh-Hans': '区级分区边界。',
    },
  } as const
  const code = companionIncludeCode(source)

  return (
    descriptions[code as keyof typeof descriptions]?.[locale] ??
    selectDocsLocalisedDescription(source.datasetI18n, locale, source.datasetCode)
  )
}

/**
 * Expands a reviewed C&SD measure curation into the release-note table for one
 * locale. This keeps the notes coupled to the names and descriptions actually
 * published by the statistics processor, rather than maintaining a second
 * hand-written copy in Markdown.
 */
export async function renderCenstatdMeasureTables(
  markdown: string,
  frontmatter: Record<string, string>,
) {
  const directive = /\{\{hkgovCenstatdMeasureTable:(en|zh-Hant|zh-Hans)\}\}/g

  if (!directive.test(markdown)) return markdown

  const curationPath = frontmatter.measureCuration
  if (!curationPath) {
    throw new Error(
      'C&SD measure-table directives require measureCuration in fixture frontmatter.',
    )
  }

  const path = resolveCurationFixturePath(curationPath)

  const manifest = parseCenstatdMeasureTableManifest(
    JSON.parse(await readFile(path, 'utf8')),
    path,
  )

  return markdown.replace(directive, (_tag, locale: CenstatdMeasureTableLocale) =>
    renderCenstatdMeasureTable(manifest, locale),
  )
}

export function renderApiReleaseSetSourcesTables(
  markdown: string,
  sources: ApiReleaseSetSourceDocsRow[],
  requireDirectives: boolean,
) {
  const directives = [
    { locale: 'en', label: 'English' },
    { locale: 'zh-Hant', label: 'Traditional Chinese' },
    { locale: 'zh-Hans', label: 'Simplified Chinese' },
  ] as const

  if (sources.length === 0) {
    if (
      directives.some(({ locale }) =>
        markdown.includes(`{{apiReleaseSetSources:${locale}}}`),
      )
    ) {
      throw new Error(
        'API release-set notes contain constituent-source directives but the release set has no sources.',
      )
    }
    return markdown
  }

  if (!requireDirectives) return markdown

  return directives.reduce((rendered, { locale, label }) => {
    const directive = `{{apiReleaseSetSources:${locale}}}`
    const occurrences = rendered.split(directive).length - 1
    if (occurrences !== 1) {
      throw new Error(
        `API release-set notes must contain exactly one ${label} constituent-source directive: ${directive}`,
      )
    }

    return rendered.replace(directive, renderApiReleaseSetSourcesTable(sources, locale))
  }, markdown)
}

function renderApiReleaseSetSourcesTable(
  sources: ApiReleaseSetSourceDocsRow[],
  locale: ApiReleaseSetSourceDocsLocale,
) {
  const groups = new Map<string, ApiReleaseSetSourceDocsRow[]>()
  const sortedSources = [...sources].sort(
    (left, right) =>
      roleOrder(left.role) - roleOrder(right.role) ||
      left.resourceType.localeCompare(right.resourceType) ||
      left.publisherCode.localeCompare(right.publisherCode) ||
      left.sourceVersion.localeCompare(right.sourceVersion, undefined, {
        numeric: true,
      }),
  )

  for (const source of sortedSources) {
    const key = `${source.role}:${source.resourceType}`
    groups.set(key, [...(groups.get(key) ?? []), source])
  }

  const lines: string[] = []
  for (const [, group] of groups) {
    const first = group[0]
    if (!first) continue

    lines.push(
      `### ${sourceRoleLabel(first.role, locale)} · ${resourceTypeLabel(first.resourceType, locale)}`,
      '',
      locale === 'en'
        ? '| Publisher | Source dataset | Release |'
        : locale === 'zh-Hant'
          ? '| 發布者 | 來源資料集 | 發布版本 |'
          : '| 发布者 | 来源数据集 | 发布版本 |',
      '| --- | --- | --- |',
    )

    for (const source of group) {
      const datasetHref = `/sources/${source.datasetCode}`
      const releaseHref = `${datasetHref}/${source.releaseCode}`
      const publisherName = selectDocsLocalisedName(
        source.publisherI18n,
        locale,
        source.publisherCode,
      )
      const datasetName = selectDocsLocalisedName(
        source.datasetI18n,
        locale,
        source.datasetCode,
      )
      lines.push(
        `| ${markdownLink(publisherName, `/publishers/${source.publisherCode}`)} | ${markdownLink(datasetName, datasetHref)} | ${markdownLink(source.sourceVersion, releaseHref)} |`,
      )
    }

    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

function roleOrder(role: ApiReleaseSetSourceDocsRow['role']) {
  return role === 'primary' ? 0 : 1
}

export type ApiReleaseSetSourceDocsLocale = 'en' | 'zh-Hant' | 'zh-Hans'

function sourceRoleLabel(
  role: ApiReleaseSetSourceDocsRow['role'],
  locale: ApiReleaseSetSourceDocsLocale,
) {
  if (locale === 'zh-Hant') return role === 'primary' ? '主要' : '支援'
  if (locale === 'zh-Hans') return role === 'primary' ? '主要' : '支持'
  return role === 'primary' ? 'Primary' : 'Supporting'
}

function resourceTypeLabel(
  resourceType: string,
  locale: ApiReleaseSetSourceDocsLocale,
) {
  if (locale === 'zh-Hant') {
    return (
      {
        division: '區劃',
        divisionArea: '區劃面',
        divisionBoundary: '區劃邊界',
        divisionStatistic: '區劃統計',
      }[resourceType] ?? humaniseResourceType(resourceType)
    )
  }

  if (locale === 'zh-Hans') {
    return (
      {
        division: '区划',
        divisionArea: '区划面',
        divisionBoundary: '区划边界',
        divisionStatistic: '区划统计',
      }[resourceType] ?? humaniseResourceType(resourceType)
    )
  }

  return humaniseResourceType(resourceType)
}
