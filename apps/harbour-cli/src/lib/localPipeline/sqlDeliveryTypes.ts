export type SqlDeliveryTarget = {
  databaseId: string
  bindingName: string
}

export type SqlDeliveryBatch = {
  kind: 'sql' | 'bound'
  index: number
  target: SqlDeliveryTarget
  file: string
  sha256: string
  bytes: number
}

export type SqlDeliveryPlan = {
  version: 1
  id: string
  context: {
    releaseId: string
    environment: 'preview' | 'production'
    phase: string
    /** Frozen planning inputs, including selected snapshots and source checksums. */
    inputs: Record<string, unknown>
    cacheDir: string
    cachePreparedAt: string
  }
  batches: SqlDeliveryBatch[]
  preparedAt: string
  generationMs: number
  mirrorPreparationMs: number
}

export type SqlDeliveryCheckpoint = {
  status: 'pending' | 'uploaded' | 'ingesting' | 'polling' | 'complete'
  filename?: string
  bookmark?: string
  uploadMs: number
  executionMs: number
}

export type SqlDeliveryProgress = {
  version: 1
  planId: string
  remote: Record<string, SqlDeliveryCheckpoint>
  local: Record<string, { completedAt: string; durationMs: number }>
}
