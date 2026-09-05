import { describe, expect, test } from 'bun:test'

import { normalisePlaceBbox } from '../../../db/places'
import { placeGeometry, toPlaceApiRecord, toPlaceI18nApiRecord } from './places'

describe('Places API geometry projection', () => {
  test('projects stored latitude and longitude as a GeoJSON Point', () => {
    expect(placeGeometry({ lat: 22.3193, lng: 114.1694 })).toEqual({
      type: 'Point',
      coordinates: [114.1694, 22.3193],
    })
  })

  test('projects stored taxonomy fields into the nested API object', () => {
    const result = toPlaceApiRecord({
      id: 'place-1',
      lat: 22.3193,
      lng: 114.1694,
      taxonomyPrimary: 'restaurant',
      taxonomyHierarchy: ['food', 'restaurant'],
      taxonomyAlternates: ['cafe'],
    })

    expect(result).toMatchObject({
      taxonomy: {
        primary: 'restaurant',
        hierarchy: ['food', 'restaurant'],
        alternates: ['cafe'],
      },
      geometry: {
        type: 'Point',
        coordinates: [114.1694, 22.3193],
      },
    })
    expect(result).not.toHaveProperty('taxonomyPrimary')
    expect(result).not.toHaveProperty('taxonomyHierarchy')
    expect(result).not.toHaveProperty('taxonomyAlternates')
    expect(result).not.toHaveProperty('lat')
    expect(result).not.toHaveProperty('lng')
  })
})

test('keeps public localisation provenance trust-oriented', () => {
  const result = toPlaceI18nApiRecord({
    placeId: 'place-1',
    locale: 'zh-hant',
    freeformAddress: '中環',
    provenance: {
      isMachineTranslated: ['name'],
      isHumanVerified: [],
      isLocaleInferred: true,
    },
  })

  expect(result).toMatchObject({
    freeformAddress: '中環',
    provenance: {
      isMachineTranslated: ['name'],
      isHumanVerified: [],
      isLocaleInferred: true,
    },
  })
  expect(result.provenance).toEqual({
    isMachineTranslated: ['name'],
    isHumanVerified: [],
    isLocaleInferred: true,
  })
})

test('normalises the retained Overture bbox struct to the public tuple', () => {
  expect(
    normalisePlaceBbox({
      xmin: 113.85128,
      xmax: 113.851295,
      ymin: 22.198448,
      ymax: 22.19845,
    }),
  ).toEqual([113.85128, 22.198448, 113.851295, 22.19845])
  expect(normalisePlaceBbox([114.155, 22.285, 114.156, 22.286])).toEqual([
    114.155, 22.285, 114.156, 22.286,
  ])
  expect(normalisePlaceBbox(null)).toBeNull()
})
