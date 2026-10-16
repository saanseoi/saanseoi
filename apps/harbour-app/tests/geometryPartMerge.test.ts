import { describe, expect, it } from 'vitest'
import type { Polygon } from 'geojson'
import { mergePolygonPart } from '../src/tools/division-areas/geometryTools'

const rectangle = (west: number, east: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, 0],
      [east, 0],
      [east, 1],
      [west, 1],
      [west, 0],
    ],
  ],
})

describe('adding a polygon part', () => {
  it('unions an overlapping part with the retained geometry', () => {
    const result = mergePolygonPart(rectangle(0, 2), rectangle(1, 3))
    expect(result.type).toBe('Polygon')
    expect(result.coordinates[0]).toContainEqual([0, 0])
    expect(result.coordinates[0]).toContainEqual([3, 1])
  })

  it('retains disconnected parts as a multipolygon', () => {
    const result = mergePolygonPart(rectangle(0, 1), rectangle(2, 3))
    expect(result).toMatchObject({ type: 'MultiPolygon' })
    if (result.type === 'MultiPolygon') expect(result.coordinates).toHaveLength(2)
  })
})
