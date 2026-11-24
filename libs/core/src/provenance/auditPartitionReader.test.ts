import { expect, test } from 'bun:test'
import { readPartitionedFixture } from './auditPartitionReader'
import { retainObject } from './objects'
import { createMemoryProvenanceStore } from '../testing/provenanceStore'

test('partitioned evidence deduplicates across chunks and searches late rows before paging', async () => {
  const { store } = createMemoryProvenanceStore()
  const entries = Array.from({ length: 120 }, (_, id) => ({
    id,
    name: `Evidence ${id}`,
    nested: { label: id === 119 ? '香港 needle' : 'other' },
  }))
  const refs = await Promise.all([
    retainObject(store, {
      auditPartition: { firstOrdinal: 0 },
      entries: entries.slice(0, 70),
      ledger: { count: 120 },
    }),
    retainObject(store, {
      auditPartition: { firstOrdinal: 70 },
      entries: [entries[0]!, ...entries.slice(70)],
      ledger: { count: 120 },
    }),
  ])
  const catalogue = await readPartitionedFixture(store, refs, '')
  expect(catalogue.group).toEqual({
    rows: [],
    text: null,
    totalRows: 120,
    matchingRows: 120,
  })
  expect(catalogue.value.entries).toHaveLength(0)
  const page = await readPartitionedFixture(store, refs, '', 50)
  expect(page.value.entries).toEqual(entries.slice(50, 100))
  expect(page.value).toHaveProperty('ledger', { count: 120 })
  const search = await readPartitionedFixture(store, refs, '香港 NEEDLE', 0)
  expect(search.group.matchingRows).toBe(1)
  expect(search.value.entries).toEqual([entries[119]!])
})

test('partitioned decisions are countable and paged without returning their full arrays', async () => {
  const { store } = createMemoryProvenanceStore()
  const ref = await retainObject(store, {
    auditPartition: { firstOrdinal: 0 },
    decisions: [{ reason: 'reviewed' }, { reason: 'deferred' }],
  })
  const result = await readPartitionedFixture(store, [ref], 'deferred', 0)
  expect(result.group.totalRows).toBe(2)
  expect(result.group.matchingRows).toBe(1)
  expect(result.value.entries).toEqual([{ reason: 'deferred' }])
  expect(result.value).not.toHaveProperty('decisions')
})

test('missing or corrupt partitions fail rather than returning incomplete counts', async () => {
  const { store, objects } = createMemoryProvenanceStore()
  const ref = await retainObject(store, {
    auditPartition: { firstOrdinal: 0 },
    entries: [{ id: 1 }],
  })
  objects.clear()
  await expect(readPartitionedFixture(store, [ref], '')).rejects.toThrow(
    'Missing provenance object',
  )
})
