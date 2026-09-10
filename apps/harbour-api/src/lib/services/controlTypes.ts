import type { HarbourJobMessage, RegionCode, ResourceType } from '@repo/core'
import type {
  ApiReleaseSetMetadataDelta,
  SnapshotMetadataDelta,
} from '@repo/core/pipeline/harbourClient'
import type { ApiFamilyType } from '@repo/db'
import type { ReleaseSetPublication } from './releaseDiscord'

export type StageRequest = {
  releaseCode?: string
  releaseId?: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

export type PublishRequest = {
  carriedSnapshots?: Array<{
    resourceType: ResourceType
    snapshotId: string
    variant?: string
  }>
  deferApiReleaseSet?: boolean
  deferStatsReleaseSet?: boolean
  deferSourcePublish?: boolean
  releaseCode?: string
  releaseId?: string
  skipSnapshotCleanup?: boolean
}

export type CleanupSnapshotsRequest = {
  delaySeconds?: number
  dryRun?: boolean
  resourceType?: ResourceType
  snapshotIds?: string[]
}

export type ReconcileDraftReleaseSetsRequest = {
  apiFamily?: ApiFamilyType
  regionCode?: RegionCode
}

export type BootstrapStatsReleaseSetsRequest = {
  regionCode?: RegionCode
}

export type ControlResult = {
  apiCatalogRevisionCode?: string
  apiCatalogRevisionId?: string
  apiReleaseSetId?: string
  apiReleaseSetCode?: string
  apiReleaseSetStatus?: 'current' | 'draft' | 'archived'
  /** Release-set publications that crossed draft -> current in this call. */
  apiReleaseSetAnnouncements?: ReleaseSetPublication[]
  apiReleaseSetPublications?: ReleaseSetPublication[]
  datasetId: string
  metadataDelta?: {
    apiReleaseSets?: ApiReleaseSetMetadataDelta[]
    releases: Array<{ id: string; status: 'published' }>
    snapshots?: SnapshotMetadataDelta[]
  }
  releaseCode: string
  releaseId: string
  phase: string | null
  snapshotId?: string
  status: string
}

export type CleanupSnapshotsResult = {
  candidateCount: number
  delaySeconds: number
  dryRun: boolean
  snapshotIds: string[]
  status: 'queued' | 'skipped'
}

export type ReconcileDraftReleaseSetsResult = {
  inspected: number
  pendingReleaseSetCodes: string[]
  /** Release-set publications that crossed draft -> current in this call. */
  publishedReleaseSetAnnouncements: ReleaseSetPublication[]
  publishedReleaseSetPublications: ReleaseSetPublication[]
  publishedReleaseSetCodes: string[]
  publishedReleaseSetStatsTargets: Array<{
    apiReleaseSetId: string
    cohortKey: string
    family: 'address' | 'division' | 'place' | 'statistics'
    releaseCode: string
    releaseId: string
    snapshotId: string
  }>
}

export type BootstrapStatsReleaseSetsResult = {
  createdReleaseSetCodes: string[]
  inspectedSnapshots: number
  skippedCohortKeys: string[]
}

export type HarbourJobQueue = {
  send(message: HarbourJobMessage, options?: QueueSendOptions): Promise<unknown>
}
