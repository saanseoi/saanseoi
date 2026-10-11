import { expect, test } from 'bun:test'
import { applyDivisionNamePatch } from './divisionNamePatch'

test('patch primary name replaces the curated name and retains unrelated locales', () => {
  const curated = ['en', 'zh-hant'].map(locale => ({
    divisionId: 'division',
    locale,
    name: `curated-${locale}`,
    nameAlts: null,
    nameVariant: null,
    nameRules: null,
    isLocaleInferred: false,
  }))
  const result = applyDivisionNamePatch('division', curated, {
    class: 'macrohood',
    level: 4,
    nameEn: 'Patched name',
    nameAltsEn: ['Patched alias'],
  })
  expect(result.find(row => row.locale === 'en')).toMatchObject({
    name: 'Patched name',
    nameAlts: 'Patched alias',
  })
  expect(result.find(row => row.locale === 'zh-hant')).toEqual(curated[1])
  expect(curated[0]!.name).toBe('curated-en')
})

test('patch restores declared names and aliases after curation removes a locale', () => {
  expect(
    applyDivisionNamePatch('division', [], {
      class: 'macrohood',
      level: 4,
      nameEn: 'Patched name',
      nameAltsZhHant: ['補充名稱'],
    }),
  ).toMatchObject([
    { locale: 'en', name: 'Patched name' },
    { locale: 'zh-hant', nameAlts: '補充名稱' },
  ])
  expect(
    applyDivisionNamePatch('division', [], {
      class: 'macrohood',
      level: 4,
      nameAltsZhHant: ['補充名稱'],
    }),
  ).toMatchObject([{ locale: 'zh-hant', nameAlts: '補充名稱' }])
})
