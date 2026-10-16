import { expect, test } from 'bun:test'
import { isApproved, readSignoffs, viewKey } from './src/signoffs'
test('sign-offs distinguish table subsets and become pending for a new data revision', () => {
  const key = viewKey('HISTORY', 'lineage', 'records', 'deletes')
  const saved = readSignoffs(
    JSON.stringify({ [key]: { revision: 'one', signedAt: '2026-10-15T00:00:00Z' } }),
  )
  expect(isApproved(saved, key, 'one')).toBe(true)
  expect(isApproved(saved, key, 'two')).toBe(false)
  expect(isApproved(saved, viewKey('HISTORY', 'lineage', 'records', ''), 'one')).toBe(
    false,
  )
  expect(readSignoffs('{broken')).toEqual({})
  expect(readSignoffs(JSON.stringify({ bad: { revision: 'one' } }))).toEqual({})
})

test('production-review flags cover every subset, remain pending independently of revisions, and reject malformed records', async () => {
  const { tableKey, needsProductionReview, readProductionReviews } = await import(
    './src/productionReviews'
  )
  const key = tableKey('CURRENT', 'lineage', 'records')
  const entry = {
    kind: 'CURRENT',
    group: 'lineage',
    groupLabel: 'Example lineage',
    table: 'records',
    markedAt: '2026-10-16T00:00:00Z',
  }
  const saved = readProductionReviews(JSON.stringify({ [key]: entry }))
  expect(needsProductionReview(saved, 'CURRENT', 'lineage', 'records')).toBe(true)
  expect(needsProductionReview(saved, 'CURRENT', 'lineage', 'other')).toBe(false)
  expect(needsProductionReview(saved, 'HISTORY', 'lineage', 'records')).toBe(false)
  expect(Object.values(saved)).toEqual([entry])
  expect(readProductionReviews(JSON.stringify({ wrong: entry }))).toEqual({})
  expect(
    readProductionReviews(JSON.stringify({ [key]: { ...entry, kind: 'REMOTE' } })),
  ).toEqual({})
  expect(readProductionReviews('{bad')).toEqual({})
  expect(readProductionReviews(JSON.stringify(saved))).toEqual(saved)
})
