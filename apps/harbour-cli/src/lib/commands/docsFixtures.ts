import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  ApiReleaseSetDocsRow,
  DocsFixture,
  ParsedApiReleaseSetDocsRow,
  ParsedReleaseSetCode,
  ReleaseDocsRow,
} from './docsTypes.ts'
import { parseMarkdownFixture } from './docsRendering.ts'
import {
  API_RELEASE_SET_DOCS_ROOT,
  API_RELEASE_SET_GUIDES_DIRECTORY,
  API_RELEASE_SET_NOTES_DIRECTORY,
  CURATION_ROOT,
  RELEASE_DOCS_ROOT,
  REPO_ROOT,
} from './docsConfig.ts'

export async function findEffectiveFixture(
  apiFamily: string,
  familyRows: ParsedApiReleaseSetDocsRow[],
  targetCode: string,
) {
  let effectiveFixture: DocsFixture | null = null

  for (const row of familyRows) {
    if (row.code === targetCode) {
      return effectiveFixture
    }

    const fixture = await readFixtureIfExists(apiFamily, row.code)

    if (fixture) {
      effectiveFixture = fixture
    }
  }

  return effectiveFixture
}

export async function findEffectiveGuideFixture(
  apiFamily: string,
  familyRows: ParsedApiReleaseSetDocsRow[],
  targetCode: string,
) {
  let effectiveFixture: DocsFixture | null = null

  for (const row of familyRows) {
    if (row.code === targetCode) return effectiveFixture

    const fixture = await readGuideFixtureIfExists(apiFamily, row.code)

    if (fixture) effectiveFixture = fixture
  }

  return effectiveFixture
}

export async function findEffectiveReleaseFixture(
  datasetRows: ReleaseDocsRow[],
  targetCode: string,
) {
  let effectiveFixture: DocsFixture | null = null

  for (const row of datasetRows) {
    if (row.code === targetCode) {
      return effectiveFixture
    }

    const fixture = await readReleaseFixtureIfExists(row.datasetCode, row.code)

    if (fixture) {
      effectiveFixture = fixture
    }
  }

  return effectiveFixture
}

export async function readFixtureIfExists(apiFamily: string, code: string) {
  const paths = [
    resolveDocsFixturePath(apiFamily, code),
    resolveInitialRevisionDocsFixturePath(apiFamily, code),
    resolveLegacyDocsFixturePath(apiFamily, code),
  ]

  for (const path of paths) {
    if (!existsSync(path)) continue

    return {
      ...parseMarkdownFixture(await readFile(path, 'utf8')),
      path,
    }
  }

  return null
}

export async function readGuideFixtureIfExists(apiFamily: string, code: string) {
  const paths = [
    resolveGuideFixturePath(apiFamily, code),
    resolveInitialRevisionGuideFixturePath(apiFamily, code),
  ]

  for (const path of paths) {
    if (!existsSync(path)) continue

    return {
      ...parseMarkdownFixture(await readFile(path, 'utf8')),
      path,
    }
  }

  return null
}

export async function readReleaseFixtureIfExists(datasetCode: string, code: string) {
  const path = resolveReleaseDocsFixturePath(datasetCode, code)

  if (!existsSync(path)) {
    return null
  }

  return {
    ...parseMarkdownFixture(await readFile(path, 'utf8')),
    path,
  }
}

export function resolveDocsFixturePath(apiFamily: string, code: string) {
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    API_RELEASE_SET_NOTES_DIRECTORY,
    `${code}.md`,
  )
}

export function resolveGuideFixturePath(apiFamily: string, code: string) {
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    API_RELEASE_SET_GUIDES_DIRECTORY,
    `${code}.md`,
  )
}

function resolveInitialRevisionDocsFixturePath(apiFamily: string, code: string) {
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    API_RELEASE_SET_NOTES_DIRECTORY,
    `${code}-r0.md`,
  )
}

function resolveInitialRevisionGuideFixturePath(apiFamily: string, code: string) {
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    API_RELEASE_SET_GUIDES_DIRECTORY,
    `${code}-r0.md`,
  )
}

function resolveLegacyDocsFixturePath(apiFamily: string, code: string) {
  return resolve(API_RELEASE_SET_DOCS_ROOT, apiFamily, `${code}.md`)
}

export async function resolvePublisherName(publisherCode: string) {
  const path = resolve(
    REPO_ROOT,
    'fixtures/meta/dataPublishers',
    `${publisherCode}.json`,
  )
  const fixture = JSON.parse(await readFile(path, 'utf8')) as {
    i18n?: Array<{ locale?: string; name?: string }>
  }
  return fixture.i18n?.find(entry => entry.locale === 'en')?.name ?? publisherCode
}

export function appendEnglishRevisionLog(
  body: string,
  message: string,
  previousRevision: number,
) {
  const frozenBody = body.replaceAll(
    /\{\{\s*revision\s*\}\}/g,
    String(previousRevision),
  )
  const englishEnd = frozenBody.indexOf('\n# ZH-HANT')
  const english = englishEnd === -1 ? frozenBody : frozenBody.slice(0, englishEnd)
  const remainder = englishEnd === -1 ? '' : frozenBody.slice(englishEnd)
  const heading = '## Revision log'
  const entry = `- \`r{{ revision }}\` ${message}`
  const existingHeading = /^## Revision log$/im.exec(english)

  if (existingHeading) {
    const insertionPoint = existingHeading.index + existingHeading[0].length
    const nextHeading = english.indexOf('\n## ', insertionPoint)
    const existingEntriesEnd = nextHeading === -1 ? english.length : nextHeading
    const existingEntries = english
      .slice(insertionPoint, existingEntriesEnd)
      .replace(/^\n+/, '\n')
      .replace(/\n{2,}(?=- `r)/g, '\n')
    return `${english.slice(0, insertionPoint).trimEnd()}\n\n${entry}${existingEntries}${english.slice(existingEntriesEnd)}${remainder}`
  }

  return `${english.trimEnd()}\n\n${heading}\n\n${entry}\n${remainder}`
}

export function resolveReleaseDocsFixturePath(datasetCode: string, code: string) {
  return resolve(RELEASE_DOCS_ROOT, datasetCode, `${code}.md`)
}

export function resolveCurationFixturePath(curationPath: string) {
  const path = resolve(REPO_ROOT, curationPath)
  if (!path.startsWith(`${CURATION_ROOT}/`) || !path.endsWith('.json')) {
    throw new Error(`Invalid curation fixture path: ${curationPath}`)
  }
  return path
}

export function isParsedReleaseSetRow(
  row: ApiReleaseSetDocsRow & { parsedCode: ParsedReleaseSetCode | null },
): row is ParsedApiReleaseSetDocsRow {
  return row.parsedCode !== null
}

export function frontmatterForApiReleaseSetRow(
  row: ParsedApiReleaseSetDocsRow,
): Record<string, string> {
  const primarySource = row.sources?.find(source => source.role === 'primary')

  return {
    apiFamily: row.parsedCode.apiFamily,
    apiReleaseSet: row.code,
    revision: String(row.parsedCode.sequence),
    apiVersion: row.apiVersion,
    cohortKey: row.parsedCode.cohortKey,
    domainCode: row.domainCode,
    regionCode: row.parsedCode.regionCode,
    ...(primarySource
      ? {
          primarySourceRelease: primarySource.releaseCode,
          primarySourceReleaseUrl: `/sources/${primarySource.datasetCode}/${primarySource.releaseCode}`,
        }
      : {}),
  }
}

export function frontmatterForReleaseRow(row: ReleaseDocsRow): Record<string, string> {
  return {
    cohortKey: row.cohortKey ?? '',
    dataset: row.datasetCode,
    regionCode: row.regionCode,
    release: row.code,
    source: row.source,
    sourceSchemaVersion: row.sourceSchemaVersion ?? '',
    sourceVersion: row.sourceVersion,
    releaseVersion: releaseVersionFromSourceVersion(row.sourceVersion),
  }
}

export function releaseVersionFromSourceVersion(sourceVersion: string) {
  return /\.\d+$/.test(sourceVersion) ? sourceVersion : `${sourceVersion}.0`
}

export function parseSimpleYaml(value: string) {
  const frontmatter: Record<string, string> = {}

  for (const line of value.split('\n')) {
    const separator = line.indexOf(':')

    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()

    frontmatter[key] = rawValue.replace(/^"|"$/g, '')
  }

  return frontmatter
}

export function ensureTrailingNewline(value: string) {
  return value.length === 0 || value.endsWith('\n') ? value : `${value}\n`
}

export function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  )
}
