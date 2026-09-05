import { describe, expect, test } from 'bun:test'

import { placeGeometry, toPlaceApiRecord } from './places'

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
