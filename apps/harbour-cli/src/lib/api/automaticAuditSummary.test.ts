import { expect, test } from 'bun:test'
import { summariseAutomaticActions } from './automaticAuditSummary'

test('automatic audit size depends on operations, not matched records', () => {
  const actions = Array.from({ length: 10000 }, (_, index) => ({
    action: 'normalise',
    mode: 'automatic' as const,
    affectedRecordCount: 1,
    summary: 'Normalise matching publisher records.',
    evidence: { id: index, publisher: 'must not be uploaded' },
  }))
  expect(summariseAutomaticActions(actions)).toEqual([
    {
      action: 'normalise',
      mode: 'automatic',
      affectedRecordCount: 10000,
      summary: 'Normalise matching publisher records.',
    },
  ])
  expect(() => summariseAutomaticActions([{ ...actions[0]!, mode: 'manual' }])).toThrow(
    'individual audit',
  )
  expect(() =>
    summariseAutomaticActions([
      actions[0]!,
      { ...actions[1]!, summary: 'Record-specific description' },
    ]),
  ).toThrow('stable description')
})
