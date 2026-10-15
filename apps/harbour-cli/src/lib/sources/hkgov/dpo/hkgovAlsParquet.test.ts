import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { int32Column, jsonColumn, stringColumn } from './hkgovAlsNormalisation'
import { writeAlsParquet } from './hkgovAlsParquet'

for (const count of [0, 10003]) {
  test(`ALS Parquet preserves values and schema across batches (${count} rows)`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'als-parquet-'))
    try {
      const filename = join(directory, 'prepared.parquet')
      const rows = Array.from({ length: count }, (_, index) => index)
      const batches: number[] = []
      await writeAlsParquet({
        filename,
        rows,
        columnData: batch => {
          batches.push(batch.length)
          return [
            stringColumn(
              'name',
              batch.map(i => (i < 5000 ? null : '香港 Hong Kong')),
            ),
            jsonColumn(
              'evidence',
              batch.map(i => JSON.stringify({ index: i })),
            ),
            int32Column(
              'easting',
              batch.map(i => (i % 2 ? i : null)),
            ),
          ]
        },
      })
      expect(batches).toEqual(count ? [5000, 5000, 3] : [0])
      const file = await asyncBufferFromFile(filename)
      const metadata = await parquetMetadataAsync(file)
      expect(
        metadata.schema
          .slice(1)
          .map(field => [field.name, field.type, field.repetition_type]),
      ).toEqual([
        ['name', 'BYTE_ARRAY', 'OPTIONAL'],
        ['evidence', 'BYTE_ARRAY', 'OPTIONAL'],
        ['easting', 'INT32', 'OPTIONAL'],
      ])
      const actual = await parquetReadObjects({ file })
      expect(actual).toHaveLength(count)
      if (count) {
        expect(actual[0]).toEqual({
          name: null,
          evidence: '{"index":0}',
          easting: null,
        })
        expect(actual[5001]).toEqual({
          name: '香港 Hong Kong',
          evidence: '{"index":5001}',
          easting: 5001,
        })
        expect(actual.at(-1)).toEqual({
          name: '香港 Hong Kong',
          evidence: '{"index":10002}',
          easting: null,
        })
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
