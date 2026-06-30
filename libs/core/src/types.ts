import type { ReleaseStatus } from '@repo/db'

export const resourceThemes = ['divisions', 'addresses', 'places', 'streets'] as const
export const resourceTypes = ['division', 'address', 'place', 'street'] as const

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
  source: string
  sourceVersion: string
  rawObjectKey: string
  originalFileName: string
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
  rawObjectKey: string,
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
  rowCount: number
  schemaFingerprint: string
  inferredFrom: {
    theme: 'path' | 'parquet' | 'flag'
    type: 'path' | 'parquet' | 'flag'
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
}

export type SnapshotCleanupMessage = {
  jobType: 'cleanupCurrentSnapshots'
  requestedAt: string
  resourceType?: ResourceType
  snapshotIds?: string[]
}

export type HarbourJobMessage = DatasetProcessingMessage | SnapshotCleanupMessage
