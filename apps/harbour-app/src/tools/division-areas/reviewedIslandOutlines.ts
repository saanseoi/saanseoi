import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson'

/** Island visibility follows the current reviewed polygon, including saved edits. */
export function reviewedIslandOutlines<P extends { divisionId: string }>(
  reference: FeatureCollection<Polygon | MultiPolygon, P>,
  drawings: FeatureCollection<Polygon | MultiPolygon, P>,
): FeatureCollection<Polygon | MultiPolygon, P> {
  const edits = new Map(
    drawings.features.map(feature => [feature.properties.divisionId, feature]),
  )
  return {
    type: 'FeatureCollection',
    features: reference.features.map(
      feature => edits.get(feature.properties.divisionId) ?? feature,
    ),
  }
}
