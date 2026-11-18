import { expect, test } from 'bun:test'
import { retainAuditResult } from './audit'
import { objectKey, retainObject } from './objects'
import { readAuditPageIndex, readAuditFixtureCatalogue } from './auditSearchIndex'
import type { ProvenanceStore } from './types'

test('audit presentation reads fixtures without retaining derived objects', async () => {
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
    id: 'fields',
    scope: 'bulk',
    basis: 'fixture',
  })
  const fixture = await retainObject(store, {
    fields: [{ sourceField: 'population', fieldName: 'Population' }],
  })
  const audit = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'release' },
    resourceReleaseId: 'release',
    datasetCode: 'statistics',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [
      {
        id: 'fields',
        basis: 'fixture',
        summary: 'Reviewed fields',
        outcome: 'applied',
        definition,
        counts: { inputs: {}, outputs: {}, recordsAffected: 1, decisions: {} },
        fixtures: [{ type: 'fields', object: fixture }],
      },
    ],
    guards: [],
    individuals: [],
  })
  const size = objects.size
  reads.length = 0
  const catalogue = await readAuditFixtureCatalogue(
    store,
    audit.manifest,
    '2026-09-10.0',
  )
  const page = await readAuditPageIndex(store, audit.manifest)
  expect(catalogue.groups.fields?.fields?.rows).toHaveLength(1)
  expect(page.bulk[0]?.text).toContain('fields')
  expect(reads).toContain(objectKey(fixture.hash))
  expect(objects.size).toBe(size)
})

test('large non-tabular evidence builds bounded search without merging its payloads', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
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
    id: 'prepare',
    scope: 'bulk',
    basis: 'fixture',
  })
  const fixture = await retainObject(store, {
    actions: [{ evidence: `needle ${'retained evidence '.repeat(55000)}` }],
  })
  const audit = await retainAuditResult(store, {
    scope: { stage: 'ingestion', ownerId: 'release' },
    resourceReleaseId: 'release',
    datasetCode: 'addresses',
    attempt: { id: 'attempt', status: 'completed' },
    bulk: [
      {
        id: 'prepare',
        basis: 'fixture',
        summary: 'Retained preparation evidence',
        outcome: 'applied',
        definition,
        counts: { inputs: {}, outputs: {}, recordsAffected: 10, decisions: {} },
        fixtures: Array.from({ length: 10 }, () => ({
          type: 'actions',
          object: fixture,
        })),
      },
    ],
    guards: [],
    individuals: [],
  })
  const catalogue = await readAuditFixtureCatalogue(
    store,
    audit.manifest,
    '2026-09-10.0',
  )
  expect(catalogue.groups.prepare?.actions?.text).toContain('needle')
  expect(catalogue.groups.prepare?.actions?.text?.length).toBeLessThan(1_048_576)
  expect(objects.get(objectKey(fixture.hash))).toBeDefined()
})

test('large partitioned catalogues return counts and search beyond the first partition', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
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
    id: 'partitioned',
    scope: 'bulk',
    basis: 'fixture',
  })
  const fixtures = []
  for (let index = 0; index < 7; index++) {
    fixtures.push({
      type: 'evidence',
      object: await retainObject(store, {
        auditPartition: { firstOrdinal: index },
        entries: [
          {
            id: index,
            evidence: 'evidence '.repeat(80000),
            label: index === 6 ? 'last needle' : 'other',
          },
        ],
      }),
    })
  }
  const audit = await retainAuditResult(store, {
    scope: { stage: 'assembly', ownerId: 'snapshot' },
    resourceReleaseId: 'release',
    datasetCode: 'places',
    attempt: { id: 'attempt', status: 'completed' },
    guards: [],
    individuals: [],
    bulk: [
      {
        id: 'partitioned',
        basis: 'fixture',
        summary: 'Evidence',
        outcome: 'applied',
        definition,
        counts: { inputs: {}, outputs: {}, recordsAffected: 7, decisions: {} },
        fixtures,
      },
    ],
  })
  const before = objects.size
  const catalogue = await readAuditFixtureCatalogue(
    store,
    audit.manifest,
    'release',
    'last needle',
  )
  expect(catalogue.groups.partitioned?.evidence).toEqual({
    rows: [],
    text: null,
    totalRows: 7,
    matchingRows: 1,
  })
  expect(JSON.stringify(catalogue).length).toBeLessThan(200)
  expect(objects.size).toBe(before)
})
