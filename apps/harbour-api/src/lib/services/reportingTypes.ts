import type { CountSpec, ReportFilters, ReportRowCount } from './reportingRows.ts'

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

export type StatQueryRow = Omit<StatReportRow, 'createdAt' | 'updatedAt'> & {
  createdAt: Date | string
  updatedAt: Date | string
}

export type ListStatsOptions = ReportFilters & {
  resourceReleaseId?: string
}

export type ReleaseReportRow = {
  hasStatisticsSnapshot?: boolean
  createdAt: string
  datasetCode: string
  datasetId: string
  ingestedAt: string | null
  publicationDate: string | null
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
  resourceReleaseId: string
  sourceVersion: string
  specs: CountSpec[]
}
