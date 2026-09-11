import { expect, test } from 'bun:test'
import { buildDisplayName } from './displayName'

test.each([
  [{ 'zh-hant': '九龍', en: 'Kowloon' }, '九龍 Kowloon'],
  [{ 'zh-hant': '九龍' }, '九龍'],
  [{ en: 'Kowloon' }, 'Kowloon'],
  [{ 'zh-hant': 'Kowloon', en: 'Kowloon' }, 'Kowloon'],
  [{ 'zh-hant': ' Kowloon ', en: 'Kowloon' }, 'Kowloon'],
  [{ 'zh-hant': '  ', en: 'Kowloon' }, 'Kowloon'],
  [{ 'zh-hant': null, en: undefined }, null],
  [{}, null],
] as const)('buildDisplayName(%j) = %j', (names, expected) => {
  expect(buildDisplayName(names)).toBe(expected)
})
