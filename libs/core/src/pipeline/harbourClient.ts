export type PublishDatasetResult = {
  apiReleaseSetId?: string
  datasetId?: string
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
