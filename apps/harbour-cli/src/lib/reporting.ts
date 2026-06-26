import type { ParsedArgs, UploadTarget } from './options.ts'
import { resolveHarbourApiUrl } from './upload.ts'

export type ReportRowCount = {
  kind: 'history' | 'source'
  label: string
  rowCount: number
  tableName: string
}

export type IngestRunReportRow = {
  datasetCode: string
  error: unknown
  finishedAt: string | null
  phase: string
  releaseCode: string
  releaseId: string
  runId: string
  snapshotMonth: string | null
  source: string
  startedAt: string
  stats: unknown
  status: string
  type: string
}

export type StatReportRow = {
  createdAt: string
  datasetCode: string
  dimension: string
  groupBy: string | null
  groupValue: string | null
  id: string
  metric: string
  metricUnit: string
  releaseCode: string
  releaseId: string
  source: string
  type: string
  updatedAt: string
  value: number
}

export type ReleaseReportRow = {
  createdAt: string
  datasetCode: string
  datasetId: string
  ingestedAt: string | null
  originalFileName: string | null
  publicationDate: string | null
  rawObjectKey: string | null
  releaseCode: string
  releaseId: string
  revocationReason: string | null
  revokedAt: string | null
  rowCounts: ReportRowCount[]
  snapshotMonth: string | null
  source: string
  sourceVersion: string
  status: string
  supersededByReleaseId: string | null
  type: string
  updatedAt: string
}

type IngestRunReportResponse = {
  rows: IngestRunReportRow[]
}

type StatsReportResponse = {
  rows: StatReportRow[]
}

type ReleaseReportResponse = {
  rows: ReleaseReportRow[]
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function getAuthHeaders() {
  const apiKey = process.env.HARBOUR_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('Missing HARBOUR_API_KEY for authenticated Harbour API requests.')
  }

  return {
    'x-api-key': apiKey,
  }
}

function parseLimit(limit: number | undefined) {
  if (limit == null) {
    return 10
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('`--limit` must be an integer between 1 and 100.')
  }

  return limit
}

async function parseJsonResponse<T>(response: Response, action: string) {
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `${action} failed with status ${response.status}.`

    throw new Error(message)
  }

  return payload as T
}

export async function fetchIngestRunReport(
  args: ParsedArgs,
  target: UploadTarget,
  options?: {
    limit?: number
    source?: string
    type?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(args, target)
  const url = new URL(`${normalizeBaseUrl(apiBaseUrl)}/v1/reports/ingestion`)

  if (options?.limit != null) {
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  }

  if (options?.source) {
    url.searchParams.set('source', options.source)
  }

  if (options?.type) {
    url.searchParams.set('type', options.type)
  }

  const response = await fetch(url.toString(), {
    headers: getAuthHeaders(),
    method: 'GET',
  })

  return parseJsonResponse<IngestRunReportResponse>(
    response,
    'Harbour ingestion report',
  )
}

export async function fetchStatsReport(
  args: ParsedArgs,
  target: UploadTarget,
  options?: {
    limit?: number
    releaseId?: string
    source?: string
    type?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(args, target)
  const url = new URL(`${normalizeBaseUrl(apiBaseUrl)}/v1/reports/stats`)

  if (options?.limit != null) {
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  }

  if (options?.releaseId) {
    url.searchParams.set('releaseId', options.releaseId)
  }

  if (options?.source) {
    url.searchParams.set('source', options.source)
  }

  if (options?.type) {
    url.searchParams.set('type', options.type)
  }

  const response = await fetch(url.toString(), {
    headers: getAuthHeaders(),
    method: 'GET',
  })

  return parseJsonResponse<StatsReportResponse>(response, 'Harbour stats report')
}

export async function fetchReleaseReport(
  args: ParsedArgs,
  target: UploadTarget,
  options?: {
    limit?: number
    source?: string
    type?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(args, target)
  const url = new URL(`${normalizeBaseUrl(apiBaseUrl)}/v1/reports/releases`)

  if (options?.limit != null) {
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  }

  if (options?.source) {
    url.searchParams.set('source', options.source)
  }

  if (options?.type) {
    url.searchParams.set('type', options.type)
  }

  const response = await fetch(url.toString(), {
    headers: getAuthHeaders(),
    method: 'GET',
  })

  return parseJsonResponse<ReleaseReportResponse>(response, 'Harbour releases report')
}
