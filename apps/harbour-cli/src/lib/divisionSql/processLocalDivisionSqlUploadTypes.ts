import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import type { NewSourceResolution } from '@repo/db/historySchema'
import type { DivisionI18nPayload, NewDivisionRow } from '@repo/db/currentSchema'
import type { CurrentSourceRecord } from '@repo/core/pipeline/db/source'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import type { DivisionVersionSnapshot } from '@repo/core/pipeline/db/division'
import type { SqlImportTargetContext } from '../localPipeline/sqlImport.ts'

export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type UploadPlan = {
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: 'hkgov-censtatd' | 'hkgov-landsd' | 'overture'
  sourceVersion: string
  theme: 'divisions'
  type: 'division'
}

export type DivisionPreparedRecord = {
  base: Omit<NewDivisionRow, 'snapshotId'>
  baseChanged: boolean
  canonicalI18n: DivisionI18nPayload[]
  currentChanged: boolean
  currentExists: boolean
  id: string
  i18nVersionHash: string
  isSupplemental?: boolean
  sourceResolution?: NewSourceResolution
  raw: Record<string, unknown>
  sourceChanged: boolean
  sourcePayloadHash: string
  versionHash: string
}

export type DivisionSqlImportFile = {
  bytes: number
  filename: string
  sql: string
  statementCount: number
  target: 'current' | 'history' | 'meta' | 'source'
}

export type DivisionSqlState = {
  branchCounts?: import('@repo/core/provenance').BranchCounts
  auditGuards?: import('@repo/core/provenance').AuditGuard[]
  curationDocuments?: Array<{ type: string; document: unknown }>
  currentRows: Map<string, OwnedDivisionVersionSnapshot>
  currentSourceRows: Map<string, OwnedCurrentSourceRecord>
  deletedRows: number
  insertedVersions: number
  isInitialSourceLoad: boolean
  localisedRows: number
  previousRows: Map<string, DivisionVersionSnapshot>
  processedRows: number
  processedRowsById: Map<string, DivisionVersionSnapshot>
  processingActions: ReleaseProcessingAction[]
  records: DivisionPreparedRecord[]
  seenIds: Set<string>
  snapshotId: string
  sourceChangedRows: number
  sourceUnchangedRows: number
  statsRows: ReleaseScopedStatsRow[]
  unchangedRows: number
}

export type DivisionSqlArtefactManifest = {
  currentKey: string
  currentInitKey: string | null
  historyKey: string
  metaKey: string
  sourceKey: string
}

export type OwnedDivisionVersionSnapshot = DivisionVersionSnapshot & {
  ownerShardKeys?: string[]
}

export type OwnedCurrentSourceRecord = CurrentSourceRecord & {
  ownerShardKeys?: string[]
}

export type ExtraSqlImportOperation = {
  sql: string
  target: SqlImportTargetContext
}

export type SqlValue = boolean | number | string | null | undefined
