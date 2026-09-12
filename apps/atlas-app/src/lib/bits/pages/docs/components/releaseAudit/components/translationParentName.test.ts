import { expect, test } from 'bun:test'
import { translationParentName } from './translationParentName'

test('selects the UI locale case-insensitively with explicit fallbacks', () => {
  const context = {
    parentDivisionId: 'hk',
    parentName: 'Hong Kong',
    'parentName.en': 'Hong Kong',
    'parentName.zh-hant': '香港',
    'parentName.zh-hans': '香港简',
  }
  expect(translationParentName(context, 'zh-Hant')).toBe('香港')
  expect(translationParentName(context, 'zh-Hans')).toBe('香港简')
  expect(translationParentName(context, 'fr')).toBe('Hong Kong')
  expect(translationParentName({ 'parentName.zh-hant': '香港' }, 'en')).toBe('香港')
  expect(translationParentName({ parentDivisionId: 'hk' }, 'en')).toBe('hk')
  expect(translationParentName(null, 'en')).toBeNull()
})
