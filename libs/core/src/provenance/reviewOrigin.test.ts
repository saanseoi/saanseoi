import { expect, test } from 'bun:test'
import { retainAuditResult, readAuditPage } from './audit'
import { retainObject } from './objects'
import type { ProvenanceStore } from './types'
import type { IndividualAudit } from './auditTypes'

test('review origin survives retention and cannot contradict the rule', async () => {
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
    id: 'qa-correction',
    scope: 'individual',
    basis: 'fixture',
    review: { kind: 'patch' },
  })
  const fixture = await retainObject(store, {
    expected: 'source-value',
    replacement: 'reviewed-value',
  })
  const action: IndividualAudit = {
    id: 'patch-1',
    operation: 'qa-correction',
    basis: 'fixture',
    review: { kind: 'patch' },
    outcome: 'applied',
    summary: 'Correct a reviewed QA issue.',
    reason: 'Independent QA finding.',
    definition,
    fixture: { object: fixture, pointer: '' },
    record: { id: 'record', names: [], parents: [] },
    context: {},
  }
  const input = {
    releaseId: 'release',
    datasetCode: 'dataset',
    attempt: { id: 'attempt', status: 'completed' as const },
    bulk: [],
    guards: [],
    individuals: [action],
  }
  const retained = await retainAuditResult(store, input)
  expect(retained.manifest.applicationCount).toBe(1)
  const page = await readAuditPage(store, retained.manifest, '', 0, 50, {
    category: 'patches',
  })
  expect(page.rows[0]?.review).toEqual({ kind: 'patch' })
  await expect(
    retainAuditResult(store, {
      ...input,
      individuals: [
        {
          ...action,
          review: {
            kind: 'curation',
            guard: {
              id: 'guard',
              summary: 'Review required.',
              consequence: 'block-ingestion',
            },
          },
        },
      ],
    }),
  ).rejects.toThrow('does not match')
})
