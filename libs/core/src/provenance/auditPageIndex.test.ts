import { expect, test } from 'bun:test'
import { retainAuditResult } from './audit'
import { buildAuditPageIndex, readIndexedAuditPage } from './auditPageIndex'
import { objectKey, retainObject } from './objects'
import type { IndividualAudit } from './auditTypes'
import type { ProvenanceStore } from './types'

test('cached category and fixture search reads only page chunks and shares global search semantics', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const reads: string[] = []
  const store: ProvenanceStore = {
    async get(key) {
      reads.push(key)
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'translate',
    scope: 'individual',
    basis: 'fixture',
  })
  const fixture = await retainObject(store, { entries: [{ translation: '河' }] })
  const individuals: IndividualAudit[] = Array.from({ length: 300 }, (_, i) => ({
    id: `action-${i}`,
    operation: 'translate',
    basis: 'fixture',
    outcome: 'applied',
    summary: 'Translate a name',
    reason: 'Reviewed translation',
    definition,
    fixture: { object: fixture, pointer: '/entries/0' },
    record: { id: `division-${i}`, names: ['River'], parents: [] },
    context: i === 280 ? { replacement: 'macrohood' } : {},
  }))
  const { manifest } = await retainAuditResult(store, {
    releaseId: 'release',
    datasetCode: 'divisions',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [],
    guards: [],
    individuals,
  })
  const index = await buildAuditPageIndex(store, manifest)
  reads.length = 0
  const page = await readIndexedAuditPage(
    store,
    manifest,
    index,
    'ＭＡＣＲＯＨＯＯＤ',
    0,
    50,
    { category: 'translations' },
  )
  expect(page.rows.map(row => row.id)).toEqual(['action-280'])
  expect(page.total).toBe(1)
  const secondChunk = manifest.chunks[1]
  if (!secondChunk) throw new Error('Expected two action chunks')
  expect(reads).toEqual([objectKey(secondChunk.hash)])
  expect((await readIndexedAuditPage(store, manifest, index, 'macrohood')).total).toBe(
    page.total,
  )
  reads.length = 0
  const absent = await readIndexedAuditPage(store, manifest, index, '', 0, 50, {
    fixture: { hash: fixture.hash, pointer: '/entries/1' },
  })
  expect(absent.total).toBe(0)
  expect(reads).toEqual([])
  const later = await readIndexedAuditPage(store, manifest, index, '', 250, 50, {
    category: 'translations',
    fixture: { hash: fixture.hash, pointer: '/entries/0' },
  })
  expect(later.rows).toHaveLength(50)
  expect(later.rows[0]?.id).toBe('action-250')
  expect(later.total).toBe(300)
  expect(later.nextOffset).toBeNull()
  reads.length = 0
  const counts = await readIndexedAuditPage(
    store,
    manifest,
    index,
    'macrohood',
    0,
    50,
    { countOnly: true },
  )
  expect(counts.total).toBe(1)
  expect(counts.rows).toEqual([])
  expect(reads).toEqual([])
})
