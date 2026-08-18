import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import {
  CENSTATD_STATISTIC_PROFILES,
  prepareHkgovCenstatdStatisticUpload,
  readHkgovCenstatdStatisticArchive,
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
  const rows = readHkgovCenstatdStatisticArchive({
    datasetCode: datasetCode as CenstatdStatisticDatasetCode,
    inputGml,
    sourceVersion,
  })
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
        skipSnapshotCleanup: false,
        validateGeometry: false,
      },
    )
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}
