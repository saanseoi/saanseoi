import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { readHkgovHadDistrictArchive } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovHad.ts'
import { assertSourceArchiveHash, isSha256 } from '../lib/sourceArchive.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')

/** Imports one locally mirrored native HAD File Geodatabase archive. */
export async function runHkgovHadDistrictArchiveIngestCommand(
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
    !sourceArchive ||
    args.positionals.length !== 1 ||
    typeof sourceVersion !== 'string' ||
    typeof releaseNotesUrl !== 'string' ||
    typeof sourceArchiveKey !== 'string' ||
    !isSha256(sourceArchiveSha256)
  ) {
    printUsage()
    throw new Error(
      'HAD district-area ingestion requires <source.zip>, --source-version, --release-notes-url, --source-archive-key, and --source-archive-sha256.',
    )
  }

  const archiveBytes = await readFile(resolve(sourceArchive))
  assertSourceArchiveIdentity(archiveBytes, sourceArchiveSha256)
  const featureCollection = await readHkgovHadDistrictArchive(archiveBytes)
  const workDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-had-district-'))
  try {
    const geoJsonPath = join(workDir, 'district-boundary.geojson')
    await writeFile(geoJsonPath, JSON.stringify(featureCollection), 'utf8')
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [geoJsonPath],
        options: {
          'cohort-key': sourceVersion,
          'dataset-code': 'ds-hk-hkgov-had-division-area-district',
          'release-notes-url': releaseNotesUrl,
          region: 'hk',
          source: 'hkgov-had',
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
        dryRun: false,
        forceUpload: true,
        invocationCwd: REPO_ROOT,
        printUsage: () => undefined,
        skipConfirm: true,
        skipSnapshotCleanup: false,
        validateGeometry: true,
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
  assertSourceArchiveHash(archiveBytes, expectedSha256, 'Prepared HAD archive')
}
