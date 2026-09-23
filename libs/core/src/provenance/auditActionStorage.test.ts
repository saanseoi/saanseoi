import { auditObjectSchemas } from './auditSchema'
import { validateShape } from './schema'
import { expect, test } from 'bun:test'
import { packAuditActions, unpackAuditActions } from './auditActionStorage'
import type { IndividualAudit } from './auditTypes'
import { serialise } from './objects'

test('column storage preserves optional fields, nulls, Unicode and exact action semantics', () => {
  const actions = Array.from({ length: 256 }, (_, i) => ({
    id: `action-${i}`,
    operation: 'translate',
    outcome: 'applied',
    summary: 'Apply reviewed translation',
    reason: 'Required name missing',
    basis: 'code',
    fixture: null,
    definition: { hash: `sha256:${'a'.repeat(64)}`, byteLength: 100 },
    record: { id: `record-${i}`, names: ['大澳'], parents: [] },
    context: { source: null, name: '大澳', nested: { retained: true } },
    ...(i % 2 ? { review: { kind: 'patch' } } : {}),
  })) as IndividualAudit[]
  const packed = packAuditActions(actions)
  expect(() => validateShape(packed, { anyOf: auditObjectSchemas })).not.toThrow()
  expect(unpackAuditActions(JSON.parse(serialise(packed))).actions).toEqual(actions)
  expect(serialise(packed).length).toBeLessThan(serialise(actions).length * 0.5)
  expect(
    serialise(
      packAuditActions(
        actions.map(
          a => Object.fromEntries(Object.entries(a).reverse()) as IndividualAudit,
        ),
      ),
    ),
  ).toBe(serialise(packed))
})

test('invalid dictionary references and duplicate columns fail closed', () => {
  const packed = {
    kind: 'individual-actions',
    schemaVersion: 2,
    count: 1,
    columns: [{ field: 'id', values: ['one'], rows: [1] }],
  }
  expect(() => unpackAuditActions(packed)).toThrow('reference')
  packed.columns[0]!.rows = [0]
  packed.columns.push(packed.columns[0]!)
  expect(() => unpackAuditActions(packed)).toThrow('column')
})

test('compact input cannot amplify into an oversized action page', () => {
  expect(() =>
    unpackAuditActions({
      kind: 'individual-actions',
      schemaVersion: 2,
      count: 256,
      columns: [
        { field: 'context', values: ['x'.repeat(5000)], rows: Array(256).fill(0) },
      ],
    }),
  ).toThrow('Expanded audit chunk exceeds byte limit')
})
