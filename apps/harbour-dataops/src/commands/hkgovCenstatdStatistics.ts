import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  CENSTATD_STATISTIC_PROFILES,
  prepareHkgovCenstatdStatisticGeographyUploads,
  prepareHkgovCenstatdStatisticUpload,
  type CenstatdStatisticDatasetCode,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdStatistics.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'
import { unzipSelected } from '../lib/zip.ts'

export async function runHkgovCenstatdStatisticsIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const input = args.positionals[0],
    datasetCode = args.options['dataset-code'],
    sourceVersion = args.options['source-version'],
    releaseNotesUrl = args.options['release-notes-url'],
    key = args.options['source-archive-key'],
    sha = args.options['source-archive-sha256']
  const geographyOnly = args.options['geography-only'] === true
  if (
    !input ||
    args.positionals.length !== 1 ||
    typeof datasetCode !== 'string' ||
    !(datasetCode in CENSTATD_STATISTIC_PROFILES) ||
    typeof sourceVersion !== 'string' ||
    typeof releaseNotesUrl !== 'string' ||
    typeof key !== 'string' ||
    !isSha256(sha)
  ) {
    printUsage()
    throw new Error(
      'C&SD statistics ingestion requires <source.zip>, --dataset-code, --source-version, --release-notes-url, --source-archive-key and --source-archive-sha256.',
    )
  }
  const bytes = await readFile(resolve(input))
  assertSourceArchiveHash(bytes, sha, 'Prepared CSDI archive')
  const inputGml = Object.fromEntries(
    Object.entries(unzipSelected(bytes, entry => entry.name.endsWith('.gml'))).map(
      ([name, content]) => [name, new TextDecoder().decode(content)],
    ),
  )
  const workDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-statistics-'))
  try {
    const inputFiles = Object.fromEntries(
      Object.entries(inputGml).map(([name]) => [name, join(workDir, name)]),
    )
    await Promise.all(
      Object.entries(inputGml).map(async ([name, content]) => {
        await Bun.write(join(workDir, name), content)
      }),
    )
    if (!geographyOnly) {
      const parquetPath = join(workDir, 'hkgov-censtatd-statistics.parquet')
      await prepareHkgovCenstatdStatisticUpload({
        datasetCode: datasetCode as CenstatdStatisticDatasetCode,
        inputFiles,
        outputFile: parquetPath,
        sourceArchiveKey: key,
        sourceArchiveSha256: sha,
        sourceVersion,
      })
      await runUploadCommand(
        {
          command: 'upload',
          positionals: [parquetPath],
          options: {
            'cohort-key': sourceVersion,
            'dataset-code': datasetCode,
            region: 'hk',
            'release-notes-url': releaseNotesUrl,
            source: 'hkgov-censtatd',
            'source-archive-key': key,
            'source-archive-sha256': sha,
            'source-version': sourceVersion,
            theme: 'stats',
            type: 'divisionStatistic',
            // Preserve the caller's explicit automation choice. New publisher
            // measures must be reviewed interactively before their canonical
            // metadata is admitted, so this command cannot force --yes.
            yes: Boolean(args.options.yes),
          },
        },
        target,
        {
          allowReprocessPublished: true,
          deferStatsReleaseSet: args.options['defer-stats-release-set'] === true,
          dryRun: false,
          forceUpload: true,
          invocationCwd: resolve(import.meta.dir, '../../../..'),
          printUsage: () => undefined,
          skipConfirm: Boolean(args.options.yes),
          skipSnapshotCleanup: false,
          validateGeometry: false,
        },
      )
    }
    // Launch bootstrap prepares all Statistics snapshots before publishing a
    // cohort-complete r0. HMA/area companion geometry belongs to the Divisions
    // family and may depend on Division inputs that are deliberately outside
    // that Stats-only batch. Do not let that optional fan-out invalidate the
    // successfully published Statistics source release.
    if (!geographyOnly && args.options['defer-stats-release-set'] === true) return
    const geographyDivisionPath = join(
      workDir,
      'hkgov-censtatd-geography-division.parquet',
    )
    const geographyAreaPath = join(
      workDir,
      'hkgov-censtatd-geography-division-area.parquet',
    )
    const geography = await prepareHkgovCenstatdStatisticGeographyUploads({
      areaOutputFile: geographyAreaPath,
      datasetCode: datasetCode as CenstatdStatisticDatasetCode,
      divisionOutputFile: geographyDivisionPath,
      inputGml,
      sourceArchiveKey: key,
      sourceArchiveSha256: sha,
      sourceVersion,
    })
    for (const [filePath, type] of [
      ...(geography.divisionCount > 0
        ? ([[geographyDivisionPath, 'division']] as const)
        : []),
      ...(geography.areaCount > 0
        ? ([[geographyAreaPath, 'divisionArea']] as const)
        : []),
    ] as const) {
      await runUploadCommand(
        {
          command: 'upload',
          positionals: [filePath],
          options: {
            'cohort-key': sourceVersion,
            'dataset-code': datasetCode,
            region: 'hk',
            'release-notes-url': releaseNotesUrl,
            source: 'hkgov-censtatd',
            'source-archive-key': key,
            'source-archive-sha256': sha,
            'source-version': sourceVersion,
            theme: 'divisions',
            type,
            yes: true,
          },
        },
        target,
        {
          allowReprocessPublished: true,
          dryRun: false,
          forceUpload: true,
          invocationCwd: resolve(import.meta.dir, '../../../..'),
          printUsage: () => undefined,
          skipConfirm: true,
          // The area pass resolves the canonical division snapshot created
          // immediately before it; normal cleanup resumes after publication.
          skipSnapshotCleanup: type === 'division',
          validateGeometry: type === 'divisionArea',
        },
      )
    }
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}
