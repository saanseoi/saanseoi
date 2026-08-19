import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import {
  LANDSD_STREET_NAMING_URL,
  pairLandsdStreetNoticePages,
  parseLandsdStreetSourcePage,
} from './landsd/street/landsdStreet.ts'
import { ingestLandsdStreetSource } from './landsd/street/landsdStreetIngest.ts'
import { publishLandsdStreetReleasePayloads } from './landsd/street/landsdStreetPublish.ts'
import {
  type CsdiSourceArchive,
  type PreparedSourceArchive,
  prepareCsdiSourceArchive,
} from './sourceArchives.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const DATASET_ROOT = resolve(REPO_ROOT, 'fixtures/meta/datasets')
const API_COMPOSITION_ROOT = resolve(REPO_ROOT, 'fixtures/meta/apiCompositions')
const STATE_PATH = resolve(REPO_ROOT, '.local/harbour/update-state.json')
const OVERTURIST_ROOT = resolve(REPO_ROOT, '../overturist')
const OVERTURIST_ENTRYPOINT = resolve(OVERTURIST_ROOT, 'overturist.ts')
const OVERTURE_HONG_KONG_DIVISION_ID = 'b4f09a9f-4cba-4a7c-bf58-2e63bc2e913d'
const DATA_GOV_HK_ALS_RESOURCE_URL = 'https://www.als.gov.hk/data/ALS-GeoJSON.zip'
const overtureDownloadJobs = new Map<string, Promise<string>>()

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
  identicalArchiveSlots?: Array<{
    contentHash: string
    releaseSlot: string
    sourceObjectHash: string
  }>
  sourceVersion?: string
  sourceUrl?: string
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
  schemaSpecificationURL?: string | null
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
  mergeRules?: Array<{
    rulesetVersion: string
    operationCodes: string[]
  }>
  theme: string
  i18n?: Array<{ locale: string; name?: string }>
}

type CompositionMemberReference = {
  resourceType: string
  variant?: string
}

type CompositionMemberFixture = CompositionMemberReference & {
  ingestDependencies?: CompositionMemberReference[]
}

type ApiCompositionFixture = {
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

export type DatasetUpdate = {
  archive?: CsdiSourceArchive
  /** Runs only after a native CSDI archive has been mirrored successfully. */
  postArchiveIngest?: (
    target: import('../cli/options.ts').UploadTarget,
    prepared: PreparedSourceArchive,
    skipConfirm: boolean,
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
  ingest?: (target: import('../cli/options.ts').UploadTarget) => Promise<void>
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

type UpdateState = Record<string, UpdateStateEntry>

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

type LookupContext = {
  dataset: DatasetFixture
  localVersion?: string
  targetVersions?: ReadonlyMap<string, string | null>
  previous?: UpdateState[string]
  force?: boolean
}

type LookupAdapter = (
  context: LookupContext,
) => Promise<DatasetUpdate | DatasetUpdate[]>

export async function loadDatasetFixtures(
  datasetCodes?: Set<string>,
): Promise<DatasetFixture[]> {
  const entries = await readdir(DATASET_ROOT, { withFileTypes: true })
  const fixtures: DatasetFixture[] = []

  for (const entry of entries.filter(
    entry => entry.isFile() && entry.name.endsWith('.json'),
  )) {
    const sourceFixture = JSON.parse(
      await readFile(resolve(DATASET_ROOT, entry.name), 'utf8'),
    ) as Omit<DatasetFixture, 'type'>
    if (datasetCodes && !datasetCodes.has(sourceFixture.code)) continue

    const resourceTypes = sourceFixture.resourceTypes ?? []
    if (resourceTypes.length === 0) {
      throw new Error(
        `Dataset fixture ${sourceFixture.code} must declare at least one resource type.`,
      )
    }
    fixtures.push({
      ...sourceFixture,
      type: resourceTypes[0] as string,
    } satisfies DatasetFixture)
  }

  return fixtures.sort((left, right) => left.code.localeCompare(right.code))
}

/**
 * Reads the currently declared materialisation edges from API compositions.
 * Dataset fixtures intentionally remain source-discovery metadata: they do
 * not define what other data must be loaded before they are processed.
 */
export async function loadCurrentCompositionIngestDependencies(): Promise<
  CompositionIngestDependency[]
> {
  const entries = await readdir(API_COMPOSITION_ROOT, { withFileTypes: true })
  const dependencies: CompositionIngestDependency[] = []

  for (const entry of entries.filter(
    entry => entry.isFile() && entry.name.endsWith('.json'),
  )) {
    const composition = JSON.parse(
      await readFile(resolve(API_COMPOSITION_ROOT, entry.name), 'utf8'),
    ) as ApiCompositionFixture
    if (composition.status !== 'current') continue

    for (const domain of composition.domains ?? []) {
      for (const member of domain.members) {
        for (const dependency of member.ingestDependencies ?? []) {
          dependencies.push({
            compositionCode: composition.code,
            consumer: {
              resourceType: member.resourceType,
              variant: member.variant ?? 'default',
            },
            domainCode: domain.code,
            provider: {
              resourceType: dependency.resourceType,
              variant: dependency.variant ?? 'default',
            },
          })
        }
      }
    }
  }

  return dependencies
}

/**
 * Expands a requested set with composition-declared prerequisites and returns
 * a deterministic topological ordering. An edge means that the provider must
 * be available before the consumer is materialised.
 */
export function orderDatasetsByCompositionDependencies(
  allDatasets: readonly DatasetFixture[],
  requestedDatasets: readonly DatasetFixture[],
  dependencies: readonly CompositionIngestDependency[],
): DatasetFixture[] {
  const datasetsByMember = new Map<string, DatasetFixture[]>()
  for (const dataset of allDatasets) {
    for (const member of datasetCompositionMembers(dataset)) {
      const matching = datasetsByMember.get(member) ?? []
      matching.push(dataset)
      datasetsByMember.set(member, matching)
    }
  }

  const selected = new Map(requestedDatasets.map(dataset => [dataset.code, dataset]))
  const providersByConsumer = new Map<string, Set<string>>()
  const queue = [...requestedDatasets]

  for (const dataset of queue) {
    const providerCodes = providersByConsumer.get(dataset.code) ?? new Set<string>()
    for (const member of datasetCompositionMembers(dataset)) {
      for (const dependency of dependencies.filter(
        candidate => compositionMemberKey(candidate.consumer) === member,
      )) {
        const providers = datasetsByMember.get(
          compositionMemberKey(dependency.provider),
        )
        if (!providers || providers.length === 0) {
          throw new Error(
            `Composition ${dependency.compositionCode}/${dependency.domainCode} requires ${formatCompositionMember(dependency.provider)}, but no dataset fixture provides it.`,
          )
        }
        for (const provider of providers) {
          if (provider.code !== dataset.code) providerCodes.add(provider.code)
          if (!selected.has(provider.code)) {
            selected.set(provider.code, provider)
            queue.push(provider)
          }
        }
      }
    }
    providersByConsumer.set(dataset.code, providerCodes)
  }

  const ordered: DatasetFixture[] = []
  const remaining = new Map(
    [...selected.values()].map(dataset => [dataset.code, dataset]),
  )
  const emitted = new Set<string>()

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(dataset =>
        [...(providersByConsumer.get(dataset.code) ?? [])].every(
          providerCode => emitted.has(providerCode) || !remaining.has(providerCode),
        ),
      )
      .sort((left, right) => left.code.localeCompare(right.code))
    if (ready.length === 0) {
      throw new Error(
        `Composition ingest dependencies contain a cycle: ${[...remaining.keys()].sort().join(', ')}.`,
      )
    }
    for (const dataset of ready) {
      remaining.delete(dataset.code)
      emitted.add(dataset.code)
      ordered.push(dataset)
    }
  }

  return ordered
}

function datasetCompositionMembers(dataset: DatasetFixture) {
  return (dataset.resourceTypes ?? (dataset.type ? [dataset.type] : [])).map(
    resourceType =>
      compositionMemberKey({
        resourceType,
        variant:
          resourceType === 'division' ||
          resourceType === 'divisionArea' ||
          resourceType === 'divisionBoundary'
            ? (dataset.sourceVariant ?? dataset.publisherCode)
            : 'default',
      }),
  )
}

function compositionMemberKey(member: Required<CompositionMemberReference>) {
  return `${member.resourceType}:${member.variant}`
}

function formatCompositionMember(member: Required<CompositionMemberReference>) {
  return `${member.resourceType}/${member.variant}`
}

export async function readUpdateState(): Promise<UpdateState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8')) as UpdateState
  } catch {
    return {}
  }
}

export async function writeUpdateState(state: UpdateState) {
  await mkdir(dirname(STATE_PATH), { recursive: true })
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export async function lookupDatasetUpdates(
  dataset: DatasetFixture,
  previous?: UpdateState[string],
  targetVersions?: ReadonlyMap<string, string | null>,
  force = false,
): Promise<DatasetUpdate[]> {
  const adapter = resolveLookupAdapter(dataset)
  if (!adapter) {
    return [
      {
        dataset,
        message: 'No source-specific lookup is registered yet.',
        sourceUrl: dataset.sourceUrl,
        sourceKey: dataset.code,
        status: 'manual',
      },
    ]
  }

  if (dataset.updatePolicy?.allowUpdates === false) {
    return [
      skippedUpdate(
        dataset,
        dataset.code,
        'Updates are disabled by the dataset update policy.',
      ),
    ]
  }

  const sourcePrevious = getSourceState(previous, dataset.code, dataset.code)
  if (!isCsdiDataset(dataset) && !isUpdateCheckDue(dataset, sourcePrevious, force)) {
    return [
      skippedUpdate(
        dataset,
        dataset.code,
        `Update check is throttled to ${dataset.updatePolicy?.checkFrequency ?? 'daily'}.`,
      ),
    ]
  }

  try {
    const targetVersion = targetVersions?.get(dataset.code)
    const targetBaseline =
      targetVersion === undefined
        ? previous
        : {
            ...previous,
            versionKey:
              targetVersion === null
                ? 'sha256:target-has-no-release'
                : normaliseDatasetVersion(dataset, targetVersion),
          }
    const result = await adapter({
      dataset,
      localVersion:
        targetVersion === undefined
          ? await readLatestLocalSourceVersion(dataset.code)
          : targetVersion === null
            ? undefined
            : normaliseDatasetVersion(dataset, targetVersion),
      previous: targetBaseline,
      force,
      targetVersions,
    })
    const checkedAt = new Date().toISOString()
    return (Array.isArray(result) ? result : [result]).map(update => ({
      ...update,
      sourceKey: update.sourceKey ?? dataset.code,
      checkedAt: update.status === 'skipped' ? update.checkedAt : checkedAt,
    }))
  } catch (error) {
    return [
      {
        dataset,
        message: error instanceof Error ? error.message : String(error),
        sourceUrl: dataset.sourceUrl,
        sourceKey: dataset.code,
        status: 'error',
      },
    ]
  }
}

export async function lookupDatasetUpdate(
  dataset: DatasetFixture,
  previous?: UpdateState[string],
  targetVersion?: string | null,
  force = false,
): Promise<DatasetUpdate> {
  return (
    await lookupDatasetUpdates(
      dataset,
      previous,
      targetVersion === undefined
        ? undefined
        : new Map([[dataset.code, targetVersion]]),
      force,
    )
  )[0] as DatasetUpdate
}

export function isUpdateCheckDue(
  dataset: DatasetFixture,
  previous?: UpdateSourceState,
  force = false,
  now = Date.now(),
) {
  if (force) return true
  if (!previous?.lastChecked) return true

  const lastChecked = Date.parse(previous.lastChecked)
  if (!Number.isFinite(lastChecked)) return true

  return now - lastChecked >= updateCheckIntervalMs(dataset)
}

export function shouldCheckDataset(
  dataset: DatasetFixture,
  previous?: UpdateStateEntry,
  force = false,
) {
  if (dataset.updatePolicy?.allowUpdates === false) return false

  return getDueUpdatePhases(dataset, previous, { force }).length > 0
}

export function getDueUpdatePhases(
  dataset: DatasetFixture,
  previous?: UpdateStateEntry,
  options: {
    force?: boolean
    hasTargetRelease?: boolean
    now?: number
  } = {},
) {
  const policy = dataset.releasePolicy
  if (!policy || dataset.updatePolicy?.allowUpdates === false) return []
  const now = options.now ?? Date.now()
  const phases: DatasetUpdatePhase[] = []

  if (
    isReleasePolicyCheckDue(
      policy.checks.newReleases,
      previous?.phaseChecks?.['new-releases'],
      { ...options, now },
    )
  ) {
    phases.push('new-releases')
  }
  if (
    isReleasePolicyCheckDue(policy.checks.revisions, previous?.phaseChecks?.revisions, {
      ...options,
      now,
    })
  ) {
    phases.push('revisions')
  }
  if (
    isReleasePolicyCheckDue(policy.checks.archives, previous?.phaseChecks?.archives, {
      ...options,
      now,
    })
  ) {
    phases.push('archives')
  }
  return phases
}

function isReleasePolicyCheckDue(
  check: DatasetUpdateCheck,
  previous: UpdatePhaseState | undefined,
  options: { force?: boolean; hasTargetRelease?: boolean; now: number },
) {
  if (check.trigger === 'never') return false
  if (options.force) return true
  if (check.trigger === 'on-discovery') return false
  if (check.trigger === 'initial-only') {
    return options.hasTargetRelease === false && !previous?.lastChecked
  }
  if (check.trigger === 'periodic') {
    return isFrequencyDue(check.frequency, previous?.lastChecked, options.now)
  }

  const releaseDate = readReleasePolicyDate(previous?.releaseLastRevisedAt)
  if (!Number.isFinite(releaseDate)) return true
  if (options.now - releaseDate < check.ageDays * 86_400_000) return false
  return isFrequencyDue(check.frequency, previous?.lastChecked, options.now)
}

function readReleasePolicyDate(value: string | undefined) {
  if (!value) return Number.NaN
  const date = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (date) return Date.parse(`${date[1]}-${date[2]}-${date[3]}T00:00:00.000Z`)
  return Date.parse(value)
}

function isFrequencyDue(
  frequency: DatasetUpdateCheckFrequency,
  lastChecked: string | undefined,
  now: number,
) {
  if (!lastChecked) return true
  const lastCheckedAt = Date.parse(lastChecked)
  if (!Number.isFinite(lastCheckedAt)) return true
  return now - lastCheckedAt >= updateCheckIntervalMs(frequency)
}

export function recordUpdatePhaseCheck(
  state: UpdateState,
  datasetCode: string,
  phase: DatasetUpdatePhase,
  input: Omit<UpdatePhaseState, 'lastChecked'> & { checkedAt: string },
) {
  const entry = state[datasetCode] ?? {}
  entry.phaseChecks = {
    ...entry.phaseChecks,
    [phase]: {
      lastChecked: input.checkedAt,
      releaseLastRevisedAt: input.releaseLastRevisedAt,
      sourceCursor: input.sourceCursor,
    },
  }
  state[datasetCode] = entry
}

export function recordUpdateState(
  state: UpdateState,
  datasetCode: string,
  update: DatasetUpdate,
) {
  if (!update.checkedAt || update.status === 'skipped') return

  const entry = state[datasetCode] ?? {}
  const sourceKey = update.sourceKey ?? datasetCode
  const sourceState: UpdateSourceState = {
    version: update.version,
    versionKey: update.versionKey,
    lastChecked: update.checkedAt,
    releaseLastRevisedAt: update.releaseLastRevisedAt,
    metadataLastRevisedAt: update.metadataLastRevisedAt,
    sourceCursor: update.sourceCursor,
  }

  entry.sourceChecks = {
    ...entry.sourceChecks,
    [sourceKey]: sourceState,
  }

  if (sourceKey === datasetCode) Object.assign(entry, sourceState)
  state[datasetCode] = entry
}

/** Records durable archive custody only after the mirror operation succeeds. */
export function recordUpdateArchiveMirror(
  state: UpdateState,
  datasetCode: string,
  update: DatasetUpdate,
) {
  if (!update.mirroredArchive) return
  const entry = state[datasetCode] ?? {}
  const sourceKey = update.sourceKey ?? datasetCode
  entry.archiveMirrors = {
    ...entry.archiveMirrors,
    [sourceKey]: {
      ...update.mirroredArchive,
      version: update.version,
      versionKey: update.versionKey,
    },
  }
  state[datasetCode] = entry
}

/** Records a database release only after its importer returned successfully. */
export function recordUpdateDatabaseImport(
  state: UpdateState,
  datasetCode: string,
  update: DatasetUpdate,
) {
  const entry = state[datasetCode] ?? {}
  const sourceKey = update.sourceKey ?? datasetCode
  entry.databaseImports = {
    ...entry.databaseImports,
    [sourceKey]: {
      importedAt: new Date().toISOString(),
      version: update.version,
      versionKey: update.versionKey,
    },
  }
  state[datasetCode] = entry
}

function updateCheckIntervalMs(input: DatasetUpdateCheckFrequency | DatasetFixture) {
  const frequency =
    typeof input === 'string' ? input : (input.updatePolicy?.checkFrequency ?? 'daily')
  switch (frequency) {
    case 'weekly':
      return 7 * 86_400_000
    case 'monthly':
      return 30 * 86_400_000
    case 'quarterly':
      return 91 * 86_400_000
    case 'daily':
    case undefined:
      return 86_400_000
  }
}

function getSourceState(
  previous: UpdateStateEntry | undefined,
  sourceKey: string,
  fallbackKey: string,
): UpdateSourceState | undefined {
  return (
    previous?.sourceChecks?.[sourceKey] ??
    (sourceKey === fallbackKey ? previous : undefined)
  )
}

function skippedUpdate(
  dataset: DatasetFixture,
  sourceKey: string,
  message: string,
): DatasetUpdate {
  return { dataset, sourceKey, status: 'skipped', message }
}

export function isNewUpdate(update: DatasetUpdate, previous?: UpdateState[string]) {
  return (
    update.status === 'new' &&
    Boolean(update.versionKey) &&
    update.versionKey !== previous?.versionKey
  )
}

export function datasetName(dataset: DatasetFixture) {
  return (
    dataset.i18n?.find(item => item.locale === 'en')?.name ??
    dataset.i18n?.[0]?.name ??
    dataset.code
  )
}

function requireSingleResourceType(dataset: DatasetFixture) {
  const resourceTypes = dataset.resourceTypes ?? (dataset.type ? [dataset.type] : [])
  if (resourceTypes.length !== 1) {
    throw new Error(
      `Dataset ${dataset.code} has multiple resource types; it requires a source-specific fan-out adapter.`,
    )
  }

  return resourceTypes[0] as string
}

function resolveLookupAdapter(dataset: DatasetFixture): LookupAdapter | undefined {
  if (dataset.publisherCode === 'overture') return lookupOverture
  if (dataset.publisherCode === 'hkgov-dpo') return lookupDataGovHk
  if (isCsdiDataset(dataset)) return lookupCsdi
  if (dataset.code === 'ds-hk-hkgov-landsd-street') return lookupLandsdStreet
  return undefined
}

function isCsdiDataset(dataset: DatasetFixture) {
  return Boolean(
    dataset.sourceUrl?.includes('portal.csdi.gov.hk') ||
      dataset.releases?.some(release =>
        release.sourceUrl?.includes('portal.csdi.gov.hk'),
      ),
  )
}

async function lookupLandsdStreet({
  dataset,
  previous,
  targetVersions,
}: LookupContext) {
  const sourceUrl = dataset.sourceUrl ?? LANDSD_STREET_NAMING_URL
  const chineseSourceUrl = sourceUrl.replace('/en/', '/tc/')
  const [englishPage, traditionalChinesePage] = await Promise.all([
    fetchText(sourceUrl),
    fetchText(chineseSourceUrl),
  ])
  const en = parseLandsdStreetSourcePage(englishPage.body, 'en')
  const zhHant = parseLandsdStreetSourcePage(traditionalChinesePage.body, 'zh-Hant')
  const notices = pairLandsdStreetNoticePages({ en, zhHant })
  const baseline = previous?.versionKey
    ? readStreetSourceDate(previous.versionKey)
    : dataset.lastUpdated
  const targetVersion = targetVersions?.get(dataset.code)
  const checkingTarget = targetVersion !== undefined
  const knownNoticeIds = new Set(previous?.sourceCursor ?? [])
  const newNotices = notices.filter(
    notice =>
      (!baseline || notice.publicationDate > baseline) &&
      (checkingTarget || !knownNoticeIds.has(notice.id)),
  )
  const checkedAt = new Date().toISOString()
  const sourceCursor = notices.map(notice => notice.id)
  if (newNotices.length === 0) {
    return {
      checkedAt,
      dataset,
      deferStateUntilProcessed: true,
      message: 'The bilingual LandsD pages contain no new immutable notice IDs.',
      releaseLastRevisedAt: en.lastModified,
      sourceCursor,
      sourceKey: dataset.code,
      sourceUrl,
      status: 'current',
      version: `${en.lastModified}.0`,
      versionKey: `${en.lastModified}.0`,
    } satisfies DatasetUpdate
  }

  const latestDate = newNotices
    .map(notice => notice.publicationDate)
    .sort()
    .at(-1)
  if (!latestDate) throw new Error('LandsD update did not contain a publication date.')
  const sourceVersion = `${latestDate}.0`
  return [
    {
      checkedAt,
      dataset,
      deferStateUntilProcessed: true,
      ingest: async target => {
        const result = await ingestLandsdStreetSource({
          // Ingestion always downloads the baseline and uses its content hash
          // to avoid duplicating an unchanged baseline source version.
          includeBaseline: true,
          noticeIds: newNotices.map(notice => notice.id),
          outputDir: resolve(
            REPO_ROOT,
            'data/hkgov/landsd/street',
            safeFilePart(sourceVersion),
          ),
          sourceUrl,
          target,
          promptForCuration: true,
        })
        await publishLandsdStreetReleasePayloads(target, result.releases, {
          invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
          releaseNotesUrl: sourceUrl,
        })
      },
      message: `${newNotices.length} paired LandsD notice row(s) through ${latestDate}; evidence and a single active-only street snapshot will be published together.`,
      releaseLastRevisedAt: en.lastModified,
      sourceCursor: [...knownNoticeIds, ...newNotices.map(notice => notice.id)].sort(),
      sourceKey: dataset.code,
      sourceUrl,
      status: 'new' as const,
      version: sourceVersion,
      versionKey: sourceVersion,
    } satisfies DatasetUpdate,
  ]
}

function readStreetSourceDate(versionKey: string) {
  return versionKey.match(/^(\d{4}-\d{2}-\d{2})/)?.[1]
}

async function lookupOverture({
  dataset,
  localVersion,
  previous,
  targetVersions,
}: LookupContext) {
  const targetHasNoRelease = targetVersions?.get(dataset.code) === null
  const sourceUrl = 'https://stac.overturemaps.org/catalog.json'
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`STAC request failed with HTTP ${response.status}.`)
  const payload = (await response.json()) as { latest?: unknown }
  if (typeof payload.latest !== 'string' || !payload.latest) {
    throw new Error('Overture STAC catalog did not contain a latest release.')
  }

  const s3Versions =
    dataset.releasePolicy?.archives.operation === 'overture-release-catalog'
      ? await listOverturistReleaseVersions()
      : []
  const version = s3Versions[0] ?? payload.latest
  const resourceType = requireSingleResourceType(dataset)
  const outputFileName = overtureOutputFileName(resourceType)
  const latestUpdate = createOvertureUpdate({
    dataset,
    version,
    localVersion: targetHasNoRelease ? undefined : localVersion,
    previous: targetHasNoRelease ? undefined : previous,
    outputFileName,
    resourceType,
    sourceUrl,
  })
  if (dataset.releasePolicy?.archives.operation !== 'overture-release-catalog') {
    return latestUpdate
  }

  const archiveUpdates = s3Versions
    .filter(archiveVersion => archiveVersion !== version)
    .map(archiveVersion => {
      const archiveLocalVersion = targetHasNoRelease
        ? undefined
        : (targetVersions?.get(archiveVersion) ??
          previous?.sourceChecks?.[archiveVersion]?.version)
      return createOvertureUpdate({
        dataset,
        version: archiveVersion,
        localVersion: archiveLocalVersion,
        previous: targetHasNoRelease
          ? undefined
          : previous?.sourceChecks?.[archiveVersion],
        outputFileName,
        resourceType,
        sourceUrl,
        phase: 'archives',
      })
    })

  if (targetHasNoRelease) {
    archiveUpdates.sort((left, right) => compareVersions(left.version, right.version))
  }

  return [latestUpdate, ...archiveUpdates]
}

function createOvertureUpdate({
  dataset,
  version,
  localVersion,
  previous,
  outputFileName,
  resourceType,
  sourceUrl,
  phase,
}: {
  dataset: DatasetFixture
  version: string
  localVersion?: string
  previous?: UpdateSourceState
  outputFileName: string
  resourceType: string
  sourceUrl: string
  phase?: DatasetUpdatePhase
}) {
  const downloadPath = resolve(
    REPO_ROOT,
    'data/overture',
    version,
    'divisions/China/Hong Kong',
    outputFileName,
  )
  const releaseCatalogUrl = `https://stac.overturemaps.org/${encodeURIComponent(version)}/catalog.json`
  return {
    ...(phase
      ? {
          deferStateUntilProcessed: true,
          phase,
          sourceKey: version,
          targetSourceKey: version,
        }
      : {}),
    dataset,
    status: resolveDatasetStatus({
      dataset,
      version,
      localVersion,
      previous,
      releaseLastRevisedAt: version,
    }),
    version,
    versionKey: version,
    sourceUrl,
    downloadUrl: releaseCatalogUrl,
    downloadPath,
    releaseLastRevisedAt: version,
    download: async () => downloadOverture(version, dataset.theme, outputFileName),
    ...(phase
      ? {}
      : {
          upload: {
            positionals: [],
            options: {
              region: dataset.regionCode,
              source: 'overture',
              'source-version': version,
              theme: dataset.theme,
              type: resourceType,
            },
          },
        }),
    message: phase
      ? `Overturist downloaded an archived Hong Kong ${dataset.theme} release.`
      : `Overturist downloaded the Hong Kong ${dataset.theme} release.`,
  } satisfies DatasetUpdate
}

export function buildOverturistCommand(version: string, theme: string) {
  return [
    process.execPath,
    OVERTURIST_ENTRYPOINT,
    'get',
    '--division',
    OVERTURE_HONG_KONG_DIVISION_ID,
    '--release',
    version,
    '--theme',
    theme,
    '--replace',
  ]
}

export function buildOverturistReleasesCommand() {
  return [process.execPath, OVERTURIST_ENTRYPOINT, 'releases', '--format', 'json']
}

async function listOverturistReleaseVersions() {
  const child = Bun.spawn(buildOverturistReleasesCommand(), {
    cwd: OVERTURIST_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`Overturist release listing failed: ${stderr.trim() || exitCode}`)
  }
  const payload = JSON.parse(stdout) as { versions?: unknown }
  if (!Array.isArray(payload.versions)) {
    throw new Error('Overturist release listing did not return a versions array.')
  }
  const versions = payload.versions.filter(
    (candidate): candidate is string =>
      typeof candidate === 'string' && /^20\d{2}-\d{2}-\d{2}\.\d+$/.test(candidate),
  )
  if (versions.length !== payload.versions.length) {
    throw new Error('Overturist release listing returned an invalid version.')
  }
  return versions
}

async function downloadOverture(
  version: string,
  theme: string,
  outputFileName: string,
) {
  const jobKey = `${version}:${theme}`
  const existingJob = overtureDownloadJobs.get(jobKey)
  const releaseRoot = existingJob ?? runOverturist(version, theme)
  if (!existingJob) overtureDownloadJobs.set(jobKey, releaseRoot)
  return resolve(await releaseRoot, outputFileName)
}

function overtureOutputFileName(type: string) {
  const featureType = {
    division: 'division',
    divisionArea: 'division_area',
    divisionBoundary: 'division_boundary',
    place: 'place',
  }[type]
  if (!featureType) throw new Error(`Unsupported Overture dataset type: ${type}.`)
  return `${featureType}.division.intersects.clipSmart.parquet`
}

async function runOverturist(version: string, theme: string) {
  const stagingRoot = await mkdtemp(join(tmpdir(), 'saanseoi-overturist-'))
  const stagedRelease = resolve(
    stagingRoot,
    'data',
    version,
    'divisions/China/Hong Kong',
  )
  const targetRelease = resolve(
    REPO_ROOT,
    'data/overture',
    version,
    'divisions/China/Hong Kong',
  )

  try {
    const child = Bun.spawn(buildOverturistCommand(version, theme), {
      cwd: stagingRoot,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    const exitCode = await child.exited
    if (exitCode !== 0) {
      throw new Error(`Overturist failed with exit code ${exitCode}.`)
    }

    await cp(stagedRelease, targetRelease, { recursive: true, force: true })
    return targetRelease
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

async function lookupCsdi(context: LookupContext): Promise<DatasetUpdate[]> {
  const { dataset } = context
  const archiveUpdates = await lookupCsdiArchives(context)
  const missingTargetArchiveUpdates = archiveUpdates.filter(
    update =>
      context.targetVersions?.get(update.targetSourceKey ?? dataset.code) === null,
  )
  const bootstrapUpdates = selectCsdiBootstrapUpdates(
    dataset,
    missingTargetArchiveUpdates,
  )
  const reportedTargetArchiveUpdates = archiveUpdates.filter(
    update =>
      context.targetVersions?.get(update.targetSourceKey ?? dataset.code) !== null,
  )

  // CSDI's archive catalogue supplies the publisher package for every known
  // snapshot, including the latest available one. Prefer it over the WFS and
  // file-api conversion paths whenever it exists.
  if (reportedTargetArchiveUpdates.length > 0) {
    const pendingUpdates = reportedTargetArchiveUpdates.filter(
      update => update.status !== 'current' && !update.isKnownIdenticalArchive,
    )
    if (pendingUpdates.length > 0) return [...bootstrapUpdates, ...pendingUpdates]

    return [
      ...bootstrapUpdates,
      ...summariseSettledCsdiArchives(dataset, reportedTargetArchiveUpdates),
    ]
  }
  if (bootstrapUpdates.length > 0) return bootstrapUpdates
  return [
    {
      dataset,
      message:
        'CSDI did not expose a publisher archive for this dataset. The updater will not fall back to a converted WFS or GeoJSON delivery.',
      sourceKey: dataset.code,
      sourceUrl: dataset.sourceUrl,
      status: 'manual',
    } satisfies DatasetUpdate,
  ]
}

function selectCsdiBootstrapUpdates(
  dataset: DatasetFixture,
  archiveUpdates: DatasetUpdate[],
) {
  const groups = new Map<string, DatasetUpdate[]>()
  for (const update of archiveUpdates) {
    const key = update.targetSourceKey ?? dataset.code
    groups.set(key, [...(groups.get(key) ?? []), update])
  }

  return [...groups.values()]
    .toSorted((left, right) =>
      compareVersions(left[0]?.version ?? '', right[0]?.version ?? ''),
    )
    .map(updates => {
      // A target that has no release for this cohort must be rebuilt from its
      // newest available publisher archive. Static cohorts still receive
      // revised archive slots: selecting their earliest slot can replay an
      // incomplete historical extract or an archive the publisher no longer
      // serves.
      const representative = updates
        .toSorted((left, right) =>
          compareVersions(left.version ?? '', right.version ?? ''),
        )
        .at(-1) as DatasetUpdate

      return {
        ...representative,
        status: 'new' as const,
        message: `Rebuilding the reset target from the ${representative.targetSourceKey ?? dataset.code} source release.`,
      }
    })
}

async function lookupCsdiArchives(context: LookupContext): Promise<DatasetUpdate[]> {
  const { dataset } = context
  const archiveSources = [
    ...(dataset.sourceUrl ? [dataset.sourceUrl] : []),
    ...(dataset.releases?.flatMap(release =>
      release.sourceUrl ? [release.sourceUrl] : [],
    ) ?? []),
  ]
  const archiveCatalogues = [
    ...new Map(
      archiveSources
        .map(sourceUrl => [readDatasetId(sourceUrl), sourceUrl] as const)
        .filter(
          (entry): entry is readonly [string, string] => typeof entry[0] === 'string',
        ),
    ).entries(),
  ]
  if (archiveCatalogues.length === 0) return []

  const sourceLayers =
    dataset.sourceLayers ?? (dataset.sourceLayer ? [dataset.sourceLayer] : [])
  const result = await Promise.all(
    archiveCatalogues.map(async ([datasetId, archiveSourceUrl]) => ({
      archiveSourceUrl,
      datasetId,
      sources: await fetchCsdiArchivedSources(datasetId),
    })),
  )

  return result.flatMap(({ archiveSourceUrl, datasetId, sources }) =>
    sources.map(source => {
      const sourceKey = `archive:${datasetId}:${source.releaseSlot}`
      const previous = getSourceState(context.previous, sourceKey, dataset.code)
      const versionKey = readCsdiArchiveObjectHash(source.sourceUrl)
      const release = findCsdiDatasetRelease(
        dataset,
        archiveSourceUrl,
        source.releaseSlot,
        versionKey,
      )
      const version = resolveCsdiArchiveDatasetVersion(
        dataset,
        release,
        source.releaseSlot,
        previous,
        versionKey,
      )
      const targetVersion = context.targetVersions?.get(
        release?.sourceVersion ?? dataset.code,
      )
      const archive: CsdiSourceArchive = {
        datasetCode: dataset.code,
        datasetId,
        releaseSlot: source.releaseSlot,
        sourceFormat: source.sourceFormat,
        ...(sourceLayers.length > 0 ? { sourceLayers } : {}),
        sourceUrl: source.sourceUrl,
      }
      const archiveRoot = resolve(
        REPO_ROOT,
        'data/hkgov/csdi/archive',
        safeFilePart(datasetId),
        safeFilePart(source.releaseSlot),
      )
      const downloadedPath = join(archiveRoot, 'publisher-download')
      const sourcePath = join(archiveRoot, 'source.zip')

      return {
        archive,
        dataset,
        downloadPath: sourcePath,
        downloadUrl: source.sourceUrl,
        isKnownIdenticalArchive: isKnownIdenticalCsdiArchive(
          release,
          source.releaseSlot,
          versionKey,
        ),
        message: `CSDI archived publisher ${source.sourceFormat ?? 'source'} package for ${source.releaseSlot}; it will be mirrored even if its semantic content is unchanged.`,
        releaseLastRevisedAt: source.releaseSlot,
        sourceCursor: [source.sourceUrl],
        sourceKey,
        sourceUrl: archiveSourceUrl,
        // A target with no release for this source cohort must be rebuilt even
        // when the operator's local update state already contains the archive.
        status:
          targetVersion === null || previous?.versionKey !== versionKey
            ? 'new'
            : 'current',
        targetSourceKey: release?.sourceVersion ?? dataset.code,
        ...(version ? { version } : {}),
        versionKey,
        download: async () => {
          const originalFileName = await downloadCsdiArchive(
            source.sourceUrl,
            downloadedPath,
          )
          const prepared = await prepareCsdiSourceArchive({
            archive,
            inputPath: downloadedPath,
            originalFileName,
            outputPath: sourcePath,
          })
          if (resolve(downloadedPath) !== resolve(sourcePath)) {
            await rm(downloadedPath, { force: true })
          }
          return prepared.sourcePath
        },
        postArchiveIngest: async (target, prepared, skipConfirm) =>
          runCsdiArchiveIngestPlaceholder(
            dataset,
            release,
            target,
            prepared,
            skipConfirm,
          ),
        ...(release
          ? {
              recordIdenticalArchive: async (contentHash: string) => {
                await recordIdenticalCsdiArchiveSlot({
                  contentHash,
                  datasetCode: dataset.code,
                  release,
                  releaseSlot: source.releaseSlot,
                  sourceObjectHash: versionKey.replace(/^sha256:/, ''),
                })
              },
            }
          : {}),
      } satisfies DatasetUpdate
    }),
  )
}

async function runCsdiArchiveIngestPlaceholder(
  dataset: DatasetFixture,
  release: DatasetRelease | undefined,
  target: import('../cli/options.ts').UploadTarget,
  prepared: PreparedSourceArchive,
  skipConfirm: boolean,
): Promise<'ingested' | 'not-implemented'> {
  const plandKind =
    dataset.code === 'ds-hk-hkgov-pland-division-pu'
      ? 'pu'
      : dataset.code === 'ds-hk-hkgov-pland-division-new-town'
        ? 'new-town'
        : null
  if (plandKind && release?.sourceVersion && release.sourceUrl) {
    const child = Bun.spawn(
      buildHkgovPlandArchiveIngestCommand({
        inputFile: prepared.sourcePath,
        kind: plandKind,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) {
      throw new Error(
        `Planning Department ${plandKind} archive ingest failed for ${release.sourceVersion}.`,
      )
    }
    return 'ingested'
  }

  if (
    dataset.code === 'ds-hk-hkgov-censtatd-division-area-district' &&
    (release?.sourceVersion === '2016' || release?.sourceVersion === '2021') &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovCenstatdDistrictArchiveIngestCommand({
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) {
      throw new Error(`C&SD district-area ingest failed for ${release.sourceVersion}.`)
    }
    return 'ingested'
  }

  if (
    dataset.code ===
      'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district' &&
    (release?.sourceVersion === '2022' || release?.sourceVersion === '2024') &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovCenstatdDistrictStatisticArchiveIngestCommand({
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
        yes: skipConfirm,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) {
      throw new Error(
        `C&SD district-density ingest failed for ${release.sourceVersion}.`,
      )
    }
    return 'ingested'
  }

  if (
    isHkgovCenstatdStatisticDataset(dataset.code) &&
    release?.sourceVersion &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovCenstatdStatisticsArchiveIngestCommand({
        datasetCode: dataset.code,
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
        yes: skipConfirm,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0)
      throw new Error(`C&SD statistic ingest failed for ${dataset.code}.`)
    return 'ingested'
  }

  if (
    dataset.code === 'ds-hk-hkgov-had-division-area-district' &&
    release?.sourceVersion &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovHadDistrictArchiveIngestCommand({
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0)
      throw new Error(`HAD district-area ingest failed for ${release.sourceVersion}.`)
    return 'ingested'
  }

  if (
    isHkgovHydStreetDataset(dataset.code) &&
    release?.sourceVersion &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovHydStreetArchiveIngestCommand({
        datasetCode: dataset.code,
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) {
      throw new Error(`HyD street ingest failed for ${dataset.code}.`)
    }
    return 'ingested'
  }

  if (
    dataset.code === 'ds-hk-hkgov-landsd-division' &&
    release?.sourceVersion &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovLandsdPlaceNameArchiveIngestCommand({
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) {
      throw new Error(`LandsD Place Name ingest failed for ${release.sourceVersion}.`)
    }
    return 'ingested'
  }

  if (
    dataset.code === 'ds-hk-hkgov-landsd-road-centreline' &&
    release?.sourceVersion &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovLandsdRoadCentrelineArchiveIngestCommand({
        inputFile: prepared.sourcePath,
        releaseNotesUrl: release.sourceUrl,
        sourceArchiveKey: prepared.manifest.archive.objectKey,
        sourceArchiveSha256: prepared.manifest.archive.sha256,
        sourceVersion: release.sourceVersion,
        target,
      }),
      { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) {
      throw new Error(
        `LandsD Road Centreline ingest failed for ${release.sourceVersion}.`,
      )
    }
    return 'ingested'
  }

  console.log(
    `NOT IMPLEMENTED: native CSDI archive ingestion for ${dataset.code}${release?.sourceVersion ? ` (${release.sourceVersion})` : ''}.`,
  )
  return 'not-implemented'
}

export function buildHkgovPlandArchiveIngestCommand(input: {
  inputFile: string
  kind: 'new-town' | 'pu'
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
  target: import('../cli/options.ts').UploadTarget
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-pland:ingest',
    '--kind',
    input.kind,
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
  ]
}

/** Starts density intake from the local archive prepared by this updater run. */
export function buildHkgovCenstatdDistrictStatisticArchiveIngestCommand(input: {
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: '2022' | '2024'
  target: import('../cli/options.ts').UploadTarget
  yes: boolean
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-censtatd:district-land-area-population-density',
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
    ...(input.yes ? ['--yes'] : []),
  ]
}

export function buildHkgovCenstatdDistrictArchiveIngestCommand(input: {
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: '2016' | '2021'
  target: import('../cli/options.ts').UploadTarget
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-censtatd:district-area',
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
  ]
}

const HKGOV_CENSTATD_STATISTIC_DATASETS = new Set([
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-2021',
  'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates-2021',
  'ds-hk-hkgov-censtatd-division-statistic-new-towns-2021',
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-area-type',
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters-district',
  'ds-hk-hkgov-censtatd-division-statistic-population-households-district',
  'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
])

function isHkgovCenstatdStatisticDataset(code: string) {
  return HKGOV_CENSTATD_STATISTIC_DATASETS.has(code)
}

const HKGOV_HYD_STREET_DATASETS = new Set([
  'ds-hk-hkgov-hyd-street',
  'ds-hk-hkgov-hyd-sensitive-street',
  'ds-hk-hkgov-hyd-strategic-street',
  'ds-hk-hkgov-hyd-pedestrian-street',
])

function isHkgovHydStreetDataset(code: string) {
  return HKGOV_HYD_STREET_DATASETS.has(code)
}

export function buildHkgovHydStreetArchiveIngestCommand(input: {
  datasetCode: string
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
  target: import('../cli/options.ts').UploadTarget
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-hyd:street',
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--dataset-code',
    input.datasetCode,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
  ]
}

export function buildHkgovLandsdPlaceNameArchiveIngestCommand(input: {
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
  target: import('../cli/options.ts').UploadTarget
}) {
  return buildHkgovLandsdNativeArchiveIngestCommand('hkgov-landsd:place-name', input)
}

export function buildHkgovLandsdRoadCentrelineArchiveIngestCommand(input: {
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
  target: import('../cli/options.ts').UploadTarget
}) {
  return buildHkgovLandsdNativeArchiveIngestCommand(
    'hkgov-landsd:road-centreline',
    input,
  )
}

function buildHkgovLandsdNativeArchiveIngestCommand(
  command: 'hkgov-landsd:place-name' | 'hkgov-landsd:road-centreline',
  input: {
    inputFile: string
    releaseNotesUrl: string
    sourceArchiveKey: string
    sourceArchiveSha256: string
    sourceVersion: string
    target: import('../cli/options.ts').UploadTarget
  },
) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    command,
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
  ]
}

export function buildHkgovCenstatdStatisticsArchiveIngestCommand(input: {
  datasetCode: string
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
  target: import('../cli/options.ts').UploadTarget
  yes: boolean
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-censtatd:statistics',
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--dataset-code',
    input.datasetCode,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
    ...(input.yes ? ['--yes'] : []),
  ]
}

export function buildHkgovHadDistrictArchiveIngestCommand(input: {
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: string
  target: import('../cli/options.ts').UploadTarget
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-had:district-area',
    input.inputFile,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--source-version',
    input.sourceVersion,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
  ]
}

function resolveCsdiArchiveDatasetVersion(
  dataset: DatasetFixture,
  release: DatasetRelease | undefined,
  releaseSlot: string,
  previous: UpdateSourceState | undefined,
  versionKey: string,
) {
  // CSDI's quarter is an archive slot, rather than a dataset release version.
  // It becomes the release basis only for datasets explicitly configured to
  // publish on a quarterly cadence.
  if (release?.sourceVersion) {
    return normaliseDatasetVersion(dataset, release.sourceVersion)
  }
  if (dataset.versionPolicy.scheme !== 'quarterly') return undefined

  const version = normaliseDatasetVersion(dataset, releaseSlot)
  if (previous?.versionKey === versionKey && previous.version) return previous.version
  const base = quarterlyVersionBase(version)
  if (!previous?.version || quarterlyVersionBase(previous.version) !== base) {
    return version
  }

  const previousCorrection = readVersionCorrection(previous.version, base) ?? 0
  return `${base}.${previousCorrection + 1}`
}

function findCsdiDatasetRelease(
  dataset: DatasetFixture,
  archiveSourceUrl: string,
  releaseSlot: string,
  sourceObjectHash: string,
) {
  const releases = dataset.releases ?? []
  const matchingReleases = releases.filter(
    release => !release.sourceUrl || release.sourceUrl === archiveSourceUrl,
  )
  const archiveMatch = matchingReleases.find(release =>
    release.archiveSlots?.some(
      archive =>
        archive.releaseSlot === releaseSlot &&
        `sha256:${archive.sourceObjectHash}` === sourceObjectHash,
    ),
  )
  if (archiveMatch) return archiveMatch

  return (
    matchingReleases.find(release => release.sourceUrl === archiveSourceUrl) ??
    (matchingReleases.length === 1 ? matchingReleases[0] : undefined)
  )
}

function isKnownIdenticalCsdiArchive(
  release: DatasetRelease | undefined,
  releaseSlot: string,
  sourceObjectHash: string,
) {
  return release?.identicalArchiveSlots?.some(
    archive =>
      archive.releaseSlot === releaseSlot &&
      `sha256:${archive.sourceObjectHash}` === sourceObjectHash,
  )
}

async function recordIdenticalCsdiArchiveSlot(input: {
  contentHash: string
  datasetCode: string
  release: DatasetRelease
  releaseSlot: string
  sourceObjectHash: string
}) {
  // An archive slot becomes suppressible only after the downloaded publisher
  // bytes match a byte hash already recorded for this source release.
  if (
    !input.release.archiveSlots?.some(slot => slot.contentHash === input.contentHash)
  ) {
    return
  }
  if (
    input.release.identicalArchiveSlots?.some(
      slot =>
        slot.releaseSlot === input.releaseSlot &&
        slot.sourceObjectHash === input.sourceObjectHash,
    )
  ) {
    return
  }

  const fixturePath = await findDatasetFixturePath(input.datasetCode)
  if (!fixturePath) return
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as DatasetFixture
  const release = fixture.releases?.find(
    candidate =>
      candidate.sourceVersion === input.release.sourceVersion &&
      candidate.sourceUrl === input.release.sourceUrl,
  )
  if (!release?.archiveSlots?.some(slot => slot.contentHash === input.contentHash)) {
    return
  }

  const slot = {
    contentHash: input.contentHash,
    releaseSlot: input.releaseSlot,
    sourceObjectHash: input.sourceObjectHash,
  }
  if (
    release.identicalArchiveSlots?.some(
      candidate =>
        candidate.releaseSlot === slot.releaseSlot &&
        candidate.sourceObjectHash === slot.sourceObjectHash,
    )
  ) {
    return
  }

  release.identicalArchiveSlots = [...(release.identicalArchiveSlots ?? []), slot].sort(
    (left, right) => left.releaseSlot.localeCompare(right.releaseSlot),
  )
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  input.release.identicalArchiveSlots = [
    ...(input.release.identicalArchiveSlots ?? []),
    slot,
  ]
}

async function findDatasetFixturePath(datasetCode: string) {
  const entries = await readdir(DATASET_ROOT, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = resolve(DATASET_ROOT, entry.name)
    const fixture = JSON.parse(await readFile(path, 'utf8')) as { code?: unknown }
    if (fixture.code === datasetCode) return path
  }
  return undefined
}

function summariseSettledCsdiArchives(
  dataset: DatasetFixture,
  archiveUpdates: DatasetUpdate[],
) {
  const groups = new Map<string, DatasetUpdate[]>()

  for (const update of archiveUpdates) {
    const key = update.targetSourceKey ?? dataset.code
    groups.set(key, [...(groups.get(key) ?? []), update])
  }

  return [...groups.values()].map(updates => {
    const first = updates[0] as DatasetUpdate
    const representative =
      dataset.releasePolicy?.series === 'rolling'
        ? (updates
            .toSorted((left, right) =>
              compareVersions(left.version ?? '', right.version ?? ''),
            )
            .at(-1) as DatasetUpdate)
        : first
    const archiveCount = updates.length
    const knownNoOpCount = updates.filter(
      update => update.isKnownIdenticalArchive,
    ).length
    return {
      dataset,
      message:
        knownNoOpCount === archiveCount
          ? `${archiveCount} CSDI archive slot${archiveCount === 1 ? '' : 's'} match the fixture's recorded identical publisher artefact${archiveCount === 1 ? '' : 's'}.`
          : `${archiveCount} CSDI archive slot${archiveCount === 1 ? '' : 's'} are already current.`,
      sourceKey: `archive-summary:${representative.targetSourceKey ?? dataset.code}`,
      sourceUrl: representative.sourceUrl,
      phase: 'archives',
      status: 'current',
      targetSourceKey: representative.targetSourceKey ?? dataset.code,
      ...(representative.version ? { version: representative.version } : {}),
    } satisfies DatasetUpdate
  })
}

async function downloadCsdiArchive(url: string, targetPath: string) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  assertCsdiArchiveDownload(bytes, response.headers.get('content-type'), url)
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, bytes)
  return readContentDispositionFileName(response.headers.get('content-disposition'))
}

export function assertCsdiArchiveDownload(
  bytes: Uint8Array,
  contentType: string | null,
  url: string,
) {
  const prefix = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart()
  const isHtml =
    contentType?.toLowerCase().includes('text/html') ||
    /^<!doctype\s+html\b|^<html\b/i.test(prefix)
  if (isHtml) {
    throw new Error(
      `CSDI archive download returned an HTML failure page instead of the source file: ${url}`,
    )
  }
}

function readContentDispositionFileName(value: string | null) {
  if (!value) return undefined
  const encoded = value.match(/\bfilename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded).replaceAll(/[\\/]/g, '_')
    } catch {
      // Fall through to filename when a publisher sends malformed RFC 5987.
    }
  }
  return value
    .match(/\bfilename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i)
    ?.slice(1)
    .find(Boolean)
    ?.replaceAll(/[\\/]/g, '_')
}

export async function fetchCsdiArchivedSources(datasetId: string) {
  const response = await fetchText(
    `https://portal.csdi.gov.hk/csdi-webpage/archivedDatasetFileList/${encodeURIComponent(datasetId)}`,
  )
  return readCsdiArchivedSources(JSON.parse(response.body))
}

export function readCsdiArchivedSources(payload: unknown): CsdiArchivedSource[] {
  if (!isRecord(payload) || !Array.isArray(payload.archivedDatasetVersionList)) {
    return []
  }
  const formatByPosition = new Map<number, string>()
  const sourceFormats = isRecord(payload.archivedDatasetFileFormatListVO)
    ? payload.archivedDatasetFileFormatListVO.sourceFormat
    : undefined
  if (Array.isArray(sourceFormats)) {
    for (const format of sourceFormats) {
      if (!isRecord(format)) continue
      if (typeof format.pos === 'number' && typeof format.fileType === 'string') {
        formatByPosition.set(format.pos, format.fileType)
      }
    }
  }

  return payload.archivedDatasetVersionList
    .filter(isRecord)
    .flatMap(version => {
      const year = version.year
      const quarter = version.quarter
      if (
        (typeof year !== 'number' && typeof year !== 'string') ||
        (typeof quarter !== 'number' && typeof quarter !== 'string') ||
        !Array.isArray(version.fileList)
      ) {
        return []
      }
      const source = version.fileList
        .filter(isRecord)
        .find(file => file.sourceFormat === true && typeof file.url === 'string')
      if (!source || typeof source.url !== 'string') return []
      const releaseSlot = `${year}-Q${quarter}`
      if (!/^\d{4}-Q[1-4]$/.test(releaseSlot)) return []
      return [
        {
          releaseSlot,
          ...(typeof source.pos === 'number' && formatByPosition.has(source.pos)
            ? { sourceFormat: formatByPosition.get(source.pos) }
            : {}),
          sourceUrl: source.url,
        },
      ]
    })
    .sort((left, right) => left.releaseSlot.localeCompare(right.releaseSlot))
}

function readCsdiArchiveObjectHash(url: string) {
  const key = new URL(url).pathname.split('/').at(-1)?.toLowerCase()
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    throw new Error(`CSDI archive URL does not contain a SHA-256 object key: ${url}`)
  }
  return `sha256:${key}`
}

async function lookupDataGovHk({
  dataset,
  localVersion,
  previous,
  targetVersions,
}: LookupContext) {
  const sourceUrl = dataset.sourceUrl
  if (!sourceUrl) throw new Error('The DATA.GOV.HK dataset has no catalogue URL.')

  const today = new Date()
  const end = formatDate(new Date(today.getTime() - 86_400_000))
  const start = formatDate(new Date(today.getTime() - 370 * 86_400_000))
  const archiveUrl = new URL(
    'https://api.data.gov.hk/v1/historical-archive/list-file-versions',
  )
  archiveUrl.search = new URLSearchParams({
    start,
    end,
    url: DATA_GOV_HK_ALS_RESOURCE_URL,
  }).toString()
  const archiveTimestamps = findArchiveTimestamps(
    await fetchJsonWithRetry(archiveUrl.toString()),
  )
  if (archiveTimestamps.length === 0) {
    return {
      dataset,
      status: 'manual',
      sourceUrl,
      message: 'The historical archive returned no ALS release timestamp.',
    } satisfies DatasetUpdate
  }

  const versions = resolveDataGovArchiveVersions(archiveTimestamps)
  const latestTimestamp = archiveTimestamps.at(-1)
  const latestVersion = latestTimestamp ? versions.get(latestTimestamp) : undefined
  if (!latestTimestamp || !latestVersion) {
    throw new Error('The DATA.GOV.HK archive response did not include a version.')
  }
  const latestUpdate = createDataGovHkUpdate({
    dataset,
    sourceUrl,
    timestamp: latestTimestamp,
    version: latestVersion,
    localVersion,
    previous,
    ingest: true,
  })
  const archiveUpdates = archiveTimestamps
    .filter(timestamp => timestamp !== latestTimestamp)
    .flatMap(timestamp => {
      const version = versions.get(timestamp)
      if (!version) return []
      const archiveLocalVersion =
        targetVersions?.get(version) ?? previous?.sourceChecks?.[version]?.version
      const update = createDataGovHkUpdate({
        dataset,
        sourceUrl,
        timestamp,
        version,
        localVersion: archiveLocalVersion,
        previous: previous?.sourceChecks?.[version],
        phase: 'archives',
      })
      return [update]
    })
  return [latestUpdate, ...archiveUpdates]
}

function createDataGovHkUpdate({
  dataset,
  sourceUrl,
  timestamp,
  version,
  localVersion,
  previous,
  phase,
  ingest,
}: {
  dataset: DatasetFixture
  sourceUrl: string
  timestamp: string
  version: string
  localVersion?: string
  previous?: UpdateSourceState
  phase?: DatasetUpdatePhase
  ingest?: boolean
}) {
  const downloadUrl = new URL('https://api.data.gov.hk/v1/historical-archive/get-file')
  downloadUrl.search = new URLSearchParams({
    time: timestamp,
    url: DATA_GOV_HK_ALS_RESOURCE_URL,
  }).toString()
  const downloadPath = resolve(
    REPO_ROOT,
    'data/hkgov/dpo/ALS',
    `${safeFilePart(version)}-ALS.zip`,
  )
  return {
    ...(phase
      ? {
          deferStateUntilProcessed: true,
          phase,
          sourceKey: version,
          targetSourceKey: version,
        }
      : {}),
    dataset,
    status: resolveDatasetStatus({
      dataset,
      version,
      localVersion,
      previous,
      releaseLastRevisedAt: timestamp,
    }),
    version,
    versionKey: version,
    sourceUrl,
    downloadUrl: downloadUrl.toString(),
    downloadPath,
    releaseLastRevisedAt: timestamp,
    ...(ingest
      ? {
          ingest: async (target: import('../cli/options.ts').UploadTarget) =>
            ingestDataGovHkAlsRelease({
              downloadPath,
              downloadUrl: downloadUrl.toString(),
              target,
              timestamp,
              version,
            }),
        }
      : {
          download: async () => downloadResponse(downloadUrl.toString(), downloadPath),
        }),
    message: ingest
      ? 'ALS will be unpacked and identity-reviewed locally, then uploaded to the selected target.'
      : 'Archived ALS package available; downloading it does not upload it.',
  } satisfies DatasetUpdate
}

/** Maps chronological DATA.GOV.HK delivery timestamps to release-date corrections. */
function resolveDataGovArchiveVersions(timestamps: readonly string[]) {
  const correctionByDate = new Map<string, number>()
  const versions = new Map<string, string>()
  for (const timestamp of [...timestamps].sort()) {
    const releaseDate = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`
    const correction = correctionByDate.get(releaseDate) ?? 0
    correctionByDate.set(releaseDate, correction + 1)
    versions.set(timestamp, `${releaseDate}.${correction}`)
  }
  return versions
}

async function ingestDataGovHkAlsRelease({
  downloadPath,
  downloadUrl,
  target,
  timestamp,
  version,
}: {
  downloadPath: string
  downloadUrl: string
  target: import('../cli/options.ts').UploadTarget
  timestamp: string
  version: string
}) {
  await downloadResponse(downloadUrl, downloadPath)
  const sourceRoot = resolve(REPO_ROOT, 'data/hkgov/dpo/ALS')
  const sourceDir = resolve(sourceRoot, `${timestamp}-ALS-GeoJSON`)
  await mkdir(sourceDir, { recursive: true })
  const unzip = Bun.spawn(['unzip', '-q', '-n', downloadPath, '-d', sourceDir], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if ((await unzip.exited) !== 0) {
    throw new Error(`Could not unpack ALS release ${timestamp}.`)
  }
  const dataops = Bun.spawn(
    buildHkgovAlsIngestCommand({ sourceRoot, target, version }),
    { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
  )
  if ((await dataops.exited) !== 0) {
    throw new Error(`DPO ALS backfill failed for ${version}.`)
  }
}

export function buildHkgovAlsIngestCommand(input: {
  sourceRoot: string
  target: import('../cli/options.ts').UploadTarget
  version: string
}) {
  return [
    process.execPath,
    'run',
    '--silent',
    'dataops',
    '--',
    'hkgov-dpo:ingest',
    input.sourceRoot,
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--cohort-key',
    input.version,
    '--from-source-version',
    input.version,
  ]
}

async function fetchText(url: string): Promise<{ body: string; headers: Headers }> {
  const response = await fetchWithRetry(url)
  if (!response.ok)
    throw new Error(`Request failed with HTTP ${response.status}: ${url}`)
  return { body: await response.text(), headers: response.headers }
}

async function fetchJsonWithRetry(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchText(url)
      return JSON.parse(response.body) as unknown
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise(resolve => setTimeout(resolve, attempt * 250))
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(
    `Response was not valid JSON after ${attempts} attempts: ${url} (${reason})`,
  )
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!isRetryableStatus(response.status) || attempt === attempts) {
        return response
      }
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 250))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed after ${attempts} attempts: ${url}`)
}

function isRetryableStatus(status: number) {
  return status === 403 || status === 408 || status === 429 || status >= 500
}

async function readLatestLocalSourceVersion(
  datasetCode: string,
  sourceVersion?: string,
) {
  const releaseRoot = resolve(REPO_ROOT, 'fixtures/meta/releases', datasetCode)
  let entries: Array<{ isFile(): boolean; name: string }>
  try {
    entries = await readdir(releaseRoot, { withFileTypes: true })
  } catch {
    return undefined
  }

  const versions = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(async entry => {
        const content = await readFile(resolve(releaseRoot, entry.name), 'utf8')
        return content.match(/^sourceVersion:\s*["']([^"']+)["']/m)?.[1]
      }),
  )
  const filteredVersions = sourceVersion
    ? versions.filter(
        version =>
          version === sourceVersion || version?.startsWith(`${sourceVersion}.`),
      )
    : versions
  return filteredVersions
    .filter((version): version is string => Boolean(version))
    .sort(compareVersions)
    .at(-1)
}

function resolveDatasetStatus(input: {
  dataset: DatasetFixture
  version: string
  localVersion: string | undefined
  previous: UpdateState[string] | undefined
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
}): DatasetUpdate['status'] {
  const previousReleaseRevision =
    input.previous?.releaseLastRevisedAt ?? input.dataset.releaseLastRevisedAt
  if (
    input.dataset.releasePolicy?.revisionScope !== 'none' &&
    input.releaseLastRevisedAt &&
    previousReleaseRevision &&
    input.releaseLastRevisedAt !== previousReleaseRevision
  ) {
    return 'new'
  }

  const status = resolveReleaseStatus(input.version, input.localVersion, input.previous)
  const previousMetadataRevision =
    input.previous?.metadataLastRevisedAt ?? input.dataset.metadataLastRevisedAt
  if (
    status === 'current' &&
    input.metadataLastRevisedAt &&
    previousMetadataRevision &&
    input.metadataLastRevisedAt !== previousMetadataRevision
  ) {
    return 'review'
  }
  return status
}

function resolveReleaseStatus(
  version: string,
  localVersion: string | undefined,
  previous: UpdateState[string] | undefined,
): DatasetUpdate['status'] {
  const previousVersion = previous?.versionKey?.startsWith('sha256:')
    ? undefined
    : previous?.versionKey
  const baseline = previousVersion ?? localVersion
  if (!baseline) return 'new'
  return compareVersions(baseline, version) >= 0 ? 'current' : 'new'
}

function compareVersions(left: string, right: string) {
  return normaliseComparableVersion(left).localeCompare(
    normaliseComparableVersion(right),
    undefined,
    { numeric: true },
  )
}

function normaliseComparableVersion(value: string) {
  return /^\d{4}$/.test(value) ? `${value}.0` : value
}

export function normaliseDatasetVersion(dataset: DatasetFixture, value: string) {
  if (
    dataset.versionPolicy.correctionSuffixSource === 'generated' &&
    ((dataset.versionPolicy.scheme === 'reference-year' && /^\d{4}$/.test(value)) ||
      (['initial-release-date', 'reference-date', 'release-date'].includes(
        dataset.versionPolicy.scheme,
      ) &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
      (dataset.versionPolicy.scheme === 'quarterly' &&
        (/^\d{4}-Q[1-4]$/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value))))
  ) {
    if (dataset.versionPolicy.scheme === 'quarterly') {
      const match = value.match(/^(\d{4})-(?:Q([1-4])|(\d{2})-\d{2})$/)
      if (!match) return value
      const year = match[1] as string
      const quarter = match[2] ?? String(Math.ceil(Number(match[3]) / 3))
      return `${year}-Q${quarter}.0`
    }
    return `${value}.0`
  }
  return value
}

function quarterlyVersionBase(value: string) {
  return value.replace(/\.\d+$/, '')
}

export function resolveDatasetVersion(
  dataset: DatasetFixture,
  discoveredVersion: string | undefined,
  previous: UpdateState[string] | undefined,
  releaseLastRevisedAt?: string,
) {
  const policy = dataset.versionPolicy
  if (!discoveredVersion) return undefined
  const version = normaliseDatasetVersion(dataset, discoveredVersion)
  const releaseRevisionChanged =
    releaseLastRevisedAt &&
    previous?.releaseLastRevisedAt &&
    releaseLastRevisedAt !== previous.releaseLastRevisedAt

  if (
    policy.correctionSuffixSource !== 'generated' ||
    !releaseRevisionChanged ||
    !previous?.versionKey
  ) {
    return version
  }

  const base =
    policy.scheme === 'initial-release-date'
      ? previous.versionKey.replace(/\.\d+$/, '')
      : version.replace(/\.\d+$/, '')
  const previousBase = previous.versionKey.replace(/\.\d+$/, '')
  if (policy.scheme !== 'initial-release-date' && base !== previousBase) {
    return version
  }

  const previousCorrection = readVersionCorrection(previous.versionKey, base) ?? 0
  return `${base}.${previousCorrection + 1}`
}

function readVersionCorrection(version: string, base: string) {
  return Number(version.match(new RegExp(`^${base}\\.(\\d+)$`))?.[1]) || undefined
}

async function downloadResponse(url: string, targetPath: string) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`)
  await mkdir(dirname(targetPath), { recursive: true })
  const buffer = await response.arrayBuffer()
  await writeFile(targetPath, new Uint8Array(buffer))
  return targetPath
}

function readDatasetId(sourceUrl: string | undefined) {
  if (!sourceUrl) return undefined
  return new URL(sourceUrl).searchParams.get('datasetId') ?? undefined
}

function findArchiveTimestamps(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.timestamps)) return []
  return payload.timestamps
    .filter(
      (timestamp): timestamp is string =>
        typeof timestamp === 'string' && /^\d{8}-\d{4}$/.test(timestamp),
    )
    .sort()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10).replaceAll('-', '')
}

function safeFilePart(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/g, '_')
}
