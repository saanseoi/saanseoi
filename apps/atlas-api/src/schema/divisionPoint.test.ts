import { expect, test } from 'bun:test'
import { DivisionResourceSchema, DivisionGeometryResourceSchema } from './divisions'

test('division identity geometry permits only a Point while area polygons remain separate', () => {
  const identity = DivisionResourceSchema.shape.attributes.shape.geometry
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 0],
      ],
    ],
  }
  expect(identity.safeParse({ type: 'Point', coordinates: [1, 1] }).success).toBe(true)
  expect(identity.safeParse(null).success).toBe(true)
  expect(identity.safeParse(polygon).success).toBe(false)
  expect(
    identity.safeParse({ type: 'MultiPolygon', coordinates: [polygon.coordinates] })
      .success,
  ).toBe(false)
  const area = DivisionGeometryResourceSchema.options[0].shape.attributes.shape.geometry
  expect(area.safeParse(polygon).success).toBe(true)
  expect(area.safeParse({ type: 'Point', coordinates: [1, 1] }).success).toBe(false)
})
