import { normaliseBaseUrl } from '@repo/core'

import type { UploadTarget } from '../cli/options.ts'
import { getAuthHeaders, resolveHarbourApiUrl } from './api.ts'

export type ReportRowCount = {
  kind: 'history' | 'source'
  label: string
  rowCount: number
  tableName: string
}

export type ProcessingRunReportRow = {
  datasetCode: string
  error: unknown
  finishedAt: string | null
  phase: string
  releaseCode: string
  resourceReleaseId: string
  runId: string
  cohortKey: string | null
  source: string
  startedAt: string
  results: unknown
  status: string
  resourceType: string
}

export type StatReportRow = {
  createdAt: string
  datasetCode: string
  category: string
  dimension: string | null
  dimensionValue: string | null
  id: string
  measure: string
  unit: string
  releaseCode: string
  resourceReleaseId: string
  source: string
  resourceType: string
  updatedAt: string
  value: number
}

export type ProcessingActionReportRow = {
  action: string
  affectedRecordCount: number
  createdAt: string
  datasetCode: string
  evidence: unknown
  id: string
  mode: 'automatic' | 'manual'
  releaseCode: string
  resourceReleaseId: string
  source: string
  summary: string
  resourceType: string
  updatedAt: string
}

export type ReleaseReportRow = {
  hasStatisticsSnapshot?: boolean
  createdAt: string
  datasetCode: string
  datasetId: string
  ingestedAt: string | null
  notes: string | null
  originalFileName: string | null
  publicationDate: string | null
  rawObjectKey: string | null
  releaseCode: string
  resourceReleaseId: string
  revocationReason: string | null
  revokedAt: string | null
  rowCounts: ReportRowCount[]
  cohortKey: string | null
  source: string
  sourceVersion: string
  status: string
  supersededByResourceReleaseId: string | null
  resourceType: string
  updatedAt: string
}

type ProcessingRunReportResponse = {
  rows: ProcessingRunReportRow[]
}

type StatsReportResponse = {
  rows: StatReportRow[]
}

type ProcessingActionReportResponse = {
  rows: ProcessingActionReportRow[]
}

type ReleaseReportResponse = {
  rows: ReleaseReportRow[]
}

const REPORT_READ_RETRY_LIMIT = 3
const REPORT_READ_RETRY_DELAY_MS = 250

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

async function fetchReport<T>(url: URL, action: string) {
  let lastError: unknown

  for (let attempt = 0; attempt <= REPORT_READ_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(url.toString(), {
        headers: getAuthHeaders(),
        method: 'GET',
      })
      return await parseJsonResponse<T>(response, action)
    } catch (error) {
      lastError = error
      if (attempt === REPORT_READ_RETRY_LIMIT || !isRetryableReportReadError(error)) {
        throw error
      }

      await new Promise(resolve =>
        setTimeout(resolve, REPORT_READ_RETRY_DELAY_MS * 2 ** attempt),
      )
    }
  }

  throw lastError
}

function isRetryableReportReadError(error: unknown) {
  return (
    error instanceof Error &&
    /database is locked|sqlite_busy|internal error/i.test(error.message)
  )
}

export async function fetchProcessingRunReport(
  target: UploadTarget,
  options?: {
    limit?: number
    releaseCode?: string
    resourceReleaseId?: string
    source?: string
    resourceType?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)
  const url = new URL(`${normaliseBaseUrl(apiBaseUrl)}/v1/reports/ingestion`)

  if (options?.limit != null) {
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  }

  if (options?.releaseCode) {
    url.searchParams.set('releaseCode', options.releaseCode)
  }

  if (options?.resourceReleaseId) {
    url.searchParams.set('resourceReleaseId', options.resourceReleaseId)
  }

  if (options?.source) {
    url.searchParams.set('source', options.source)
  }

  if (options?.resourceType) {
    url.searchParams.set('resourceType', options.resourceType)
  }

  return fetchReport<ProcessingRunReportResponse>(url, 'Harbour ingestion report')
}

export async function fetchStatsReport(
  target: UploadTarget,
  options?: {
    limit?: number
    resourceReleaseId?: string
    source?: string
    resourceType?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)
  const url = new URL(`${normaliseBaseUrl(apiBaseUrl)}/v1/reports/stats`)

  if (options?.limit != null) {
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  }

  if (options?.resourceReleaseId) {
    url.searchParams.set('resourceReleaseId', options.resourceReleaseId)
  }

  if (options?.source) {
    url.searchParams.set('source', options.source)
  }

  if (options?.resourceType) {
    url.searchParams.set('resourceType', options.resourceType)
  }

  return fetchReport<StatsReportResponse>(url, 'Harbour stats report')
}

export async function fetchProcessingActionReport(
  target: UploadTarget,
  options?: {
    limit?: number
    releaseCode?: string
    resourceReleaseId?: string
    source?: string
    resourceType?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)
  const url = new URL(`${normaliseBaseUrl(apiBaseUrl)}/v1/reports/processing-actions`)

  if (options?.limit != null)
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  if (options?.releaseCode) url.searchParams.set('releaseCode', options.releaseCode)
  if (options?.resourceReleaseId)
    url.searchParams.set('resourceReleaseId', options.resourceReleaseId)
  if (options?.source) url.searchParams.set('source', options.source)
  if (options?.resourceType) url.searchParams.set('resourceType', options.resourceType)

  return fetchReport<ProcessingActionReportResponse>(
    url,
    'Harbour processing-actions report',
  )
}

export async function fetchReleaseReport(
  target: UploadTarget,
  options?: {
    datasetCode?: string
    limit?: number
    releaseCode?: string
    resourceReleaseId?: string
    source?: string
    resourceType?: string
  },
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)
  const url = new URL(`${normaliseBaseUrl(apiBaseUrl)}/v1/reports/releases`)

  if (options?.datasetCode) {
    url.searchParams.set('datasetCode', options.datasetCode)
  }

  if (options?.limit != null) {
    url.searchParams.set('limit', String(parseLimit(options.limit)))
  }

  if (options?.releaseCode) {
    url.searchParams.set('releaseCode', options.releaseCode)
  }

  if (options?.resourceReleaseId) {
    url.searchParams.set('resourceReleaseId', options.resourceReleaseId)
  }

  if (options?.source) {
    url.searchParams.set('source', options.source)
  }

  if (options?.resourceType) {
    url.searchParams.set('resourceType', options.resourceType)
  }

  return fetchReport<ReleaseReportResponse>(url, 'Harbour releases report')
}
