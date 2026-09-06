import type { resolveDatasetRecord } from '@repo/core/db/metaRegistry'
import type { SqlImportTargetContext } from '../localPipeline/sqlImport.ts'

export type ReleaseRecord = Awaited<ReturnType<typeof resolveDatasetRecord>>

export type ResolvedReleaseRecord = NonNullable<ReleaseRecord>

export type RollbackPlanCounts = {
  current: RollbackStepCounts
  history: RollbackStepCounts
  meta: RollbackStepCounts
  source: RollbackStepCounts
}

export type RollbackStepCounts = {
  rows: number
  tables: number
}

export type RollbackArtefact = {
  name: keyof RollbackPlanCounts
  sql: string
  statementCount: number
  target: SqlImportTargetContext
}

export type RollbackOperation = 'purge' | 'rollback'
