import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cancel, isCancel, log, note, outro, select } from '@clack/prompts'
import { describeTarget, formatField, formatMutedValue } from '../cli/display.ts'
import { getStringOption, type ParsedArgs, type UploadTarget } from '../cli/options.ts'
import { colorize } from './updateFormatting.ts'
import { formatApiReleaseSetDocsGrid } from './releaseSetDisplay.ts'
import {
  compareReleaseRows,
  compareReleaseSetRows,
  groupReleaseRowsByDataset,
  groupRowsByDocsScope,
  parseReleaseSetCode,
  resolveDocsNewScope,
  resolveDocsPublishScope,
  resolveSelectedRelease,
} from './docsSelection.ts'
import {
  fetchApiReleaseSetDocsRows,
  fetchReleaseDocsRows,
  putApiReleaseSetDocumentation,
  putReleaseNotes,
} from './docsRequests.ts'
import {
  findEffectiveFixture,
  findEffectiveGuideFixture,
  findEffectiveReleaseFixture,
  frontmatterForApiReleaseSetRow,
  frontmatterForReleaseRow,
  isParsedReleaseSetRow,
  readFixtureIfExists,
  readGuideFixtureIfExists,
  readReleaseFixtureIfExists,
  releaseVersionFromSourceVersion,
  resolveDocsFixturePath,
  resolveGuideFixturePath,
  resolveReleaseDocsFixturePath,
  uniqueSorted,
} from './docsFixtures.ts'
import { renderMarkdownFixtureBody, serialiseMarkdownFixture } from './docsRendering.ts'
import type { DocsFixture } from './docsTypes.ts'
import { RELEASE_DOCS_ROOT } from './docsConfig.ts'

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
    revision: String(releaseSet.parsedCode.sequence),
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
    for (const row of familyRows) {
      const apiFamily = row.parsedCode.apiFamily
      const notesFixture = await readFixtureIfExists(apiFamily, row.code)
      const guideFixture = await readGuideFixtureIfExists(apiFamily, row.code)

      if (!notesFixture && !guideFixture) {
        continue
      }

      const frontmatter = frontmatterForApiReleaseSetRow(row)
      const notes = notesFixture
        ? await renderMarkdownFixtureBody(
            notesFixture,
            frontmatter,
            row.sources ?? [],
            notesFixture.path,
          )
        : row.notes
      const guide = guideFixture
        ? await renderMarkdownFixtureBody(
            guideFixture,
            frontmatter,
            row.sources ?? [],
            guideFixture.path,
          )
        : row.guide

      if (row.notes !== notes || row.guide !== guide) {
        updates.push({
          code: row.code,
          guide,
          guidePath: guideFixture?.path ?? null,
          notes,
          notesPath: notesFixture?.path ?? null,
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
      ...(dryRun ? [formatField('dryRun', 'true')] : []),
      formatField('inspected', String(rows.length)),
      formatField('changed', String(updates.length)),
    ].join('\n'),
    'DOCS PUBLISH',
  )
  if (updates.length > 0) {
    console.log(
      [
        `${colorize('◆', 36)}  ${colorize('API RELEASE-SET DOCS UPDATED', 90)}`,
        ...formatApiReleaseSetDocsGrid(updates.map(update => update.code)),
      ].join('\n'),
    )
  }
  outro(dryRun ? 'API docs publish dry run complete' : 'API docs published ✓')
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
      ...(dryRun ? [formatField('dryRun', 'true')] : []),
      formatField('inspected', String(rows.length)),
      formatField('changed', String(updates.length)),
    ].join('\n'),
    'DOCS PUBLISH',
  )
  for (const update of updates) {
    log.info(`Release docs updated  ${formatReleaseCode(update.code)}`)
  }
  outro(dryRun ? 'Release docs publish dry run complete' : 'Release docs published ✓')
}

function formatReleaseCode(code: string) {
  const match =
    /^dr-([a-z0-9]+)-([a-z0-9-]+)-(.+)-(\d{4}(?:-[\d.]+)?)(?:::(.+))?$/.exec(code)
  if (!match) return colorize(code, 33)

  const [, regionCode, publisherCode, dataset, sourceVersion, resourceType] = match
  return [
    colorize('dr', 90),
    colorize(`-${regionCode}`, 36),
    colorize(`-${publisherCode}`, 35),
    colorize(`-${dataset}`, 33),
    colorize(`-${sourceVersion}`, 32),
    resourceType ? formatMutedValue(`::${resourceType}`) : '',
  ].join('')
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

export type {
  ApiReleaseSetDocsRow,
  ApiReleaseSetSourceDocsRow,
} from './docsTypes.ts'

export {
  createApiReleaseSetRevisionDraft,
  createApiReleaseSetInitialDraft,
  initialApiReleaseSetNotesBody,
} from './docsDrafts.ts'

export { fetchApiReleaseSetDocsRows } from './docsRequests.ts'

export { releaseVersionFromSourceVersion } from './docsFixtures.ts'

export { parseMarkdownFixture, renderMarkdownFixtureBody } from './docsRendering.ts'
