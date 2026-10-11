import { expect, test } from 'bun:test'
import { divisionTranslationRule } from './divisionTranslationRule'

test('ignores automated translations in every locale and retains publisher and human names', () => {
  const source = [
    {
      divisionId: 'd',
      locale: 'zh-hant',
      name: '圍尾',
      nameAlts: null,
      nameRules: null,
      nameVariant: null,
      isLocaleInferred: false,
      nameProvenance: 'provided' as const,
    },
  ]
  const result = divisionTranslationRule.execute({
    source,
    localisations: [
      { locale: 'en', name: 'Weiwei' },
      { locale: 'fr', name: 'Translated' },
      { locale: 'zh-hans', name: '围尾' },
      { locale: 'de', name: 'Reviewed' },
    ],
    applications: [
      { locale: 'en', provenance: 'ai-translated' },
      { locale: 'fr', provenance: 'ai-translated' },
      { locale: 'zh-hans', provenance: 'human-translated' },
      { locale: 'de', provenance: 'human-translated' },
    ],
  })
  expect(result.map(row => [row.locale, row.name])).toEqual([
    ['zh-hant', '圍尾'],
    ['de', 'Reviewed'],
  ])
})
