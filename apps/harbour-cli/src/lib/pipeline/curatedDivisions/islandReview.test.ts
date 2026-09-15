import { expect, test } from 'bun:test'
import { containsReviewPoint } from '@repo/core/pipeline/services/divisions/geographicReview'
import type { Polygon, MultiPolygon } from 'geojson'
import islands from '../../../../../../fixtures/divisions/hk/island-areas.json'
import hierarchy from '../../../../../../fixtures/divisions/hk/geographic-hierarchy-patch.json'

test('the upstream tied-island outline includes Ma Shi Chau and excludes mainland Kowloon', () => {
  const island = islands.find(row => row.id === 'LANDSD:PLACE_NAME:1030')!
  const geometry = island.geometry as Polygon | MultiPolygon
  expect(containsReviewPoint([114.22984244758044, 22.45445184267817], geometry)).toBe(
    true,
  )
  expect(containsReviewPoint([114.1989697, 22.3359905], geometry)).toBe(false)
  for (const entry of hierarchy.entries) {
    if (!entry.point || containsReviewPoint(entry.point, geometry)) continue
    expect(
      Object.values(entry.hierarchies)
        .flat(2)
        .some(parent => parent.id === island.id),
    ).toBe(false)
  }
})
