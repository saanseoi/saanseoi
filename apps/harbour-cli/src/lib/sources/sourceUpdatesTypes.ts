import type { CsdiSourceArchive, PreparedSourceArchive } from './sourceArchives.ts'

export const apiFamilyHeaders = {
  addresses: 'ADDRESSES',
  divisions: 'DIVISIONS',
  places: 'PLACES',
  stats: 'STATISTICS',
  streets: 'STREETS',
} as const

export const datasetUpdateCheckFrequencies = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
] as const

export type DatasetUpdateCheckFrequency = (typeof datasetUpdateCheckFrequencies)[number]

export const datasetReleaseDiscoveryKinds = ['new-release', 'revision'] as const

export type DatasetReleaseDiscoveryKind = (typeof datasetReleaseDiscoveryKinds)[number]

/**
 * Defines when one phase of the updater may query its publisher.
 *
 * `on-discovery` runs as part of a successful new-release or revision
 * discovery. It is useful for bounded archives: the catalogue is scanned when
 * the release event that may have displaced an archive is observed.
 */
export type DatasetUpdateCheck =
  | { trigger: 'periodic'; frequency: DatasetUpdateCheckFrequency }
  | {
      trigger: 'after-latest-release-age'
      ageDays: number
      frequency: DatasetUpdateCheckFrequency
    }
  | { trigger: 'initial-only' }
  | {
      trigger: 'on-discovery'
      discoveries: DatasetReleaseDiscoveryKind[]
      includeInitialDownload?: boolean
    }
  | { trigger: 'never' }

export const datasetUpdatePhases = ['new-releases', 'revisions', 'archives'] as const

export type DatasetUpdatePhase = (typeof datasetUpdatePhases)[number]

export type DatasetUpdatePolicy = {
  allowUpdates?: boolean
  checkFrequency?: DatasetUpdateCheckFrequency
}

export const datasetArchiveAvailability = ['none', 'limited', 'full'] as const

export type DatasetArchiveAvailability = (typeof datasetArchiveAvailability)[number]

export const archiveDiscoveryOperations = [
  'csdi-archived-dataset',
  'data-gov-historical-file-versions',
  'overture-release-catalog',
] as const

export type ArchiveDiscoveryOperation = (typeof archiveDiscoveryOperations)[number]

export type DatasetReleasePolicy = {
  /** A rolling series supersedes a current snapshot; a cohort remains independently meaningful. */
  series: 'rolling' | 'cohort'
  schedule: 'regular' | 'irregular' | 'one-off'
  /** Whether a publisher can revise every release, only its latest, or none. */
  revisionScope: 'all' | 'latest' | 'none'
  checks: {
    archives: DatasetUpdateCheck
    newReleases: DatasetUpdateCheck
    revisions: DatasetUpdateCheck
  }
  archives: {
    availability: DatasetArchiveAvailability
    entryUrl?: string
    operation?: ArchiveDiscoveryOperation
  }
}

export type DatasetVersionPolicy = {
  scheme:
    | 'reference-year'
    | 'initial-release-date'
    | 'reference-date'
    | 'release-date'
    | 'quarterly'
    | 'upstream'
  releaseField?: DatasetReleaseField
  correctionSuffixSource: DatasetCorrectionSuffixSource
}

export const datasetCorrectionSuffixSources = ['none', 'generated', 'upstream'] as const

export type DatasetCorrectionSuffixSource =
  (typeof datasetCorrectionSuffixSources)[number]

export type DatasetReleaseField =
  | 'sourceVersion'
  | 'referenceYear'
  | 'referenceDate'
  | 'releaseDate'

export type DatasetRelease = {
  archiveSlots?: Array<{
    contentHash: string
    releaseSlot: string
    sourceObjectHash: string
  }>
  verifiedIdenticalArchiveSlots?: Array<{
    contentHash: string
    releaseSlot: string
    sourceObjectHash: string
  }>
  sourceVersion?: string
  sourceUrl?: string
  /**
   * Publisher fields that identify the reference periods carried by one
   * delivery. A source version may therefore contain historical records.
   */
  referencePeriods?: {
    /**
     * Whether geometry materialised from this delivery is publisher-authoritative
     * for its labelled reference periods, or is a temporary fallback.
     */
    geometryStatus?: 'authoritative' | 'fallback'
    materialiseAreaCompanions?: boolean
    sourceField: string
  }
  referenceYear?: string
  referenceDate?: string
  releaseDate?: string
  publisherLastRevisedAt?: string
}

export type DatasetFixture = {
  code: string
  publisherCode: string
  regionCode: string
  sourceUrl?: string
  schemaURL?: string | null
  publisherReleaseFrequency?: string
  updatePolicy?: DatasetUpdatePolicy
  releasePolicy?: DatasetReleasePolicy
  sourceDocumentUrl?: string
  sourceLayer?: string
  sourceLayers?: string[]
  versionPolicy: DatasetVersionPolicy
  releases?: DatasetRelease[]
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
  lastUpdated?: string
  type?: string
  resourceTypes?: readonly string[]
  sourceVariant?: string
  /**
   * The reviewed `include=areas` companion for each statistics reference year.
   * `*` applies when no year-specific entry exists; every value may contain
   * `{referencePeriodEndYear}`.
   */
  areaCompanionByReferencePeriod?: Record<
    string,
    { cohortKey: string; domainCode: string; variant: string }
  >
  mergeRules?: Array<{
    rulesetVersion: string
    operationCodes: string[]
  }>
  theme: string
  i18n?: Array<{ locale: string; name?: string }>
}

export type CompositionMemberReference = {
  resourceType: string
  variant?: string
}

type CompositionMemberFixture = CompositionMemberReference & {
  ingestDependencies?: CompositionMemberReference[]
}

export type ApiCompositionFixture = {
  code: string
  domains?: Array<{
    code: string
    members: CompositionMemberFixture[]
  }>
  status: string
}

export type CompositionIngestDependency = {
  compositionCode: string
  consumer: Required<CompositionMemberReference>
  domainCode: string
  provider: Required<CompositionMemberReference>
}

export type UpdateUpload = {
  positionals: string[]
  options: Record<string, string | boolean>
}

export type DatasetIngestProgress = {
  current?: number
  message: string
  total?: number
  waitingForInput?: boolean
}

export type DatasetUpdate = {
  archive?: CsdiSourceArchive
  /** Runs only after a native CSDI archive has been mirrored successfully. */
  postArchiveIngest?: (
    target: import('../cli/options.ts').UploadTarget,
    prepared: PreparedSourceArchive,
    skipConfirm: boolean,
    options: { deferStatsReleaseSet: boolean; includeGeography: boolean },
  ) => Promise<'ingested' | 'not-implemented'>
  /** Assigns a non-CSDI package to one of the updater's three report phases. */
  phase?: DatasetUpdatePhase
  deferStateUntilProcessed?: boolean
  dataset: DatasetFixture
  isKnownIdenticalArchive?: boolean
  status: 'new' | 'current' | 'review' | 'manual' | 'skipped' | 'error'
  sourceKey?: string
  /** Key used to find the corresponding release on the upload target. */
  targetSourceKey?: string
  /** The target release that preceded this update when it was offered. */
  targetVersion?: string | null
  version?: string
  versionKey?: string
  sourceUrl?: string
  downloadUrl?: string
  downloadPath?: string
  download?: () => Promise<string>
  ingest?: (
    target: import('../cli/options.ts').UploadTarget,
    options?: {
      forceUpload?: boolean
      onProgress?: (progress: DatasetIngestProgress) => void
      skipPrompts?: boolean
    },
  ) => Promise<void>
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
  /** Persists a proven byte-identical publisher archive after it is downloaded. */
  recordIdenticalArchive?: (contentHash: string) => Promise<void>
  metadata?: {
    abstract?: string
    creationDate?: string
    featureType?: string
    revisionDate?: string
    title?: string
    updateSequence?: string
    updateFrequency?: string
  }
  checkedAt?: string
  sourceCursor?: string[]
  upload?: UpdateUpload
  message?: string
  /** Written only after the immutable publisher archive is mirrored. */
  mirroredArchive?: {
    contentHash: string
    objectKey: string
    mirroredAt: string
  }
}

export type CsdiArchivedSource = {
  releaseSlot: string
  sourceFormat?: string
  sourceUrl: string
}

export type UpdateState = Record<string, UpdateStateEntry>

export type UpdateStateEntry = {
  versionKey?: string
  version?: string
  lastChecked?: string
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
  sourceCursor?: string[]
  sourceChecks?: Record<string, UpdateSourceState>
  /** Publisher artefacts mirrored into managed storage, independent of DB intake. */
  archiveMirrors?: Record<string, UpdateArchiveMirrorState>
  /** Source releases whose importer completed and published a database release. */
  databaseImports?: Record<string, UpdateDatabaseImportState>
  phaseChecks?: Partial<Record<DatasetUpdatePhase, UpdatePhaseState>>
}

export type UpdateSourceState = {
  versionKey?: string
  version?: string
  lastChecked?: string
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
  sourceCursor?: string[]
}

export type UpdatePhaseState = {
  lastChecked?: string
  releaseLastRevisedAt?: string
  sourceCursor?: string[]
}

export type UpdateArchiveMirrorState = {
  contentHash: string
  mirroredAt: string
  objectKey: string
  version?: string
  versionKey?: string
}

export type UpdateDatabaseImportState = {
  importedAt: string
  version?: string
  versionKey?: string
}

export type LookupContext = {
  dataset: DatasetFixture
  localVersion?: string
  targetVersions?: ReadonlyMap<string, string | null>
  previous?: UpdateState[string]
  force?: boolean
}

export type LookupAdapter = (
  context: LookupContext,
) => Promise<DatasetUpdate | DatasetUpdate[]>
