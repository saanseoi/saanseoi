import { LANDSD_STREET_NAMING_URL } from './landsdStreet.ts'
import type { LandsdStreetReleasePayload } from './landsdStreetIngest.ts'
import type { UploadTarget } from '../../../cli/options.ts'
import { runUploadCommand } from '../../../commands/upload.ts'

/**
 * A successful evidence download is not a completed ingestion. Every staged
 * daily payload must finish the ordinary release registration, SQL import and
 * publication path before the updater may advance its immutable notice cursor.
 */
export async function publishLandsdStreetReleasePayloads(
  target: UploadTarget,
  releases: LandsdStreetReleasePayload[],
  options: {
    invocationCwd?: string
    onProgress?: (progress: {
      current: number
      sourceVersion: string
      total: number
    }) => void
    releaseNotesUrl?: string
    skipSnapshotCleanup?: boolean
  } = {},
) {
  for (const [index, release] of releases.entries()) {
    options.onProgress?.({
      current: index,
      sourceVersion: release.sourceVersion,
      total: releases.length,
    })
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [release.parquetPath],
        options: {
          'cohort-key': release.sourceVersion,
          'release-notes-url': options.releaseNotesUrl ?? LANDSD_STREET_NAMING_URL,
          'source-version': release.sourceVersion,
          region: 'hk',
          source: 'hkgov-landsd',
          theme: 'streets',
          type: 'street',
          yes: true,
        },
      },
      target,
      {
        dryRun: false,
        forceUpload: false,
        invocationCwd: options.invocationCwd ?? process.cwd(),
        printUsage: () => undefined,
        quiet: true,
        skipConfirm: true,
        skipSnapshotCleanup: options.skipSnapshotCleanup ?? false,
        validateGeometry: false,
      },
    )
  }
}
