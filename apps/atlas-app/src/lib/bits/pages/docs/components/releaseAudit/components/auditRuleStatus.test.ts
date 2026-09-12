import { expect, test } from 'bun:test'
import { ruleGroupStatus } from './auditRuleStatus'

test('matching unchanged values still records application', () => {
  expect(ruleGroupStatus([{ matched: 4, changed: 0 }])).toBe('applied')
  expect(ruleGroupStatus([{ matched: 4, changed: 2 }, {}])).toBe('applied')
})

test('only complete zero counts establish no matches', () => {
  expect(ruleGroupStatus([{ matched: 0, changed: 0 }])).toBe('no-matches')
  expect(ruleGroupStatus([{ matched: 0, changed: 0 }, {}])).toBe('not-recorded')
  expect(ruleGroupStatus([{ matched: 0 }])).toBe('not-recorded')
  expect(ruleGroupStatus([])).toBe('not-recorded')
})
