import { expect, test } from 'bun:test'
import { normaliseOverturePlace } from './place'
import { normalisePlaceBbox, placePoint } from './placeGeometry'
test('canonical Places distinguish brand identity and normalise native bounds', () => {
  const row = normaliseOverturePlace(
    {
      id: 'venue',
      geometry: { type: 'Point', coordinates: [114, 22] },
      bbox: { xmin: 113, ymin: 21, xmax: 115, ymax: 23 },
      brand: { wikidata: 'Q123' },
    },
    '2026-09-23.0',
  )!
  expect(row.identifiers).toEqual({ wikidata: { brandId: { id: 'Q123' } } })
  expect(row.bbox).toEqual([113, 21, 115, 23])
  expect(placePoint(row.lng, row.lat)).toEqual({
    type: 'Point',
    coordinates: [114, 22],
  })
  expect(normalisePlaceBbox({ xmin: 115, ymin: 21, xmax: 113, ymax: 23 })).toBeNull()
  expect(() => placePoint(181, 22)).toThrow('Invalid Place coordinates')
})
