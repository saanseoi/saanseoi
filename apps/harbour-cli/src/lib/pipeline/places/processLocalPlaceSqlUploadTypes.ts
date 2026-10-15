import type { DatasetProcessingMessage } from '@repo/core'
import type {
  NormalisedPlace,
  PlaceLocalisationStatistics,
} from '@repo/core/pipeline/services/places/place'
import type { ReleaseProcessingAction } from '@repo/core/provenance/processingAction'
import type { PlaceVersionI18nRow, PlaceVersionRow } from '@repo/db/historySchema'

export type PlaceUploadPlan = {
  datasetCode: string
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: 'overture'
  sourceVersion: string
  theme: 'places'
  resourceType: 'place'
}

export type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  resourceReleaseId?: string
}

export type EnrichedPlace = {
  projection?: { cells: { h3Level: number; h3Cell: string }[]; i18nHashes: string[] }
  place: NormalisedPlace
  /** Curated Place geometry used by the public Place projection, if overridden. */
  effectiveLng?: number
  effectiveLat?: number
  addressSnapshotId?: string | null
  addressDependencyHash?: string | null
  searchDependencies?: Record<
    string,
    NonNullable<PlaceVersionI18nRow['searchDependencyText']>
  >
  address2dId: string | null
  address3dId: string | null
  address3dUnitId?: string | null
  address3dMembership?: 'established' | 'unresolved' | null
  divisionAssociation?: {
    divisionSnapshotId: string
    divisionAreaSnapshotId: string
    evidence: { divisionId: string; method: string }[]
  }
  divisionReferences?: import('../divisions/divisionMembership').DivisionReferences
  divisionIds: string[]
  divisionDefinitions?: Record<
    string,
    {
      level: number | null
      locales: { locale: string; name: string | null }[]
    }
  >
  versionHash: string
  sourcePayloadHash: string
}

/** Only retain history fields needed for replay and address continuity. */
export type PlaceHistoryRow = Pick<
  PlaceVersionRow,
  | 'id'
  | 'address2dId'
  | 'addressSnapshotId'
  | 'addresses'
  | 'createdAt'
  | 'firstSeenMonth'
  | 'resourceReleaseId'
  | 'versionHash'
> &
  Partial<PlaceVersionRow>

export type PlaceLocaleHistoryState = {
  bindingName: string
  row: PlaceVersionI18nRow
}

export type PlaceHistoryState = {
  identity?: import('@repo/core/pipeline/services/places/placeIdentity').PlaceIdentityDecision
  bindingName: string
  row: PlaceHistoryRow
  locales?: PlaceLocaleHistoryState[]
  divisionDefinitions?: import('@repo/db').PlaceDivisionDefinitionSet
}

export type BuildPlaceSqlInput = {
  /** Retain immutable per-record processing evidence before delivering canonical SQL. */
  retainEvidence?: (documents: unknown[]) => Promise<void>
  publicationPrevious?: import('@repo/core/pipeline/services/publication/sql.ts').PublicationPreparation['previous']
  /** Physical current scopes selected by logical Address and Division snapshots. */
  referenceScopes?: ReadonlyMap<string, string>
  /** Current publisher hashes from the prepared source mirrors, indexed by ID. */
  sourceRows?: ReadonlyMap<string, { bindingName: string; versionHash: string }>
  activeHistoryBindingName: string
  activeSourceBindingName: string
  sourceBindingNames: string[]
  datasetId: string
  message: DatasetProcessingMessage
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    divisionAreaSnapshotId?: string
    snapshotId: string
    snapshotLineageId: string
  }
  places: EnrichedPlace[]
  historyRows: PlaceHistoryState[]
}

export type BuildPlaceSqlOptions = {
  /** Complete membership when finalising a streamed release. */
  seenPlaceIds?: ReadonlySet<string>
  seenSourceRecordIds?: ReadonlySet<string>
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
