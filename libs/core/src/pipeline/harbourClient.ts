export type ApiReleaseSetPublication = {
  apiCatalogRevisionCode?: string
  apiReleaseSetCode: string
}

export type ApiReleaseSetMetadataDelta = {
  id: string
  apiVersionId: string
  apiCompositionId: string | null
  code: string
  regionCode: string | null
  domainCode: string
  cohortKey: string | null
  revision: number
  effectiveFrom: string | null
  supersedesApiReleaseSetId: string | null
  schemaVersion: string
  rulesetVersion: string
  status: 'current' | 'draft' | 'archived'
  publishedAt: string | null
  validFrom: string | null
  validTo: string | null
  notes: string | null
  guide: string | null
  versionHash: string
  createdAt: string
  updatedAt: string
}

export type SnapshotMetadataDelta = {
  id: string
  status: 'published'
  publishedAt: string
  validFrom: string
  validTo: null
}

export type PublishDatasetResult = {
  apiCatalogRevisionCode?: string
  apiCatalogRevisionId?: string
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  apiReleaseSetStatus?: 'current' | 'draft' | 'archived'
  apiReleaseSetPublications?: ApiReleaseSetPublication[]
  datasetId?: string
  metadataDelta?: {
    apiReleaseSets?: ApiReleaseSetMetadataDelta[]
    releases: Array<{ id: string; status: 'current' }>
    snapshots?: SnapshotMetadataDelta[]
  }
  phase: string | null
  releaseCode: string
  resourceReleaseId: string
  snapshotId?: string
  status: string
}

/**
 * Control-plane callbacks used to report pipeline progress and publish datasets.
 */
export type HarbourClient = {
  publishDataset(
    resourceReleaseId: string,
    releaseCode?: string,
    options?: {
      /** Preserve the exact reference snapshots selected by a family adapter. */
      carriedSnapshots?: Array<{
        resourceType: ResourceType
        snapshotId: string
        variant?: string
      }>
      /** Rebuild a published Overture Geographic snapshot and its API revision. */
      rebuildPublishedSnapshot?: boolean
      /** Publish source data and snapshots while keeping the API release set draft. */
      deferApiReleaseSet?: boolean
      /** Publish source data and snapshots, but leave Statistics cohorts for a launch bootstrap. */
      deferStatsReleaseSet?: boolean
      /** Publish this resource's artefacts without finalising its shared source release. */
      deferSourcePublish?: boolean
      skipSnapshotCleanup?: boolean
    },
  ): Promise<PublishDatasetResult | void>
  stageCompleted(
    resourceReleaseId: string,
    phase: string,
    results?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageFailed(
    resourceReleaseId: string,
    phase: string,
    error: string,
    results?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageRunning(
    resourceReleaseId: string,
    phase: string,
    results?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
}
import type { ResourceType } from '../types'
