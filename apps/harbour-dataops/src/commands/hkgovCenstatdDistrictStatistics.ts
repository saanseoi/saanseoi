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
import { prepareHkgovCenstatdDistrictStatisticUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdDistrictStatistics.ts'

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
    const archive = unzipSync(new Uint8Array(archiveBytes))
    const gmlBytes = archive[`Density_${sourceVersion}.gml`]
    if (!gmlBytes) throw new Error(`CSDI archive has no Density_${sourceVersion}.gml.`)
    const gmlPath = join(workDir, `Density_${sourceVersion}.gml`)
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

function isSha256(value: string | boolean | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

/** Ensures provenance names the exact locally prepared archive being parsed. */
export function assertSourceArchiveIdentity(
  archiveBytes: Uint8Array,
  expectedSha256: string,
) {
  const actualSha256 = createHash('sha256').update(archiveBytes).digest('hex')
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Prepared CSDI archive SHA-256 differs from its updater manifest: expected ${expectedSha256}, found ${actualSha256}.`,
    )
  }
}
