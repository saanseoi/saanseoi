import type { GeometryStatus, RegionCode } from '@repo/core'
import type {
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
} from '@repo/core/pipeline/services/divisionGeometry'

export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type GeometryUploadPlan = {
  cohortKey: string
  datasetCode?: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source:
    | 'overture'
    | 'hkgov-had'
    | 'hkgov-censtatd'
    | 'hkgov-pland-pu'
    | 'hkgov-pland-new-town'
  sourceVersion: string
  geometryStatus?: GeometryStatus
  transform?: 'simplified'
  theme: 'divisions'
  type: 'divisionArea' | 'divisionBoundary'
}

export type NormalisedGeometry = ReturnType<
  typeof normaliseDivisionAreaGeometryRow | typeof normaliseDivisionBoundaryGeometryRow
>

export type GeometryWriteProgress = (
  label: string,
  current?: number,
  total?: number,
) => void
