import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { prepareHkgovCenstatdDistrictStatisticUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdDistrictStatistics.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'
import { unzipSelected } from '../lib/zip.ts'

const DATASET_CODE =
  'ds-hk-hkgov-censtatd-division-statistic-land-area-population-density-district'
const REPO_ROOT = resolve(import.meta.dir, '../../../..')

export async function runHkgovCenstatdDistrictStatisticIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
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
    await prepareHkgovCenstatdDistrictStatisticUpload({
      inputFile: gmlPath,
      outputFile: parquetPath,
      sourceArchiveKey,
      sourceArchiveSha256,
      sourceVersion,
    })
    await runUploadCommand(
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
          yes: true,
        },
      },
      target,
      {
        dryRun: false,
        // A previous source-only run may already have published this deterministic
        // release. Reprocess it locally to materialise the history observation.
        allowReprocessPublished: true,
        forceUpload: true,
        invocationCwd: REPO_ROOT,
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

/** Ensures provenance names the exact locally prepared archive being parsed. */
export function assertSourceArchiveIdentity(
  archiveBytes: Uint8Array,
  expectedSha256: string,
) {
  assertSourceArchiveHash(archiveBytes, expectedSha256, 'Prepared CSDI archive')
}
