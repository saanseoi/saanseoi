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
import { type CsdiSourceArchive, prepareCsdiSourceArchive } from './sourceArchives.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const DATASET_ROOT = resolve(REPO_ROOT, 'fixtures/meta/datasets')
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

export const datasetUpdateCheckFrequencies = ['daily', 'weekly', 'monthly'] as const

export type DatasetUpdateCheckFrequency = (typeof datasetUpdateCheckFrequencies)[number]

export type DatasetUpdatePolicy = {
  allowUpdates?: boolean
  checkFrequency?: DatasetUpdateCheckFrequency
}

export type DatasetVersionPolicy = {
  scheme:
    | 'reference-year'
    | 'initial-release-date'
    | 'reference-date'
    | 'release-date'
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
  publisherReleaseFrequency?: string
  updatePolicy?: DatasetUpdatePolicy
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
  theme: string
  i18n?: Array<{ locale: string; name?: string }>
}

export type UpdateUpload = {
  positionals: string[]
  options: Record<string, string | boolean>
}

export type DatasetUpdate = {
  archive?: CsdiSourceArchive
  deferStateUntilProcessed?: boolean
  dataset: DatasetFixture
  status: 'new' | 'current' | 'review' | 'manual' | 'skipped' | 'error'
  sourceKey?: string
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
}

export type UpdateSourceState = {
  versionKey?: string
  version?: string
  lastChecked?: string
  releaseLastRevisedAt?: string
  metadataLastRevisedAt?: string
  sourceCursor?: string[]
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

  const sourceKeys = dataset.releases?.length
    ? dataset.releases.map(
        (release, index) =>
          release.sourceVersion ?? release.sourceUrl ?? `release-${index}`,
      )
    : [dataset.code]

  return sourceKeys.some(sourceKey =>
    isUpdateCheckDue(dataset, getSourceState(previous, sourceKey, dataset.code), force),
  )
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

function updateCheckIntervalMs(dataset: DatasetFixture) {
  switch (dataset.updatePolicy?.checkFrequency) {
    case 'weekly':
      return 7 * 86_400_000
    case 'monthly':
      return 30 * 86_400_000
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
  if (isCsdiDataset(dataset)) return lookupCsdi
  if (dataset.publisherCode === 'hkgov-dpo') return lookupDataGovHk
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

async function lookupOverture({ dataset, localVersion, previous }: LookupContext) {
  const sourceUrl = 'https://stac.overturemaps.org/catalog.json'
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`STAC request failed with HTTP ${response.status}.`)
  const payload = (await response.json()) as { latest?: unknown }
  if (typeof payload.latest !== 'string' || !payload.latest) {
    throw new Error('Overture STAC catalog did not contain a latest release.')
  }

  const version = payload.latest
  const resourceType = requireSingleResourceType(dataset)
  const outputFileName = overtureOutputFileName(resourceType)
  const downloadPath = resolve(
    REPO_ROOT,
    'data/overture',
    version,
    'divisions/China/Hong Kong',
    outputFileName,
  )
  const releaseCatalogUrl = `https://stac.overturemaps.org/${encodeURIComponent(version)}/catalog.json`
  return {
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
    message: `Overturist downloaded the Hong Kong ${dataset.theme} release.`,
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
  // CSDI's archive catalogue supplies the publisher package for every known
  // snapshot, including the latest available one. Prefer it over the WFS and
  // file-api conversion paths whenever it exists.
  if (archiveUpdates.length > 0) return archiveUpdates
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
        message: `CSDI archived publisher ${source.sourceFormat ?? 'source'} package for ${source.releaseSlot}; it will be mirrored even if its semantic content is unchanged.`,
        releaseLastRevisedAt: source.releaseSlot,
        sourceCursor: [source.sourceUrl],
        sourceKey,
        sourceUrl: archiveSourceUrl,
        status: previous?.versionKey === versionKey ? 'current' : 'new',
        version: source.releaseSlot,
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
      } satisfies DatasetUpdate
    }),
  )
}

async function downloadCsdiArchive(url: string, targetPath: string) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`)
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, new Uint8Array(await response.arrayBuffer()))
  return readContentDispositionFileName(response.headers.get('content-disposition'))
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

async function lookupDataGovHk({ dataset, localVersion, previous }: LookupContext) {
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
  const archiveTimestamp = findLatestArchiveTimestamp(
    await fetchJsonWithRetry(archiveUrl.toString()),
  )
  if (!archiveTimestamp) {
    return {
      dataset,
      status: 'manual',
      sourceUrl,
      message: 'The historical archive returned no ALS release timestamp.',
    } satisfies DatasetUpdate
  }

  const releaseDate = `${archiveTimestamp.slice(0, 4)}-${archiveTimestamp.slice(
    4,
    6,
  )}-${archiveTimestamp.slice(6, 8)}`
  const version = resolveDatasetVersion(
    dataset,
    releaseDate,
    previous,
    archiveTimestamp,
  )
  if (!version)
    throw new Error('The DATA.GOV.HK archive response did not include a version.')
  const downloadUrl = new URL('https://api.data.gov.hk/v1/historical-archive/get-file')
  downloadUrl.search = new URLSearchParams({
    time: archiveTimestamp,
    url: DATA_GOV_HK_ALS_RESOURCE_URL,
  }).toString()
  const downloadPath = resolve(
    REPO_ROOT,
    'data/hkgov/dpo/ALS',
    `${safeFilePart(version)}-ALS.zip`,
  )
  return {
    dataset,
    status: resolveDatasetStatus({
      dataset,
      version,
      localVersion,
      previous,
      releaseLastRevisedAt: archiveTimestamp,
    }),
    version,
    versionKey: version,
    sourceUrl,
    downloadUrl: downloadUrl.toString(),
    downloadPath,
    releaseLastRevisedAt: archiveTimestamp,
    download: async () => downloadResponse(downloadUrl.toString(), downloadPath),
    message:
      'ALS releases require the existing prep/ingest workflow and identity review before upload.',
  } satisfies DatasetUpdate
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
    const response = await fetchText(url)
    try {
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

function normaliseDatasetVersion(dataset: DatasetFixture, value: string) {
  if (
    dataset.versionPolicy.correctionSuffixSource === 'generated' &&
    ((dataset.versionPolicy.scheme === 'reference-year' && /^\d{4}$/.test(value)) ||
      (['initial-release-date', 'reference-date', 'release-date'].includes(
        dataset.versionPolicy.scheme,
      ) &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)))
  ) {
    return `${value}.0`
  }
  return value
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

function findLatestArchiveTimestamp(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.timestamps)) return undefined
  return payload.timestamps
    .filter(
      (timestamp): timestamp is string =>
        typeof timestamp === 'string' && /^\d{8}-\d{4}$/.test(timestamp),
    )
    .sort()
    .at(-1)
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
