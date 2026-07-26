import { expect, test } from 'bun:test'

import {
  materialiseLandsdStreetLifecycle,
  type LandsdStreetLifecycleInput,
} from './landsdStreetLifecycle.ts'

const base = (overrides: Partial<LandsdStreetLifecycleInput> = {}) =>
  ({
    sourceStreetId: null,
    resultStreetId: null,
    districtIds: ['district-central-western'],
    disposition: 'apply' as const,
    deferToNotices: false,
    gazetteDate: '2026-07-03',
    noticeType: 'declaration',
    i18n: [
      { description: null, locale: 'en' as const, name: 'Harbour Road' },
      { description: null, locale: 'zh-Hant' as const, name: '海港道' },
    ],
    method: 'manual' as const,
    nameChangeScope: null,
    noticeRef: 'gn4000',
    effectiveDate: null,
    previousNoticeRefs: ['gn4000'],
    retainedDescriptions: null,
    correction: null,
    evidenceAssets: [],
    sourceKind: 'notice' as const,
    recordKey: 'notice-4000',
    streetId: null,
    ...overrides,
  }) satisfies LandsdStreetLifecycleInput

test('requires explicit application IDs and never resolves Previous G.N.', () => {
  expect(() =>
    materialiseLandsdStreetLifecycle({
      current: [],
      events: [base({ noticeType: 'deletion', recordKey: 'notice-4001' })],
    }),
  ).toThrow('requires sourceStreetId')
})

test('applies a field-scoped corrigendum and records a version even when baseline text is current', () => {
  const declared = materialiseLandsdStreetLifecycle({
    current: [],
    events: [
      base({
        i18n: [
          { description: '茘寶路的說明。', locale: 'zh-Hant', name: '茘寶路' },
          { description: 'Description.', locale: 'en', name: 'Lai Po Road' },
        ],
        resultStreetId: 'street-lai-po',
      }),
    ],
  }).current
  const corrected = materialiseLandsdStreetLifecycle({
    current: declared,
    events: [
      base({
        correction: {
          fields: ['zh-Hant.name', 'zh-Hant.description'],
          from: '茘',
          to: '荔',
        },
        noticeType: 'corrigendum',
        recordKey: 'notice-9290',
        sourceStreetId: 'street-lai-po',
      }),
    ],
  })

  expect(corrected.current[0]).toMatchObject({
    i18n: expect.arrayContaining([
      { description: '荔寶路的說明。', locale: 'zh-Hant', name: '荔寶路' },
    ]),
    version: 2,
  })
  expect(corrected.changelog[0]?.kind).toBe('corrigendum')
})

test('whole name changes replace the identity while partial changes keep both active', () => {
  const declared = materialiseLandsdStreetLifecycle({
    current: [],
    events: [base({ resultStreetId: 'street-old' })],
  }).current
  const whole = materialiseLandsdStreetLifecycle({
    current: declared,
    events: [
      base({
        sourceStreetId: 'street-old',
        resultStreetId: 'street-new',
        noticeType: 'change',
        recordKey: 'notice-4001',
        i18n: base().i18n.map(value =>
          value.locale === 'en' ? { ...value, name: 'New Harbour Road' } : value,
        ),
      }),
    ],
  })
  expect(whole.current.map(street => street.id)).toEqual(['street-new'])
  const partial = materialiseLandsdStreetLifecycle({
    current: declared,
    events: [
      base({
        sourceStreetId: 'street-old',
        resultStreetId: 'street-part',
        noticeType: 'change',
        nameChangeScope: 'partial',
        retainedDescriptions: { en: 'Retained portion', 'zh-Hant': '保留部分' },
        recordKey: 'notice-4002',
      }),
    ],
  })
  expect(partial.current.map(street => street.id).sort()).toEqual([
    'street-old',
    'street-part',
  ])
})
