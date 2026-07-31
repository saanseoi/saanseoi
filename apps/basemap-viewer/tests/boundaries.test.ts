import { describe, expect, it } from 'vitest'
import {
  boundaryBounds,
  outsideBoundaryMask,
  parseRegionBoundary,
} from '../src/lib/boundaries'

const boundary = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [113, 22],
        [114, 22],
        [114, 23],
        [113, 23],
        [113, 22],
      ],
    ],
  },
}

describe('release boundaries', () => {
  it('accepts a canonical GeoJSON boundary and creates an inverted mask', () => {
    const parsed = parseRegionBoundary(boundary)
    if (!parsed) throw new Error('Expected a valid boundary.')
    expect(outsideBoundaryMask(parsed).features[0]?.geometry.coordinates[0]).toEqual([
      [-180, -85.051129],
      [180, -85.051129],
      [180, 85.051129],
      [-180, 85.051129],
      [-180, -85.051129],
    ])
  })

  it('rejects non-polygon boundary data', () => {
    expect(
      parseRegionBoundary({ type: 'Feature', geometry: { type: 'Point' } }),
    ).toBeNull()
  })

  it('uses the exact boundary as the regional map extent', () => {
    const parsed = parseRegionBoundary(boundary)
    if (!parsed) throw new Error('Expected a valid boundary.')
    expect(boundaryBounds(parsed)).toEqual([113, 22, 114, 23])
  })
})
