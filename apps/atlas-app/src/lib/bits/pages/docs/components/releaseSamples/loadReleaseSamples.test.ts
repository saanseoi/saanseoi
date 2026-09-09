import { expect, test } from 'bun:test'
import { loadReleaseSamples } from './loadReleaseSamples'

test('requests only missing samples and retries duplicates', async () => {
  const counts: number[] = []
  const result = await loadReleaseSamples([], 2, async count => {
    counts.push(count)
    return counts.length === 1
      ? [
          { id: 'a', name: 'First' },
          { id: 'a', name: 'First' },
        ]
      : [{ id: 'b', name: 'Second' }]
  })
  expect(counts).toEqual([2, 1])
  expect(result.map(row => row.id)).toEqual(['a', 'b'])
})

test('stops when the source is exhausted', async () => {
  let calls = 0
  expect(
    await loadReleaseSamples([], 4, async () => {
      calls++
      return []
    }),
  ).toEqual([])
  expect(calls).toBe(1)
})
