import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { recordCacheKey } from './placeRecordCache'
test('streamed array cache keys preserve JSON byte hashes, including sparse and nested inputs', () => {
  const sparse = Array(3)
  sparse[0] = 1
  sparse[2] = 3
  const values: unknown[] = [
    null,
    0,
    '繁體😀',
    {},
    [],
    [undefined, NaN, Infinity],
    sparse,
    [[{ a: 'x', b: undefined }], ['a', 'b']],
    { nested: [1, 2] },
    [
      { toJSON: (key: string) => key },
      Object.assign([], { toJSON: (key: string) => [key] }),
      { toJSON: () => undefined },
    ],
    Array.from({ length: 10000 }, (_, i) => ({ id: i, text: '道路' })),
  ]
  for (const value of values)
    expect(recordCacheKey(value)).toBe(
      createHash('sha256').update(JSON.stringify(value)).digest('hex'),
    )
  const custom = Object.assign([1, 2], { toJSON: () => ['custom'] })
  expect(recordCacheKey(custom)).toBe(
    createHash('sha256').update(JSON.stringify(custom)).digest('hex'),
  )
  const circular: unknown[] = []
  circular.push(circular)
  expect(() => recordCacheKey(circular)).toThrow()
})
