import { describeTarget } from '../cli/display.ts'
import type { UploadTarget } from '../cli/options.ts'
import type {
  DatasetFixture,
  DatasetIngestProgress,
  loadDatasetFixtures,
} from '../sources/sourceUpdates.ts'
import type { DatasetUpdate, PublishedSourceRelease } from './updateTypes.ts'

export const UPDATE_LINE_WIDTH = 120

const CLACK_STATUS_PREFIX_WIDTH = 3

const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

function updateLineWidth() {
  const columns =
    process.stdout.columns ?? Number(process.env.SAANSEOI_TERMINAL_COLUMNS)
  if (!columns || columns <= CLACK_STATUS_PREFIX_WIDTH) return UPDATE_LINE_WIDTH

  // Clack adds its own three-column status prefix (for example, `◇  `).
  // Keep the message itself within the remaining terminal width.
  return columns - CLACK_STATUS_PREFIX_WIDTH
}

function supportsColour() {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === '0')
    return false
  return Boolean(
    process.stdout.isTTY ||
      process.env.SAANSEOI_TERMINAL_INTERACTIVE === '1' ||
      process.env.FORCE_COLOR,
  )
}

export function formatPublishedSourceRelease(release: PublishedSourceRelease) {
  return `${formatDatasetPromptLabel(release.dataset)}  v${ownVersion(release.version)}`
}

function updateStatusLabel(update: DatasetUpdate, targetVersion?: string | null) {
  if (update.status === 'error') return 'ERROR'
  if (update.status === 'manual') return 'MANUAL'
  if (update.status === 'skipped') return 'SKIPPED'
  if (update.status === 'review') return 'REVIEW'
  if (update.status === 'new' && targetVersion === null) return 'MISSING'
  return update.status === 'new' ? 'NEW' : 'no updates'
}

export function familyLabel(value: string) {
  return value.toUpperCase()
}

export function colorFamilyOption(label: string, value: string) {
  if (!supportsColour()) return label
  return colorFamilyLabel(label, value)
}

function colorFamilyLabel(label: string, value: string) {
  if (!supportsColour()) return label
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

export function colorize(value: string, color: number) {
  if (!supportsColour()) return value
  return `\u001b[${color}m${value}\u001b[39m`
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

export function wrapUpdateMessage(
  message: string,
  detail?: string,
  width = UPDATE_LINE_WIDTH - 3,
) {
  return wrapText(detail ? `${message}: ${detail}` : message, width)
}

export function formatUpdateErrorSummary(
  errors: readonly string[],
  datasets: readonly DatasetFixture[],
) {
  const width = updateLineWidth()
  const lines = [`Update errors (${errors.length})`]
  for (const error of errors) {
    const dataset = datasets.find(item => error.startsWith(`${item.code}: `))
    const message = dataset ? error.slice(dataset.code.length + 2) : error
    lines.push('')
    if (dataset) {
      lines.push(
        width >= 94
          ? formatUpdateGridRow(dataset, 'ERROR')
          : formatDatasetPromptLabel(dataset),
      )
    }
    lines.push(...wrapText(message, Math.max(1, width - 4)).map(line => `    ${line}`))
  }
  return lines.join('\n')
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

/** A skip is one physical terminal line, including its reason. */
export function formatSkippedDatasetLine(dataset: DatasetFixture, reason: string) {
  return formatUpdateGridRow(
    dataset,
    `SKIPPED: ${reason === 'target release report unavailable' ? 'report unavailable' : reason}`,
  )
}

function gridCell(value: string, width: number) {
  const plain = value.replace(ANSI_SGR, '').replace(/\s+/g, ' ').trim()
  return (plain.length > width ? `${plain.slice(0, width - 1)}…` : plain).padEnd(width)
}

/** Fixed columns shared by checks, skips, downloads and live progress. */
export function formatUpdateGridRow(
  dataset: DatasetFixture,
  status: string,
  version?: string,
  targetVersion?: string | null,
) {
  const parts = datasetLabelParts(dataset)
  const width = updateLineWidth()
  const publisherWidth = 9
  const resourceWidth = 16
  const statusWidth = 24
  const versionsWidth = 29
  const initColumnWidth = Number(process.env.SAANSEOI_INIT_RELEASE_COLUMN_WIDTH)
  const datasetWidth = Math.max(
    8,
    initColumnWidth > 0
      ? initColumnWidth - publisherWidth - resourceWidth - 4
      : width - publisherWidth - resourceWidth - statusWidth - versionsWidth - 8,
  )
  const versions = version
    ? `v${ownVersion(version)}${targetVersion && releasesDiffer(version, targetVersion) ? ` ← v${ownVersion(targetVersion)}` : ''}`
    : targetVersion
      ? `v${ownVersion(targetVersion)}`
      : '—'
  return [
    colorize(gridCell(parts.publisher, publisherWidth), 36),
    colorize(
      gridCell(
        parts.type.replace('Statistic + DivisionArea', 'Stat + DivArea'),
        resourceWidth,
      ),
      35,
    ),
    colorize(gridCell(parts.subtype || '—', datasetWidth), 33),
    colorize(
      gridCell(status, statusWidth),
      /ERROR|MISSING/.test(status)
        ? 31
        : /SKIPPED|no updates/.test(status)
          ? 90
          : /REVIEW|MANUAL/.test(status)
            ? 33
            : 32,
    ),
    colorize(
      gridCell(versions, versionsWidth).trimEnd(),
      version || targetVersion ? 32 : 90,
    ),
  ]
    .join('  ')
    .trimEnd()
}

export function formatUpdateProgressLine(dataset: DatasetFixture, stage: string) {
  const row = formatUpdateGridRow(dataset, '')
  return `${row.slice(0, row.lastIndexOf('—')).trimEnd()}  ${stage}`
}

export function formatIngestProgressLine(
  dataset: DatasetFixture,
  progress: DatasetIngestProgress,
  target: UploadTarget,
) {
  const position =
    progress.current !== undefined && progress.total !== undefined
      ? ` ${progress.current + 1}/${progress.total}`
      : ''
  const targetLabel = describeTarget(target).label
  return formatUpdateProgressLine(
    dataset,
    `ingesting${position} · ${targetLabel} · ${progress.message}`,
  )
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

export function formatDownloadCachedLine(
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
  return formatUpdateGridRow(dataset, release, version, targetVersion)
}

export function formatDatasetCheckLine(
  dataset: DatasetFixture,
  updates: DatasetUpdate[],
  targetVersions: ReadonlyMap<string, string | null>,
) {
  return orderUpdatesForDisplay(dataset, updates)
    .map(update => {
      const targetVersion = targetVersionForUpdate(update, dataset, targetVersions)
      return formatUpdateGridRow(
        dataset,
        updateStatusLabel(update, targetVersion),
        update.version,
        targetVersion,
      )
    })
    .join('\n')
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
  if (Object.hasOwn(update, 'targetVersion')) {
    if (update.targetVersion !== null) return update.targetVersion

    // `processPlannedUpdates` records a successful native archive ingest under
    // its archive source key. An update begins with a null target version, so
    // use that now-current map entry for its completion summary. Keep null when
    // the archive has not yet been processed.
    return targetVersions.get(update.sourceKey ?? dataset.code) ?? null
  }

  return (
    targetVersions.get(update.sourceKey ?? dataset.code) ??
    targetVersions.get(update.targetSourceKey ?? dataset.code)
  )
}

export function formatUpdateLine(
  dataset: DatasetFixture,
  version?: string,
  targetVersion?: string | null,
  status?: string,
  _width = UPDATE_LINE_WIDTH,
  _showEmptyVersionPlaceholder = true,
) {
  return formatUpdateGridRow(dataset, status ?? '', version, targetVersion)
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
      resourceTypes.length === 3 &&
      resourceTypes.includes('divisionStatistic') &&
      resourceTypes.includes('division') &&
      resourceTypes.includes('divisionArea')
        ? 'Stat + Div(Area)'
        : resourceTypes.length === 2 &&
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

export function dim(value: string) {
  return supportsColour() ? `\x1b[2m${value}\x1b[22m` : value
}
