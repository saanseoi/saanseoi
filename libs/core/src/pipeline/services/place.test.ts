import { describe, expect, test } from 'bun:test'

import {
  assertPlaceAddressCardinality,
  buildPlaceLocalisationStatistics,
  buildPlaceAddresses,
  derivePlaceReferenceName,
  extractPlaceAddressTexts,
  hashPlaceMaterialisation,
  normaliseOverturePlace,
  normalisePlaceText,
  namedValues,
  pointCoordinates,
} from './place'

describe('Overture place normalisation', () => {
  test('normalises multilingual names and brand names into canonical locales', () => {
    const place = normaliseOverturePlace(
      {
        id: 'place-1',
        geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
        names: {
          en: ['Example Cafe', 'Example Coffee'],
          'zh-Hant': '示例咖啡店',
        },
        brand: {
          wikidata: 'Q123',
          names: { en: 'Example' },
        },
        categories: {
          primary: 'restaurant',
          alternate: ['cafe'],
        },
        basic_category: 'food_service',
        taxonomy: {
          primary: 'restaurant',
          hierarchy: ['food', 'restaurant'],
        },
        sources: [{ dataset: 'openstreetmap' }],
        confidence: 0.91,
      },
      '2026-08-19.0',
    )

    expect(place).not.toBeNull()
    expect(place?.firstSeenMonth).toBe('2026-08')
    expect(place?.basicCategory).toBe('food_service')
    expect(place?.taxonomyPrimary).toBe('restaurant')
    expect(place?.taxonomyHierarchy).toEqual(['food', 'restaurant'])
    expect(place?.taxonomyAlternates).toEqual(['cafe'])
    expect(place?.i18n).toEqual([
      expect.objectContaining({
        locale: 'en',
        name: 'Example Cafe',
        nameAlts: 'Example Coffee',
        nameVariant: ['Example Coffee'],
        brandName: 'Example',
        brandNameAlts: null,
        brandNameVariant: null,
        freeformAddress: null,
        provenance: expect.objectContaining({
          isLocaleInferred: false,
          isMachineTranslated: [],
          isHumanVerified: [],
        }),
      }),
      expect.objectContaining({
        locale: 'zh-hant',
        name: '示例咖啡店',
        nameAlts: null,
        nameVariant: null,
        brandName: null,
        brandNameAlts: null,
        brandNameVariant: null,
        freeformAddress: null,
      }),
    ])
  })

  test('rejects records without a valid Point geometry', () => {
    expect(pointCoordinates({ type: 'Polygon', coordinates: [] })).toBeNull()
    expect(
      normaliseOverturePlace(
        { id: 'place-1', geometry: { type: 'LineString', coordinates: [] } },
        '2026-08-19.0',
      ),
    ).toBeNull()
  })
})

test('extracts free-form address text and ignores publisher identifiers', () => {
  expect(
    extractPlaceAddressTexts([
      {
        id: 'overture-address-1',
        freeform: '1 Example Road',
        locality: 'Example Town',
        country: 'HK',
        region: 'HK',
        postcode: '000000',
      },
      '2 Example Road',
    ]),
  ).toEqual(['1 Example Road', '2 Example Road'])
})

test('unwraps free-form addresses into canonical strings only', () => {
  expect(
    buildPlaceAddresses([
      {
        freeform: '1 Example Road',
        locality: 'Example Town',
        country: 'HK',
      },
      { freeform: null, locality: 'Other Town' },
      { freeform: '1 Example Road' },
    ]),
  ).toEqual(['1 Example Road', '1 Example Road'])
  expect(buildPlaceAddresses([{ locality: 'Example Town' }])).toBeNull()
})

test('counts raw publisher addresses even when a free-form value is absent', () => {
  const place = normaliseOverturePlace(
    {
      id: 'place-with-two-source-addresses',
      geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
      addresses: [{ freeform: '1 Example Road' }, { locality: 'Example Town' }],
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a normalised place.')

  expect(place.addresses).toEqual(['1 Example Road'])
  expect(() => assertPlaceAddressCardinality([place])).toThrow(
    'WARNING: Overture Places ingestion stopped',
  )
})

test('stops Places ingestion when a Place has multiple addresses', () => {
  const place = normaliseOverturePlace(
    {
      id: 'place-with-multiple-addresses',
      geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
      addresses: [{ freeform: '1 Example Road' }, { freeform: '2 Example Road' }],
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a normalised place.')

  expect(() => assertPlaceAddressCardinality([place])).toThrow(
    'WARNING: Overture Places ingestion stopped',
  )
})

test('normalises address join text consistently', () => {
  expect(normalisePlaceText('  1\u00a0Example  Road  ')).toBe('1 example road')
})

test('resolves missing locales from script evidence without defaulting to English', () => {
  expect(namedValues('Example Cafe')[0]).toMatchObject({
    locale: 'en',
    inferred: true,
  })
  expect(namedValues('繁體中文')[0]).toMatchObject({
    locale: 'zh-hant',
    inferred: true,
  })
})

test('records and resolves explicit locale/script conflicts', () => {
  const chineseLabel = namedValues({ language: 'en', value: '繁體中文' })[0]
  expect(chineseLabel).toMatchObject({
    locale: 'zh-hant',
    inferred: true,
    evidence: {
      sourceLocale: 'en',
      conflict: true,
    },
  })
  const latinLabel = namedValues({ language: 'zh-Hant', value: 'Example Cafe' })[0]
  expect(latinLabel).toMatchObject({
    locale: 'en',
    inferred: true,
    evidence: { sourceLocale: 'zh-hant', conflict: true },
  })
})

test('keeps mixed-script values together and applies the resolver to brands and addresses', () => {
  const place = normaliseOverturePlace(
    {
      id: 'mixed-place',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      names: { 'zh-Hant': '香港 ABC' },
      brand: { names: { language: 'en', value: '香港 ABC' } },
      addresses: [{ freeform: '中環 ABC' }],
    },
    '2026-08-19.0',
  )
  expect(place?.i18n).toHaveLength(2)
  expect(place?.i18n).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ locale: 'en', brandName: '香港 ABC' }),
      expect.objectContaining({
        locale: 'zh-hant',
        name: '香港 ABC',
        freeformAddress: '中環 ABC',
      }),
    ]),
  )
  expect(place?.i18n.every(row => !row.name?.includes('|'))).toBe(true)
})

test('allows localised values inside one publisher address', () => {
  const place = normaliseOverturePlace(
    {
      id: 'localised-address-place',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      addresses: [{ freeform: { en: '1 Central Road', 'zh-Hant': '中環一號' } }],
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a normalised place.')
  expect(() => assertPlaceAddressCardinality([place])).not.toThrow()
  expect(place.i18n).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ locale: 'en', freeformAddress: '1 Central Road' }),
      expect.objectContaining({ locale: 'zh-hant', freeformAddress: '中環一號' }),
    ]),
  )
})

test('derives referenceName in the requested fallback order', () => {
  const row = (locale: string, name: string | null) => ({
    locale,
    name,
  })
  expect(derivePlaceReferenceName([row('zh-hant', '中環'), row('en', 'Central')])).toBe(
    '中環 Central',
  )
  expect(derivePlaceReferenceName([row('zh-hant', '中環'), row('en', '中環')])).toBe(
    '中環',
  )
  expect(derivePlaceReferenceName([row('zh-hans', '中环'), row('en', 'Central')])).toBe(
    'Central',
  )
  expect(derivePlaceReferenceName([row('ja', '銀座')])).toBe('銀座')
})

test('counts Places rather than i18n rows in field statistics', () => {
  const place = normaliseOverturePlace(
    {
      id: 'stats-place',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      names: { en: 'Central' },
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a normalised place.')
  const stats = buildPlaceLocalisationStatistics([{ id: place.id, i18n: place.i18n }])
  expect(stats.totalPlaces).toBe(1)
  expect(stats.fields.get('name\u0000en')).toMatchObject({
    valueCount: 1,
    providedCount: 1,
    missingCount: 0,
  })
  expect(stats.referenceNameCount).toBe(1)
})

test('counts locale conflicts from transient resolver evidence', () => {
  const place = normaliseOverturePlace(
    {
      id: 'conflict-stats-place',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
      names: { language: 'en', value: '香港地點' },
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a normalised place.')

  const stats = buildPlaceLocalisationStatistics([place])
  expect(stats.fields.get('name\u0000zh-hant')).toMatchObject({
    valueCount: 1,
    conflictCount: 1,
  })
})

test('changes the materialisation hash when a reference snapshot changes', async () => {
  const place = normaliseOverturePlace(
    {
      id: 'place-1',
      geometry: { type: 'Point', coordinates: [114.1694, 22.3193] },
      names: { en: 'Example' },
    },
    '2026-08-19.0',
  )
  if (!place) throw new Error('Expected a normalised place.')

  const first = await hashPlaceMaterialisation(place, {
    addressSnapshotId: 'address-1',
    divisionSnapshotId: 'division-1',
    addressId: 'address-id',
    divisionIds: ['division-id'],
  })
  const second = await hashPlaceMaterialisation(place, {
    addressSnapshotId: 'address-2',
    divisionSnapshotId: 'division-2',
    addressId: 'address-id',
    divisionIds: ['division-id'],
  })

  expect(second).not.toBe(first)
})
