import { describe, expect, mock, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'

import type { PreparedHkgovCenstatdDistrictUpload } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatd.ts'
import type { PreparedHkgovCenstatdDistrictStatistic } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovCenstatdDistrictStatistics.ts'
import {
  assertSourceArchiveIdentity,
  runHkgovCenstatdDistrictStatisticIngestCommand,
} from './hkgovCenstatdDistrictStatistics.ts'
import type { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'

describe('C&SD district-density archive identity', () => {
  test('only accepts the archive represented by the updater manifest hash', () => {
    const archive = new TextEncoder().encode('prepared-local-source-archive')
    const hash = createHash('sha256').update(archive).digest('hex')

    expect(() => assertSourceArchiveIdentity(archive, hash)).not.toThrow()
    expect(() => assertSourceArchiveIdentity(archive, hash.toUpperCase())).not.toThrow()
    expect(() => assertSourceArchiveIdentity(archive, '0'.repeat(64))).toThrow(
      'differs from its updater manifest',
    )
  })

  test('defers the companion Geographic release set with a Stats bootstrap', async () => {
    const workDir = await mkdtemp(join(tmpdir(), 'hkgov-density-defer-test-'))
    const archivePath = join(workDir, 'density.zip')
    const archive = zipSync({
      'Density_2022.gml': new TextEncoder().encode('<gml/>'),
    })
    const sourceArchiveSha256 = createHash('sha256').update(archive).digest('hex')
    const uploadOptions: Array<{
      deferApiReleaseSet?: boolean
      deferStatsReleaseSet?: boolean
      reuseExistingRelease?: boolean
    }> = []
    await writeFile(archivePath, archive)

    try {
      await runHkgovCenstatdDistrictStatisticIngestCommand(
        {
          command: 'hkgov-censtatd:district-land-area-population-density',
          positionals: [archivePath],
          options: {
            'defer-stats-release-set': true,
            'release-notes-url': 'https://example.com/density',
            'source-archive-key': 'by-source/hk/hkgov-csdi/density.zip',
            'source-archive-sha256': sourceArchiveSha256,
            'source-version': '2022',
          },
        },
        { environment: 'preview', remote: true },
        () => undefined,
        {
          prepareHkgovCenstatdDistrictStatisticUpload: mock(
            async () =>
              ({
                outputFile: join(workDir, 'statistics.parquet'),
                rowCount: 18,
              }) satisfies PreparedHkgovCenstatdDistrictStatistic,
          ),
          prepareHkgovCenstatdDistrictUpload: mock(
            async () =>
              ({
                cohortKey: '2022',
                filePath: join(workDir, 'division-area.parquet'),
              }) as PreparedHkgovCenstatdDistrictUpload,
          ),
          runUploadCommand: mock(async (_args, _target, options) => {
            uploadOptions.push({
              deferApiReleaseSet: options.deferApiReleaseSet,
              deferStatsReleaseSet: options.deferStatsReleaseSet,
              reuseExistingRelease: options.reuseExistingRelease,
            })
          }) as typeof runUploadCommand,
        },
      )
    } finally {
      await rm(workDir, { force: true, recursive: true })
    }

    expect(uploadOptions).toEqual([
      { deferStatsReleaseSet: true },
      { deferApiReleaseSet: true, reuseExistingRelease: true },
    ])
  })
})
