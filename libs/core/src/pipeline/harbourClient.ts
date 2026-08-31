export type ApiReleaseSetPublication = {
  apiCatalogRevisionCode?: string
  apiReleaseSetCode: string
}

export type PublishDatasetResult = {
  apiCatalogRevisionCode?: string
  apiCatalogRevisionId?: string
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  apiReleaseSetStatus?: 'current' | 'draft'
  apiReleaseSetPublications?: ApiReleaseSetPublication[]
  datasetId?: string
  metadataDelta?: {
    apiReleaseSets?: Array<{ id: string; status: 'current' | 'draft' }>
    releases: Array<{ id: string; status: 'published' }>
  }
  phase: string | null
  releaseCode: string
  releaseId: string
  snapshotId?: string
  status: string
}

/**
 * Control-plane callbacks used to report pipeline progress and publish datasets.
 */
export type HarbourClient = {
  publishDataset(
    releaseId: string,
    releaseCode?: string,
    options?: {
      /** Publish source data and snapshots while keeping the API release set draft. */
      deferApiReleaseSet?: boolean
      /** Publish source data and snapshots, but leave Statistics cohorts for a launch bootstrap. */
      deferStatsReleaseSet?: boolean
      skipSnapshotCleanup?: boolean
    },
  ): Promise<PublishDatasetResult | void>
  stageCompleted(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageFailed(
    releaseId: string,
    phase: string,
    error: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
  stageRunning(
    releaseId: string,
    phase: string,
    stats?: Record<string, unknown>,
    releaseCode?: string,
  ): Promise<void>
}
