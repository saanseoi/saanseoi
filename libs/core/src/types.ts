import type { ReleaseStatus } from '@repo/db'

export const resourceThemes = [
  'divisions',
  'addresses',
  'places',
  'streets',
  'stats',
] as const
export const resourceTypes = [
  'division',
  'divisionArea',
  'divisionBoundary',
  'divisionStatistic',
  'address',
  'place',
  'street',
] as const

export type ResourceTheme = (typeof resourceThemes)[number]
export type ResourceType = (typeof resourceTypes)[number]
export type RegionCode = 'hk' | 'mo'

export type DatasetRecord = {
  id: string
  datasetId: string
  datasetCode: string
  releaseId: string
  releaseCode: string
  regionCode: string
  cohortKey: string
  theme: string
  type: string
  sourceVariant: string
  source: string
  sourceVersion: string
  rawObjectKey: string | null
  originalFileName: string
  releaseNotesUrl: string | null
  notes: string | null
  status: ReleaseStatus
  supersedesDatasetId: string | null
  supersededByReleaseId: string | null
  revokedAt: string | null
  revocationReason: string | null
  ingestedAt: string
  createdAt: string
  updatedAt: string
}

export type ParquetSchemaField = {
  name: string
  type: string
  nullable: boolean
}

export type ParquetInspection = {
  rowCount: number
  schema: ParquetSchemaField[]
  distinctThemeValues: string[]
  distinctTypeValues: string[]
  distinctCountryValues: string[]
  distinctRegionValues: string[]
}

export type SchemaFingerprintResolver = (
  rawObjectKey: string | null,
  datasetId: string,
) => Promise<string | null>

export type UploadPlan = {
  datasetId: string
  datasetCode: string
  releaseCode: string
  regionCode: RegionCode
  cohortKey: string
  shardYear?: string
  theme: ResourceTheme
  type: ResourceType
  source: string
  sourceVersion: string
  filePath: string
  fileName: string
  originalFileName: string
  releaseNotesUrl?: string
  rowCount: number
  schemaFingerprint: string
  inferredFrom: {
    theme: 'path' | 'filename' | 'parquet' | 'flag'
    type: 'path' | 'filename' | 'parquet' | 'flag'
    regionCode: 'path' | 'parquet' | 'flag'
    cohortKey: 'path' | 'filename' | 'flag' | 'sourceVersion'
    source: 'flag' | 'path' | 'filename'
    sourceVersion: 'flag' | 'path' | 'filename' | 'cohortKey'
  }
  supersedesDatasetId: string | null
}

export type RegisterUploadOptions = {
  filePath: string
  originalFileName?: string
  regionCode?: string
  cohortKey?: string
  theme?: string
  type?: string
  source?: string
  sourceVersion?: string
  releaseNotesUrl?: string
  shardYear?: string
  dryRun?: boolean
  inspection?: ParquetInspection
  rawObjectKey?: string
  resolveSchemaFingerprint?: SchemaFingerprintResolver
  allowExistingDatasetStatuses?: ReleaseStatus[]
}

export type PreparedUploadResult = {
  plan: UploadPlan
  inspection: ParquetInspection
}

export type RegisterUploadResult = {
  plan: UploadPlan
  inspection: ParquetInspection
  datasetId: string | null
  rawObjectKey: string | null
  releaseId: string | null
}

export type DatasetProcessingMessage = {
  jobType?: 'processDataset'
  datasetId: string
  datasetCode?: string
  releaseId?: string
  releaseCode?: string
  rawObjectKey: string
  regionCode: RegionCode
  shardYear?: string
  cohortKey: string
  source: string
  sourceVersion: string
  theme: ResourceTheme
  type: ResourceType
  skipSnapshotCleanup?: boolean
  preplannedAddressChunks?: boolean
  rowStart?: number
  rowEnd?: number
  totalRows?: number
  chunkSize?: number
  processingRunStartedAt?: string
  processingMode?: 'direct' | 'sql'
  addressStage?:
    | 'normalise'
    | 'source'
    | 'history'
    | 'current'
    | 'finalise'
    | 'sql-source'
    | 'sql-history'
    | 'sql-current'
    | 'sql-finalise'
    | 'sql-import-source'
    | 'sql-import-history'
    | 'sql-import-current'
    | 'sql-import-meta'
    | 'sql-cleanup-staging'
  artefactKey?: string
  resolvedArtefactKey?: string
  addressSqlArtefactKeys?: string[]
  addressSqlPublishAfterCleanup?: boolean
  addressStats?: {
    deletedRows: number
    insertedVersions: number
    localisedRows: number
    processedRows: number
    unchangedRows: number
  }
}

export type SnapshotCleanupMessage = {
  jobType: 'cleanupCurrentSnapshots'
  requestedAt: string
  resourceType?: ResourceType
  snapshotIds?: string[]
}

export type AddressSqlStagingCleanupMessage = DatasetProcessingMessage & {
  addressStage: 'sql-cleanup-staging'
  jobType?: 'processDataset'
  processingMode: 'sql'
}

// Harbour's only remote queue work is snapshot cleanup. Dataset processing runs
// in the local CLI pipeline and must not be dispatched to this queue.
export type HarbourJobMessage = SnapshotCleanupMessage
