import { confirm, isCancel, log, outro, select, spinner } from '@clack/prompts'
import { stat } from 'node:fs/promises'
import { relative } from 'node:path'

import { describeTarget } from '../cli/display.ts'
import { fetchReleaseReport, type ReleaseReportRow } from '../api/reporting.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { runUploadCommand } from './upload.ts'
import {
  loadPreparedSourceArchive,
  mirrorCsdiSourceArchive,
} from '../sources/sourceArchives.ts'
import {
  type DatasetFixture,
  type UpdateStateEntry,
  getDueUpdatePhases,
  loadCurrentCompositionIngestDependencies,
  loadDatasetFixtures,
  lookupDatasetUpdates,
  normaliseDatasetVersion,
  orderDatasetsByCompositionDependencies,
  recordUpdatePhaseCheck,
  recordUpdateArchiveMirror,
  recordUpdateDatabaseImport,
  recordUpdateState,
  readUpdateState,
  writeUpdateState,
} from '../sources/sourceUpdates.ts'

type DatasetUpdate = Awaited<ReturnType<typeof lookupDatasetUpdates>>[number]
type PlannedDatasetUpdates = {
  dataset: DatasetFixture
  duePhases: ReturnType<typeof getDueUpdatePhases>
  targetVersions: Map<string, string | null>
  updates: DatasetUpdate[]
}

type TargetVersionLookup =
  | { status: 'available'; versions: Map<string, string | null> }
  | { status: 'unknown' }

type UpdateProcessingResult =
  | 'downloaded'
  | 'ingested'
  | 'mirrored'
  | 'reviewed'
  | 'skipped'
  | 'uploaded'

const UPDATE_LINE_WIDTH = 120
const CLACK_STATUS_PREFIX_WIDTH = 3
const PUBLISHER_COLUMN_WIDTH = 10
const RESOURCE_TYPE_COLUMN_WIDTH = 16
const VERSION_COLUMN_WIDTH = 'vXXXX-XX-XX.XX'.length
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const TARGET_RELEASE_REPORT_LIMIT = 100

function updateLineWidth() {
  const columns = process.stdout.isTTY ? process.stdout.columns : undefined
  if (!columns || columns <= CLACK_STATUS_PREFIX_WIDTH) return UPDATE_LINE_WIDTH

  // Clack adds its own three-column status prefix (for example, `◇  `).
  // Keep the message itself within the remaining terminal width.
  return Math.min(UPDATE_LINE_WIDTH, columns - CLACK_STATUS_PREFIX_WIDTH)
}

export async function runUpdateCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const requested = readDatasetOption(args)
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error('`update` accepts dataset selection through --dataset only.')
  }

  const datasets = await loadDatasetFixtures()
  const requestedDatasets = requested
    ? datasets.filter(dataset => requested.has(dataset.code))
    : datasets
  if (requestedDatasets.length === 0) throw new Error('No matching datasets found.')

  const selectedFamily = await resolveApiFamilySelection(args, datasets, requested)
  const selectedFamilyDatasets =
    selectedFamily === 'all'
      ? requestedDatasets
      : requestedDatasets.filter(dataset => dataset.theme === selectedFamily)
  const selectedDatasets = orderDatasetsByCompositionDependencies(
    datasets,
    selectedFamilyDatasets,
    await loadCurrentCompositionIngestDependencies(),
  )

  log.message('', { spacing: 0 })
  log.message(
    `${colorize('DATASET UPDATES', 34)} ${dim('·')} ${colorize(
      selectedFamily === 'all' ? 'ALL' : familyLabel(selectedFamily),
      33,
    )} ${dim('·')} ${colorize(describeTarget(target).label, 34)}`,
    { spacing: 0 },
  )
  log.message('', { spacing: 0 })

  const state = await readUpdateState()
  const forceDownload = args.options['force-download'] === true
  const shouldDownload = args.options.download === true || forceDownload
  const skipUpload = args.options['no-upload'] === true
  const skipPrompts = args.options.yes === true
  const forceCheck =
    args.options.force === true || args.options['check-now'] === true || forceDownload
  const errors: string[] = []
  let reportedTargetLookupFailure = false
  const planned: PlannedDatasetUpdates[] = []

  for (const dataset of selectedDatasets) {
    let targetVersionLookup: TargetVersionLookup
    try {
      targetVersionLookup = {
        status: 'available',
        versions: await fetchTargetVersions(target, dataset),
      }
    } catch {
      if (!reportedTargetLookupFailure) {
        log.warn(
          'Target release report unavailable; skipping affected datasets until it can be retrieved.',
        )
        reportedTargetLookupFailure = true
      }
      targetVersionLookup = { status: 'unknown' }
    }

    if (targetVersionLookup.status === 'unknown') {
      const row = new UpdateRow(dataset)
      row.start('checking target release')
      row.finish('SKIPPED', undefined, null)
      continue
    }

    const targetVersions = targetVersionLookup.versions

    const duePhases = getDueUpdatePhases(dataset, state[dataset.code], {
      force: forceCheck,
      hasTargetRelease: [...targetVersions.values()].some(version => version !== null),
    })
    if (duePhases.length === 0) {
      const row = new UpdateRow(dataset)
      row.start('checking current')
      row.finish('SKIPPED', undefined, null)
      continue
    }

    const updates = await lookupDatasetUpdates(
      dataset,
      state[dataset.code],
      targetVersions,
      // Phase scheduling has already decided that this source is due. The
      // previous single-cadence throttle must not suppress that decision.
      true,
    )
    for (const update of updates) {
      const sourceKey = update.sourceKey ?? dataset.code
      update.targetVersion =
        targetVersions.get(sourceKey) ??
        targetVersions.get(update.targetSourceKey ?? dataset.code)
    }
    if (!updates.some(update => update.status === 'error')) {
      const checkedAt = new Date().toISOString()
      const latest = updates
        .filter(update => update.releaseLastRevisedAt)
        .sort((left, right) =>
          (left.releaseLastRevisedAt ?? '').localeCompare(
            right.releaseLastRevisedAt ?? '',
          ),
        )
        .at(-1)
      for (const phase of duePhases) {
        recordUpdatePhaseCheck(state, dataset.code, phase, {
          checkedAt,
          releaseLastRevisedAt: latest?.releaseLastRevisedAt,
          sourceCursor: latest?.sourceCursor,
        })
      }

      const archiveCheck = dataset.releasePolicy?.checks.archives
      const discoveredNewRelease = updates.some(isNewReleaseDiscovery)
      const discoveredRevision = updates.some(isRevisionDiscovery)
      const initialDownload = ![...targetVersions.values()].some(
        version => version !== null,
      )
      if (
        archiveCheck?.trigger === 'on-discovery' &&
        ((archiveCheck.includeInitialDownload && initialDownload) ||
          (archiveCheck.discoveries.includes('new-release') && discoveredNewRelease) ||
          (archiveCheck.discoveries.includes('revision') && discoveredRevision))
      ) {
        recordUpdatePhaseCheck(state, dataset.code, 'archives', {
          checkedAt,
          releaseLastRevisedAt: latest?.releaseLastRevisedAt,
          sourceCursor: latest?.sourceCursor,
        })
      }
    }
    planned.push({ dataset, duePhases, targetVersions, updates })
  }

  // Archive evidence must be mirrored before a correction or a new release is
  // considered for ingestion, so every later action has its publisher bytes
  // available for review and reproducibility.
  for (const phase of ['archives', 'revisions', 'new-releases'] as const) {
    const phasePlans = planned
      .map(plan => ({
        ...plan,
        updates: plan.updates.filter(update =>
          updateBelongsToPhase(update, plan, phase),
        ),
      }))
      .filter(plan => plan.updates.length > 0)

    logPhaseHeading(phase)
    if (phasePlans.length === 0) {
      log.message(`No actionable ${phaseHeading(phase).toLowerCase()}.`, {
        spacing: 0,
      })
      continue
    }
    for (const plan of phasePlans) {
      await processPlannedUpdates(plan, {
        errors,
        forceDownload,
        printUsage,
        shouldDownload,
        skipPrompts,
        skipUpload,
        state,
        target,
      })
    }
  }

  await writeUpdateState(state)
  if (errors.length > 0) {
    log.error(
      ['Update errors:', ...errors.flatMap(error => wrapUpdateMessage(error))].join(
        '\n',
      ),
      {
        spacing: 1,
      },
    )
  }
  const family =
    selectedFamily === 'all'
      ? colorFamilyLabel('API family', 'all')
      : colorFamilyLabel(familyLabel(selectedFamily), selectedFamily)
  outro(`Checked all ${family} datasets for new releases`)
}

function phaseHeading(phase: 'new-releases' | 'revisions' | 'archives') {
  return {
    'new-releases': 'NEW RELEASES',
    revisions: 'NEW REVISIONS',
    archives: 'ARCHIVES',
  }[phase]
}

function logPhaseHeading(phase: 'new-releases' | 'revisions' | 'archives') {
  // The leading and trailing guide make each phase a connected branch while
  // retaining a clear pause before its dataset rows.
  log.message([phaseHeading(phase), ''], {
    secondarySymbol: dim('│'),
    spacing: 1,
    symbol: dim('├'),
    withGuide: true,
  })
}

function updateBelongsToPhase(
  update: DatasetUpdate,
  plan: PlannedDatasetUpdates,
  phase: 'new-releases' | 'revisions' | 'archives',
) {
  if (update.phase) {
    return (
      update.phase === phase &&
      (update.phase !== 'archives' || isArchiveActionable(plan))
    )
  }
  if (update.archive) return phase === 'archives' && isArchiveActionable(plan)
  if (phase === 'archives') return false
  if (update.status === 'review') return phase === 'revisions'
  if (
    phase === 'revisions' &&
    !plan.duePhases.includes('new-releases') &&
    plan.duePhases.includes('revisions')
  ) {
    return true
  }
  return phase === 'new-releases'
}

function isArchiveActionable(plan: PlannedDatasetUpdates) {
  const check = plan.dataset.releasePolicy?.checks.archives
  if (!check) return false
  // An explicitly due archive phase (currently only a periodic policy or a
  // forced check) must report every unresolved archive slot. On-discovery
  // policies otherwise limit routine scans to release events.
  if (plan.duePhases.includes('archives')) return true
  if (check.trigger !== 'on-discovery') return false

  const initialDownload = ![...plan.targetVersions.values()].some(
    version => version !== null,
  )
  return (
    (check.includeInitialDownload && initialDownload) ||
    (check.discoveries.includes('new-release') &&
      plan.updates.some(isNewReleaseDiscovery)) ||
    (check.discoveries.includes('revision') && plan.updates.some(isRevisionDiscovery))
  )
}

function isNewReleaseDiscovery(update: DatasetUpdate) {
  if (update.status !== 'new') return false
  if (!update.targetVersion) return true
  return updateVersionBase(update.version) !== updateVersionBase(update.targetVersion)
}

function isRevisionDiscovery(update: DatasetUpdate) {
  return (
    update.status === 'review' ||
    (update.status === 'new' &&
      Boolean(update.targetVersion) &&
      updateVersionBase(update.version) === updateVersionBase(update.targetVersion))
  )
}

function updateVersionBase(version: string | null | undefined) {
  return version?.replace(/\.\d+$/, '')
}

async function processPlannedUpdates(
  plan: PlannedDatasetUpdates,
  options: {
    errors: string[]
    forceDownload: boolean
    printUsage: () => void
    shouldDownload: boolean
    skipPrompts: boolean
    skipUpload: boolean
    state: Record<string, UpdateStateEntry>
    target: UploadTarget
  },
) {
  const row = new UpdateRow(plan.dataset)
  const renderedUpdates = new Set<DatasetUpdate>()

  for (const [updateIndex, update] of plan.updates.entries()) {
    const sourceKey = update.sourceKey ?? plan.dataset.code
    const targetVersion =
      plan.targetVersions.get(sourceKey) ??
      plan.targetVersions.get(update.targetSourceKey ?? plan.dataset.code)
    update.targetVersion = targetVersion
    try {
      const result = await processUpdate(update, {
        forceDownload: options.forceDownload,
        printUsage: options.printUsage,
        row,
        shouldDownload: options.shouldDownload,
        skipPrompts: options.skipPrompts,
        skipUpload: options.skipUpload,
        target: options.target,
        targetVersion: targetVersion ?? undefined,
        updateIndex,
        updateTotal: plan.updates.length,
      })
      if (result === 'ingested' && update.version) {
        plan.targetVersions.set(sourceKey, update.version)
      }
      if (update.mirroredArchive) {
        recordUpdateArchiveMirror(options.state, plan.dataset.code, update)
      }
      if (result === 'ingested') {
        recordUpdateDatabaseImport(options.state, plan.dataset.code, update)
      }
      if (shouldRecordUpdateStateAfterProcessing(update, result)) {
        recordUpdateState(options.state, plan.dataset.code, update)
      }
      if (result === 'downloaded' || result === 'mirrored') {
        renderedUpdates.add(update)
      }
      if (update.status === 'error' && update.message) {
        options.errors.push(`${plan.dataset.code}: ${update.message}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Update cancelled.') throw error
      // Mirroring succeeded before a downstream importer failed. Persist archive
      // custody independently; deliberately do not record database intake.
      if (update.mirroredArchive) {
        recordUpdateArchiveMirror(options.state, plan.dataset.code, update)
      }
      const message = error instanceof Error ? error.message : String(error)
      options.errors.push(`${plan.dataset.code}: ${message}`)
    }
  }

  const unrenderedUpdates = plan.updates.filter(update => !renderedUpdates.has(update))
  if (unrenderedUpdates.length > 0) {
    row.finishUpdates(unrenderedUpdates, plan.targetVersions)
  }
}

/**
 * Source checks are not publication evidence. In particular, a declined or failed
 * upload must leave a new release eligible for a later retry.
 */
export function shouldRecordUpdateStateAfterProcessing(
  update: Pick<
    DatasetUpdate,
    'archive' | 'deferStateUntilProcessed' | 'phase' | 'status'
  >,
  result: UpdateProcessingResult,
) {
  const deferStateUntilProcessed = Boolean(
    update.archive || update.deferStateUntilProcessed,
  )
  if (deferStateUntilProcessed) {
    return (
      result === 'ingested' ||
      result === 'mirrored' ||
      (update.phase === 'archives' && result === 'downloaded') ||
      update.status === 'current'
    )
  }

  return (
    result === 'ingested' ||
    result === 'reviewed' ||
    result === 'uploaded' ||
    update.status === 'current'
  )
}

export async function resolveApiFamilySelection(
  args: ParsedArgs,
  datasets: readonly DatasetFixture[],
  requested?: Set<string>,
) {
  const selected = args.options['api-family'] ?? args.options.scope
  if (requested && selected !== undefined) {
    throw new Error('Use either --dataset or --api-family to select updates, not both.')
  }
  if (requested) return 'all'

  if (selected === undefined) return askApiFamily(datasets)
  if (typeof selected !== 'string') {
    throw new Error('--api-family requires a value.')
  }

  const families = new Set(datasets.map(dataset => dataset.theme))
  if (selected !== 'all' && !families.has(selected)) {
    throw new Error(
      `Unsupported API family: ${selected}. Use all or ${[...families].sort().join(', ')}.`,
    )
  }

  return selected
}

function updateStatusLabel(update: DatasetUpdate, targetVersion?: string | null) {
  if (update.status === 'error') return 'ERROR'
  if (update.status === 'manual') return 'MANUAL'
  if (update.status === 'skipped') return 'SKIPPED'
  if (update.status === 'review') return 'REVIEW'
  if (update.status === 'new' && targetVersion === null) return 'MISSING'
  return update.status === 'new' ? 'NEW' : 'no updates'
}

async function askApiFamily(datasets: readonly DatasetFixture[]) {
  const families = [...new Set(datasets.map(dataset => dataset.theme))].sort(
    (left, right) => familyLabel(left).localeCompare(familyLabel(right)),
  )
  const options = ['all', ...families].map(value => ({
    label: colorFamilyOption(value === 'all' ? 'ALL' : familyLabel(value), value),
    value,
  }))
  const answer = await select({
    message: 'Update which API Family?',
    options,
    initialValue: 'all',
    showInstructions: false,
    withGuide: false,
  })
  if (isCancel(answer)) throw new Error('Update cancelled.')
  clearResolvedPrompt()
  return answer
}

function familyLabel(value: string) {
  return value.toUpperCase()
}

function colorFamilyOption(label: string, value: string) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return label
  return colorFamilyLabel(label, value)
}

function colorFamilyLabel(label: string, value: string) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return label
  const color = familyColor(value)
  return `${color}${label}\u001b[39m`
}

function familyColor(value: string) {
  return value === 'all'
    ? '\u001b[36m'
    : value === 'addresses'
      ? '\u001b[34m'
      : value === 'divisions'
        ? '\u001b[35m'
        : value === 'places'
          ? '\u001b[33m'
          : value === 'stats'
            ? '\u001b[32m'
            : '\u001b[31m'
}

function colorize(value: string, color: number) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return value
  return `\u001b[${color}m${value}\u001b[39m`
}

async function fetchTargetVersions(target: UploadTarget, dataset: DatasetFixture) {
  const report = await fetchReleaseReport(target, {
    datasetCode: dataset.code,
    limit: TARGET_RELEASE_REPORT_LIMIT,
  })
  if (report.rows.length === TARGET_RELEASE_REPORT_LIMIT) {
    throw new Error(
      `Target release report for ${dataset.code} may be truncated at ${TARGET_RELEASE_REPORT_LIMIT} rows.`,
    )
  }
  return targetVersionsFromReport(dataset, report.rows)
}

export function targetVersionsFromReport(
  dataset: DatasetFixture,
  rows: ReadonlyArray<Pick<ReleaseReportRow, 'sourceVersion'>>,
) {
  const targetVersions = new Map<string, string | null>()
  const releases = dataset.releases?.length ? dataset.releases : [undefined]
  const targetHasNoReleases = rows.length === 0

  // A successful target report is authoritative. Missing manifest cohorts are
  // absent from the target too, even when this operator has saved local state.
  if (targetHasNoReleases) targetVersions.set(dataset.code, null)

  for (const sourceVersion of rows
    .map(row => row.sourceVersion)
    .filter((version): version is string => Boolean(version))) {
    targetVersions.set(sourceVersion, normaliseDatasetVersion(dataset, sourceVersion))
  }

  for (const [index, release] of releases.entries()) {
    const releaseSourceVersion = release?.sourceVersion
    const sourceKey = releaseSourceVersion ?? dataset.code
    const matchingVersions = releaseSourceVersion
      ? rows
          .map(row => row.sourceVersion)
          .filter(version => versionMatchesSourceRelease(version, releaseSourceVersion))
      : rows.map(row => row.sourceVersion)
    const resolvedTargetVersion = latestVersion(matchingVersions)
    const targetVersion = resolvedTargetVersion
      ? normaliseDatasetVersion(dataset, resolvedTargetVersion)
      : null

    targetVersions.set(sourceKey || `release-${index}`, targetVersion)
  }

  return targetVersions
}

function versionMatchesSourceRelease(version: string, sourceVersion: string) {
  return version === sourceVersion || version.startsWith(`${sourceVersion}.`)
}

function latestVersion(versions: string[]) {
  return versions
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .at(-1)
}

async function processUpdate(
  update: DatasetUpdate,
  options: {
    printUsage: () => void
    row: UpdateRow
    shouldDownload: boolean
    forceDownload: boolean
    skipPrompts: boolean
    skipUpload: boolean
    target: UploadTarget
    targetVersion: string | undefined
    updateIndex: number
    updateTotal: number
  },
): Promise<UpdateProcessingResult> {
  if (update.status === 'review') {
    await askToInvestigate(update)
    return 'reviewed' as const
  }
  if (update.status === 'error' || update.status === 'manual') return 'skipped' as const
  if (update.ingest) {
    if (!shouldIngestUpdate(update)) return 'skipped' as const
    if (options.skipUpload) return 'skipped' as const
    options.row.clear()
    const promptForIngest = !options.skipPrompts
    const ingest = promptForIngest
      ? await askToIngest(
          update,
          options.targetVersion,
          options.updateIndex,
          options.updateTotal,
        )
      : true
    if (isCancel(ingest)) throw new Error('Update cancelled.')
    if (!ingest) {
      clearResolvedPrompt()
      return 'skipped' as const
    }
    if (promptForIngest) replaceResolvedDecision()
    await update.ingest(options.target)
    return 'ingested' as const
  }
  if (!shouldDownloadUpdate(update, options.forceDownload)) return 'skipped' as const

  options.row.clear()

  const archiveMustMirror = Boolean(update.archive)
  const promptForDownload =
    !archiveMustMirror && !options.shouldDownload && !options.skipPrompts
  const download = promptForDownload
    ? archiveMustMirror
      ? true
      : await askToDownload(update, options.targetVersion)
    : true
  if (isCancel(download)) throw new Error('Update cancelled.')
  if (!download) {
    clearResolvedPrompt()
    return 'skipped' as const
  }
  if (promptForDownload) replaceResolvedDecision()

  const path = await downloadWithSpinner(update, {
    forceDownload: options.forceDownload,
    index: options.updateIndex,
    row: options.row,
    total: options.updateTotal,
    targetVersion: options.targetVersion,
  })

  if (update.archive) {
    const prepared = await loadPreparedSourceArchive(path)
    await update.recordIdenticalArchive?.(prepared.manifest.original.sha256)
    await mirrorCsdiSourceArchive(options.target, update.archive, prepared)
    update.mirroredArchive = {
      contentHash: prepared.manifest.archive.sha256,
      mirroredAt: new Date().toISOString(),
      objectKey: prepared.manifest.archive.objectKey,
    }
    if (!update.postArchiveIngest || options.skipUpload) return 'mirrored' as const

    const promptForIngest = !options.skipPrompts
    const ingest = promptForIngest
      ? await askToIngest(
          update,
          options.targetVersion,
          options.updateIndex,
          options.updateTotal,
        )
      : true
    if (isCancel(ingest)) throw new Error('Update cancelled.')
    if (!ingest) {
      clearResolvedPrompt()
      return 'mirrored' as const
    }
    if (promptForIngest) replaceResolvedDecision()
    const result = await update.postArchiveIngest(options.target, prepared)
    return result === 'ingested' ? ('ingested' as const) : ('mirrored' as const)
  }

  if (!update.upload || options.skipUpload) return 'downloaded' as const
  const promptForUpload = !options.skipPrompts
  const upload = promptForUpload ? await askToUpload(path, options.target) : true
  if (isCancel(upload)) throw new Error('Update cancelled.')
  if (!upload) {
    clearResolvedPrompt()
    return 'downloaded' as const
  }
  if (promptForUpload) replaceResolvedDecision()

  await runUploadCommand(
    { command: 'upload', positionals: [path], options: update.upload.options },
    options.target,
    {
      dryRun: false,
      forceUpload: false,
      invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
      printUsage: options.printUsage,
      skipConfirm: true,
      skipSnapshotCleanup: false,
      quiet: true,
      validateGeometry: false,
    },
  )
  return 'uploaded' as const
}

export function shouldIngestUpdate(update: Pick<DatasetUpdate, 'ingest' | 'status'>) {
  return update.status === 'new' && Boolean(update.ingest)
}

export function shouldDownloadUpdate(
  update: Pick<DatasetUpdate, 'download' | 'status'>,
  forceDownload = false,
) {
  return Boolean(update.download) && (forceDownload || update.status !== 'current')
}

export function datasetLabel(
  dataset: Awaited<ReturnType<typeof loadDatasetFixtures>>[number],
) {
  const prefix = `ds-${dataset.regionCode}-${dataset.publisherCode}-`
  const remainder = dataset.code.startsWith(prefix)
    ? dataset.code.slice(prefix.length)
    : dataset.code
  const resourceTypes = dataset.resourceTypes ?? (dataset.type ? [dataset.type] : [])
  const primaryType = resourceTypes[0] ?? 'resource'
  const typeSlug = primaryType.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const suffix = remainder.startsWith(`${typeSlug}-`)
    ? remainder.slice(typeSlug.length + 1)
    : remainder.endsWith(`-${typeSlug}`)
      ? remainder.slice(0, -(typeSlug.length + 1))
      : ''
  return `${dataset.publisherCode} : ${resourceTypes.join(' + ')}${suffix ? ` [::${suffix}]` : ''}`
}

async function askToDownload(
  update: DatasetUpdate,
  _targetVersion: string | undefined,
) {
  const answer = await confirm({
    message: formatUpdateLine(
      update.dataset,
      update.version,
      _targetVersion,
      undefined,
      UPDATE_LINE_WIDTH - 3,
    ),
    initialValue: true,
    withGuide: false,
  })
  return answer
}

export function formatLandsdIngestPrompt(
  update: DatasetUpdate,
  targetVersion: string | undefined,
  index: number,
  total: number,
) {
  const position = total > 1 ? ` ${index + 1}/${total}` : ''
  const candidate = update.version ? `v${ownVersion(update.version)}` : 'this release'
  const baseline = targetVersion
    ? `after v${ownVersion(targetVersion)}`
    : 'as the target baseline'
  return `Ingest ${formatDatasetPromptLabel(update.dataset)}${position}: ${candidate} ${baseline}?`
}

async function askToIngest(
  update: DatasetUpdate,
  targetVersion: string | undefined,
  index: number,
  total: number,
) {
  return confirm({
    message: formatLandsdIngestPrompt(update, targetVersion, index, total),
    initialValue: true,
    withGuide: false,
  })
}

async function askToInvestigate(update: DatasetUpdate) {
  const answer = await confirm({
    message: `${formatDatasetPromptLabel(update.dataset)} ${dim('·')} metadata changed — investigate before publishing?`,
    initialValue: true,
    withGuide: false,
  })
  if (isCancel(answer)) throw new Error('Update cancelled.')
  clearResolvedPrompt()
  return answer
}

async function downloadWithSpinner(
  update: DatasetUpdate,
  options: {
    forceDownload: boolean
    index: number
    row: UpdateRow
    targetVersion: string | undefined
    total: number
  },
) {
  const cached = options.forceDownload
    ? undefined
    : await findCachedDownload(update.downloadPath)
  if (cached) {
    options.row.cached(
      update,
      options.index,
      options.total,
      options.targetVersion,
      cached.size,
    )
    return update.downloadPath as string
  }

  const startedAt = Date.now()
  options.row.downloading(update, options.index, options.total)

  try {
    const path = await update.download?.()
    if (!path) throw new Error('The update did not provide a download path.')
    const file = await stat(path)
    options.row.downloaded(
      update,
      options.index,
      options.total,
      options.targetVersion,
      Date.now() - startedAt,
      file.size,
    )
    return path
  } catch (error) {
    options.row.error('Download failed')
    throw error
  }
}

async function findCachedDownload(path: string | undefined) {
  if (!path) return undefined

  try {
    const file = await stat(path)
    return file.isFile() && file.size > 0 ? file : undefined
  } catch {
    return undefined
  }
}

export function wrapUpdateMessage(
  message: string,
  detail?: string,
  width = UPDATE_LINE_WIDTH - 3,
) {
  return wrapText(detail ? `${message}: ${detail}` : message, width)
}

function wrapText(value: string, width: number) {
  return value.split('\n').flatMap(line => {
    if (line.length === 0) return ['']

    const lines: string[] = []
    let remaining = line
    while (remaining.length > width) {
      const breakAt = remaining.lastIndexOf(' ', width)
      const splitAt = breakAt > 0 ? breakAt : width
      lines.push(remaining.slice(0, splitAt))
      remaining = remaining.slice(splitAt).trimStart()
    }
    lines.push(remaining)
    return lines
  })
}

export function formatDatasetPromptLabel(dataset: DatasetFixture) {
  const parts = datasetLabelParts(dataset)
  return `${colorize(parts.publisher, 36)} ${dim('∷')} ${colorize(parts.type, 35)}${
    parts.subtype ? ` ${dim('∷')} ${colorize(parts.subtype, 33)}` : ''
  }`
}

export function formatCheckLine(
  dataset: DatasetFixture,
  status: string,
  version?: string,
  targetVersion?: string | null,
) {
  return formatUpdateLine(dataset, version, targetVersion, status)
}

export function formatUpdateProgressLine(dataset: DatasetFixture, stage: string) {
  const label = formatDatasetCheckLabel(dataset)
  const stageColumn = updateLineWidth() - 5 - VERSION_COLUMN_WIDTH * 2
  const padding = Math.max(1, stageColumn - visibleWidth(label))
  return `${label}${' '.repeat(padding)}${stage}`
}

export function formatDownloadProgressLine(
  dataset: DatasetFixture,
  index: number,
  total: number,
  version?: string,
) {
  const position = total > 1 ? ` ${index + 1}/${total}` : ''
  const release = version ? ` ${dim(`· v${ownVersion(version)}`)}` : ''
  return formatUpdateProgressLine(dataset, `downloading${position}${release}`)
}

export function formatDownloadCompleteLine(
  dataset: DatasetFixture,
  index: number,
  total: number,
  version: string | undefined,
  targetVersion: string | null | undefined,
  elapsed: number,
  bytes: number,
) {
  const position = total > 1 ? ` ${index + 1}/${total}` : ''
  const release = `${position.trimStart()} ${dim(
    `(${formatElapsed(elapsed)}, ${formatBytes(bytes)})`,
  )}`
  return formatDownloadResultLine(dataset, release, version, targetVersion)
}

function formatDownloadCachedLine(
  dataset: DatasetFixture,
  index: number,
  total: number,
  version: string | undefined,
  targetVersion: string | null | undefined,
  bytes: number,
) {
  const position = total > 1 ? ` ${index + 1}/${total}` : ''
  const release = `${position.trimStart()} ${dim(`(cached, ${formatBytes(bytes)})`)}`
  return formatDownloadResultLine(dataset, release, version, targetVersion)
}

function formatDownloadResultLine(
  dataset: DatasetFixture,
  release: string,
  version: string | undefined,
  targetVersion: string | null | undefined,
) {
  const versions = formatVersionColumns(version, targetVersion)
  const label = formatDatasetCheckLabel(dataset)
  const padding = Math.max(
    2,
    updateLineWidth() -
      visibleWidth(label) -
      visibleWidth(release) -
      visibleWidth(versions),
  )
  const line = `${label}${' '.repeat(padding)}${release}${versions}`
  if (visibleWidth(line) <= updateLineWidth()) return line

  // Completed downloads include both the release position and version
  // columns. On a narrow terminal, do not let terminal wrapping detach those
  // details from their dataset label.
  const compactLabel = formatDatasetCheckLabel(dataset, true)
  const compactVersions = formatCompactVersionColumns(version, targetVersion)
  const compactLine = `${compactLabel}  ${release}  ${compactVersions}`
  if (visibleWidth(compactLine) <= updateLineWidth()) return compactLine

  return `${compactLabel}  ${release}\n  ${compactVersions}`
}

export function formatDatasetCheckLine(
  dataset: DatasetFixture,
  updates: DatasetUpdate[],
  targetVersions: ReadonlyMap<string, string | null>,
) {
  const label = formatDatasetCheckLabel(dataset)
  const orderedUpdates = orderUpdatesForDisplay(dataset, updates)
  if (orderedUpdates.length === 1) {
    const update = orderedUpdates[0] as DatasetUpdate
    const targetVersion = targetVersionForUpdate(update, dataset, targetVersions)
    return formatUpdateLineWithLabel(
      label,
      update.version,
      targetVersion,
      updateStatusLabel(update, targetVersion),
    )
  }

  const first = orderedUpdates[0] as DatasetUpdate
  const releaseLines = orderedUpdates.slice(1).map(update => {
    const continuation = `${dim('│')} ${' '.repeat(
      Math.max(0, visibleWidth(label) - 2),
    )}`
    const targetVersion = targetVersionForUpdate(update, dataset, targetVersions)
    return formatUpdateLineWithLabel(
      continuation,
      update.version,
      targetVersion,
      updateStatusLabel(update, targetVersion),
      UPDATE_LINE_WIDTH + CLACK_STATUS_PREFIX_WIDTH,
    )
  })
  const firstTargetVersion = targetVersionForUpdate(first, dataset, targetVersions)
  return [
    formatUpdateLineWithLabel(
      label,
      first.version,
      firstTargetVersion,
      updateStatusLabel(first, firstTargetVersion),
    ),
    ...releaseLines,
  ].join('\n')
}

function orderUpdatesForDisplay(dataset: DatasetFixture, updates: DatasetUpdate[]) {
  if (dataset.releasePolicy?.series !== 'cohort') return updates

  return updates.toSorted((left, right) => {
    const versionComparison = (right.version ?? '').localeCompare(
      left.version ?? '',
      undefined,
      { numeric: true },
    )
    if (versionComparison !== 0) return versionComparison
    return (right.sourceKey ?? '').localeCompare(left.sourceKey ?? '')
  })
}

function targetVersionForUpdate(
  update: DatasetUpdate,
  dataset: DatasetFixture,
  targetVersions: ReadonlyMap<string, string | null>,
) {
  return Object.hasOwn(update, 'targetVersion')
    ? update.targetVersion
    : (targetVersions.get(update.sourceKey ?? dataset.code) ??
        targetVersions.get(update.targetSourceKey ?? dataset.code))
}

function formatUpdateLine(
  dataset: DatasetFixture,
  version?: string,
  targetVersion?: string | null,
  status?: string,
  width = UPDATE_LINE_WIDTH,
  showEmptyVersionPlaceholder = true,
) {
  return formatUpdateLineWithLabel(
    formatDatasetCheckLabel(dataset),
    version,
    targetVersion,
    status,
    width,
    showEmptyVersionPlaceholder,
  )
}

function formatUpdateLineWithLabel(
  label: string,
  version?: string,
  targetVersion?: string | null,
  status?: string,
  width = UPDATE_LINE_WIDTH,
  showEmptyVersionPlaceholder = true,
) {
  const showStatus =
    Boolean(status) &&
    (status === 'MISSING' ||
      !releasesDiffer(version, targetVersion) ||
      (status === 'no updates' && !version))
  const statusText = showStatus
    ? status === 'ERROR'
      ? colorize((status as string).padStart(VERSION_COLUMN_WIDTH), 31)
      : (status as string).padStart(VERSION_COLUMN_WIDTH)
    : ''
  const versionText = formatVersionColumns(
    version,
    targetVersion,
    showEmptyVersionPlaceholder,
  )
  const separatorWidth = showStatus ? 2 : 0
  const padding = Math.max(
    2,
    width -
      visibleWidth(label) -
      visibleWidth(statusText) -
      separatorWidth -
      visibleWidth(versionText),
  )
  return `${label}${' '.repeat(padding)}${statusText}${
    showStatus ? '  ' : ''
  }${versionText}`
}

function formatDatasetCheckLabel(dataset: DatasetFixture, compact = false) {
  const parts = datasetLabelParts(dataset)
  const publisher = compact
    ? parts.publisher
    : parts.publisher.padEnd(PUBLISHER_COLUMN_WIDTH)
  const type = compact ? parts.type : parts.type.padEnd(RESOURCE_TYPE_COLUMN_WIDTH)
  return `${colorize(publisher, 36)} ${dim('∷')} ${colorize(type, 35)}${
    parts.subtype ? ` ${dim('∷')} ${colorize(parts.subtype, 33)}` : ''
  }`
}

function formatVersionColumns(
  version?: string,
  targetVersion?: string | null,
  showEmptyPlaceholder = true,
) {
  if (!version && !targetVersion) {
    return showEmptyPlaceholder
      ? dim('—'.padStart(VERSION_COLUMN_WIDTH))
      : ' '.repeat(VERSION_COLUMN_WIDTH)
  }

  const theirs = version ? `v${ownVersion(version)}` : '—'
  const ours = targetVersion ? `v${ownVersion(targetVersion)}` : '—'
  if (!releasesDiffer(version, targetVersion)) {
    return targetVersion
      ? colorize(ours.padStart(VERSION_COLUMN_WIDTH), 32)
      : dim(ours.padStart(VERSION_COLUMN_WIDTH))
  }
  const separator = version && targetVersion ? '←' : ''

  return `${
    version
      ? colorize(theirs.padStart(VERSION_COLUMN_WIDTH), 32)
      : dim(theirs.padStart(VERSION_COLUMN_WIDTH))
  } ${dim(separator)} ${
    targetVersion
      ? colorize(ours.padStart(VERSION_COLUMN_WIDTH), 31)
      : dim(ours.padStart(VERSION_COLUMN_WIDTH))
  }`
}

function formatCompactVersionColumns(version?: string, targetVersion?: string | null) {
  const theirs = version ? `v${ownVersion(version)}` : '—'
  const ours = targetVersion ? `v${ownVersion(targetVersion)}` : '—'
  if (!releasesDiffer(version, targetVersion)) return colorize(theirs, 32)

  return `${version ? colorize(theirs, 32) : dim(theirs)} ${dim('←')} ${
    targetVersion ? colorize(ours, 31) : dim(ours)
  }`
}

function releasesDiffer(version?: string, targetVersion?: string | null) {
  if (!version || !targetVersion) return Boolean(version || targetVersion)
  return comparableVersion(version) !== comparableVersion(targetVersion)
}

function ownVersion(value: string) {
  const compact = compactVersion(value)
  return /^(?:\d{4}|\d{4}-\d{2}-\d{2})$/.test(compact) ? `${compact}.0` : compact
}

function comparableVersion(value: string) {
  const compact = compactVersion(value)
  return /^\d{4}$/.test(compact) ? `${compact}.0` : compact
}

function visibleWidth(value: string) {
  return value.replace(ANSI_SGR, '').length
}

function datasetLabelParts(dataset: DatasetFixture) {
  const prefix = `ds-${dataset.regionCode}-${dataset.publisherCode}-`
  const remainder = dataset.code.startsWith(prefix)
    ? dataset.code.slice(prefix.length)
    : dataset.code
  const resourceTypes = dataset.resourceTypes ?? (dataset.type ? [dataset.type] : [])
  const primaryType = resourceTypes[0] ?? 'resource'
  const typeSlug = primaryType.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const codeSubtype = remainder.startsWith(`${typeSlug}-`)
    ? remainder.slice(typeSlug.length + 1)
    : remainder.endsWith(`-${typeSlug}`)
      ? remainder.slice(0, -(typeSlug.length + 1))
      : ''
  const variantPrefix = `${dataset.publisherCode}-`
  const variantSubtype = dataset.sourceVariant?.startsWith(variantPrefix)
    ? dataset.sourceVariant.slice(variantPrefix.length)
    : dataset.sourceVariant
  const subtype = codeSubtype || variantSubtype
  return {
    publisher: formatPublisherLabel(dataset.publisherCode),
    subtype: subtype
      ? formatTitleLabel(subtype)
      : dataset.publisherCode === 'hkgov-hyd' && primaryType === 'street'
        ? 'Nameplate'
        : '',
    type:
      resourceTypes.length === 2 &&
      resourceTypes.includes('division') &&
      resourceTypes.includes('divisionArea')
        ? 'Division(Area)'
        : resourceTypes.map(formatResourceTypeLabel).join(' + '),
  }
}

function formatResourceTypeLabel(value: string) {
  return value === 'divisionStatistic' ? 'Statistic' : formatTitleLabel(value)
}

function formatPublisherLabel(value: string) {
  const publisher = value.replace(/^hkgov-/, '')
  if (publisher === 'dpo') return 'DPO'
  if (publisher === 'td') return 'TD'
  if (publisher.endsWith('d')) return `${formatTitleLabel(publisher.slice(0, -1))}D`
  return formatTitleLabel(publisher)
}

function formatTitleLabel(value: string) {
  return value
    .split('-')
    .map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function compactVersion(value: string) {
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? value
}

function formatElapsed(milliseconds: number) {
  return `${Math.max(1, Math.round(milliseconds / 1000))}s`
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`
}

async function askToUpload(path: string, target: UploadTarget) {
  return confirm({
    message: `Upload ${relative(process.cwd(), path)} to ${describeTarget(target).label}?`,
    initialValue: true,
    withGuide: true,
  })
}

class UpdateRow {
  private readonly progress = spinner({ withGuide: false })
  private active = false

  constructor(private readonly dataset: DatasetFixture) {}

  start(stage: string) {
    this.progress.start(`${formatUpdateProgressLine(this.dataset, stage)} `)
    this.active = true
  }

  message(stage: string) {
    const message = `${formatUpdateProgressLine(this.dataset, stage)} `
    if (this.active) {
      this.progress.message(message)
    } else {
      this.progress.start(message)
      this.active = true
    }
  }

  downloading(update: DatasetUpdate, index: number, total: number) {
    this.progress.start(
      `${formatDownloadProgressLine(this.dataset, index, total, update.version)} `,
    )
    this.active = true
  }

  downloaded(
    update: DatasetUpdate,
    index: number,
    total: number,
    targetVersion: string | undefined,
    elapsed: number,
    bytes: number,
  ) {
    this.progress.stop(
      formatDownloadCompleteLine(
        this.dataset,
        index,
        total,
        update.version,
        targetVersion,
        elapsed,
        bytes,
      ),
    )
    this.active = false
  }

  cached(
    update: DatasetUpdate,
    index: number,
    total: number,
    targetVersion: string | undefined,
    bytes: number,
  ) {
    log.success(
      formatDownloadCachedLine(
        this.dataset,
        index,
        total,
        update.version,
        targetVersion,
        bytes,
      ),
      { spacing: 0, withGuide: true },
    )
  }

  clear() {
    if (!this.active) return
    this.progress.clear()
    this.active = false
  }

  finish(status: string, version?: string, targetVersion?: string | null) {
    const message = formatCheckLine(this.dataset, status, version, targetVersion)
    if (status === 'ERROR') {
      this.stop(message, 'error')
    } else {
      this.stop(message, 'success')
    }
  }

  finishUpdates(
    updates: DatasetUpdate[],
    targetVersions: ReadonlyMap<string, string | null>,
  ) {
    const message = formatDatasetCheckLine(this.dataset, updates, targetVersions)
    if (updates.some(update => update.status === 'error')) {
      this.stop(message, 'error')
    } else {
      this.stop(message, 'success')
    }
  }

  error(message: string) {
    this.stop(message, 'error')
  }

  private stop(message: string, status: 'error' | 'success') {
    if (this.active) {
      if (status === 'error') {
        this.progress.error(message)
      } else {
        this.progress.stop(message)
      }
    } else if (status === 'error') {
      log.error(message, { spacing: 0, withGuide: false })
    } else {
      // A completed download stops the spinner before any remaining release
      // rows are rendered. Restart it so those rows retain the same Clack
      // status prefix and version-column alignment as the download row.
      this.progress.start('')
      this.progress.stop(message)
    }
    this.active = false
  }
}

function clearResolvedPrompt() {
  if (!process.stdout.isTTY) return
  process.stdout.write('\x1B[2A\x1B[0J')
}

function replaceResolvedDecision() {
  if (!process.stdout.isTTY) return
  process.stdout.write('\x1B[1A\x1B[2K\r')
}

function dim(value: string) {
  return process.stdout.isTTY && !process.env.NO_COLOR
    ? `\x1b[2m${value}\x1b[22m`
    : value
}

function readDatasetOption(args: ParsedArgs) {
  if (typeof args.options.dataset !== 'string') return undefined
  const values = new Set(
    args.options.dataset
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  return values.size > 0 ? values : undefined
}
