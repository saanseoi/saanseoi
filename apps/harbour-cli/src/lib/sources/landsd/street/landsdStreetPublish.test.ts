import { expect, test } from 'bun:test'

import type { runUploadCommand } from '../../../commands/upload.ts'
import { publishLandsdStreetReleasePayloads } from './landsdStreetPublish.ts'

test('reprocesses a staged LandsD release only when the updater forces it', async () => {
  const forceUploads: boolean[] = []
  const captureUpload: typeof runUploadCommand = async (_args, _target, options) => {
    forceUploads.push(options.forceUpload)
  }

  await publishLandsdStreetReleasePayloads(
    { environment: 'dev', remote: false },
    [
      {
        fixturePath: null,
        parquetPath: '/tmp/landsd-street.parquet',
        records: [],
        sourceVersion: '2026-08-14.0',
      },
    ],
    { forceUpload: true, runUploadCommand: captureUpload },
  )

  expect(forceUploads).toEqual([true])
})
