import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetWriteBuffer } from 'hyparquet-writer'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { readPreparedDivisions } from './processLocalHkgovPlandDivisionSqlUploadPreparation.ts'

test('Planning preparation rejects source cells missing publisher properties', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'planning-properties-'))
  const bucket = new LocalPipelineBucket(directory)
  try {
    await bucket.put(
      'prepared.parquet',
      parquetWriteBuffer({
        columnData: [
          { name: 'id', type: 'STRING', data: ['planning-subunit'] },
          { name: 'planning_level', type: 'STRING', data: ['subunit'] },
          { name: 'source_version', type: 'STRING', data: ['2026'] },
          {
            name: 'geometry',
            type: 'JSON',
            data: [
              {
                type: 'Polygon',
                coordinates: [
                  [
                    [114, 22],
                    [115, 22],
                    [115, 23],
                    [114, 22],
                  ],
                ],
              },
            ],
          },
          {
            name: 'source_properties',
            type: 'JSON',
            data: [{ sourceFeatures: [{ sourceRecordId: 'source-1' }] }],
          },
        ],
      }),
    )
    await expect(
      readPreparedDivisions(bucket, 'prepared.parquet', 'release', false, new Map()),
    ).rejects.toThrow(
      'sourceFeatures[0].properties is missing; prepare the release again',
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
