import { expect, test } from 'bun:test'
import { loadAddressSample, loadReleaseSamples } from './loadReleaseSamples'

test('seeks inside a hash-prefixed namespace and wraps at its end', async () => {
  const seeks: string[] = []
  const first = { id: `opa-${'0'.repeat(64)}` }
  const result = await loadAddressSample(async after => {
    seeks.push(after)
    return seeks.length === 2 ? [] : [first]
  })
  expect(seeks).toHaveLength(3)
  expect(seeks[1]).toMatch(/^opa-[0-9a-f]{32}$/)
  expect(seeks[2]).toBe('opa-')
  expect(result).toEqual([first])
})

test('empty address collections terminate after wrapping once', async () => {
  const seeks: string[] = []
  expect(
    await loadAddressSample(async after => {
      seeks.push(after)
      return []
    }),
  ).toEqual([])
  expect(seeks).toHaveLength(2)
  expect(seeks[1]).toBe('')
})

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
