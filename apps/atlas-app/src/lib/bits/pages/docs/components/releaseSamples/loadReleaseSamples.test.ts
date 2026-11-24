import { expect, test } from 'bun:test'
import { loadAddressSample, loadReleaseSamples } from './loadReleaseSamples'

test('seeks inside canonical prefixed UUIDs instead of repeating the first address', async () => {
  const records = [
    { id: 'ss-00000000-0000-0000-0000-000000000000' },
    { id: 'ss-ffffffff-ffff-ffff-ffff-ffffffffffff' },
  ]
  const seeks: string[] = []
  const result = await loadAddressSample(async after => {
    seeks.push(after)
    return records.filter(record => record.id > after).slice(0, 1)
  })
  expect(result).toEqual([records[1]])
  expect(seeks).toHaveLength(2)
  expect(seeks[1]).toMatch(
    /^ss-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
})

test('prefixed UUID samples wrap to their namespace when the random pivot is past its end', async () => {
  const first = { id: 'ss-00000000-0000-0000-0000-000000000000' }
  const seeks: string[] = []
  const result = await loadAddressSample(async after => {
    seeks.push(after)
    return first.id > after ? [first] : []
  })
  expect(result).toEqual([first])
  expect(seeks).toHaveLength(3)
  expect(seeks[2]).toBe('ss-')
})

test('bare UUID samples do not add an identifier namespace', async () => {
  const record = { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }
  let calls = 0
  expect(
    await loadAddressSample(async () => {
      calls++
      return [record]
    }),
  ).toEqual([record])
  expect(calls).toBe(1)
})

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

test('aborted sample batches stop before converting results or retrying duplicates', async () => {
  const controller = new AbortController()
  let calls = 0
  await expect(
    loadReleaseSamples(
      [],
      4,
      async () => {
        calls++
        controller.abort()
        return [{ id: 'ignored', name: 'Old release' }]
      },
      controller.signal,
    ),
  ).rejects.toThrow()
  expect(calls).toBe(1)
})

test('aborted address seeks do not issue wraparound or namespace requests', async () => {
  const controller = new AbortController()
  let calls = 0
  await expect(
    loadAddressSample(async () => {
      calls++
      controller.abort()
      return []
    }, controller.signal),
  ).rejects.toThrow()
  expect(calls).toBe(1)
})
