import type {
  DatasetFixture,
  getDueUpdatePhases,
  lookupDatasetUpdates,
} from '../sources/sourceUpdates.ts'

export type DatasetUpdate = Awaited<ReturnType<typeof lookupDatasetUpdates>>[number]

export type PlannedDatasetUpdates = {
  dataset: DatasetFixture
  duePhases: ReturnType<typeof getDueUpdatePhases>
  targetVersions: Map<string, string | null>
  updates: DatasetUpdate[]
}

export type TargetVersionLookup =
  | { status: 'available'; versions: Map<string, string | null> }
  | { status: 'unknown' }

export type UpdateProcessingResult =
  | 'downloaded'
  | 'ingested'
  | 'mirrored'
  | 'reviewed'
  | 'review-required'
  | 'skipped'
  | 'uploaded'

export type PublishedSourceRelease = {
  dataset: DatasetFixture
  sourceKey: string
  version: string
}

export type ScheduledUpdateSummary = {
  added: Array<{
    datasetCode: string
    version?: string
  }>
  errors: string[]
}
