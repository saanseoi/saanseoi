import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { prepareHkgovCenstatdDistrictUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatd.ts'
import { prepareHkgovCenstatdDistrictStatisticUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdDistrictStatistics.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'
import { planCenstatdResourceLifecycle } from '../lib/censtatdResourceLifecycle.ts'
import { unzipSelected } from '../lib/zip.ts'

const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
const REPO_ROOT = resolve(import.meta.dir, '../../../..')

type DistrictStatisticDependencies = {
  prepareHkgovCenstatdDistrictUpload?: typeof prepareHkgovCenstatdDistrictUpload
  prepareHkgovCenstatdDistrictStatisticUpload?: typeof prepareHkgovCenstatdDistrictStatisticUpload
  runUploadCommand?: typeof runUploadCommand
}

export async function runHkgovCenstatdDistrictStatisticIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
  dependencies: DistrictStatisticDependencies = {},
) {
  const sourceArchive = args.positionals[0]
  const sourceVersion = args.options['source-version']
  const releaseNotesUrl = args.options['release-notes-url']
  const sourceArchiveKey = args.options['source-archive-key']
  const sourceArchiveSha256 = args.options['source-archive-sha256']
  if (
    (sourceVersion !== '2022' && sourceVersion !== '2024') ||
    !sourceArchive ||
    args.positionals.length !== 1 ||
    typeof releaseNotesUrl !== 'string' ||
    typeof sourceArchiveKey !== 'string' ||
    !isSha256(sourceArchiveSha256)
  ) {
    printUsage()
    throw new Error(
      'C&SD district statistic ingestion requires <source.zip>, --source-version 2022|2024, --release-notes-url, --source-archive-key, and --source-archive-sha256.',
    )
  }
  const deferStatsReleaseSet = args.options['defer-stats-release-set'] === true
  // Density produces a Statistics source and its companion Geographic
  // divisionArea source in one intake. A Stats bootstrap must leave both
  // API families for their respective, deliberate release-set publication.
  const deferApiReleaseSet =
    deferStatsReleaseSet || args.options['defer-api-release-set'] === true
  const prepareStatistic =
    dependencies.prepareHkgovCenstatdDistrictStatisticUpload ??
    prepareHkgovCenstatdDistrictStatisticUpload
  const prepareGeometry =
    dependencies.prepareHkgovCenstatdDistrictUpload ??
    prepareHkgovCenstatdDistrictUpload
  const upload = dependencies.runUploadCommand ?? runUploadCommand
  const [statisticLifecycle, geometryLifecycle] = planCenstatdResourceLifecycle([
    'divisionStatistic',
    'divisionArea',
  ])
  if (!statisticLifecycle || !geometryLifecycle) {
    throw new Error('C&SD density lifecycle is incomplete.')
  }
  const workDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-density-'))
  try {
    // The updater has already prepared and mirrored this immutable archive. Read
    // its local cache directly: R2 is provenance/durability, never an input hop.
    const archiveBytes = await readFile(resolve(sourceArchive))
    assertSourceArchiveIdentity(archiveBytes, sourceArchiveSha256)
    const expectedGml = `Density_${sourceVersion}.gml`
    const archive = unzipSelected(
      new Uint8Array(archiveBytes),
      entry => entry.name === expectedGml,
    )
    const gmlBytes = archive[expectedGml]
    if (!gmlBytes) throw new Error(`CSDI archive has no ${expectedGml}.`)
    const gmlPath = join(workDir, expectedGml)
    const parquetPath = join(
      workDir,
      `hkgov-censtatd-hk-${sourceVersion}-division-statistic.parquet`,
    )
    await writeFile(gmlPath, gmlBytes)
    await prepareStatistic({
      inputFile: gmlPath,
      outputFile: parquetPath,
      sourceArchiveKey,
      sourceArchiveSha256,
      sourceVersion,
    })
    await upload(
      {
        command: 'upload',
        positionals: [parquetPath],
        options: {
          'cohort-key': sourceVersion,
          'dataset-code': DATASET_CODE,
          region: 'hk',
          'release-notes-url': releaseNotesUrl,
          source: 'hkgov-censtatd',
          'source-archive-key': sourceArchiveKey,
          'source-archive-sha256': sourceArchiveSha256,
          'source-version': sourceVersion,
          theme: 'stats',
          type: 'divisionStatistic',
          // Unreviewed publisher measures must be curated interactively.
          yes: Boolean(args.options.yes),
        },
      },
      target,
      {
        dryRun: false,
        // A previous source-only run may already have published this deterministic
        // release. Reprocess it locally to materialise the history observation.
        allowHistoricalCohort: true,
        allowReprocessPublished: true,
        deferStatsReleaseSet,
        deferSourcePublish: statisticLifecycle.deferSourcePublish,
        forceUpload: true,
        invocationCwd: REPO_ROOT,
        printUsage: () => undefined,
        skipConfirm: Boolean(args.options.yes),
        skipSnapshotCleanup: false,
        validateGeometry: false,
      },
    )
    const geometry = await prepareGeometry(gmlPath, workDir, sourceVersion, {
      datasetCode: DATASET_CODE,
      sourceArchive: { key: sourceArchiveKey, sha256: sourceArchiveSha256 },
    })
    await upload(
      {
        command: 'upload',
        positionals: [geometry.filePath],
        options: {
          'cohort-key': geometry.cohortKey,
          'dataset-code': DATASET_CODE,
          region: 'hk',
          'release-notes-url': releaseNotesUrl,
          source: 'hkgov-censtatd',
          'source-archive-key': sourceArchiveKey,
          'source-archive-sha256': sourceArchiveSha256,
          'source-version': sourceVersion,
          theme: 'divisions',
          type: 'divisionArea',
          yes: true,
        },
      },
      target,
      {
        allowHistoricalCohort: true,
        allowReprocessPublished: true,
        deferApiReleaseSet,
        deferSourcePublish: geometryLifecycle.deferSourcePublish,
        dryRun: false,
        forceUpload: true,
        invocationCwd: REPO_ROOT,
        printUsage: () => undefined,
        reuseExistingRelease: geometryLifecycle.reuseExistingRelease,
        skipConfirm: true,
        skipSnapshotCleanup: false,
        validateGeometry: false,
      },
    )
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}

/** Ensures provenance names the exact locally prepared archive being parsed. */
export function assertSourceArchiveIdentity(
  archiveBytes: Uint8Array,
  expectedSha256: string,
) {
  assertSourceArchiveHash(archiveBytes, expectedSha256, 'Prepared CSDI archive')
}
