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
