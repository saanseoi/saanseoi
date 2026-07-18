import type { DatasetProcessingMessage } from '../../../types'
import type {
  AddressI18nPayload,
  AddressRow,
  NewAddressI18nRow,
} from '@repo/db/currentSchema'

export type AddressPipelineStage =
  | 'normalize'
  | 'source'
  | 'history'
  | 'current'
  | 'finalize'
  | 'sql-source'
  | 'sql-history'
  | 'sql-current'
  | 'sql-finalize'
  | 'sql-import-source'
  | 'sql-import-history'
  | 'sql-import-current'
  | 'sql-import-meta'
  | 'sql-cleanup-staging'

export type AddressPipelineStats = {
  deletedRows: number
  insertedVersions: number
  localizedRows: number
  processedRows: number
  unchangedRows: number
}

export type AddressPipelineMessage = DatasetProcessingMessage & {
  addressStage?: AddressPipelineStage
  addressCurrentLookupCache?: AddressCurrentLookupCache
  artifactKey?: string
  resolvedArtifactKey?: string
  addressSqlArtifactKeys?: string[]
  addressStats?: AddressPipelineStats
}

export type AddressCurrentLookupEntry = {
  id: string
  versionHash: string
}

export type AddressCurrentLookupCache = {
  byId: Map<string, AddressCurrentLookupEntry>
  byMatchKey: Map<string, AddressCurrentLookupEntry>
}

export type NormalizedAddressRecord = {
  canonicalId: string
  base: Omit<AddressRow, 'id' | 'snapshotId' | 'createdAt' | 'updatedAt'>
  i18n: AddressI18nPayload[]
  matchKey: string | null
  raw: Record<string, unknown>
  sourceId: string
  sourcePayloadHash: string
}

export type NormalizedAddressChunkArtifact = {
  kind: 'address.normalized.v1'
  processingRunStartedAt: string
  releaseId: string
  rowEnd: number
  rowStart: number
  rows: NormalizedAddressRecord[]
  totalRows: number
}

export type ResolvedAddressRecord = {
  addressId: string
  base: AddressRow
  changed: boolean
  changedExistingId: string | null
  i18n: NewAddressI18nRow[]
  sourceId: string
  versionHash: string
}

export type ResolvedAddressChunkArtifact = {
  kind: 'address.resolved.v1'
  insertedVersions: number
  localizedRows: number
  processingRunStartedAt: string
  releaseId: string
  rowEnd: number
  rowStart: number
  rows: ResolvedAddressRecord[]
  totalRows: number
  unchangedRows: number
}

export const EMPTY_ADDRESS_PIPELINE_STATS: AddressPipelineStats = {
  deletedRows: 0,
  insertedVersions: 0,
  localizedRows: 0,
  processedRows: 0,
  unchangedRows: 0,
}

export function getAddressPipelineStage(
  message: DatasetProcessingMessage,
): AddressPipelineStage {
  return (message as AddressPipelineMessage).addressStage ?? 'normalize'
}

export function addAddressPipelineStats(
  left: AddressPipelineStats | undefined,
  right: Partial<AddressPipelineStats>,
): AddressPipelineStats {
  return {
    deletedRows: (left?.deletedRows ?? 0) + (right.deletedRows ?? 0),
    insertedVersions: (left?.insertedVersions ?? 0) + (right.insertedVersions ?? 0),
    localizedRows: (left?.localizedRows ?? 0) + (right.localizedRows ?? 0),
    processedRows: (left?.processedRows ?? 0) + (right.processedRows ?? 0),
    unchangedRows: (left?.unchangedRows ?? 0) + (right.unchangedRows ?? 0),
  }
}
