import { expect, test } from 'bun:test'
import { curationApplies, scopedExclusions } from './curationApplicability'
import exclusions from '../../../../../../fixtures/meta/curations/saanseoi-division/division-exclusions.json'
test('release applicability includes the start and excludes the end', () => {
  const row = { appliesFrom: '2026-10-01.2', appliesUntil: '2026-10-01.10' }
  expect(curationApplies(row, '2026-10-01.1')).toBe(false)
  expect(curationApplies(row, '2026-10-01.2')).toBe(true)
  expect(curationApplies(row, '2026-10-01.9')).toBe(true)
  expect(curationApplies(row, '2026-10-01.10')).toBe(false)
  expect(() => curationApplies(row)).toThrow('release version')
  expect(() => curationApplies({ appliesFrom: 'bad' }, '2026-10-01.0')).toThrow(
    'bounds',
  )
})
test('one list preserves independently scoped exclusions without duplicate identities', () => {
  expect(new Set(exclusions.entries.map(row => row.divisionId)).size).toBe(
    exclusions.entries.length,
  )
  expect(scopedExclusions(exclusions.entries, 'result')).toHaveLength(98)
  expect(scopedExclusions(exclusions.entries, 'overture')).toHaveLength(105)
  expect(scopedExclusions(exclusions.entries, 'landsd')).toHaveLength(0)
  expect(
    scopedExclusions(
      [{ divisionId: 'a', scopes: ['overture'], appliesUntil: '2026-10-01.0' }],
      'overture',
      '2026-10-01.0',
    ),
  ).toEqual([])
})
