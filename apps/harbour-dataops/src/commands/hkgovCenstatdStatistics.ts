import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { unzipSync } from 'fflate'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import {
  CENSTATD_STATISTIC_PROFILES,
  prepareHkgovCenstatdStatisticUpload,
  type CenstatdStatisticDatasetCode,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdStatistics.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
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
    typeof sha !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(sha)
  ) {
    printUsage()
    throw new Error(
      'C&SD statistics ingestion requires <source.zip>, --dataset-code, --source-version, --release-notes-url, --source-archive-key and --source-archive-sha256.',
    )
  }
  const bytes = await readFile(resolve(input))
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== sha)
    throw new Error(
      `Prepared CSDI archive SHA-256 differs from its updater manifest: expected ${sha}, found ${actual}.`,
    )
  const dir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-statistics-'))
  try {
    const files: Record<string, string> = {}
    const archive = unzipSync(bytes)
    for (const [name, content] of Object.entries(archive)) {
      if (!name.endsWith('.gml')) continue
      const path = join(dir, name)
      await writeFile(path, content)
      files[name] = path
    }
    const output = join(dir, 'statistics.parquet')
    await prepareHkgovCenstatdStatisticUpload({
      datasetCode: datasetCode as CenstatdStatisticDatasetCode,
      inputFiles: files,
      outputFile: output,
      sourceArchiveKey: key,
      sourceArchiveSha256: sha,
      sourceVersion,
    })
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [output],
        options: {
          'cohort-key': sourceVersion,
          'dataset-code': datasetCode,
          'release-notes-url': releaseNotesUrl,
          region: 'hk',
          source: 'hkgov-censtatd',
          'source-version': sourceVersion,
          theme: 'stats',
          type: 'divisionStatistic',
          yes: true,
        },
      },
      target,
      {
        dryRun: false,
        forceUpload: true,
        invocationCwd: REPO_ROOT,
        printUsage: () => undefined,
        skipConfirm: true,
        skipSnapshotCleanup: false,
        validateGeometry: false,
      },
    )
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}
