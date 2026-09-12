import type { CountSpec, ReportFilters, ReportRowCount } from './reportingRows.ts'

export type IngestRunReportRow = {
  datasetCode: string
  error: unknown
  finishedAt: string | null
  phase: string
  releaseCode: string
  releaseId: string
  runId: string
  cohortKey: string | null
  source: string
  startedAt: string
  stats: unknown
  status: string
  resourceType: string
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
  releaseId: string
  source: string
  summary: string
  resourceType: string
  updatedAt: string
}

export type StatQueryRow = Omit<StatReportRow, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string
  updatedAt: Date | string
}

export type ProcessingActionQueryRow = Omit<
  ProcessingActionReportRow,
  'createdAt' | 'updatedAt'
> & {
  createdAt: Date | string
  updatedAt: Date | string
}

export type ListStatsOptions = ReportFilters & {
  releaseId?: string
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
  releaseId: string
  revocationReason: string | null
  revokedAt: string | null
  rowCounts: ReportRowCount[]
  cohortKey: string | null
  source: string
  sourceVersion: string
  status: string
  supersededByReleaseId: string | null
  resourceType: string
  updatedAt: string
}

export type ReleaseQueryRow = Omit<ReleaseReportRow, 'rowCounts'> & {
  createdAt: string
  ingestedAt: string | null
  regionCode: string
  revokedAt: string | null
  sourceUrl: string | null
  updatedAt: string
}

export type CountTarget = {
  bindings: D1Database[]
  kind: 'history' | 'source'
  releaseId: string
  sourceVersion: string
  specs: CountSpec[]
}
