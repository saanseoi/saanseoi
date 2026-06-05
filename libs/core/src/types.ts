export const SUPPORTED_THEMES = ['addresses', 'divisions', 'places'] as const
export const SUPPORTED_TYPES = ['address', 'division', 'place'] as const

export type SupportedTheme = (typeof SUPPORTED_THEMES)[number]
export type SupportedType = (typeof SUPPORTED_TYPES)[number]
export type RegionCode = 'hk' | 'mo'

export type DatasetRecord = {
  datasetId: string
  regionCode: string
  snapshotMonth: string
  theme: string
  type: string
  source: string
  sourceVersion: string
  rawObjectKey: string
  originalFileName: string
  status: string
  supersedesDatasetId: string | null
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
  regionCode: RegionCode
  snapshotMonth: string
  theme: SupportedTheme
  type: SupportedType
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
    snapshotMonth: 'path' | 'filename' | 'flag'
    sourceVersion: 'flag' | 'path' | 'filename' | 'snapshotMonth'
  }
  supersedesDatasetId: string | null
}

export type RegisterUploadOptions = {
  filePath: string
  originalFileName?: string
  regionCode?: string
  snapshotMonth?: string
  theme?: string
  type?: string
  source?: string
  sourceVersion?: string
  dryRun?: boolean
  inspection?: ParquetInspection
  rawObjectKey?: string
  resolveSchemaFingerprint?: SchemaFingerprintResolver
  allowExistingDatasetStatuses?: string[]
}

export type PreparedUploadResult = {
  plan: UploadPlan
  inspection: ParquetInspection
}

export type RegisterUploadResult = {
  plan: UploadPlan
  inspection: ParquetInspection
  rawObjectKey: string | null
}

export type DatasetProcessingMessage = {
  datasetId: string
  rawObjectKey: string
  regionCode: RegionCode
  snapshotMonth: string
  source: string
  sourceVersion: string
  theme: SupportedTheme
  type: SupportedType
}
