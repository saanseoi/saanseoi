import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { type CsdiSourceArchive, prepareCsdiSourceArchive } from './sourceArchives.ts'
import type {
  CsdiArchivedSource,
  DatasetFixture,
  DatasetRelease,
  DatasetUpdate,
  LookupContext,
  UpdateSourceState,
} from './sourceUpdatesTypes.ts'
import {
  compareVersions,
  isRecord,
  normaliseDatasetVersion,
  quarterlyVersionBase,
  readVersionCorrection,
  safeFilePart,
} from './sourceUpdatesVersions.ts'
import { getSourceState } from './sourceUpdatesState.ts'
import { DATASET_ROOT, REPO_ROOT } from './sourceUpdatesConfig.ts'
import {
  assertCsdiArchiveUrl,
  downloadCsdiArchive,
  fetchText,
} from './sourceUpdatesDownloads.ts'
import { runCsdiArchiveIngestPlaceholder } from './sourceUpdatesArchiveIngest.ts'

export function isCsdiDataset(dataset: DatasetFixture) {
  return Boolean(
    dataset.sourceUrl?.includes('portal.csdi.gov.hk') ||
      dataset.releases?.some(release =>
        release.sourceUrl?.includes('portal.csdi.gov.hk'),
      ),
  )
}

export async function lookupCsdi(context: LookupContext): Promise<DatasetUpdate[]> {
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
      const sourceObjectHash = versionKey.slice('sha256:'.length)
      // Catalogue revisions can replace the object behind one release slot.
      // Content-address both cache paths so an older source.zip can never be
      // mistaken for the newly advertised archive.
      const downloadedPath = join(archiveRoot, `${sourceObjectHash}-publisher-download`)
      const sourcePath = join(archiveRoot, `${sourceObjectHash}-source.zip`)

      return {
        archive,
        dataset,
        downloadPath: sourcePath,
        downloadUrl: source.sourceUrl,
        isKnownIdenticalArchive: isVerifiedIdenticalCsdiArchive(
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
        postArchiveIngest: async (target, prepared, skipConfirm, options) =>
          runCsdiArchiveIngestPlaceholder(
            dataset,
            release,
            target,
            prepared,
            skipConfirm,
            options,
          ),
        ...(release
          ? {
              recordIdenticalArchive: async (contentHash: string) => {
                await recordVerifiedIdenticalCsdiArchiveSlot({
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

export function findCsdiDatasetRelease(
  dataset: DatasetFixture,
  archiveSourceUrl: string,
  releaseSlot: string,
  sourceObjectHash: string,
) {
  const releases = dataset.releases ?? []
  const matchingReleases = releases.filter(
    release =>
      !release.sourceUrl ||
      release.sourceUrl === archiveSourceUrl ||
      // Direct CSDI publisher-download URLs identify an individual release,
      // not a catalogue. They must remain eligible for its slot from the
      // dataset's primary CSDI catalogue.
      !readDatasetId(release.sourceUrl),
  )
  const archiveMatch = matchingReleases.find(release =>
    release.archiveSlots?.some(
      archive =>
        archive.releaseSlot === releaseSlot &&
        `sha256:${archive.sourceObjectHash}` === sourceObjectHash,
    ),
  )
  if (archiveMatch) return archiveMatch

  // A configured current CSDI source version can use its archive slot as its
  // release identity. Prefer that exact match before falling back to another
  // release that happens to share the same catalogue URL. Without it, a new
  // slot such as 2026-Q2 is incorrectly ingested as the first historical
  // release (for example, 2024).
  const slotMatch = matchingReleases.find(
    release => release.sourceVersion === releaseSlot,
  )
  if (slotMatch) return slotMatch

  return (
    matchingReleases.find(release => release.sourceUrl === archiveSourceUrl) ??
    (matchingReleases.length === 1 ? matchingReleases[0] : undefined)
  )
}

function isVerifiedIdenticalCsdiArchive(
  release: DatasetRelease | undefined,
  releaseSlot: string,
  sourceObjectHash: string,
) {
  return release?.verifiedIdenticalArchiveSlots?.some(
    archive =>
      archive.releaseSlot === releaseSlot &&
      `sha256:${archive.sourceObjectHash}` === sourceObjectHash,
  )
}

async function recordVerifiedIdenticalCsdiArchiveSlot(input: {
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
    input.release.verifiedIdenticalArchiveSlots?.some(
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
    release.verifiedIdenticalArchiveSlots?.some(
      candidate =>
        candidate.releaseSlot === slot.releaseSlot &&
        candidate.sourceObjectHash === slot.sourceObjectHash,
    )
  ) {
    return
  }

  release.verifiedIdenticalArchiveSlots = [
    ...(release.verifiedIdenticalArchiveSlots ?? []),
    slot,
  ].sort((left, right) => left.releaseSlot.localeCompare(right.releaseSlot))
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  input.release.verifiedIdenticalArchiveSlots = [
    ...(input.release.verifiedIdenticalArchiveSlots ?? []),
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
  assertCsdiArchiveUrl(url)
  const key = new URL(url).pathname.split('/').at(-1)?.toLowerCase()
  if (!key || !/^[a-f0-9]{64}$/.test(key)) {
    throw new Error(`CSDI archive URL does not contain a SHA-256 object key: ${url}`)
  }
  return `sha256:${key}`
}

function readDatasetId(sourceUrl: string | undefined) {
  if (!sourceUrl) return undefined
  return new URL(sourceUrl).searchParams.get('datasetId') ?? undefined
}

export function findArchiveTimestamps(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.timestamps)) return []
  return payload.timestamps
    .filter(
      (timestamp): timestamp is string =>
        typeof timestamp === 'string' && /^\d{8}-\d{4}$/.test(timestamp),
    )
    .sort()
}
