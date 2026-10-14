import { expect, test } from 'bun:test'
import { statisticLocalisationRule } from './statisticLocalisationRule'

const label = {
  locale: 'en' as const,
  name: 'Population',
  description: 'Number of people',
  isTranslationVerified: true,
}

test('publisher text does not imply human verification', () => {
  const row = statisticLocalisationRule.execute({
    ...label,
    origin: { kind: 'publisher' },
  })
  expect(row.meta).toEqual({
    isLocaleInferred: false,
    fields: { name: { origin: 'provided' }, description: { origin: 'provided' } },
  })
})

test('machine origin survives human verification', () => {
  const row = statisticLocalisationRule.execute({
    ...label,
    origin: {
      kind: 'machine-translated',
      sourceLocale: 'zh-Hant',
      sourceName: '人口',
      sourceDescription: '人口數目',
    },
  })
  expect(row.meta.fields?.name).toEqual({
    origin: 'ai-translated',
    isHumanVerified: true,
  })
  expect(row.meta.fields?.description).toEqual({
    origin: 'ai-translated',
    isHumanVerified: true,
  })
})

test('missing source origin remains unknown', () => {
  expect(statisticLocalisationRule.execute(label).meta).toEqual({
    isLocaleInferred: false,
  })
})
