import type { DatasetProcessingMessage } from '../../../types'
import type {
  AddressI18nPayload,
  AddressRow,
  NewAddressI18nRow,
} from '@repo/db/currentSchema'

export type AddressPipelineStage =
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

export type AddressPipelineStats = {
  addedRows: number
  changedRows: number
  componentCounts: Record<string, number>
  deletedRows: number
  districtCounts: Record<string, number>
  insertedVersions: number
  localeCounts: Record<string, number>
  localisedRows: number
  processedRows: number
  recordedRows: number
  unchangedRows: number
}

export type AddressPipelineMessage = DatasetProcessingMessage & {
  addressStage?: AddressPipelineStage
  addressCurrentLookupCache?: AddressCurrentLookupCache
  artefactKey?: string
  resolvedArtefactKey?: string
  addressSqlArtefactKeys?: string[]
  addressStats?: Partial<AddressPipelineStats>
}

export type AddressCurrentLookupEntry = {
  churnHash: string
  id: string
}

export type AddressCurrentLookupCache = {
  byId: Map<string, AddressCurrentLookupEntry>
  byMatchKey: Map<string, AddressCurrentLookupEntry>
}

export type NormalisedAddressRecord = {
  canonicalId: string
  base: Omit<AddressRow, 'id' | 'snapshotId' | 'createdAt' | 'updatedAt'>
  coverageComponents: string[]
  i18n: AddressI18nPayload[]
  matchKey: string | null
  raw: Record<string, unknown>
  sourceId: string
  sourcePayloadHash: string
}

export type NormalisedAddressChunkArtefact = {
  kind: 'address.normalised.v1'
  processingRunStartedAt: string
  releaseId: string
  rowEnd: number
  rowStart: number
  rows: NormalisedAddressRecord[]
  totalRows: number
}

export type ResolvedAddressRecord = {
  addressId: string
  base: AddressRow
  changed: boolean
  changedExistingId: string | null
  coverageComponents: string[]
  i18n: NewAddressI18nRow[]
  sourceId: string
  versionHash: string
}

export type ResolvedAddressChunkArtefact = {
  addedRows: number
  changedRows: number
  kind: 'address.resolved.v1'
  insertedVersions: number
  localisedRows: number
  processingRunStartedAt: string
  releaseId: string
  rowEnd: number
  rowStart: number
  rows: ResolvedAddressRecord[]
  totalRows: number
  unchangedRows: number
}

export const EMPTY_ADDRESS_PIPELINE_STATS: AddressPipelineStats = {
  addedRows: 0,
  changedRows: 0,
  componentCounts: {},
  deletedRows: 0,
  districtCounts: {},
  insertedVersions: 0,
  localeCounts: {},
  localisedRows: 0,
  processedRows: 0,
  recordedRows: 0,
  unchangedRows: 0,
}

export function getAddressPipelineStage(
  message: DatasetProcessingMessage,
): AddressPipelineStage {
  return (message as AddressPipelineMessage).addressStage ?? 'normalise'
}

export function addAddressPipelineStats(
  left: Partial<AddressPipelineStats> | undefined,
  right: Partial<AddressPipelineStats>,
): AddressPipelineStats {
  return {
    addedRows: (left?.addedRows ?? 0) + (right.addedRows ?? 0),
    changedRows: (left?.changedRows ?? 0) + (right.changedRows ?? 0),
    componentCounts: addCountMaps(left?.componentCounts, right.componentCounts),
    deletedRows: (left?.deletedRows ?? 0) + (right.deletedRows ?? 0),
    districtCounts: addCountMaps(left?.districtCounts, right.districtCounts),
    insertedVersions: (left?.insertedVersions ?? 0) + (right.insertedVersions ?? 0),
    localeCounts: addCountMaps(left?.localeCounts, right.localeCounts),
    localisedRows: (left?.localisedRows ?? 0) + (right.localisedRows ?? 0),
    processedRows: (left?.processedRows ?? 0) + (right.processedRows ?? 0),
    recordedRows: (left?.recordedRows ?? 0) + (right.recordedRows ?? 0),
    unchangedRows: (left?.unchangedRows ?? 0) + (right.unchangedRows ?? 0),
  }
}

/**
 * Coverage counters are gathered from resolved rows, after source-level
 * consolidation. A component is counted once per address even when present in
 * more than one locale.
 */
export function collectAddressCoverageCounts(rows: ResolvedAddressRecord[]) {
  const componentCounts: Record<string, number> = {}
  const districtCounts: Record<string, number> = {}
  const localeCounts: Record<string, number> = {}

  for (const row of rows) {
    if (row.base.districtId) incrementCount(districtCounts, row.base.districtId)

    const locales = new Set<string>()
    const components = new Set(row.coverageComponents)
    for (const localised of row.i18n) {
      locales.add(localised.locale)
      if (localised.streetName) components.add('street_name')
      if (localised.buildingNumberFrom || localised.buildingNumberTo)
        components.add('building_number')
      if (localised.buildingName) components.add('building_name')
      if (localised.estateName) components.add('estate_name')
      if (localised.phaseName || localised.phaseRef) components.add('phase')
      if (localised.blockType || localised.blockRef) components.add('block')
    }

    for (const locale of locales) incrementCount(localeCounts, locale)
    for (const component of components) incrementCount(componentCounts, component)
  }

  return { componentCounts, districtCounts, localeCounts }
}

function addCountMaps(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
) {
  const result = { ...(left ?? {}) }
  for (const [key, count] of Object.entries(right ?? {})) {
    result[key] = (result[key] ?? 0) + count
  }
  return result
}

function incrementCount(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1
}
