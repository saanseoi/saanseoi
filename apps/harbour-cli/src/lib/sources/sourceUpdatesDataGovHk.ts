import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  DatasetFixture,
  DatasetUpdate,
  DatasetUpdatePhase,
  LookupContext,
  UpdateSourceState,
} from './sourceUpdatesTypes.ts'
import {
  formatDate,
  resolveDatasetStatus,
  safeFilePart,
} from './sourceUpdatesVersions.ts'
import { DATA_GOV_HK_ALS_RESOURCE_URL, REPO_ROOT } from './sourceUpdatesConfig.ts'
import { findArchiveTimestamps } from './sourceUpdatesCsdi.ts'
import { downloadResponse, fetchJsonWithRetry } from './sourceUpdatesDownloads.ts'

export async function lookupDataGovHk({
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
    sourceKey: version,
    targetSourceKey: version,
    ...(phase ? { deferStateUntilProcessed: true, phase } : {}),
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
          ingest: async (
            target: import('../cli/options.ts').UploadTarget,
            options = {},
          ) =>
            ingestDataGovHkAlsRelease({
              downloadPath,
              downloadUrl: downloadUrl.toString(),
              skipPrompts: options.skipPrompts === true,
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
  skipPrompts,
  target,
  timestamp,
  version,
}: {
  downloadPath: string
  downloadUrl: string
  skipPrompts: boolean
  target: import('../cli/options.ts').UploadTarget
  timestamp: string
  version: string
}) {
  await downloadResponse(downloadUrl, downloadPath)
  const sourceRoot = resolve(REPO_ROOT, 'data/hkgov/dpo/ALS')
  const sourceDir = resolve(sourceRoot, `${timestamp}-ALS-GeoJSON`)
  await rm(sourceDir, { force: true, recursive: true })
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
    buildHkgovAlsIngestCommand({ sourceRoot, target, version, skipPrompts }),
    { cwd: REPO_ROOT, stdout: 'inherit', stderr: 'inherit' },
  )
  if ((await dataops.exited) !== 0) {
    throw new Error(
      [
        `DPO ALS intake stopped for ${version}; resolve the release-specific instruction in the preceding output.`,
        'Run interactively with:',
        formatHkgovAlsReviewCommand({ target, version }),
      ].join('\n'),
    )
  }
}

/** The updater's non-interactive ALS intake may require premise decisions. */
export function formatHkgovAlsReviewCommand(input: {
  target: import('../cli/options.ts').UploadTarget
  version: string
}) {
  return [
    'bun run dataops -- hkgov-dpo:ingest',
    'data/hkgov/dpo/ALS',
    '--target',
    input.target.environment === 'dev' ? 'local' : input.target.environment,
    '--cohort-key',
    input.version,
    '--from-source-version',
    input.version,
  ].join(' ')
}

export function buildHkgovAlsIngestCommand(input: {
  sourceRoot: string
  target: import('../cli/options.ts').UploadTarget
  version: string
  skipPrompts?: boolean
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
    ...(input.skipPrompts ? ['--yes'] : []),
  ]
}
