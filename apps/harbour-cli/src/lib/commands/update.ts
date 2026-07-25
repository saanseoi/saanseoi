import { confirm, isCancel, log, outro, select, spinner } from '@clack/prompts'
import { stat } from 'node:fs/promises'
import { relative } from 'node:path'

import { describeTarget } from '../display.ts'
import { fetchReleaseReport } from '../reporting.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'
import { runUploadCommand } from './upload.ts'
import {
  loadPreparedSourceArchive,
  mirrorCsdiSourceArchive,
} from '../sourceArchives.ts'
import {
  type DatasetFixture,
  type UpdateStateEntry,
  loadDatasetFixtures,
  lookupDatasetUpdates,
  recordUpdateState,
  readUpdateState,
  shouldCheckDataset,
  writeUpdateState,
} from '../sourceUpdates.ts'

type DatasetUpdate = Awaited<ReturnType<typeof lookupDatasetUpdates>>[number]

const UPDATE_LINE_WIDTH = 120
const CLACK_STATUS_PREFIX_WIDTH = 3
const PUBLISHER_COLUMN_WIDTH = 10
const RESOURCE_TYPE_COLUMN_WIDTH = 16
const VERSION_COLUMN_WIDTH = 'vXXXX-XX-XX.XX'.length
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

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

  const datasets = await loadDatasetFixtures(requested)
  if (datasets.length === 0) throw new Error('No matching datasets found.')

  const selectedFamily = requested ? 'all' : await askApiFamily(datasets)
  const selectedDatasets =
    selectedFamily === 'all'
      ? datasets
      : datasets.filter(dataset => dataset.theme === selectedFamily)

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

  for (const dataset of selectedDatasets) {
    const row = new UpdateRow(dataset)
    const renderedUpdates = new Set<DatasetUpdate>()
    row.start('checking current')

    if (!shouldCheckDataset(dataset, state[dataset.code], forceCheck)) {
      row.finish('SKIPPED', undefined, null)
      continue
    }

    let targetVersions: Map<string, string | null>
    try {
      targetVersions = await fetchTargetVersions(target, dataset, state[dataset.code])
    } catch {
      if (!reportedTargetLookupFailure) {
        log.warn(
          'Target release report unavailable; comparing updates against local versions instead.',
        )
        reportedTargetLookupFailure = true
      }
      targetVersions = new Map()
    }

    row.message('checking latest')
    const updates = await lookupDatasetUpdates(
      dataset,
      state[dataset.code],
      targetVersions,
      forceCheck,
    )

    for (const [updateIndex, update] of updates.entries()) {
      const sourceKey = update.sourceKey ?? dataset.code
      const targetVersion = targetVersions.get(sourceKey)
      update.targetVersion = targetVersion
      const deferStateUntilProcessed = Boolean(
        update.archive || update.deferStateUntilProcessed,
      )
      if (!deferStateUntilProcessed) recordUpdateState(state, dataset.code, update)

      try {
        const result = await processUpdate(update, {
          printUsage,
          row,
          shouldDownload,
          forceDownload,
          skipPrompts,
          skipUpload,
          target,
          targetVersion: targetVersion ?? undefined,
          updateIndex,
          updateTotal: updates.length,
        })
        if (result === 'ingested' && update.version) {
          targetVersions.set(sourceKey, update.version)
        }
        if (
          deferStateUntilProcessed &&
          (result === 'ingested' ||
            result === 'mirrored' ||
            update.status === 'current')
        ) {
          recordUpdateState(state, dataset.code, update)
        }
        if (result === 'downloaded' || result === 'mirrored') {
          renderedUpdates.add(update)
        }
        if (update.status === 'error' && update.message) {
          errors.push(`${dataset.code}: ${update.message}`)
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Update cancelled.') {
          throw error
        }
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${dataset.code}: ${message}`)
      }
    }
    const unrenderedUpdates = updates.filter(update => !renderedUpdates.has(update))
    if (unrenderedUpdates.length > 0) {
      row.finishUpdates(unrenderedUpdates, targetVersions)
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

function updateStatusLabel(update: DatasetUpdate) {
  if (update.status === 'error') return 'ERROR'
  if (update.status === 'manual') return 'MANUAL'
  if (update.status === 'skipped') return 'SKIPPED'
  if (update.status === 'review') return 'REVIEW'
  return update.status === 'new' ? 'NEW' : 'no updates'
}

async function askApiFamily(datasets: DatasetFixture[]) {
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

async function fetchTargetVersions(
  target: UploadTarget,
  dataset: DatasetFixture,
  previous?: UpdateStateEntry,
) {
  const report = await fetchReleaseReport(target, {
    datasetCode: dataset.code,
    limit: 100,
  })
  const targetVersions = new Map<string, string | null>()
  const releases = dataset.releases?.length ? dataset.releases : [undefined]

  for (const [index, release] of releases.entries()) {
    const releaseSourceVersion = release?.sourceVersion
    const sourceKey = releaseSourceVersion ?? dataset.code
    const fallback =
      previous?.sourceChecks?.[sourceKey]?.version ??
      (sourceKey === dataset.code ? previous?.version : undefined)
    const matchingVersions = releaseSourceVersion
      ? report.rows
          .map(row => row.sourceVersion)
          .filter(version => versionMatchesSourceRelease(version, releaseSourceVersion))
      : report.rows.map(row => row.sourceVersion)
    const targetVersion = latestVersion(matchingVersions) ?? fallback ?? null

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

export function resolveTargetVersion(
  reportedVersion?: string,
  fallbackVersion?: string,
) {
  return reportedVersion ?? fallbackVersion
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
) {
  if (update.status === 'review') {
    await askToInvestigate(update)
    return 'reviewed' as const
  }
  if (update.status === 'error' || update.status === 'manual') return 'skipped' as const
  if (update.ingest) {
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
    index: options.updateIndex,
    row: options.row,
    total: options.updateTotal,
    targetVersion: options.targetVersion,
  })

  if (update.archive) {
    const prepared = await loadPreparedSourceArchive(path)
    await mirrorCsdiSourceArchive(options.target, update.archive, prepared)
    return 'mirrored' as const
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
  return 'downloaded' as const
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
    index: number
    row: UpdateRow
    targetVersion: string | undefined
    total: number
  },
) {
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
  const stageColumn = UPDATE_LINE_WIDTH - 5 - VERSION_COLUMN_WIDTH * 2
  const padding = Math.max(4, stageColumn - visibleWidth(label))
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
  const versions = formatVersionColumns(version, targetVersion)
  const label = formatDatasetCheckLabel(dataset)
  const padding = Math.max(
    2,
    UPDATE_LINE_WIDTH -
      visibleWidth(label) -
      visibleWidth(release) -
      visibleWidth(versions),
  )
  return `${label}${' '.repeat(padding)}${release}${versions}`
}

export function formatDatasetCheckLine(
  dataset: DatasetFixture,
  updates: DatasetUpdate[],
  targetVersions: ReadonlyMap<string, string | null>,
) {
  const label = formatDatasetCheckLabel(dataset)
  if (updates.length === 1) {
    const update = updates[0] as DatasetUpdate
    return formatUpdateLineWithLabel(
      label,
      update.version,
      targetVersionForUpdate(update, dataset, targetVersions),
      updateStatusLabel(update),
    )
  }

  const first = updates[0] as DatasetUpdate
  const releaseLines = updates.slice(1).map(update => {
    const continuation = `${dim('│')} ${' '.repeat(
      Math.max(0, visibleWidth(label) - 2),
    )}`
    return formatUpdateLineWithLabel(
      continuation,
      update.version,
      targetVersionForUpdate(update, dataset, targetVersions),
      updateStatusLabel(update),
      UPDATE_LINE_WIDTH + CLACK_STATUS_PREFIX_WIDTH,
    )
  })
  return [
    formatUpdateLineWithLabel(
      label,
      first.version,
      targetVersionForUpdate(first, dataset, targetVersions),
      updateStatusLabel(first),
    ),
    ...releaseLines,
  ].join('\n')
}

function targetVersionForUpdate(
  update: DatasetUpdate,
  dataset: DatasetFixture,
  targetVersions: ReadonlyMap<string, string | null>,
) {
  return Object.hasOwn(update, 'targetVersion')
    ? update.targetVersion
    : targetVersions.get(update.sourceKey ?? dataset.code)
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
  const showStatus = Boolean(status) && !releasesDiffer(version, targetVersion)
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

function formatDatasetCheckLabel(dataset: DatasetFixture) {
  const parts = datasetLabelParts(dataset)
  return `${colorize(parts.publisher.padEnd(PUBLISHER_COLUMN_WIDTH), 36)} ${dim(
    '∷',
  )} ${colorize(parts.type.padEnd(RESOURCE_TYPE_COLUMN_WIDTH), 35)}${
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
  const subtype = remainder.startsWith(`${typeSlug}-`)
    ? remainder.slice(typeSlug.length + 1)
    : remainder.endsWith(`-${typeSlug}`)
      ? remainder.slice(0, -(typeSlug.length + 1))
      : ''
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
      log.success(message, { spacing: 0, withGuide: false })
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
