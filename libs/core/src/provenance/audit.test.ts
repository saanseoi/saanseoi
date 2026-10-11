import { expect, test } from 'bun:test'
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

test('retains each curation once with its application count and resolves audit details on demand', async () => {
  const { store, objects } = memoryStore()
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'translate',
    scope: 'individual',
    basis: 'fixture',
    summary: 'Translate a name.',
  })
  const fixture = await retainObject(store, {
    entries: [{ id: 'river', sourceText: 'River', translation: '河' }],
  })
  const individuals: IndividualAudit[] = Array.from({ length: 300 }, (_, i) => ({
    id: `action-${i}`,
    operation: 'translate',
    basis: 'fixture',
    outcome: 'applied',
    summary: 'Translate a name.',
    reason: 'Reviewed translation.',
    definition,
    fixture: { object: fixture, pointer: '/entries/0' },
    record: { id: `division-${i}`, names: ['DUPLICATE RECORD NAME'], parents: [] },
    context: { duplicated: 'DO NOT RETAIN' },
  }))
  const result = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'release' },
    resourceReleaseId: 'release',
    datasetCode: 'divisions',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [],
    guards: [],
    individuals,
  })
  expect(result.manifest.applicationCount).toBe(300)
  expect(result.manifest.chunks).toHaveLength(1)
  expect(result.manifest.chunks[0]!.count).toBe(1)
  expect(objects.size).toBe(4) // definition, fixture, references/counts, manifest
  const retained = [...objects.values()]
    .map(bytes => new TextDecoder().decode(bytes))
    .join('')
  expect(retained).not.toContain('DO NOT RETAIN')
  expect(retained).not.toContain('DUPLICATE RECORD NAME')
  expect(retained).not.toContain('individual-search')
  const page = await readAuditPage(store, result.manifest, '河', 0, 50, {
    category: 'translations',
  })
  expect(page.total).toBe(1)
  expect(page.rows[0]!.context.applicationCount).toBe(300)
  expect(
    (await readAuditDecision(store, result.manifest, page.rows[0]!.id)).fixture,
  ).toEqual({ id: 'river', sourceText: 'River', translation: '河' })
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
  await verifyAuditResult(destination.store, result.manifest)
  expect((await readAuditPage(destination.store, result.manifest, '河')).total).toBe(1)
})

test('bulk search resolves retained fixture contents at read time', async () => {
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
    scope: { stage: 'ingestion', ownerId: 'r' },
    resourceReleaseId: 'r',
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
  expect(reads).toContain(objectKey(fixture.hash))
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
    scope: { stage: 'ingestion', ownerId: 'large-release' },
    resourceReleaseId: 'large-release',
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
  expect(result.manifest.bulk[0]?.search).toBeUndefined()
}, 30_000)

test('bulk payloads and completed failed guards cannot pass audit validation', async () => {
  const { store } = memoryStore()
  const definition = await retainObject(store, {
    id: 'normalise',
    scope: 'bulk',
    basis: 'code',
  })
  const result = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'release' },
    resourceReleaseId: 'release',
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

test('automatic rules cannot retain per-record actions or payload fixtures', async () => {
  const { store } = memoryStore()
  const definition = await retainObject(store, {
    kind: 'processing-rule',
    schemaVersion: 1,
    id: 'automatic',
    scope: 'bulk',
    basis: 'code',
  })
  const fixture = await retainObject(store, { record: 'publisher-copy' })
  const input = {
    scope: { stage: 'ingestion' as const, ownerId: 'release' },
    resourceReleaseId: 'release',
    datasetCode: 'dataset',
    attempt: { id: 'attempt', status: 'completed' as const },
    guards: [],
    bulk: [],
    individuals: [
      {
        id: 'automatic:record',
        operation: 'automatic',
        basis: 'code' as const,
        outcome: 'applied' as const,
        summary: 'Normalise',
        reason: 'Matches rule',
        definition,
        fixture: null,
        record: { id: 'record', names: [], parents: [] },
        context: {},
      },
    ],
  }
  await expect(retainAuditResult(store, input)).rejects.toThrow(
    'automatic rules must use bulk counts',
  )
  await expect(
    retainAuditResult(store, {
      ...input,
      individuals: [],
      bulk: [
        {
          id: 'automatic',
          definition,
          basis: 'code',
          summary: 'Normalise',
          outcome: 'applied',
          counts: { inputs: {}, outputs: {}, recordsAffected: 1, decisions: {} },
          fixtures: [{ type: 'copied-records', object: fixture }],
        },
      ],
    }),
  ).rejects.toThrow('not record evidence fixtures')
  await expect(
    retainAuditResult(store, {
      ...input,
      individuals: [
        {
          ...input.individuals[0]!,
          basis: 'fixture',
          fixture: { object: fixture, pointer: '' },
        },
      ],
    }),
  ).rejects.toThrow('fixture-based declaration')
})
