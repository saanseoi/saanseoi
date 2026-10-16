import { expect, it } from 'vitest'
import { reviewedIslandOutlines } from '../src/tools/division-areas/reviewedIslandOutlines'
import type { FeatureCollection, Polygon } from 'geojson'

it('keeps edited islands in the island overlay without including unrelated drawings', () => {
  const feature = (id: string, x: number) => ({
    type: 'Feature' as const,
    properties: { divisionId: id },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [x, 0],
          [x + 1, 0],
          [x, 1],
          [x, 0],
        ],
      ],
    },
  })
  const collection = (
    ...features: ReturnType<typeof feature>[]
  ): FeatureCollection<Polygon, { divisionId: string }> => ({
    type: 'FeatureCollection',
    features,
  })
  const saved = feature('island', 2)
  const other = feature('other-island', 4)
  expect(
    reviewedIslandOutlines(
      collection(feature('island', 0), other),
      collection(saved, feature('town', 8)),
    ).features,
  ).toEqual([saved, other])
})
