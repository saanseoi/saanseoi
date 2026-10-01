import { expect, it } from 'vitest'
import { coverageSummary } from '../src/local-review/division-areas/coverageSummary'

it('counts unique divisions and polygon coverage across reference and drawn areas', () => {
  const rows = [
    { id: 'a', category: 'administrative' },
    { id: 'b', category: 'locality' },
    { id: 'c', category: 'hood' },
    { id: 'd', category: 'landform' },
    { id: 'd', category: 'landform' },
  ]
  expect(coverageSummary(rows, ['a', 'a', 'd', 'unknown'])).toEqual([
    { total: 4, coverage: 2 },
    { total: 1, coverage: 1 },
    { total: 1, coverage: 0 },
    { total: 1, coverage: 0 },
    { total: 1, coverage: 1 },
  ])
})
