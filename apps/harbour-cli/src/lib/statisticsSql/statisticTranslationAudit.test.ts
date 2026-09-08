import { expect, test } from 'bun:test'
import { readValue, type ProvenanceStore } from '@repo/core/provenance'
import { retainStatisticTranslations } from './statisticTranslationAudit'
import {
  reviewedLocalisationOrigin,
  validLocalisationOrigin,
} from './censtatdMeasureCurationLocalisation'

test('only explicitly recorded translations produce individual curations with retained source context', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const label = {
    name: '人口',
    description: '參考日期的人口',
    locale: 'zh-Hant',
    isTranslationVerified: true,
  }
  const fieldMetadata = new Map<string, unknown>([
    [
      'stats\u0000publisher',
      {
        fieldName: 'publisher',
        localisations: [{ ...label, origin: { kind: 'publisher' } }],
      },
    ],
    ['stats\u0000unknown', { fieldName: 'unknown', localisations: [label] }],
    [
      'stats\u0000translated',
      {
        fieldName: 'translated',
        localisations: [
          {
            ...label,
            origin: {
              kind: 'human-translated',
              sourceLocale: 'en',
              sourceName: 'Population',
              sourceDescription: 'Population at the reference date',
            },
          },
        ],
      },
    ],
    [
      'stats\u0000unused',
      {
        fieldName: 'unused',
        localisations: [
          {
            ...label,
            origin: {
              kind: 'machine-translated',
              sourceLocale: 'en',
              sourceName: 'Population',
              sourceDescription: 'Population at the reference date',
            },
          },
        ],
      },
    ],
  ])
  const rows = await retainStatisticTranslations(store, {
    datasetCode: 'stats',
    fieldMetadata,
    appliedFields: new Set(['publisher', 'unknown', 'translated']),
    appliedMeasures: new Set(),
  })
  expect(rows.map(row => [row.record.id, row.outcome])).toEqual([
    ['translated', 'applied'],
    ['unused', 'unmatched'],
  ])
  expect(
    await readValue(store, {
      ...rows[0]!.fixture!.object,
      pointer: rows[0]!.fixture!.pointer,
    }),
  ).toMatchObject({ origin: { sourceName: 'Population', kind: 'human-translated' } })
  expect(validLocalisationOrigin({ kind: 'human-translated' })).toBe(false)
  expect(validLocalisationOrigin(undefined)).toBe(true)
  expect(
    reviewedLocalisationOrigin(
      { ...label, locale: 'zh-Hant' },
      label.name,
      label.description,
    ),
  ).toBeUndefined()
})
