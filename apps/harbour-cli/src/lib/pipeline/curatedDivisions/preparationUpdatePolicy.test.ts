import { expect, test } from 'bun:test'
import { preparationUpdatePolicy } from './preparationUpdatePolicy'
import type { PreparationEvidence } from './preparationAudit'
test('automatic outcomes retain aggregate rule counts and manual decisions check the guard', () => {
  const evidence = {
    definitions: {
      updatePolicy: { coreLocales: ['en'], excludedNewNamePatterns: ['plaza'] },
    },
    records: [{ id: 'one' }],
    updateDecisions: ['keep', 'delete', 'restored', 'added', 'excluded'].map(
      status => ({ status, field: '$record' }),
    ),
  } as unknown as PreparationEvidence
  const result = preparationUpdatePolicy(evidence)
  expect(result.rule.declaration.basis).toBe('code')
  expect(result.rule.decisions).toEqual({ restored: 1, added: 1, excluded: 1 })
  expect(result.guard).toMatchObject({ status: 'passed', checked: 2, failed: 0 })
  expect(result.rule).not.toHaveProperty('fixtures')
})
