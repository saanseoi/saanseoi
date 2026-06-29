import type { prepareUpload } from '@repo/core/upload-local'

import type {
  IngestRunReportRow,
  ReleaseReportRow,
  StatReportRow,
} from './reporting.ts'
import type { UploadTarget } from './options.ts'
import { resolveHarbourBaseUrl } from './api.ts'

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

function cyanText(label: string) {
  return `\u001B[36m${label}\u001B[39m`
}

function deEmphasize(text: string) {
  return `\u001B[90m${text}\u001B[39m`
}

function redText(text: string) {
  return `\u001B[31m${text}\u001B[39m`
}

/**
 * Format a labelled CLI output field with optional provenance metadata.
 */
export function formatField(
  label: string,
  value: string | number,
  inferredFrom?: string,
) {
  const suffix = inferredFrom ? ` ${deEmphasize(`(${inferredFrom})`)}` : ''
  return `${cyanText(label)}: ${value}${suffix}`
}

function describeInferredFrom(
  field: 'regionCode' | 'snapshotMonth' | 'source' | 'sourceVersion' | 'type',
  inferredFrom: 'flag' | 'filename' | 'parquet' | 'path' | 'snapshotMonth' | undefined,
) {
  switch (field) {
    case 'source':
      switch (inferredFrom) {
        case 'flag':
          return 'flag --source'
        case 'path':
          return 'path'
        case 'filename':
          return 'filename'
        default:
          return undefined
      }
    case 'regionCode':
    case 'type':
      switch (inferredFrom) {
        case 'flag':
          return 'flag'
        case 'path':
          return 'path'
        case 'parquet':
          return 'parquet'
        default:
          return undefined
      }
    case 'snapshotMonth':
      switch (inferredFrom) {
        case 'flag':
          return 'flag --month'
        case 'path':
          return 'path'
        case 'filename':
          return 'filename'
        default:
          return undefined
      }
    case 'sourceVersion':
      switch (inferredFrom) {
        case 'flag':
          return 'flag --source-version'
        case 'path':
          return 'path'
        case 'filename':
          return 'filename'
        case 'snapshotMonth':
          return 'snapshotMonth fallback'
        default:
          return undefined
      }
  }
}

/**
 * Convert an upload target into user-facing labels for prompts and logs.
 */
export function describeTarget(target: UploadTarget) {
  if (!target.remote) {
    switch (target.environment) {
      case 'dev':
        return {
          label: 'local-dev',
          destination: 'local Wrangler dev / Miniflare environment',
        }
      case 'preview':
      case 'production':
        throw new Error(
          `Invalid local upload environment: ${target.environment}. Local uploads must use target=local.`,
        )
    }
  }

  switch (target.environment) {
    case 'dev':
      return {
        label: 'cf-dev',
        destination: 'Cloudflare dev environment',
      }
    case 'preview':
      return {
        label: 'cf-preview',
        destination: 'Cloudflare preview environment',
      }
    case 'production':
      return {
        label: 'production',
        destination: 'Cloudflare production environment',
      }
  }
}

/**
 * Render the prepared upload plan as formatted CLI output lines.
 */
export function formatPlan(result: UploadPreviewResult) {
  return [
    formatField('datasetCode', result.plan.datasetCode),
    formatField('releaseCode', result.plan.releaseCode),
    formatField(
      'source',
      result.plan.source,
      describeInferredFrom('source', result.plan.inferredFrom.source),
    ),
    formatField(
      'sourceVersion',
      result.plan.sourceVersion,
      describeInferredFrom('sourceVersion', result.plan.inferredFrom.sourceVersion),
    ),
    formatField(
      'region',
      result.plan.regionCode,
      describeInferredFrom('regionCode', result.plan.inferredFrom.regionCode),
    ),
    formatField(
      'snapshotMonth',
      result.plan.snapshotMonth,
      describeInferredFrom('snapshotMonth', result.plan.inferredFrom.snapshotMonth),
    ),
    formatField(
      'type',
      result.plan.type,
      describeInferredFrom('type', result.plan.inferredFrom.type),
    ),
    formatField('rows', result.plan.rowCount),
  ]
}

/**
 * Render the top-level upload summary shown before confirmation.
 */
export function formatSummary(result: UploadPreviewResult, target: UploadTarget) {
  const targetMode = target.remote ? 'cf' : 'local'
  const harbourBaseUrl = resolveHarbourBaseUrl(target)

  return [
    formatField('target', `${target.environment} (${redText(targetMode)})`),
    ...formatPlan(result),
    formatField('harbourApi', harbourBaseUrl),
  ]
}

/**
 * Describe the API dispatch step and the expected downstream behaviour.
 */
export function explainDispatch(target: UploadTarget) {
  const targetDetails = describeTarget(target)
  return [
    `CLI target: ${targetDetails.label}`,
    `Destination: ${targetDetails.destination}`,
  ].join('\n')
}

type TableCell = string | number

export function filterIngestionRows(rows: IngestRunReportRow[]) {
  const groupedRows = new Map<string, IngestRunReportRow[]>()
  const orderedReleaseCodes: string[] = []

  for (const row of rows) {
    const existing = groupedRows.get(row.releaseCode)

    if (existing) {
      existing.push(row)
      continue
    }

    groupedRows.set(row.releaseCode, [row])
    orderedReleaseCodes.push(row.releaseCode)
  }

  const ongoingGroups = orderedReleaseCodes.filter(releaseCode =>
    (groupedRows.get(releaseCode) ?? []).some(
      row => row.status === 'queued' || row.status === 'running',
    ),
  )

  const latestFinishedRelease = orderedReleaseCodes.find(releaseCode =>
    (groupedRows.get(releaseCode) ?? []).every(
      row => row.status !== 'queued' && row.status !== 'running',
    ),
  )

  const selectedReleaseCodes = new Set([
    ...ongoingGroups,
    ...(latestFinishedRelease ? [latestFinishedRelease] : []),
  ])

  return orderedReleaseCodes.flatMap(releaseCode =>
    selectedReleaseCodes.has(releaseCode) ? (groupedRows.get(releaseCode) ?? []) : [],
  )
}

export function formatIngestionReportTable(
  rows: IngestRunReportRow[],
  options?: {
    applyDefaultReleaseFilter?: boolean
  },
) {
  const filteredRows =
    options?.applyDefaultReleaseFilter === false ? rows : filterIngestionRows(rows)

  if (filteredRows.length === 0) {
    return 'No ingest runs found.'
  }

  return formatTable(
    ['release', 'phase', 'status', 'startedAt', 'duration', 'stat', 'value', 'error'],
    expandIngestRunRows(filteredRows),
  )
}

export function formatStatsReportTable(rows: StatReportRow[]) {
  if (rows.length === 0) {
    return 'No stats found.'
  }

  const groupedRows = new Map<string, StatReportRow[]>()
  const orderedReleaseCodes: string[] = []

  for (const row of rows) {
    const existing = groupedRows.get(row.releaseCode)

    if (existing) {
      existing.push(row)
      continue
    }

    groupedRows.set(row.releaseCode, [row])
    orderedReleaseCodes.push(row.releaseCode)
  }

  return orderedReleaseCodes
    .map(releaseCode => {
      const releaseRows = groupedRows.get(releaseCode) ?? []
      const sections = ['completeness', 'churn', 'quality']
        .map(metric => {
          const metricRows = releaseRows.filter(row => row.metric === metric)

          if (metricRows.length === 0) {
            return null
          }

          const pivot = pivotStatsRows(metricRows)
          return [metric, formatTable(pivot.headers, pivot.rows)].join('\n')
        })
        .filter((section): section is string => section !== null)

      return [`release: ${releaseCode}`, ...sections].join('\n\n')
    })
    .join('\n\n')
}

export function formatReleaseReportTable(rows: ReleaseReportRow[]) {
  if (rows.length === 0) {
    return 'No releases found.'
  }

  const countHeaders = uniqueHeaders(
    rows.flatMap(row => row.rowCounts.map(rowCount => `${rowCount.label}Count`)),
  )

  return formatTable(
    ['release', 'ingestedAt', 'status', ...countHeaders],
    rows.map(row => [
      row.releaseCode,
      formatDateTime(row.ingestedAt ?? row.createdAt),
      row.status,
      ...countHeaders.map(header => {
        const rowCount = row.rowCounts.find(entry => `${entry.label}Count` === header)
        return rowCount ? formatNumber(rowCount.rowCount) : '-'
      }),
    ]),
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 3,
  }).format(value)
}

function summarizeJsonCell(value: unknown) {
  if (value == null) {
    return '-'
  }

  const text =
    typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 0).replace(/\s+/g, ' ')

  return text.length > 48 ? `${text.slice(0, 45)}...` : text
}

function uniqueHeaders(values: string[]) {
  return [...new Set(values)]
}

function expandIngestRunRows(rows: IngestRunReportRow[]): TableCell[][] {
  return rows.flatMap<TableCell[]>(row => {
    const statsEntries = asRecordEntries(row.stats).filter(
      ([statKey]) => statKey !== 'durationMs',
    )
    const statRows: Array<[string, string]> =
      statsEntries.length > 0 ? statsEntries : [['-', '-']]
    const renderedError = summarizeJsonCell(row.error)

    return statRows.map(([statKey, statValue], index) => [
      index === 0 ? row.releaseCode : '',
      index === 0 ? row.phase : '',
      index === 0 ? row.status : '',
      index === 0 ? formatDateTime(row.startedAt) : '',
      index === 0 ? formatDuration(row.startedAt, row.finishedAt) : '',
      statKey,
      statValue,
      index === 0 ? renderedError : '',
    ])
  })
}

function asRecordEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.entries(value).map(([key, entryValue]) => [
    key,
    summarizeJsonCell(entryValue),
  ])
}

function pivotStatsRows(rows: StatReportRow[]) {
  const countHeaders = uniqueHeaders(
    rows.filter(row => row.metricUnit === 'count').map(row => row.dimension),
  )
  const percentageHeaders = uniqueHeaders(
    rows.filter(row => row.metricUnit === 'percentage').map(row => row.dimension),
  )
  const dimensionHeaders = [...countHeaders, ...percentageHeaders]
  const grouped = new Map<string, Map<string, string>>()

  for (const row of rows) {
    const rowLabel = formatStatsRowLabel(row)
    const current = grouped.get(rowLabel) ?? new Map<string, string>()
    current.set(row.dimension, formatNumber(row.value))
    grouped.set(rowLabel, current)
  }

  return {
    headers: ['group', ...dimensionHeaders],
    rows: [...grouped.entries()].map(([label, values]) => [
      label,
      ...dimensionHeaders.map(header => values.get(header) ?? '-'),
    ]),
  }
}

function formatStatsRowLabel(row: StatReportRow) {
  return row.groupBy ? `${row.groupBy}=${row.groupValue ?? '(null)'}` : 'all'
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) {
    return 'ongoing'
  }

  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(finishedAt).getTime()

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return '-'
  }

  const diffMs = endMs - startMs
  const units = [
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ] as const

  for (const [label, unitMs] of units) {
    if (diffMs >= unitMs) {
      const rounded = Math.round(diffMs / unitMs)
      return `${rounded} ${label}${rounded === 1 ? '' : 's'}`
    }
  }

  return '0 seconds'
}

function formatTable(headers: string[], rows: TableCell[][]) {
  const widths = headers.map((header, columnIndex) =>
    Math.max(header.length, ...rows.map(row => String(row[columnIndex] ?? '').length)),
  )
  const divider = widths.map(width => '-'.repeat(width)).join('  ')

  return [
    formatTableRow(headers, widths),
    divider,
    ...rows.map(row => formatTableRow(row, widths)),
  ].join('\n')
}

function formatTableRow(cells: TableCell[], widths: number[]) {
  return cells
    .map((cell, columnIndex) => String(cell ?? '').padEnd(widths[columnIndex] ?? 0))
    .join('  ')
}
