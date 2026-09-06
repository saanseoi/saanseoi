import type { RegionCode } from '@repo/core'

export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type HkgovPlandDivisionUploadPlan = {
  cohortKey: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source: 'hkgov-pland-pu' | 'hkgov-pland-new-town'
  sourceVersion: string
  theme: 'divisions'
  type: 'division'
}

export type PreparedDivision = {
  base: {
    bbox: unknown
    cartography: null
    divisionCode: string | null
    geometry: unknown
    hierarchy: unknown
    id: string
    identifiers: unknown
    level: number
    sources: Record<string, unknown>
    type: string
    wikidata: null
  }
  cells: Array<{
    ppuCode: string
    rawProperties: unknown
    repairedGeometry: unknown
    sourceRecordId: string
    sourceGeometry: unknown
    spuCode: string
    subunitCode: string
    tpuCode: string
    wasGeometryRepaired: boolean
  }>
  i18n: Array<{ locale: string; name: string }>
  newTown: null | {
    nameEn: string
    nameZhHans: string
    nameZhHant: string
    rawProperties: unknown
    repairedGeometry: unknown
    sourceGeometry: unknown
    sourceRecordId: string
    wasGeometryRepaired: boolean
  }
  raw: Record<string, unknown>
  sourceCellIds: unknown
  versionHash: string
}

export type CompressedPlanningDivisionGeometry = ReadonlyMap<string, Uint8Array>
