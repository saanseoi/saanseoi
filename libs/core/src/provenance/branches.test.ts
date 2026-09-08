import { expect, test } from 'bun:test'
import { createBranchCounts, selectBranch, type RuleBranch } from './branches'

test('retained precedence selects the winner even when storage order differs', () => {
  const branches: RuleBranch[] = [
    {
      id: 'fallback',
      group: 'test',
      precedence: 2,
      condition: { all: [] },
      result: 'fallback',
    },
    {
      id: 'exact',
      group: 'test',
      precedence: 1,
      condition: { field: 'value', equals: 'source' },
      result: 'source',
    },
  ]
  const counts = createBranchCounts(branches)
  expect(selectBranch(branches, { value: 'source' }, 'source', counts)).toBe('source')
  expect(counts).toEqual({
    fallback: { matched: 0, changed: 0 },
    exact: { matched: 1, changed: 0 },
  })
})
