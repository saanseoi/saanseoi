import { expect, test } from 'bun:test'

import { compressJsonBrotli, decompressJsonBrotli } from './brotliJson.ts'

test('round-trips JSON through Brotli bytes', () => {
  const value = {
    coordinates: [114.1694, 22.3193],
    type: 'Point',
  }

  const compressed = compressJsonBrotli(value)

  expect(compressed).toBeInstanceOf(Uint8Array)
  expect(decompressJsonBrotli(compressed)).toEqual(value)
})
