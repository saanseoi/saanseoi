import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { cancel, isCancel, note, outro, select } from '@clack/prompts'
import { compareReleaseVersions, normaliseBaseUrl } from '@repo/core'

import { getAuthHeaders, resolveHarbourApiUrl } from '../api.ts'
import { describeTarget, formatField } from '../display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../options.ts'

type ApiReleaseSetDocsRow = {
  id: string
  apiFamily: string
  apiVersion: string
  code: string
  status: string
  schemaVersion: string
  rulesetVersion: string
  publishedAt: string | null
  validFrom: string | null
  validTo: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type ReleaseDocsRow = {
  id: string
  datasetId: string
  datasetCode: string
  regionCode: string
  theme: string
  type: string
  source: string
  code: string
  sourceVersion: string
  sourceSchemaVersion: string | null
  cohortKey: string | null
  publicationDate: string | null
  status: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

type ParsedReleaseSetCode = {
  apiFamily: string
  cohortKey: string
  regionCode: string
  sequence: number
}

type DocsFixture = {
  body: string
  frontmatter: Record<string, string>
  path: string
}
type ParsedApiReleaseSetDocsRow = ApiReleaseSetDocsRow & {
  parsedCode: ParsedReleaseSetCode
}
type DocsScope = 'apiReleaseSets' | 'releases'
type PublishDocsScope = DocsScope | 'all'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const API_RELEASE_SET_DOCS_ROOT = resolve(REPO_ROOT, 'fixtures/meta/apiReleaseSets')
const RELEASE_DOCS_ROOT = resolve(REPO_ROOT, 'fixtures/meta/releases')

export async function runDocsNewCommand(args: ParsedArgs, target: UploadTarget) {
  if ((await resolveDocsNewScope(args)) === 'releases') {
    await runReleaseDocsNewCommand(args, target)
    return
  }

  const rows = await fetchApiReleaseSetDocsRows(target)
  const eligibleRows = rows
    .map(row => ({ ...row, parsedCode: parseReleaseSetCode(row.code) }))
    .filter(isParsedReleaseSetRow)

  if (eligibleRows.length === 0) {
    throw new Error(`No API release sets found for ${describeTarget(target).label}.`)
  }

  const selectedRegion = await resolveSelectedValue({
    label: 'region',
    optionValue: getStringOption(args, ['region']),
    values: uniqueSorted(eligibleRows.map(row => row.parsedCode?.regionCode)),
  })
  const selectedFamily = await resolveSelectedValue({
    label: 'ApiFamily',
    optionValue: getStringOption(args, ['api-family', 'family', 'type']),
    values: uniqueSorted(
      eligibleRows
        .filter(row => row.parsedCode?.regionCode === selectedRegion)
        .map(row => row.parsedCode?.apiFamily),
    ),
  })
  const familyRows = eligibleRows
    .filter(
      row =>
        row.parsedCode?.regionCode === selectedRegion &&
        row.parsedCode.apiFamily === selectedFamily,
    )
    .sort(compareReleaseSetRows)
  const selectedCohortKey = await resolveSelectedValue({
    label: 'cohortKey',
    optionValue: getStringOption(args, ['cohort-key', 'cohort']),
    values: uniqueSorted(familyRows.map(row => row.parsedCode?.cohortKey)),
  })
  const releaseSet = familyRows.find(
    row => row.parsedCode?.cohortKey === selectedCohortKey,
  )

  if (!releaseSet?.parsedCode) {
    throw new Error(
      `No API release set found for ${selectedRegion}/${selectedFamily}/${selectedCohortKey}.`,
    )
  }

  const targetPath = resolveDocsFixturePath(selectedFamily, releaseSet.code)

  if (existsSync(targetPath)) {
    throw new Error(`Docs fixture already exists: ${targetPath}`)
  }

  const previousFixture = await findEffectiveFixture(
    selectedFamily,
    familyRows,
    releaseSet.code,
  )
  const now = new Date().toISOString()
  const frontmatter = {
    createdAt: now,
    updatedAt: now,
    apiFamily: selectedFamily,
    apiVersion: releaseSet.apiVersion,
    apiReleaseSet: releaseSet.code,
    regionCode: releaseSet.parsedCode.regionCode,
    cohortKey: releaseSet.parsedCode.cohortKey,
  }
  const body = previousFixture?.body ?? ''

  await mkdir(resolve(API_RELEASE_SET_DOCS_ROOT, selectedFamily), { recursive: true })
  await writeFile(targetPath, serialiseMarkdownFixture(frontmatter, body), 'utf8')

  note(
    [
      formatField('target', describeTarget(target).label),
      formatField('apiFamily', selectedFamily),
      formatField('cohortKey', selectedCohortKey),
      formatField('apiReleaseSet', releaseSet.code),
      formatField('copiedFrom', previousFixture?.frontmatter.apiReleaseSet ?? '-'),
      formatField('path', targetPath),
    ].join('\n'),
    'DOCS NEW',
  )
  outro('API release-set docs fixture created')
}

export async function runDocsPublishCommand(args: ParsedArgs, target: UploadTarget) {
  const scope = await resolveDocsPublishScope(args)

  if (scope === 'all') {
    await runApiReleaseSetDocsPublishCommand(args, target)
    await runReleaseDocsPublishCommand(args, target)
    return
  }

  if (scope === 'releases') {
    await runReleaseDocsPublishCommand(args, target)
    return
  }

  await runApiReleaseSetDocsPublishCommand(args, target)
}

async function runApiReleaseSetDocsPublishCommand(
  args: ParsedArgs,
  target: UploadTarget,
) {
  const dryRun = Boolean(args.options['dry-run'])
  const rows = (await fetchApiReleaseSetDocsRows(target))
    .map(row => ({ ...row, parsedCode: parseReleaseSetCode(row.code) }))
    .filter(isParsedReleaseSetRow)
    .sort(compareReleaseSetRows)
  const rowsByScope = groupRowsByDocsScope(rows)
  const updates: Array<{
    code: string
    fixturePath: string
    notes: string
    previousNotes: string
  }> = []

  for (const familyRows of rowsByScope.values()) {
    let effectiveFixture: DocsFixture | null = null

    for (const row of familyRows) {
      const apiFamily = row.parsedCode.apiFamily
      const fixture = await readFixtureIfExists(apiFamily, row.code)

      if (fixture) {
        effectiveFixture = fixture
      }

      if (!effectiveFixture) {
        continue
      }

      const previousNotes = row.notes ?? ''

      const notes = renderMarkdownFixtureBody(
        effectiveFixture,
        frontmatterForApiReleaseSetRow(row),
      )

      if (previousNotes !== notes) {
        updates.push({
          code: row.code,
          fixturePath: effectiveFixture.path,
          notes,
          previousNotes,
        })
      }
    }
  }

  if (!dryRun) {
    for (const update of updates) {
      await putApiReleaseSetNotes(target, update.code, update.notes)
    }
  }

  note(
    [
      formatField('target', describeTarget(target).label),
      formatField('dryRun', String(dryRun)),
      formatField('inspected', String(rows.length)),
      formatField('changed', String(updates.length)),
      formatField(
        'apiReleaseSets',
        updates.length > 0 ? updates.map(update => update.code).join(', ') : '-',
      ),
    ].join('\n'),
    'DOCS PUBLISH',
  )
  outro(dryRun ? 'API docs publish dry run complete' : 'API docs published')
}

async function runReleaseDocsNewCommand(args: ParsedArgs, target: UploadTarget) {
  const rows = (await fetchReleaseDocsRows(target)).sort(compareReleaseRows)

  if (rows.length === 0) {
    throw new Error(`No releases found for ${describeTarget(target).label}.`)
  }

  const selectedRegion = await resolveSelectedValue({
    label: 'region',
    optionValue: getStringOption(args, ['region']),
    values: uniqueSorted(rows.map(row => row.regionCode)),
  })
  const regionRows = rows.filter(row => row.regionCode === selectedRegion)
  const selectedSource = await resolveSelectedValue({
    label: 'source',
    optionValue: getStringOption(args, ['source']),
    values: uniqueSorted(regionRows.map(row => row.source)),
  })
  const sourceRows = regionRows.filter(row => row.source === selectedSource)
  const selectedType = await resolveSelectedValue({
    label: 'type',
    optionValue: getStringOption(args, ['type']),
    values: uniqueSorted(sourceRows.map(row => row.type)),
  })
  const typeRows = sourceRows.filter(row => row.type === selectedType)
  const selectedDataset = await resolveSelectedValue({
    label: 'dataset',
    optionValue: getStringOption(args, ['dataset', 'dataset-code']),
    values: uniqueSorted(typeRows.map(row => row.datasetCode)),
  })
  const datasetRows = typeRows
    .filter(row => row.datasetCode === selectedDataset)
    .sort(compareReleaseRows)
  const releaseOption = getStringOption(args, ['release', 'release-code'])
  const cohortOption = getStringOption(args, ['cohort-key', 'cohort'])
  const selectedRelease = await resolveSelectedRelease({
    cohortOption,
    datasetCode: selectedDataset,
    releaseOption,
    rows: datasetRows,
  })

  if (!selectedRelease) {
    throw new Error(
      releaseOption
        ? `Release not found: ${releaseOption}`
        : `No release found for dataset ${selectedDataset}.`,
    )
  }

  const targetPath = resolveReleaseDocsFixturePath(
    selectedRelease.datasetCode,
    selectedRelease.code,
  )

  if (existsSync(targetPath)) {
    throw new Error(`Docs fixture already exists: ${targetPath}`)
  }

  const previousFixture = await findEffectiveReleaseFixture(
    datasetRows,
    selectedRelease.code,
  )
  const now = new Date().toISOString()
  const frontmatter = {
    createdAt: now,
    updatedAt: now,
    dataset: selectedRelease.datasetCode,
    release: selectedRelease.code,
    regionCode: selectedRelease.regionCode,
    source: selectedRelease.source,
    sourceVersion: selectedRelease.sourceVersion,
    sourceSchemaVersion: selectedRelease.sourceSchemaVersion ?? '',
    type: selectedRelease.type,
    cohortKey: selectedRelease.cohortKey ?? '',
  }
  const body = previousFixture?.body ?? ''

  await mkdir(resolve(RELEASE_DOCS_ROOT, selectedRelease.datasetCode), {
    recursive: true,
  })
  await writeFile(targetPath, serialiseMarkdownFixture(frontmatter, body), 'utf8')

  note(
    [
      formatField('target', describeTarget(target).label),
      formatField('dataset', selectedRelease.datasetCode),
      formatField('release', selectedRelease.code),
      formatField('copiedFrom', previousFixture?.frontmatter.release ?? '-'),
      formatField('path', targetPath),
    ].join('\n'),
    'DOCS NEW',
  )
  outro('Release docs fixture created')
}

async function runReleaseDocsPublishCommand(args: ParsedArgs, target: UploadTarget) {
  const dryRun = Boolean(args.options['dry-run'])
  const rows = (await fetchReleaseDocsRows(target)).sort(compareReleaseRows)
  const rowsByDataset = groupReleaseRowsByDataset(rows)
  const updates: Array<{
    code: string
    datasetCode: string
    fixturePath: string
    notes: string
    previousNotes: string
  }> = []

  for (const datasetRows of rowsByDataset.values()) {
    let effectiveFixture: DocsFixture | null = null

    for (const row of datasetRows) {
      const fixture = await readReleaseFixtureIfExists(row.datasetCode, row.code)

      if (fixture) {
        effectiveFixture = fixture
      }

      if (!effectiveFixture) {
        continue
      }

      const previousNotes = row.notes ?? ''

      const notes = renderMarkdownFixtureBody(
        effectiveFixture,
        frontmatterForReleaseRow(row),
      )

      if (previousNotes !== notes) {
        updates.push({
          code: row.code,
          datasetCode: row.datasetCode,
          fixturePath: effectiveFixture.path,
          notes,
          previousNotes,
        })
      }
    }
  }

  if (!dryRun) {
    for (const update of updates) {
      await putReleaseNotes(target, update.code, update.notes)
    }
  }

  note(
    [
      formatField('target', describeTarget(target).label),
      formatField('dryRun', String(dryRun)),
      formatField('inspected', String(rows.length)),
      formatField('changed', String(updates.length)),
      formatField(
        'releases',
        updates.length > 0 ? updates.map(update => update.code).join(', ') : '-',
      ),
    ].join('\n'),
    'DOCS PUBLISH',
  )
  outro(dryRun ? 'Release docs publish dry run complete' : 'Release docs published')
}

async function fetchApiReleaseSetDocsRows(target: UploadTarget) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(`${baseUrl}/api/v1/meta/docs/apiReleaseSets`, {
    headers: getAuthHeaders(),
    method: 'GET',
  })
  const payload = (await response.json().catch(() => null)) as {
    rows?: ApiReleaseSetDocsRow[]
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to fetch API release-set docs metadata with status ${response.status}.`,
    )
  }

  return payload?.rows ?? []
}

async function fetchReleaseDocsRows(target: UploadTarget) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(`${baseUrl}/api/v1/meta/docs/releases`, {
    headers: getAuthHeaders(),
    method: 'GET',
  })
  const payload = (await response.json().catch(() => null)) as {
    rows?: ReleaseDocsRow[]
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to fetch release docs metadata with status ${response.status}.`,
    )
  }

  return payload?.rows ?? []
}

async function putApiReleaseSetNotes(
  target: UploadTarget,
  code: string,
  notes: string,
) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(
    `${baseUrl}/api/v1/meta/docs/apiReleaseSets/${encodeURIComponent(code)}`,
    {
      body: JSON.stringify({ notes }),
      headers: {
        'content-type': 'application/json',
        ...getAuthHeaders(),
      },
      method: 'PUT',
    },
  )
  const payload = (await response.json().catch(() => null)) as {
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to publish docs for ${code} with status ${response.status}.`,
    )
  }
}

async function putReleaseNotes(target: UploadTarget, code: string, notes: string) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(
    `${baseUrl}/api/v1/meta/docs/releases/${encodeURIComponent(code)}`,
    {
      body: JSON.stringify({ notes }),
      headers: {
        'content-type': 'application/json',
        ...getAuthHeaders(),
      },
      method: 'PUT',
    },
  )
  const payload = (await response.json().catch(() => null)) as {
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to publish release docs for ${code} with status ${response.status}.`,
    )
  }
}

async function resolveSelectedValue(input: {
  label: string
  optionValue: string | undefined
  values: string[]
}): Promise<string> {
  if (input.values.length === 0) {
    throw new Error(`No ${input.label} options are available.`)
  }

  if (input.optionValue) {
    if (!input.values.includes(input.optionValue)) {
      throw new Error(
        `Unknown ${input.label}: ${input.optionValue}. Available: ${input.values.join(', ')}`,
      )
    }

    return input.optionValue
  }

  if (input.values.length === 1) {
    return input.values[0] as string
  }

  const selected = await select({
    message: `Select ${input.label}`,
    options: input.values.map(value => ({
      label: value,
      value,
    })),
  })

  if (isCancel(selected)) {
    cancel('DOCS NEW CANCELLED')
    process.exit(1)
  }

  return selected
}

async function findEffectiveFixture(
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

async function findEffectiveReleaseFixture(
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

async function readFixtureIfExists(apiFamily: string, code: string) {
  const path = resolveDocsFixturePath(apiFamily, code)

  if (!existsSync(path)) {
    return null
  }

  return {
    ...parseMarkdownFixture(await readFile(path, 'utf8')),
    path,
  }
}

async function readReleaseFixtureIfExists(datasetCode: string, code: string) {
  const path = resolveReleaseDocsFixturePath(datasetCode, code)

  if (!existsSync(path)) {
    return null
  }

  return {
    ...parseMarkdownFixture(await readFile(path, 'utf8')),
    path,
  }
}

function groupRowsByDocsScope(rows: ParsedApiReleaseSetDocsRow[]) {
  const grouped = new Map<string, ParsedApiReleaseSetDocsRow[]>()

  for (const row of rows) {
    const docsScope = `${row.parsedCode.regionCode}:${row.parsedCode.apiFamily}`

    grouped.set(docsScope, [...(grouped.get(docsScope) ?? []), row])
  }

  return grouped
}

function groupReleaseRowsByDataset(rows: ReleaseDocsRow[]) {
  const grouped = new Map<string, ReleaseDocsRow[]>()

  for (const row of rows) {
    grouped.set(row.datasetCode, [...(grouped.get(row.datasetCode) ?? []), row])
  }

  return grouped
}

function resolveSingleReleaseForCohort(rows: ReleaseDocsRow[], cohortKey: string) {
  const matches = rows.filter(row => row.cohortKey === cohortKey)

  if (matches.length > 1) {
    throw new Error(
      `Multiple releases found for cohort ${cohortKey}: ${matches.map(row => row.code).join(', ')}`,
    )
  }

  return matches[0] ?? null
}

async function resolveSelectedRelease(input: {
  cohortOption: string | undefined
  datasetCode: string
  releaseOption: string | undefined
  rows: ReleaseDocsRow[]
}) {
  if (input.releaseOption) {
    return input.rows.find(row => row.code === input.releaseOption) ?? null
  }

  if (input.cohortOption) {
    return resolveSingleReleaseForCohort(input.rows, input.cohortOption)
  }

  if (input.rows.length === 0) {
    return null
  }

  const selectedCode = await select({
    message: `Select release for ${input.datasetCode}`,
    options: input.rows
      .slice()
      .reverse()
      .map(row => ({
        label: row.code,
        hint: [
          row.cohortKey ? `cohort ${row.cohortKey}` : null,
          `source ${row.sourceVersion}`,
          row.status,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' · '),
        value: row.code,
      })),
  })

  if (isCancel(selectedCode)) {
    cancel('DOCS NEW CANCELLED')
    process.exit(1)
  }

  return input.rows.find(row => row.code === selectedCode) ?? null
}

function parseReleaseSetCode(code: string): ParsedReleaseSetCode | null {
  const match = /^data-([a-z0-9]+)-([a-z]+)-(.+)-(\d+)$/.exec(code)

  if (!match) {
    return null
  }

  const [, regionCode, apiFamily, cohortKey, sequence] = match

  if (!regionCode || !apiFamily || !cohortKey || !sequence) {
    return null
  }

  return {
    regionCode,
    apiFamily,
    cohortKey,
    sequence: Number.parseInt(sequence, 10),
  }
}

function compareReleaseSetRows(
  left: ParsedApiReleaseSetDocsRow,
  right: ParsedApiReleaseSetDocsRow,
) {
  return (
    left.parsedCode.apiFamily.localeCompare(right.parsedCode.apiFamily) ||
    left.parsedCode.regionCode.localeCompare(right.parsedCode.regionCode) ||
    left.parsedCode.cohortKey.localeCompare(right.parsedCode.cohortKey) ||
    left.parsedCode.sequence - right.parsedCode.sequence ||
    left.code.localeCompare(right.code)
  )
}

function compareReleaseRows(left: ReleaseDocsRow, right: ReleaseDocsRow) {
  return (
    left.datasetCode.localeCompare(right.datasetCode) ||
    compareReleaseVersions(left.sourceVersion, right.sourceVersion) ||
    (left.cohortKey ?? '').localeCompare(right.cohortKey ?? '') ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.code.localeCompare(right.code)
  )
}

function resolveDocsFixturePath(apiFamily: string, code: string) {
  return resolve(API_RELEASE_SET_DOCS_ROOT, apiFamily, `${code}.md`)
}

function resolveReleaseDocsFixturePath(datasetCode: string, code: string) {
  return resolve(RELEASE_DOCS_ROOT, datasetCode, `${code}.md`)
}

function isParsedReleaseSetRow(
  row: ApiReleaseSetDocsRow & { parsedCode: ParsedReleaseSetCode | null },
): row is ParsedApiReleaseSetDocsRow {
  return row.parsedCode !== null
}

async function resolveDocsNewScope(args: ParsedArgs): Promise<DocsScope> {
  const explicitScope = getStringOption(args, ['scope', 'docs-scope'])

  if (explicitScope) {
    return parseDocsScope(explicitScope)
  }

  if (args.options.releases) {
    return 'releases'
  }

  const selectedScope = await promptDocsScope({
    message: 'Create docs for',
    options: ['apiReleaseSets', 'releases'],
  })

  if (selectedScope === 'all') {
    throw new Error('`all` is only supported for `docs:publish`.')
  }

  return selectedScope
}

async function resolveDocsPublishScope(args: ParsedArgs): Promise<PublishDocsScope> {
  const explicitScope = getStringOption(args, ['scope', 'docs-scope'])

  if (explicitScope) {
    return parsePublishDocsScope(explicitScope)
  }

  if (args.options.releases) {
    return 'releases'
  }

  return promptDocsScope({
    message: 'Publish docs for',
    options: ['apiReleaseSets', 'releases', 'all'],
  })
}

function parseDocsScope(value: string): DocsScope {
  const scope = parsePublishDocsScope(value)

  if (scope === 'all') {
    throw new Error('`all` is only supported for `docs:publish`.')
  }

  return scope
}

function parsePublishDocsScope(value: string): PublishDocsScope {
  switch (value) {
    case 'all':
      return 'all'
    case 'api':
    case 'api-release-set':
    case 'api-release-sets':
    case 'apiReleaseSet':
    case 'apiReleaseSets':
      return 'apiReleaseSets'
    case 'release':
    case 'releases':
    case 'dataset-release':
    case 'dataset-releases':
      return 'releases'
    default:
      throw new Error(
        `Unsupported docs scope: ${value}. Expected apiReleaseSets, releases, or all.`,
      )
  }
}

async function promptDocsScope(input: {
  message: string
  options: PublishDocsScope[]
}): Promise<PublishDocsScope> {
  const selected = await select<PublishDocsScope>({
    message: input.message,
    options: input.options.map(value => ({
      label: formatDocsScopeLabel(value),
      value,
    })),
  })

  if (isCancel(selected)) {
    cancel('DOCS CANCELLED')
    process.exit(1)
  }

  return selected
}

function formatDocsScopeLabel(scope: PublishDocsScope) {
  switch (scope) {
    case 'apiReleaseSets':
      return 'API release sets'
    case 'releases':
      return 'Releases'
    case 'all':
      return 'All'
  }
}

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

function serialiseMarkdownFixture(frontmatter: Record<string, string>, body: string) {
  return `---\n${Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')}\n---\n${ensureTrailingNewline(body)}`
}

export function renderMarkdownFixtureBody(
  fixture: {
    body: string
    frontmatter: Record<string, string>
  },
  frontmatterOverride: Record<string, string> = {},
) {
  const frontmatter = {
    ...fixture.frontmatter,
    ...frontmatterOverride,
  }

  return fixture.body.replace(
    /\{\{\s*([a-z][A-Za-z0-9_-]*)\s*\}\}/g,
    (tag, key: string) => {
      const value = frontmatter[key]

      if (value === undefined) {
        throw new Error(`Unknown markdown fixture frontmatter tag: ${tag}`)
      }

      return value
    },
  )
}

function frontmatterForApiReleaseSetRow(
  row: ParsedApiReleaseSetDocsRow,
): Record<string, string> {
  return {
    apiFamily: row.parsedCode.apiFamily,
    apiReleaseSet: row.code,
    apiVersion: row.apiVersion,
    cohortKey: row.parsedCode.cohortKey,
    regionCode: row.parsedCode.regionCode,
  }
}

function frontmatterForReleaseRow(row: ReleaseDocsRow): Record<string, string> {
  return {
    cohortKey: row.cohortKey ?? '',
    dataset: row.datasetCode,
    regionCode: row.regionCode,
    release: row.code,
    source: row.source,
    sourceSchemaVersion: row.sourceSchemaVersion ?? '',
    sourceVersion: row.sourceVersion,
    type: row.type,
  }
}

function parseSimpleYaml(value: string) {
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

function ensureTrailingNewline(value: string) {
  return value.length === 0 || value.endsWith('\n') ? value : `${value}\n`
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort(
    (left, right) => left.localeCompare(right),
  )
}
