import type { PreparedSourceArchive } from './sourceArchives.ts'
import type { DatasetFixture, DatasetRelease } from './sourceUpdatesTypes.ts'
import { REPO_ROOT } from './sourceUpdatesConfig.ts'

export async function runCsdiArchiveIngestPlaceholder(
  dataset: DatasetFixture,
  release: DatasetRelease | undefined,
  target: import('../cli/options.ts').UploadTarget,
  prepared: PreparedSourceArchive,
  skipConfirm: boolean,
  options: { deferStatsReleaseSet: boolean },
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
    (dataset.code ===
      'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district' ||
      dataset.code ===
        'ds-hk-hkgov-censtatd-division-statistic-population-households-district') &&
    (release?.sourceVersion === '2016' ||
      release?.sourceVersion === '2021' ||
      release?.sourceVersion === '2024') &&
    release.sourceUrl
  ) {
    const child = Bun.spawn(
      buildHkgovCenstatdStatisticsArchiveIngestCommand({
        datasetCode: dataset.code,
        deferStatsReleaseSet: options.deferStatsReleaseSet,
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
        `C&SD district statistic ingest failed for ${release.sourceVersion}.`,
      )
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
        deferStatsReleaseSet: options.deferStatsReleaseSet,
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
        deferStatsReleaseSet: options.deferStatsReleaseSet,
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
  deferStatsReleaseSet?: boolean
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
    ...(input.deferStatsReleaseSet ? ['--defer-stats-release-set'] : []),
    ...(input.yes ? ['--yes'] : []),
  ]
}

export function buildHkgovCenstatdDistrictArchiveIngestCommand(input: {
  datasetCode:
    | 'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district'
    | 'ds-hk-hkgov-censtatd-division-statistic-population-households-district'
  deferApiReleaseSet?: boolean
  inputFile: string
  releaseNotesUrl: string
  sourceArchiveKey: string
  sourceArchiveSha256: string
  sourceVersion: '2016' | '2021' | '2024'
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
    '--dataset-code',
    input.datasetCode,
    '--release-notes-url',
    input.releaseNotesUrl,
    '--source-archive-key',
    input.sourceArchiveKey,
    '--source-archive-sha256',
    input.sourceArchiveSha256,
    ...(input.deferApiReleaseSet ? ['--defer-api-release-set'] : []),
  ]
}

const HKGOV_CENSTATD_STATISTIC_DATASETS = new Set([
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
  'ds-hk-hkgov-censtatd-division-statistic-major-housing-estates',
  'ds-hk-hkgov-censtatd-division-statistic-new-towns',
  'ds-hk-hkgov-censtatd-division-statistic-permanent-living-quarters',
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
  deferStatsReleaseSet?: boolean
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
    ...(input.deferStatsReleaseSet ? ['--defer-stats-release-set'] : []),
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
