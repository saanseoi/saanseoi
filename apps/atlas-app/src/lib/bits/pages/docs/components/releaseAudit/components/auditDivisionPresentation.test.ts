import { expect, test } from 'bun:test'
import {
  curationAction,
  decodeAuditValue,
  divisionAuditTitle,
} from './auditDivisionPresentation'
test('hierarchy summaries count distinct ancestors across paths', () => {
  expect(
    curationAction({
      definition: {
        paths: [
          ['a', 'b'],
          ['a', 'c'],
        ],
      },
    }),
  ).toBe('3 ancestors')
  expect(curationAction({ definition: { paths: [['a']] } })).toBe('1 ancestor')
})
test('island geometry review actions use the decision and rejection code', () => {
  const row = { section: 'exclusions', collection: 'islandDecisions' }
  expect(curationAction({ ...row, definition: { decision: 'accepted' } })).toBe(
    'Accepted',
  )
  expect(
    curationAction({
      ...row,
      definition: { decision: 'rejected', rejectionCode: 'remove-tied-land' },
    }),
  ).toBe('Rejected · remove-tied-land')
  expect(
    curationAction({
      ...row,
      definition: {
        decision: 'rejected',
        rejectionCode: 'remove-man-made-attachments',
      },
    }),
  ).toBe('Rejected · remove-man-made-attachments')
  expect(
    curationAction({ section: 'exclusions', collection: 'entries', definition: {} }),
  ).toBe('Exclude')
})
test('division row names and missing names', () => {
  expect(divisionAuditTitle({ id: 'fallback' })).toBe('fallback')
  expect(
    divisionAuditTitle({ names: { after: [{ locale: 'en', name: 'Tai Tam Gap' }] } }),
  ).toBe('Tai Tam Gap')
  expect(divisionAuditTitle({ before: { names: { en: 'Old name' } } })).toBe('Old name')
})
test('decodes nested database JSON while preserving ordinary strings', () => {
  expect(decodeAuditValue({ hierarchies: '{"full":[{"name":"Hong Kong"}]}' })).toEqual({
    hierarchies: { full: [{ name: 'Hong Kong' }] },
  })
  expect(decodeAuditValue('[not json')).toBe('[not json')
})
