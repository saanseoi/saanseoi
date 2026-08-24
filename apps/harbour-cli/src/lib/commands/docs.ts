import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { cancel, isCancel, note, outro, select, text } from '@clack/prompts'
import { compareReleaseVersions, normaliseBaseUrl } from '@repo/core'
import { apiProfileDocumentationByFamily, apiProfileNames } from '@repo/core/apiLocales'

import { getAuthHeaders, resolveHarbourApiUrl } from '../api/api.ts'
import { describeTarget, formatField } from '../cli/display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'

type ApiReleaseSetDocsRow = {
  id: string
  apiFamily: string
  apiVersion: string
  code: string
  domainCode: string
  status: string
  schemaVersion: string
  rulesetVersion: string
  publishedAt: string | null
  validFrom: string | null
  validTo: string | null
  notes: string | null
  guide: string | null
  createdAt: string
  updatedAt: string
  sources?: ApiReleaseSetSourceDocsRow[]
}

export type ApiReleaseSetSourceDocsRow = {
  datasetCode: string
  datasetI18n: Array<{ locale: string; name: string }>
  publisherCode: string
  publisherI18n: Array<{ locale: string; name: string }>
  releaseCode: string
  resourceType: string
  role: 'primary' | 'supporting'
  sourceVersion: string
  variant: string
}

type ReleaseDocsRow = {
  id: string
  datasetId: string
  datasetCode: string
  regionCode: string
  theme: string
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
const API_RELEASE_SET_NOTES_DIRECTORY = 'notes'
const API_RELEASE_SET_GUIDES_DIRECTORY = 'guides'
const RELEASE_DOCS_ROOT = resolve(REPO_ROOT, 'fixtures/meta/releases')
const CURATION_ROOT = resolve(REPO_ROOT, 'fixtures/meta/curations')

type ApiReleaseSetRevisionDraft = {
  apiReleaseSetCode: string
  datasetName: string
  message?: string
  publisherCode: string
  sourceVersion: string
}

/**
 * Creates an editable English revision note after a new immutable API release
 * revision has been published. Publication never depends on this local draft.
 */
export async function createApiReleaseSetRevisionDraft(
  input: ApiReleaseSetRevisionDraft,
  options: { prompt: boolean },
) {
  const parsedCode = parseReleaseSetCode(input.apiReleaseSetCode)
  if (!parsedCode || parsedCode.sequence === 0) return null

  const targetPath = resolveDocsFixturePath(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const existingFixture = await readFixtureIfExists(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const existingGuideFixture = await readGuideFixtureIfExists(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const existingPath = existingFixture?.path ?? existingGuideFixture?.path
  if (existingPath) return { path: existingPath, status: 'existing' as const }

  const previousCode = input.apiReleaseSetCode.replace(
    /-r\d+(?=--|$)/,
    `-r${parsedCode.sequence - 1}`,
  )
  const previousFixture = await readFixtureIfExists(parsedCode.apiFamily, previousCode)
  if (!previousFixture) {
    throw new Error(
      `Cannot draft revision notes for ${input.apiReleaseSetCode}: no prior fixture exists for ${previousCode}.`,
    )
  }

  const publisherName = await resolvePublisherName(input.publisherCode)
  const defaultMessage = `Added **${input.datasetName}** \`${input.sourceVersion}\` by _${publisherName}_ to this API Family Release.`
  let message = input.message?.trim() || defaultMessage

  if (options.prompt && !input.message) {
    const answer = await text({
      initialValue: defaultMessage,
      message: `Revision note for ${input.apiReleaseSetCode}`,
      validate: value => (value?.trim() ? undefined : 'Enter a revision note.'),
    })
    if (isCancel(answer)) return { status: 'cancelled' as const }
    message = answer.trim()
  }

  const now = new Date().toISOString()
  const body = appendEnglishRevisionLog(
    previousFixture.body,
    message,
    parsedCode.sequence - 1,
  )
  const frontmatter = {
    ...previousFixture.frontmatter,
    apiReleaseSet: input.apiReleaseSetCode,
    apiReleaseSetRevision: String(parsedCode.sequence),
    createdAt: now,
    updatedAt: now,
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, serialiseMarkdownFixture(frontmatter, body), 'utf8')

  const guidePath = resolveGuideFixturePath(
    parsedCode.apiFamily,
    input.apiReleaseSetCode,
  )
  const previousGuideFixture = await readGuideFixtureIfExists(
    parsedCode.apiFamily,
    previousCode,
  )
  await mkdir(dirname(guidePath), { recursive: true })
  await writeFile(
    guidePath,
    serialiseMarkdownFixture(frontmatter, previousGuideFixture?.body ?? ''),
    'utf8',
  )

  return { path: targetPath, guidePath, status: 'created' as const }
}

/** Creates editable Notes and Guide drafts for a newly published r0 release. */
export async function createApiReleaseSetInitialDraft(
  apiReleaseSetCode: string,
  target: UploadTarget,
) {
  const parsedCode = parseReleaseSetCode(apiReleaseSetCode)
  if (parsedCode?.sequence !== 0) return null

  const [existingNotes, existingGuide] = await Promise.all([
    readFixtureIfExists(parsedCode.apiFamily, apiReleaseSetCode),
    readGuideFixtureIfExists(parsedCode.apiFamily, apiReleaseSetCode),
  ])
  const existingPath = existingNotes?.path ?? existingGuide?.path
  if (existingPath) {
    return {
      path: existingPath,
      status: 'existing' as const,
    }
  }

  const rows = (await fetchApiReleaseSetDocsRows(target))
    .map(row => ({ ...row, parsedCode: parseReleaseSetCode(row.code) }))
    .filter(isParsedReleaseSetRow)
    .sort(compareReleaseSetRows)
  const releaseSet = rows.find(row => row.code === apiReleaseSetCode)
  if (!releaseSet) {
    throw new Error(
      `Cannot draft docs: API release set was not found: ${apiReleaseSetCode}.`,
    )
  }

  const familyRows = rows.filter(
    row =>
      row.parsedCode.apiFamily === parsedCode.apiFamily &&
      row.parsedCode.regionCode === parsedCode.regionCode,
  )
  const [previousNotes, previousGuide] = await Promise.all([
    findEffectiveFixture(parsedCode.apiFamily, familyRows, apiReleaseSetCode),
    findEffectiveGuideFixture(parsedCode.apiFamily, familyRows, apiReleaseSetCode),
  ])
  const now = new Date().toISOString()
  const frontmatter = {
    createdAt: now,
    updatedAt: now,
    apiFamily: parsedCode.apiFamily,
    apiVersion: releaseSet.apiVersion,
    apiReleaseSet: apiReleaseSetCode,
    apiReleaseSetRevision: '0',
    regionCode: parsedCode.regionCode,
    cohortKey: parsedCode.cohortKey,
  }
  const notesPath = resolveDocsFixturePath(parsedCode.apiFamily, apiReleaseSetCode)
  const guidePath = resolveGuideFixturePath(parsedCode.apiFamily, apiReleaseSetCode)

  await mkdir(dirname(notesPath), { recursive: true })
  await writeFile(
    notesPath,
    serialiseMarkdownFixture(frontmatter, previousNotes?.body ?? ''),
    'utf8',
  )
  await mkdir(dirname(guidePath), { recursive: true })
  await writeFile(
    guidePath,
    serialiseMarkdownFixture(frontmatter, previousGuide?.body ?? ''),
    'utf8',
  )

  return { path: notesPath, guidePath, status: 'created' as const }
}

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

  const existingFixture = await readFixtureIfExists(selectedFamily, releaseSet.code)
  const existingGuideFixture = await readGuideFixtureIfExists(
    selectedFamily,
    releaseSet.code,
  )

  const existingPath = existingFixture?.path ?? existingGuideFixture?.path
  if (existingPath) {
    throw new Error(`Docs fixture already exists: ${existingPath}`)
  }

  const previousFixture = await findEffectiveFixture(
    selectedFamily,
    familyRows,
    releaseSet.code,
  )
  const previousGuideFixture = await findEffectiveGuideFixture(
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
    apiReleaseSetRevision: String(releaseSet.parsedCode.sequence),
    regionCode: releaseSet.parsedCode.regionCode,
    cohortKey: releaseSet.parsedCode.cohortKey,
  }
  const body = previousFixture?.body ?? ''
  const guideBody = previousGuideFixture?.body ?? ''
  const guidePath = resolveGuideFixturePath(selectedFamily, releaseSet.code)

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, serialiseMarkdownFixture(frontmatter, body), 'utf8')
  await mkdir(dirname(guidePath), { recursive: true })
  await writeFile(guidePath, serialiseMarkdownFixture(frontmatter, guideBody), 'utf8')

  note(
    [
      formatField('target', describeTarget(target).label),
      formatField('apiFamily', selectedFamily),
      formatField('cohortKey', selectedCohortKey),
      formatField('apiReleaseSet', releaseSet.code),
      formatField('copiedFrom', previousFixture?.frontmatter.apiReleaseSet ?? '-'),
      formatField('path', targetPath),
      formatField('guidePath', guidePath),
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
    guide: string | null
    guidePath: string | null
    notes: string | null
    notesPath: string | null
  }> = []

  for (const familyRows of rowsByScope.values()) {
    let effectiveNotesFixture: DocsFixture | null = null
    let effectiveGuideFixture: DocsFixture | null = null

    for (const row of familyRows) {
      const apiFamily = row.parsedCode.apiFamily
      const notesFixture = await readFixtureIfExists(apiFamily, row.code)
      const guideFixture = await readGuideFixtureIfExists(apiFamily, row.code)

      if (notesFixture) effectiveNotesFixture = notesFixture
      if (guideFixture) effectiveGuideFixture = guideFixture

      if (!effectiveNotesFixture && !effectiveGuideFixture) {
        continue
      }

      const frontmatter = frontmatterForApiReleaseSetRow(row)
      const notes = effectiveNotesFixture
        ? await renderMarkdownFixtureBody(
            effectiveNotesFixture,
            frontmatter,
            row.sources ?? [],
            effectiveNotesFixture.path,
          )
        : row.notes
      const guide = effectiveGuideFixture
        ? await renderMarkdownFixtureBody(
            effectiveGuideFixture,
            frontmatter,
            [],
            effectiveGuideFixture.path,
          )
        : row.guide

      if (row.notes !== notes || row.guide !== guide) {
        updates.push({
          code: row.code,
          guide,
          guidePath: effectiveGuideFixture?.path ?? null,
          notes,
          notesPath: effectiveNotesFixture?.path ?? null,
        })
      }
    }
  }

  if (!dryRun) {
    for (const update of updates) {
      await putApiReleaseSetDocumentation(target, update.code, update)
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
  const selectedDataset = await resolveSelectedValue({
    label: 'dataset',
    optionValue: getStringOption(args, ['dataset', 'dataset-code']),
    values: uniqueSorted(sourceRows.map(row => row.datasetCode)),
  })
  const datasetRows = sourceRows
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
    releaseVersion: releaseVersionFromSourceVersion(selectedRelease.sourceVersion),
    sourceSchemaVersion: selectedRelease.sourceSchemaVersion ?? '',
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

      const notes = await renderMarkdownFixtureBody(
        effectiveFixture,
        frontmatterForReleaseRow(row),
        [],
        effectiveFixture.path,
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

async function putApiReleaseSetDocumentation(
  target: UploadTarget,
  code: string,
  documentation: { guide: string | null; notes: string | null },
) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(
    `${baseUrl}/api/v1/meta/docs/apiReleaseSets/${encodeURIComponent(code)}`,
    {
      body: JSON.stringify(documentation),
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

async function findEffectiveGuideFixture(
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
  const paths = [
    resolveDocsFixturePath(apiFamily, code),
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

async function readGuideFixtureIfExists(apiFamily: string, code: string) {
  const path = resolveGuideFixturePath(apiFamily, code)

  if (!existsSync(path)) return null

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
  const match = /^data-([a-z0-9]+)-([a-z]+)-(.+?)(?:-r(\d+))?(?:--[a-z0-9-]+)?$/.exec(
    code,
  )

  if (!match) {
    return null
  }

  const [, regionCode, apiFamily, cohortKey, revision] = match

  if (!regionCode || !apiFamily || !cohortKey) {
    return null
  }

  return {
    regionCode,
    apiFamily,
    cohortKey,
    sequence: Number.parseInt(revision ?? '0', 10),
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
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    API_RELEASE_SET_NOTES_DIRECTORY,
    `${/-r\d+(?:--|$)/.test(code) ? code : `${code}-r0`}.md`,
  )
}

function resolveGuideFixturePath(apiFamily: string, code: string) {
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    API_RELEASE_SET_GUIDES_DIRECTORY,
    `${/-r\d+(?:--|$)/.test(code) ? code : `${code}-r0`}.md`,
  )
}

function resolveLegacyDocsFixturePath(apiFamily: string, code: string) {
  return resolve(
    API_RELEASE_SET_DOCS_ROOT,
    apiFamily,
    `${/-r\d+(?:--|$)/.test(code) ? code : `${code}-r0`}.md`,
  )
}

async function resolvePublisherName(publisherCode: string) {
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

function appendEnglishRevisionLog(
  body: string,
  message: string,
  previousRevision: number,
) {
  const frozenBody = body.replaceAll(
    /\{\{\s*apiReleaseSetRevision\s*\}\}/g,
    String(previousRevision),
  )
  const englishEnd = frozenBody.indexOf('\n# ZH-HANT')
  const english = englishEnd === -1 ? frozenBody : frozenBody.slice(0, englishEnd)
  const remainder = englishEnd === -1 ? '' : frozenBody.slice(englishEnd)
  const heading = '## Revision log'
  const entry = `- \`r{{ apiReleaseSetRevision }}\` ${message}`
  const existingHeading = english.indexOf(heading)

  if (existingHeading !== -1) {
    const insertionPoint = existingHeading + heading.length
    return `${english.slice(0, insertionPoint).trimEnd()}\n${entry}\n${english.slice(insertionPoint)}${remainder}`
  }

  return `${english.trimEnd()}\n\n${heading}\n\n${entry}\n${remainder}`
}

function resolveReleaseDocsFixturePath(datasetCode: string, code: string) {
  return resolve(RELEASE_DOCS_ROOT, datasetCode, `${code}.md`)
}

function resolveCurationFixturePath(curationPath: string) {
  const path = resolve(REPO_ROOT, curationPath)
  if (!path.startsWith(`${CURATION_ROOT}/`) || !path.endsWith('.json')) {
    throw new Error(`Invalid curation fixture path: ${curationPath}`)
  }
  return path
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
    options: ['all', 'apiReleaseSets', 'releases'],
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

    const markdown = fixture.body.replace(
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
    const renderedCenstatdTables = await renderCenstatdMeasureTables(
      renderedApiProfileTables,
      frontmatter,
    )
    return renderApiReleaseSetSourcesTables(renderedCenstatdTables, apiReleaseSources)
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
    /^(apiKeyNote|apiProfileTable|experimentalApiWarning|apiReleaseSetSources|hkgovCenstatdMeasureTable):/.test(
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
  const warnings = {
    en: `The <black>${apiVersionPath}</black> contract is experimental. The API contract might
change before the <black>v1</black> release, after which prior versions will be retired.`,
    'zh-Hant': `<black>${apiVersionPath}</black> 合約仍屬實驗性質。API 合約可能在 v1
發布前變更；屆時將淘汰舊版本。`,
    'zh-Hans': `<black>${apiVersionPath}</black> 合约仍处于实验阶段。API 合约可能在 v1
发布前变更；届时将淘汰旧版本。`,
  } as const

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
        return `| <black>${profileName}</black> | ${documentation.useCase} | ${documentation.coverage} |`
      })
      .join('\n')

    return `| ${profile} | ${useCase} | ${coverage} |\n| --- | --- | --- |\n${rows}`
  })
}

/**
 * Expands a reviewed C&SD measure curation into the release-note table for one
 * locale. This keeps the notes coupled to the names and descriptions actually
 * published by the statistics processor, rather than maintaining a second
 * hand-written copy in Markdown.
 */
async function renderCenstatdMeasureTables(
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

function renderApiReleaseSetSourcesTables(
  markdown: string,
  sources: ApiReleaseSetSourceDocsRow[],
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

type ApiReleaseSetSourceDocsLocale = 'en' | 'zh-Hant' | 'zh-Hans'

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

function humaniseResourceType(value: string) {
  return value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

function selectDocsLocalisedName(
  rows: Array<{ locale: string; name: string }>,
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

function markdownLink(label: string, href: string) {
  return escapeMarkdownTableCell(`[${label.replaceAll(']', '\\]')}](${href})`)
}

type CenstatdMeasureTableLocale = 'en' | 'zh-Hant' | 'zh-Hans'

type CenstatdMeasureTableManifest = {
  measures: Array<{
    localisations: Array<{
      description: string
      locale: CenstatdMeasureTableLocale
      name: string
    }>
    measureCode: string
  }>
}

function parseCenstatdMeasureTableManifest(
  value: unknown,
  path: string,
): CenstatdMeasureTableManifest {
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { measures?: unknown }).measures)
  ) {
    throw new Error(`Invalid C&SD measure curation manifest: ${path}`)
  }

  const measures = (value as { measures: unknown[] }).measures.map((measure, index) => {
    if (!measure || typeof measure !== 'object') {
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}`)
    }

    const entry = measure as {
      localisations?: unknown
      measureCode?: unknown
    }
    if (
      typeof entry.measureCode !== 'string' ||
      !/^[a-z][A-Za-z0-9]*$/.test(entry.measureCode) ||
      !Array.isArray(entry.localisations)
    ) {
      throw new Error(`Invalid C&SD measure curation entry ${index + 1}: ${path}`)
    }

    const localisations = entry.localisations.map((localisation, localisationIndex) => {
      if (!localisation || typeof localisation !== 'object') {
        throw new Error(
          `Invalid C&SD measure localisation ${index + 1}.${localisationIndex + 1}: ${path}`,
        )
      }
      const value = localisation as {
        description?: unknown
        locale?: unknown
        name?: unknown
      }
      if (
        typeof value.description !== 'string' ||
        typeof value.name !== 'string' ||
        !isCenstatdMeasureTableLocale(value.locale)
      ) {
        throw new Error(
          `Invalid C&SD measure localisation ${index + 1}.${localisationIndex + 1}: ${path}`,
        )
      }
      return value as CenstatdMeasureTableManifest['measures'][number]['localisations'][number]
    })

    return {
      localisations,
      measureCode: entry.measureCode,
    }
  })

  return { measures }
}

function isCenstatdMeasureTableLocale(
  value: unknown,
): value is CenstatdMeasureTableLocale {
  return value === 'en' || value === 'zh-Hant' || value === 'zh-Hans'
}

function renderCenstatdMeasureTable(
  manifest: CenstatdMeasureTableManifest,
  locale: CenstatdMeasureTableLocale,
) {
  const lines = ['| measureCode | name | description |', '| --- | --- | --- |']

  for (const measure of manifest.measures) {
    const localisation = measure.localisations.find(entry => entry.locale === locale)
    if (!localisation) {
      throw new Error(
        `C&SD measure ${measure.measureCode} has no ${locale} localisation for the release-note table.`,
      )
    }
    lines.push(
      `| \`${escapeMarkdownTableCell(measure.measureCode)}\` | ${escapeMarkdownTableCell(localisation.name)} | ${escapeMarkdownTableCell(localisation.description)} |`,
    )
  }

  return lines.join('\n')
}

function escapeMarkdownTableCell(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

function frontmatterForApiReleaseSetRow(
  row: ParsedApiReleaseSetDocsRow,
): Record<string, string> {
  const primarySource = row.sources?.find(source => source.role === 'primary')

  return {
    apiFamily: row.parsedCode.apiFamily,
    apiReleaseSet: row.code,
    apiReleaseSetRevision: String(row.parsedCode.sequence),
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

function frontmatterForReleaseRow(row: ReleaseDocsRow): Record<string, string> {
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
