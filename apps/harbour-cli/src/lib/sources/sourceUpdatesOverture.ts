import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type {
  DatasetFixture,
  DatasetUpdate,
  DatasetUpdatePhase,
  LookupContext,
  UpdateSourceState,
} from './sourceUpdatesTypes.ts'
import { requireSingleResourceType } from './sourceUpdates.ts'
import { compareVersions, resolveDatasetStatus } from './sourceUpdatesVersions.ts'
import {
  OVERTURE_HONG_KONG_DIVISION_ID,
  OVERTURIST_ENTRYPOINT,
  OVERTURIST_ROOT,
  REPO_ROOT,
} from './sourceUpdatesConfig.ts'

const overtureDownloadJobs = new Map<string, Promise<string>>()

export async function lookupOverture({
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
  // The Places processor materialises its supplementary Address output from
  // the same retained Place input; there is no separate upstream Address file.
  const resourceType = dataset.code.endsWith('-overture-place')
    ? 'place'
    : requireSingleResourceType(dataset)
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
              'resource-type': resourceType,
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
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    if (exitCode !== 0) {
      throw new Error(
        `Overturist failed with exit code ${exitCode}: ${formatChildProcessOutput(stderr || stdout)}`,
      )
    }

    await cp(stagedRelease, targetRelease, { recursive: true, force: true })
    return targetRelease
  } finally {
    await rm(stagingRoot, { recursive: true, force: true })
  }
}

function formatChildProcessOutput(output: string) {
  const singleLine = output.replace(/\s+/g, ' ').trim()
  return singleLine ? singleLine.slice(0, 500) : 'no diagnostic output'
}
