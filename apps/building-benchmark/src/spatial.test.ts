import { describe, expect, test } from 'bun:test'
import { footprintDistance, parseSearch, searchBounds } from './spatial'
import type { Polygon } from 'geojson'
const square: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [114, 22],
      [114.001, 22],
      [114.001, 22.001],
      [114, 22.001],
      [114, 22],
    ],
  ],
}
describe('nearby footprints', () => {
  test('inside and on a building have zero distance', () => {
    expect(footprintDistance(square, 114.0005, 22.0005)).toBe(0)
    expect(footprintDistance(square, 114, 22)).toBe(0)
  })
  test('distance is to the edge, not the centroid', () => {
    expect(footprintDistance(square, 114.0005, 22.002)).toBeCloseTo(111.195, 2)
  })
  test('courtyards are outside the filled footprint', () => {
    const courtyard: Polygon = {
      ...square,
      coordinates: [
        ...square.coordinates,
        [
          [114.0002, 22.0002],
          [114.0008, 22.0002],
          [114.0008, 22.0008],
          [114.0002, 22.0008],
          [114.0002, 22.0002],
        ],
      ],
    }
    expect(footprintDistance(courtyard, 114.0005, 22.0005)).toBeGreaterThan(30)
  })
  test('separate inventories and bounded radii are mandatory', () => {
    expect(() =>
      parseSearch(
        new URL('https://example/nearby?inventory=combined&lng=114.1&lat=22.3'),
      ),
    ).toThrow()
    expect(() =>
      parseSearch(
        new URL(
          'https://example/nearby?inventory=landsd&lng=114.1&lat=22.3&radius=5000',
        ),
      ),
    ).toThrow()
    const b = searchBounds(114.1, 22.3, 250)
    expect(b.minX).toBeLessThan(114.1)
    expect(b.maxY).toBeGreaterThan(22.3)
  })
})
