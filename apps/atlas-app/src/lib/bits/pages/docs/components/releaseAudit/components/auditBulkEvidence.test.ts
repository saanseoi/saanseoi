import { expect, test } from 'bun:test'
import type { BulkAudit } from '@repo/core/provenance'
import { auditBulkEvidence } from './auditBulkEvidence'

const rule = (
  id: string,
  inputs: Record<string, number> = {},
  fixtures: BulkAudit['fixtures'] = [],
) => ({ id, counts: { inputs }, fixtures }) as BulkAudit
const bridge = rule('resolve-geography-identities', {}, [
  { type: 'identity-mappings', object: { hash: 'sha256:bridge', byteLength: 1 } },
])

test('identity consumers reuse retained evidence without changing the audit', () => {
  const consumer = rule('match-districts', { 'identity-mappings': 18 })
  expect(auditBulkEvidence(consumer, [consumer, bridge])).toBe(bridge)
  expect(consumer.fixtures).toEqual([])
  expect(auditBulkEvidence(consumer, [consumer])).toBe(consumer)
})

test('direct evidence takes precedence and unrelated rules do not inherit bridges', () => {
  const direct = rule('match-districts', { 'identity-mappings': 18 }, bridge.fixtures)
  const unrelated = rule('normalise-statistics', { observations: 18 })
  expect(auditBulkEvidence(direct, [bridge, direct])).toBe(direct)
  expect(auditBulkEvidence(unrelated, [bridge, unrelated])).toBe(unrelated)
})
