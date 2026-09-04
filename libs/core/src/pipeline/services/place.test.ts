import { describe, expect, test } from 'bun:test'

import {
  extractPlaceAddressReference,
  hashPlaceMaterialisation,
  normaliseOverturePlace,
  normalisePlaceText,
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
      {
        locale: 'en',
        name: 'Example Cafe',
        nameAlts: 'Example Coffee',
        nameVariant: ['Example Coffee'],
        isLocaleInferred: false,
        brandName: 'Example',
        brandNameAlts: null,
        brandNameVariant: null,
      },
      {
        locale: 'zh-hant',
        name: '示例咖啡店',
        nameAlts: null,
        nameVariant: null,
        isLocaleInferred: false,
        brandName: null,
        brandNameAlts: null,
        brandNameVariant: null,
      },
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

test('extracts all address candidates without treating Overture IDs as ALS IDs', () => {
  expect(
    extractPlaceAddressReference([
      { id: 'overture-address-1', freeform: '1 Example Road' },
      '2 Example Road',
    ]),
  ).toEqual({
    ids: ['overture-address-1'],
    texts: ['1 Example Road', '2 Example Road'],
  })
})

test('normalises address join text consistently', () => {
  expect(normalisePlaceText('  1\u00a0Example  Road  ')).toBe('1 example road')
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
