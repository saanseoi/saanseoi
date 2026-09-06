import type { DatasetProcessingMessage } from '@repo/core'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import type {
  PlaceLocalisationStatistics,
  NormalisedPlace,
} from '@repo/core/pipeline/services/place'
import type { historySchema } from '@repo/db'

export type PlaceUploadPlan = {
  datasetCode: string
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: 'overture'
  sourceVersion: string
  theme: 'places'
  type: 'place'
}

export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

export type EnrichedPlace = {
  place: NormalisedPlace
  /** Curated Place geometry used by the public Place projection, if overridden. */
  effectiveLng?: number
  effectiveLat?: number
  addressSnapshotId?: string | null
  address2dId: string | null
  address3dId: string | null
  address3dUnitId?: string | null
  address3dMembership?: 'established' | 'unresolved' | null
  divisionIds: string[]
  versionHash: string
  sourcePayloadHash: string
}

/** Only retain history fields needed for replay and address continuity. */
export type PlaceHistoryRow = Pick<
  typeof historySchema.places.$inferSelect,
  | 'id'
  | 'address2dId'
  | 'addressSnapshotId'
  | 'addresses'
  | 'createdAt'
  | 'firstSeenMonth'
  | 'lastSeenMonth'
  | 'releaseId'
  | 'versionHash'
>

export type PlaceHistoryState = {
  bindingName: string
  row: PlaceHistoryRow
}

export type BuildPlaceSqlInput = {
  activeHistoryBindingName: string
  activeSourceBindingName: string
  sourceBindingNames: string[]
  datasetId: string
  message: DatasetProcessingMessage
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    snapshotId: string
  }
  places: EnrichedPlace[]
  historyRows: PlaceHistoryState[]
}

export type BuildPlaceSqlOptions = {
  includeInitialStatements?: boolean
  includeRemovedPlaces?: boolean
  onProgress?: (current: number) => void
  timestamp?: string
}

export type PlaceSqlProgressEvent = {
  current: number
  detail?: string
  phase: 'generate' | 'import'
}

export type StagedPlaces = {
  actions: ReleaseProcessingAction[]
  includedRows: number
  path: string
  processedRows: number
}

export type StagedEnrichedPlaces = {
  path: string
  processedRows: number
  stats: PlaceReleaseStatsAccumulator
}

export type PlaceReleaseStatsAccumulator = {
  addressLinkedRows: number
  divisionLinkedRows: number
  localeCounts: Map<string, number>
  localisedPlaceCount: number
  localisedRows: number
  localisation: PlaceLocalisationStatistics
  processedRows: number
}
