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

const PUBLISHER_COLUMN_WIDTH = 10

const RESOURCE_TYPE_COLUMN_WIDTH = 16

const VERSION_COLUMN_WIDTH = 'vXXXX-XX-XX.XX'.length

const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

function updateLineWidth() {
  const columns = process.stdout.isTTY ? process.stdout.columns : undefined
  if (!columns || columns <= CLACK_STATUS_PREFIX_WIDTH) return UPDATE_LINE_WIDTH

  // Clack adds its own three-column status prefix (for example, `◇  `).
  // Keep the message itself within the remaining terminal width.
  return Math.min(UPDATE_LINE_WIDTH, columns - CLACK_STATUS_PREFIX_WIDTH)
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

export function colorize(value: string, color: number) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return value
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
  return process.stdout.isTTY && !process.env.NO_COLOR
    ? `\x1b[2m${value}\x1b[22m`
    : value
}
