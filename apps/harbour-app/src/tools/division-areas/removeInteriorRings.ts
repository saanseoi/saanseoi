import type { MultiPolygon, Polygon } from 'geojson'

type Area = Polygon | MultiPolygon

export function removeInteriorRings(geometry: Area) {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const removedHoleCount = polygons.reduce(
    (count, rings) => count + Math.max(0, rings.length - 1),
    0,
  )
  return {
    geometry:
      geometry.type === 'Polygon'
        ? {
            type: 'Polygon' as const,
            coordinates: [structuredClone(geometry.coordinates[0]!)],
          }
        : {
            type: 'MultiPolygon' as const,
            coordinates: geometry.coordinates.map(rings => [
              structuredClone(rings[0]!),
            ]),
          },
    removedHoleCount,
  }
}
