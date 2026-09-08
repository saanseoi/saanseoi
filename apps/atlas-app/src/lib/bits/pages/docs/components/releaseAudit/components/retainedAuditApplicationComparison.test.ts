import { expect, test } from 'bun:test'
import type { IndividualAudit } from '@repo/core/provenance'
import { auditApplicationComparison } from './retainedAuditApplicationComparison'

const row = (context: IndividualAudit['context'], review?: IndividualAudit['review']) =>
  ({ context, review }) as IndividualAudit

test('classification evidence keeps input/output presentation without a patch filter', () => {
  expect(
    auditApplicationComparison(
      row({
        expected: { adminLevel: 2, class: null, subtype: 'region' },
        replacement: { level: 4, type: 'macrohood' },
      }),
    ),
  ).toEqual({
    input: { adminLevel: 2, class: null, subtype: 'region' },
    output: { level: 4, type: 'macrohood' },
  })
})

test('comparisons preserve null and false values and leave translations alone', () => {
  expect(auditApplicationComparison(row({ input: null, output: false }))).toEqual({
    input: null,
    output: false,
  })
  expect(
    auditApplicationComparison(
      row({ expected: null, input: 'not selected', replacement: 0 }),
    ),
  ).toEqual({ input: null, output: 0 })
  expect(
    auditApplicationComparison(row({ sourceText: 'River', name: '河' })),
  ).toBeNull()
  expect(auditApplicationComparison(row({}, { kind: 'patch' }))).toEqual({
    input: null,
    output: null,
  })
})
