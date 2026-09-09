import { isCancel, log, outro, select } from '@clack/prompts'
import { writeFile } from 'node:fs/promises'
import {
  isMinimalInitialisation,
  selectInitialisationVersions,
} from '../cli/minimalInitialisation.ts'
import { describeTarget } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  type DatasetFixture,
  type CompositionIngestDependency,
  type UpdateStateEntry,
  getDueUpdatePhases,
  loadCurrentCompositionIngestDependencies,
  loadDatasetFixtures,
  lookupDatasetUpdates,
  orderDatasetsByCompositionDependencies,
  recordUpdatePhaseCheck,
  recordUpdateArchiveMirror,
  recordUpdateDatabaseImport,
  recordUpdateState,
  readUpdateState,
  writeUpdateState,
} from '../sources/sourceUpdates.ts'
import {
  colorFamilyOption,
  colorize,
  dim,
  familyLabel,
  formatPublishedSourceRelease,
  formatUpdateErrorSummary,
} from './updateFormatting.ts'
import type {
  DatasetUpdate,
  PlannedDatasetUpdates,
  PublishedSourceRelease,
  ScheduledUpdateSummary,
  TargetVersionLookup,
  UpdateProcessingResult,
} from './updateTypes.ts'
import { fetchTargetVersions, requirePublishedTargetVersion } from './updateTargets.ts'
import { UpdateRow, clearResolvedPrompt, logPhaseHeading } from './updateDisplay.ts'
import { processUpdate } from './updateProcessing.ts'

export async function runUpdateCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  validateUpdateArguments(args, printUsage)
  const requested = readDatasetOption(args)
  const releaseNotesUrl =
    typeof args.options['release-notes-url'] === 'string'
      ? args.options['release-notes-url']
      : undefined
  if (releaseNotesUrl && requested?.size !== 1) {
    throw new Error('--release-notes-url requires exactly one --dataset CODE.')
  }
  const releaseNotesDatasetCode =
    releaseNotesUrl && requested?.size === 1 ? [...requested][0] : undefined

  const datasets = (await loadDatasetFixtures()).map(dataset => ({
    ...dataset,
    releases: dataset.releases
      ? selectInitialisationVersions(
          dataset.releases,
          release => release.sourceVersion ?? '',
        )
      : dataset.releases,
  }))
  const requestedDatasets = requested
    ? datasets.filter(dataset => requested.has(dataset.code))
    : datasets
  if (requestedDatasets.length === 0) throw new Error('No matching datasets found.')

  const selectedFamily = await resolveApiFamilySelection(args, datasets, requested)
  const includeDependencies = args.options['with-dependencies'] === true
  const deferStatsReleaseSet = args.options['defer-stats-release-set'] === true
  const includeGeography = args.options['include-geography'] === true
  const selectedFamilyDatasets =
    selectedFamily === 'all'
      ? requestedDatasets
      : requestedDatasets.filter(dataset => dataset.theme === selectedFamily)
  if (
    deferStatsReleaseSet &&
    !selectedFamilyDatasets.every(dataset => dataset.theme === 'stats')
  ) {
    throw new Error('--defer-stats-release-set requires a Stats-only selection.')
  }
  if (
    includeGeography &&
    !selectedFamilyDatasets.every(dataset => dataset.theme === 'stats')
  ) {
    throw new Error('--include-geography requires a Stats-only selection.')
  }
  const selectedDatasets = selectUpdateDatasets(
    datasets,
    selectedFamilyDatasets,
    includeDependencies ? await loadCurrentCompositionIngestDependencies() : [],
    includeDependencies,
  )

  const nestedInitialisation = Boolean(process.env.SAANSEOI_INIT_COMMAND)
  if (!nestedInitialisation) {
    log.message('', { spacing: 0 })
    log.message(
      `${colorize('DATASET UPDATES', 34)} ${dim('·')} ${colorize(
        updateSelectionLabel({ requested, selectedFamily }),
        33,
      )} ${dim('·')} ${colorize(describeTarget(target).label, 34)}`,
      { spacing: 0 },
    )
    log.message('', { spacing: 0 })
  }

  const state = await readUpdateState()
  const forceDownload = args.options['force-download'] === true
  const shouldDownload = args.options.download === true || forceDownload
  const skipUpload = args.options['no-upload'] === true
  const skipPrompts = args.options.yes === true
  const forceCheck = args.options['check-now'] === true || forceDownload
  const forceUpload = args.options['force-upload'] === true
  const errors: string[] = []
  const added = new Map<string, PublishedSourceRelease>()
  const planned: PlannedDatasetUpdates[] = []

  for (const dataset of selectedDatasets) {
    let targetVersionLookup: TargetVersionLookup
    try {
      targetVersionLookup = {
        status: 'available',
        versions: await fetchTargetVersions(
          target,
          dataset,
          includeGeography || !deferStatsReleaseSet,
        ),
      }
    } catch {
      targetVersionLookup = { status: 'unknown' }
    }

    if (targetVersionLookup.status === 'unknown') {
      if (isMinimalInitialisation()) {
        throw new Error(
          `Cannot initialise ${dataset.code}: target release report unavailable.`,
        )
      }
      const row = new UpdateRow(dataset)
      row.skipped('target release report unavailable')
      continue
    }

    const targetVersions = targetVersionLookup.versions

    const duePhases = getDueUpdatePhases(dataset, state[dataset.code], {
      force: forceCheck,
      hasTargetRelease: [...targetVersions.values()].some(version => version !== null),
    })
    if (duePhases.length === 0) {
      const row = new UpdateRow(dataset)
      row.skipped('check not due')
      continue
    }

    const discoveredUpdates = await lookupDatasetUpdates(
      dataset,
      state[dataset.code],
      targetVersions,
      // Phase scheduling has already decided that this source is due. The
      // previous single-cadence throttle must not suppress that decision.
      true,
    )
    const selectedVersions = new Set(
      selectInitialisationVersions(
        discoveredUpdates.filter(update => update.version),
        update => update.version!,
      ),
    )
    const updates = discoveredUpdates.filter(
      update => !update.version || selectedVersions.has(update),
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
        updates:
          nestedInitialisation &&
          plan.updates.every(
            update => update.status === 'current' || update.status === 'skipped',
          )
            ? phase === 'archives'
              ? plan.updates
              : []
            : plan.updates.filter(update => updateBelongsToPhase(update, plan, phase)),
      }))
      .filter(plan => plan.updates.length > 0)

    if (phasePlans.length === 0) {
      continue
    }
    if (!nestedInitialisation) logPhaseHeading(phase)
    for (const plan of phasePlans) {
      await processPlannedUpdates(plan, {
        added,
        errors,
        deferStatsReleaseSet,
        includeGeography,
        forceDownload,
        forceUpload,
        printUsage,
        releaseNotesDatasetCode,
        releaseNotesUrl,
        shouldDownload,
        skipPrompts,
        skipUpload,
        state,
        target,
      })
    }
  }

  await writeUpdateState(state)
  if (added.size > 0) {
    log.message(['PUBLISHED SOURCE RELEASES', ''].join('\n'), {
      secondarySymbol: dim('│'),
      spacing: 1,
      symbol: dim('├'),
      withGuide: true,
    })
    for (const release of added.values()) {
      log.success(formatPublishedSourceRelease(release), {
        spacing: 0,
        withGuide: true,
      })
    }
  }
  if (errors.length > 0) {
    log.error(formatUpdateErrorSummary(errors, datasets), {
      spacing: 1,
    })
  }
  await writeScheduledUpdateSummary({
    added: [...added.values()].map(({ dataset, version }) => ({
      datasetCode: dataset.code,
      version,
    })),
    errors,
  })
  if (!nestedInitialisation) outro('Update check complete')
  if (errors.length > 0) process.exitCode = 1
}

export function validateUpdateArguments(args: ParsedArgs, printUsage: () => void) {
  const supportedOptions = new Set([
    'api-family',
    'check-now',
    'dataset',
    'defer-stats-release-set',
    'download',
    'force-download',
    'force-upload',
    'include-geography',
    'no-upload',
    'release-notes-url',
    'scope',
    'target',
    'with-dependencies',
    'yes',
  ])
  const invalidOptions = Object.keys(args.options).filter(
    option => !supportedOptions.has(option),
  )
  const booleanOptions = [
    'check-now',
    'defer-stats-release-set',
    'download',
    'force-download',
    'force-upload',
    'include-geography',
    'no-upload',
    'with-dependencies',
    'yes',
  ]
  const invalidBooleanOptions = booleanOptions.filter(
    option => args.options[option] !== undefined && args.options[option] !== true,
  )
  const releaseNotesUrlMissingValue = args.options['release-notes-url'] === true

  if (
    args.positionals.length === 0 &&
    invalidOptions.length === 0 &&
    invalidBooleanOptions.length === 0 &&
    !releaseNotesUrlMissingValue
  ) {
    return
  }

  printUsage()
  if (args.positionals.length > 0) {
    throw new Error('`update` accepts dataset selection through --dataset only.')
  }
  if (invalidOptions.includes('force')) {
    throw new Error(
      '`update` does not support --force. Use --check-now to ignore the scheduled delay, --force-download to fetch again, or --force-upload with --check-now to reprocess a staged release.',
    )
  }
  if (invalidOptions.length > 0) {
    throw new Error(
      `Unsupported update option(s): ${invalidOptions.map(option => `--${option}`).join(', ')}.`,
    )
  }
  if (releaseNotesUrlMissingValue) {
    throw new Error('--release-notes-url requires an absolute HTTP(S) URL.')
  }
  throw new Error(
    `Update flags do not take values: ${invalidBooleanOptions.map(option => `--${option}`).join(', ')}.`,
  )
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
    added: Map<string, PublishedSourceRelease>
    errors: string[]
    deferStatsReleaseSet: boolean
    includeGeography: boolean
    forceDownload: boolean
    forceUpload: boolean
    printUsage: () => void
    releaseNotesDatasetCode?: string
    releaseNotesUrl?: string
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
        forceUpload: options.forceUpload,
        deferStatsReleaseSet: options.deferStatsReleaseSet,
        includeGeography: options.includeGeography,
        printUsage: options.printUsage,
        releaseNotesUrl:
          options.releaseNotesDatasetCode === plan.dataset.code
            ? options.releaseNotesUrl
            : undefined,
        row,
        shouldDownload: options.shouldDownload,
        skipPrompts: options.skipPrompts,
        skipUpload: options.skipUpload,
        target: options.target,
        targetVersion: targetVersion ?? undefined,
        updateIndex,
        updateTotal: plan.updates.length,
      })
      if (result === 'review-required') {
        options.errors.push(
          `${plan.dataset.code}: metadata review required; run update interactively after investigating the change.`,
        )
      }
      if ((result === 'ingested' || result === 'uploaded') && update.version) {
        const publishedVersion = requirePublishedTargetVersion(
          update,
          await fetchTargetVersions(
            options.target,
            plan.dataset,
            options.includeGeography || !options.deferStatsReleaseSet,
          ),
        )
        plan.targetVersions.set(
          update.targetSourceKey ?? plan.dataset.code,
          publishedVersion,
        )
        recordPublishedSourceRelease(options.added, {
          dataset: plan.dataset,
          sourceKey,
          version: update.version,
        })
        // Native archive intake emits its own detailed upload plan. End the
        // dataset row with an explicit result as well, rather than leaving the
        // final summary to describe the target as it was before processing.
        row.finish(
          result === 'ingested' ? 'INGESTED' : 'UPLOADED',
          update.version,
          update.version,
        )
        renderedUpdates.add(update)
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
      update.message = message
      update.status = 'error'
      options.errors.push(`${plan.dataset.code}: ${message}`)
    }
  }

  const unrenderedUpdates = plan.updates.filter(update => !renderedUpdates.has(update))
  if (unrenderedUpdates.length > 0) {
    row.finishUpdates(unrenderedUpdates, plan.targetVersions)
  }
}

export function recordPublishedSourceRelease(
  releases: Map<string, PublishedSourceRelease>,
  release: PublishedSourceRelease,
) {
  releases.set(
    `${release.dataset.code}:${release.sourceKey}:${release.version}`,
    release,
  )
}

async function writeScheduledUpdateSummary(summary: ScheduledUpdateSummary) {
  const path = process.env.SAANSEOI_RUN_SUMMARY_PATH
  if (!path) return

  await writeFile(path, `${JSON.stringify(summary)}\n`, 'utf8')
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

export function updateSelectionLabel(input: {
  requested?: ReadonlySet<string>
  selectedFamily: string
}) {
  if (input.requested) {
    return input.requested.size === 1 ? 'SELECTED DATASET' : 'SELECTED DATASETS'
  }
  return input.selectedFamily === 'all' ? 'ALL' : familyLabel(input.selectedFamily)
}

/** A requested scope is exact unless the operator explicitly asks for providers. */
export function selectUpdateDatasets(
  allDatasets: readonly DatasetFixture[],
  selectedDatasets: readonly DatasetFixture[],
  dependencies: readonly CompositionIngestDependency[],
  includeDependencies: boolean,
) {
  return includeDependencies
    ? orderDatasetsByCompositionDependencies(
        allDatasets,
        selectedDatasets,
        dependencies,
      )
    : [...selectedDatasets]
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

export type { ScheduledUpdateSummary } from './updateTypes.ts'

export {
  formatPublishedSourceRelease,
  datasetLabel,
  formatLandsdIngestPrompt,
  wrapUpdateMessage,
  formatDatasetPromptLabel,
  formatCheckLine,
  formatUpdateProgressLine,
  formatIngestProgressLine,
  formatDownloadProgressLine,
  formatDownloadCompleteLine,
  formatDatasetCheckLine,
} from './updateFormatting.ts'

export {
  requirePublishedTargetVersion,
  targetVersionsFromReport,
} from './updateTargets.ts'

export {
  shouldIngestUpdate,
  shouldDownloadUpdate,
  resolveMetadataReview,
} from './updateProcessing.ts'
