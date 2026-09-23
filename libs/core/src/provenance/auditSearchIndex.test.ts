import { expect, test } from 'bun:test'
import { retainAuditResult } from './audit'
import { objectKey, retainObject } from './objects'
import {
  auditSearchKey,
  retainAuditSearchIndex,
  readAuditPageIndex,
  readAuditFixtureCatalogue,
} from './auditSearchIndex'
import type { ProvenanceStore } from './types'

test('backfill preserves immutable audit objects and serves search without evidence reads', async () => {
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
    releaseId: 'release',
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
  const original = objects.get(objectKey(audit.ref.hash))
  await retainAuditSearchIndex(store, audit.ref, audit.manifest, '2026-09-10.0')
  expect(objects.get(objectKey(audit.ref.hash))).toBe(original)
  expect(objects.has(auditSearchKey(audit.ref.hash))).toBe(true)
  const size = objects.size
  await retainAuditSearchIndex(store, audit.ref, audit.manifest, '2026-09-10.0')
  expect(objects.size).toBe(size)
  reads.length = 0
  const catalogue = await readAuditFixtureCatalogue(store, audit.ref.hash)
  const page = await readAuditPageIndex(store, audit.ref.hash)
  expect(catalogue.groups.fields?.fields?.rows).toHaveLength(1)
  expect(page.bulk[0]?.text).toContain('population')
  expect(reads).not.toContain(objectKey(fixture.hash))
  expect(reads).not.toContain(objectKey(definition.hash))
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
    releaseId: 'release',
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
  await retainAuditSearchIndex(store, audit.ref, audit.manifest, '2026')
  const catalogue = await readAuditFixtureCatalogue(store, audit.ref.hash)
  expect(catalogue.groups.prepare?.actions?.text).toContain('needle')
  expect(catalogue.groups.prepare?.actions?.text?.length).toBeLessThan(1_048_576)
  expect(objects.get(objectKey(fixture.hash))).toBeDefined()
})
