import { expect, test } from 'bun:test'

import { withMaterialisationCohort } from './uploadProcessing.ts'

test('keeps the release cohort separate from the geometry snapshot cohort', () => {
  const releasePlan = { cohortKey: '2026-Q2', sourceVersion: '2026-Q2' }

  expect(withMaterialisationCohort(releasePlan, '2016')).toEqual({
    cohortKey: '2016',
    sourceVersion: '2026-Q2',
  })
  expect(releasePlan.cohortKey).toBe('2026-Q2')
})
