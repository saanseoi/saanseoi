import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { readHkgovCenstatdDistrictGmlArchive } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatd.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')

/** Imports one already-mirrored native C&SD district-boundary source archive. */
export async function runHkgovCenstatdDistrictArchiveIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceArchive = args.positionals[0]
  const sourceVersion = args.options['source-version']
  const datasetCode = args.options['dataset-code']
  const releaseNotesUrl = args.options['release-notes-url']
  const sourceArchiveKey = args.options['source-archive-key']
  const sourceArchiveSha256 = args.options['source-archive-sha256']
  const deferApiReleaseSet = args.options['defer-api-release-set'] === true
  if (
    !sourceArchive ||
    args.positionals.length !== 1 ||
    (sourceVersion !== '2016' &&
      sourceVersion !== '2021' &&
      sourceVersion !== '2024') ||
    typeof datasetCode !== 'string' ||
    typeof releaseNotesUrl !== 'string' ||
    typeof sourceArchiveKey !== 'string' ||
    !isSha256(sourceArchiveSha256)
  ) {
    printUsage()
    throw new Error(
      'C&SD district-area ingestion requires <source.zip>, --dataset-code, --source-version 2016|2021|2024, --release-notes-url, --source-archive-key, and --source-archive-sha256.',
    )
  }

  const archiveBytes = await readFile(resolve(sourceArchive))
  assertSourceArchiveIdentity(archiveBytes, sourceArchiveSha256)
  const workDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-censtatd-district-'))
  try {
    const gmlPath = join(workDir, `district-council-districts-${sourceVersion}.gml`)
    await writeFile(
      gmlPath,
      readHkgovCenstatdDistrictGmlArchive(
        archiveBytes,
        sourceVersion,
        datasetCode as Parameters<typeof readHkgovCenstatdDistrictGmlArchive>[2],
      ),
      'utf8',
    )
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [gmlPath],
        options: {
          'cohort-key': sourceVersion,
          'dataset-code': datasetCode,
          'release-notes-url': releaseNotesUrl,
          region: 'hk',
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
        deferApiReleaseSet,
        dryRun: false,
        forceUpload: true,
        invocationCwd: REPO_ROOT,
        printUsage: () => undefined,
        skipConfirm: true,
        skipSnapshotCleanup: false,
        // The authoritative 2021 delivery includes a self-intersecting
        // CENSTATD:T ring. Preserve the publisher geometry without a repair,
        // matching the updater's source-profile policy.
        validateGeometry: false,
      },
    )
  } finally {
    await rm(workDir, { force: true, recursive: true })
  }
}

export function assertSourceArchiveIdentity(
  archiveBytes: Uint8Array,
  expectedSha256: string,
) {
  assertSourceArchiveHash(archiveBytes, expectedSha256, 'Prepared CSDI archive')
}
