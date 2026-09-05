import { expect, test } from 'bun:test'
import { createLocalParquetBuffer } from './buildPlaceTranslationFixture.ts'

test('local Parquet slices contain only the requested Buffer range', async () => {
  const contents = Buffer.from([0, 1, 2, 3, 4, 5])
  const file = createLocalParquetBuffer(contents)
  const result = await file.slice(2, 5)

  expect([...new Uint8Array(result)]).toEqual([2, 3, 4])
  expect(result.byteLength).toBe(3)
})
