import { expect, test } from 'bun:test'

import {
  compressJsonBrotli,
  decompressJsonBrotli,
  MAX_BROTLI_QUALITY,
} from './brotliJson.ts'

test('round-trips JSON through Brotli bytes', () => {
  const value = {
    coordinates: [114.1694, 22.3193],
    type: 'Point',
  }

  const compressed = compressJsonBrotli(value)

  expect(compressed).toBeInstanceOf(Uint8Array)
  expect(decompressJsonBrotli(compressed)).toEqual(value)
})

test('rejects values JSON cannot serialize', () => {
  expect(() => compressJsonBrotli(undefined)).toThrow(
    'Value cannot be serialized as JSON',
  )
})

test('supports maximum-density Brotli compression', () => {
  const value = {
    coordinates: Array.from({ length: 100 }, (_, index) => [114 + index, 22 + index]),
    type: 'LineString',
  }

  expect(decompressJsonBrotli(compressJsonBrotli(value, MAX_BROTLI_QUALITY))).toEqual(
    value,
  )
})
