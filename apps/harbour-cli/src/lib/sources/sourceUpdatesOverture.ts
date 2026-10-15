import { cp, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type {
  DatasetFixture,
  DatasetUpdate,
  DatasetUpdatePhase,
  LookupContext,
  UpdateSourceState,
} from './sourceUpdatesTypes.ts'
import { compareVersions, resolveDatasetStatus } from './sourceUpdatesVersions.ts'
import {
  OVERTURE_HONG_KONG_DIVISION_ID,
  OVERTURIST_ENTRYPOINT,
  OVERTURIST_ROOT,
  REPO_ROOT,
} from './sourceUpdatesConfig.ts'

import { applySkippedRelease, skippedReleaseReason } from './sourceUpdatesSkips.ts'

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
  const versions = [...new Set([payload.latest, ...s3Versions])].sort((a, b) =>
    compareVersions(b, a),
  )
  const version =
    versions.find(candidate => !skippedReleaseReason(dataset, candidate)) ??
    versions[0]!
  // The Places processor materialises its supplementary Address output from
  // the same retained Place input; there is no separate upstream Address file.
  const resourceTypes = dataset.code.endsWith('-overture-place')
    ? ['place']
    : (dataset.resourceTypes ?? (dataset.resourceType ? [dataset.resourceType] : []))
  if (!resourceTypes.length) throw Error(`Missing resource types for ${dataset.code}.`)
  const updates = resourceTypes.flatMap(resourceType => {
    const outputFileName = overtureOutputFileName(resourceType)
    const latestUpdate = createOvertureUpdate({
      dataset,
      version,
      localVersion: targetVersions
        ? ((resourceType === 'place'
            ? targetVersions.get(version)
            : targetVersions.get(`${version}:${resourceType}`)) ?? undefined)
        : localVersion,
      previous: targetVersions ? undefined : previous,
      outputFileName,
      resourceType,
      sourceUrl,
    })
    if (dataset.releasePolicy?.archives.operation !== 'overture-release-catalog')
      return [latestUpdate]
    return [
      latestUpdate,
      ...versions
        .filter(candidate => candidate !== version)
        .map(archiveVersion =>
          createOvertureUpdate({
            dataset,
            version: archiveVersion,
            localVersion: targetVersions
              ? (targetVersions.get(`${archiveVersion}:${resourceType}`) ?? undefined)
              : previous?.sourceChecks?.[`${archiveVersion}:${resourceType}`]?.version,
            previous: targetVersions
              ? undefined
              : previous?.sourceChecks?.[`${archiveVersion}:${resourceType}`],
            outputFileName,
            resourceType,
            sourceUrl,
            phase: skippedReleaseReason(dataset, archiveVersion)
              ? undefined
              : 'archives',
          }),
        ),
    ]
  })
  if (targetHasNoRelease) updates.sort((a, b) => compareVersions(a.version, b.version))
  return updates.length === 1 ? updates[0]! : updates
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
  return applySkippedRelease({
    sourceKey: `${version}:${resourceType}`,
    targetSourceKey: resourceType === 'place' ? version : `${version}:${resourceType}`,
    ...(phase
      ? {
          deferStateUntilProcessed: true,
          phase,
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
    // Division preparation verifies the publisher ancestor even for cached extracts.
    downloadPath: resourceType === 'division' ? undefined : downloadPath,
    releaseLastRevisedAt: version,
    download: async () => downloadOverture(version, dataset.theme, outputFileName),
    ...(phase
      ? {}
      : {
          upload: {
            positionals: [],
            options: {
              'dataset-code': dataset.code,
              'cohort-key': version,
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
  } satisfies DatasetUpdate)
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
  const existingFile = resolve(
    REPO_ROOT,
    'data/overture',
    version,
    'divisions/China/Hong Kong',
    outputFileName,
  )
  try {
    const fileStat = await stat(existingFile)
    if (fileStat.isFile() && fileStat.size > 0) return existingFile
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const jobKey = `${version}:${theme}`
  const existingJob = overtureDownloadJobs.get(jobKey)
  const releaseRoot = existingJob ?? runOverturist(version, theme)
  if (!existingJob) overtureDownloadJobs.set(jobKey, releaseRoot)
  const downloaded = resolve(await releaseRoot, outputFileName)
  return downloaded
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
