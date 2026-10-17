import { expect, it, vi } from 'vitest'
import { createPolygonDisplayLabelData } from '../src/tools/division-areas/polygonDisplayLabels'
import { createSameLevelOverlapWarnings } from '../src/tools/division-areas/pencilRegions'
import type { Polygon } from 'geojson'
const box = (x: number): Polygon => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, 0],
      [x + 2, 0],
      [x + 2, 2],
      [x, 2],
      [x, 0],
    ],
  ],
})
it('only relocates changed labels, survives cloning, and refreshes properties', () => {
  const locate = vi.fn(() => [1, 1])
  const labels = createPolygonDisplayLabelData(locate)
  const data = {
    type: 'FeatureCollection' as const,
    features: [0, 1].map(x => ({
      type: 'Feature' as const,
      id: String(x),
      properties: { label: 'old' },
      geometry: box(x),
    })),
  }
  labels(data)
  expect(locate).toHaveBeenCalledTimes(2)
  const next = structuredClone(data)
  next.features[0]!.properties.label = 'new'
  expect(labels(next).features[0]!.properties?.label).toBe('new')
  expect(locate).toHaveBeenCalledTimes(2)
  next.features[0]!.geometry = box(4)
  labels(next)
  expect(locate).toHaveBeenCalledTimes(3)
  labels(data)
  expect(locate).toHaveBeenCalledTimes(4)
})
it('refreshes cached overlap names, geometry, levels, and removed rows', () => {
  const warnings = createSameLevelOverlapWarnings()
  const rows = [
    { id: 'a', name: 'A', level: 4, geometry: box(0) },
    { id: 'b', name: 'B', level: 4, geometry: box(1) },
  ]
  expect(warnings(rows).get('a')).toEqual(['B'])
  const renamed = structuredClone(rows)
  renamed[1]!.name = 'Renamed'
  expect(warnings(renamed).get('a')).toEqual(['Renamed'])
  renamed[1]!.geometry = box(10)
  expect(warnings(renamed).size).toBe(0)
  expect(warnings(rows).size).toBe(2)
  expect(warnings([{ ...rows[0]!, level: 3 }, rows[1]!]).size).toBe(0)
  expect(warnings([rows[0]!]).size).toBe(0)
})
