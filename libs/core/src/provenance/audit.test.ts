import { expect, spyOn, test } from 'bun:test'
import {
  retainAuditResult,
  readAuditPage,
  readAuditDecision,
  verifyAuditResult,
  validateAuditManifest,
} from './audit'
import { retainObject, objectKey } from './objects'
import { transferProcessingResult } from './transfer'
import type { IndividualAudit } from './auditTypes'
import type { ProvenanceStore } from './types'

function memoryStore() {
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
  return { store, reads, objects }
}

test('individual search reads indexes and only matching action chunks; transfer preserves the complete audit', async () => {
  const { store, reads } = memoryStore()
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'translate',
    scope: 'individual',
    basis: 'fixture',
  })
  const fixture = await retainObject(store, {
    entries: [{ sourceText: 'River', translation: '河' }],
  })
  const individuals: IndividualAudit[] = Array.from(
    { length: 300 },
    (_, i): IndividualAudit => ({
      id: `action-${i}`,
      operation: 'translate',
      basis: 'fixture',
      outcome: 'applied',
      summary: 'Translate a name.',
      reason: 'Reviewed translation.',
      definition,
      fixture: { object: fixture, pointer: '/entries/0' },
      record: {
        id: `division-${i}`,
        names: [i === 280 ? '河' : 'River'],
        parents: [
          { id: 'parent', names: [i === 280 ? 'North district' : 'South district'] },
        ],
      },
      context: i === 281 ? { replacement: { type: 'macrohood' } } : {},
    }),
  )
  const result = await retainAuditResult(store, {
    releaseId: 'release',
    datasetCode: 'divisions',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [],
    guards: [],
    individuals,
  })
  expect(result.manifest.chunks).toHaveLength(2)
  expect(
    (
      await readAuditPage(store, result.manifest, 'macrohood', 0, 50, {
        category: 'translations',
      })
    ).rows.map(row => row.id),
  ).toEqual(['action-281'])
  const fixturePage = await readAuditPage(store, result.manifest, '', 250, 50, {
    fixture: { hash: fixture.hash, pointer: '/entries/0' },
  })
  expect(fixturePage.rows).toHaveLength(50)
  expect(fixturePage.rows[0]?.id).toBe('action-250')
  expect(fixturePage.nextOffset).toBeNull()
  expect(
    (
      await readAuditPage(store, result.manifest, '', 0, 50, {
        fixture: { hash: fixture.hash, pointer: '/entries/1' },
      })
    ).total,
  ).toBe(0)
  expect(
    (
      await readAuditPage(store, result.manifest, '', 0, 50, {
        fixture: { hash: definition.hash, pointer: '/entries/0' },
      })
    ).total,
  ).toBe(0)
  expect(
    (
      await readAuditPage(store, result.manifest, '', 0, 50, {
        category: 'translations',
      })
    ).total,
  ).toBe(300)
  expect(
    (await readAuditPage(store, result.manifest, '', 0, 50, { category: 'curations' }))
      .total,
  ).toBe(0)
  reads.length = 0
  const page = await readAuditPage(store, result.manifest, 'north 河')
  expect(page.rows.map(r => r.id)).toEqual(['action-280'])
  expect(reads).not.toContain(objectKey(result.manifest.chunks[0]!.hash))
  expect(reads).toContain(objectKey(result.manifest.chunks[1]!.hash))
  reads.length = 0
  expect(
    (await readAuditDecision(store, result.manifest, 'action-280')).fixture,
  ).toEqual({ sourceText: 'River', translation: '河' })
  expect(reads).not.toContain(objectKey(result.manifest.chunks[0]!.hash))
  await expect(readAuditDecision(store, result.manifest, 'undeclared')).rejects.toThrow(
    'not declared',
  )
  const destination = memoryStore()
  const transferred: string[] = []
  await transferProcessingResult(
    store,
    {
      get: destination.store.get,
      async put(key, bytes) {
        await destination.store.put(key, bytes)
        transferred.push(key)
      },
    },
    result.ref,
    { concurrency: 4 },
  )
  expect(transferred.at(-1)).toBe(objectKey(result.ref.hash))
  const fixtureText = new TextDecoder().decode(
    destination.objects.get(objectKey(fixture.hash)),
  )
  const parse = JSON.parse
  let fixtureParses = 0
  const parseSpy = spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === fixtureText) fixtureParses += 1
    return parse(text, reviver)
  })
  try {
    await verifyAuditResult(destination.store, result.manifest)
    expect(fixtureParses).toBe(1)
  } finally {
    parseSpy.mockRestore()
  }
  expect(
    (await readAuditPage(destination.store, result.manifest, '', 250, 50)).rows,
  ).toHaveLength(50)
})

test('bulk search indexes retained fixture contents without reading fixtures during search', async () => {
  const { store, reads } = memoryStore()
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'fields',
    scope: 'bulk',
    basis: 'fixture',
  })
  const fixture = await retainObject(store, {
    fields: [{ sourceField: 'QTR_PRH_HS', name: 'Housing Society rental flats' }],
  })
  const result = await retainAuditResult(store, {
    releaseId: 'r',
    datasetCode: 'stats',
    attempt: { id: 'a', status: 'completed' },
    guards: [],
    individuals: [],
    bulk: [
      {
        id: 'fields',
        definition,
        basis: 'fixture',
        summary: 'Apply reviewed field metadata.',
        outcome: 'applied',
        counts: { inputs: {}, outputs: {}, recordsAffected: 1, decisions: {} },
        fixtures: [{ type: 'statistic-fields', object: fixture }],
      },
    ],
  })
  reads.length = 0
  expect(
    (await readAuditPage(store, result.manifest, 'QTR_PRH_HS society')).bulkIds,
  ).toEqual(['fields'])
  expect(reads).not.toContain(objectKey(fixture.hash))
  expect(
    (await readAuditPage(store, result.manifest, 'unmatched-text')).bulkIds,
  ).toEqual([])
})

test('bulk search bounds large retained fixture indexes', async () => {
  const { store } = memoryStore()
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'large-fixture',
    scope: 'bulk',
    basis: 'fixture',
  })
  const fixtures = await Promise.all(
    Array.from({ length: 140 }, async (_, index) => ({
      type: 'large-fixture',
      object: await retainObject(store, {
        values: Array.from(
          { length: 500 },
          (_, value) => `fixture-${index}-${value}-searchable`,
        ),
      }),
    })),
  )
  const result = await retainAuditResult(store, {
    releaseId: 'large-release',
    datasetCode: 'large',
    attempt: { id: 'large-attempt', status: 'completed' },
    guards: [],
    individuals: [],
    bulk: [
      {
        id: 'large-fixture',
        definition,
        basis: 'fixture',
        summary: 'Retain a large fixture.',
        outcome: 'applied',
        counts: { inputs: {}, outputs: {}, recordsAffected: 1, decisions: {} },
        fixtures,
      },
    ],
  })
  expect(result.manifest.bulk[0]?.search?.byteLength).toBeLessThanOrEqual(1024 * 1024)
}, 30_000)

test('bulk payloads and completed failed guards cannot pass audit validation', async () => {
  const { store } = memoryStore()
  const definition = await retainObject(store, {
    id: 'normalise',
    scope: 'bulk',
    basis: 'code',
  })
  const result = await retainAuditResult(store, {
    releaseId: 'release',
    datasetCode: 'stats',
    attempt: { id: 'attempt', status: 'failed' },
    individuals: [],
    bulk: [
      {
        id: 'normalise',
        definition,
        basis: 'code',
        summary: 'Normalise numbers.',
        outcome: 'not-run',
        counts: { inputs: {}, outputs: {}, recordsAffected: 0, decisions: {} },
        fixtures: [],
      },
    ],
    guards: [
      {
        id: 'unique',
        summary: 'Require unique identities.',
        consequence: 'block-ingestion',
        status: 'failed',
        checked: 2,
        failed: 1,
        reason: 'Duplicate identity.',
      },
    ],
  })
  expect(() =>
    validateAuditManifest({
      ...result.manifest,
      attempt: { id: 'attempt', status: 'completed' },
    }),
  ).toThrow('failed blocking guard')
  expect(() =>
    validateAuditManifest({
      ...result.manifest,
      bulk: [{ ...result.manifest.bulk[0], evidence: [{ value: 123 }] }],
    }),
  ).toThrow('Invalid provenance structure')
})
