import proj4 from 'proj4'
import '../../sources/hkgov/hk1980'

export const MIN_HIERARCHY_OVERLAP_SQUARE_METRES = 10
export const MIN_HIERARCHY_OVERLAP_FRACTION = 0.01
export type HierarchySpatialAudit = {
  divisionId: string
  ancestorIds: string[]
  reason: 'small-overlap' | 'small-remainder' | 'numerical-containment'
  areaSquareMetres?: number
  fractionOfSmallerArea?: number
  areaThresholdSquareMetres?: number
  fractionThreshold?: number
  toleranceDegrees?: number
}

/** Measure the existing WGS84 result in HK1980; topology remains in WGS84. */
export function hierarchyAreaSquareMetres(geometry: any): number {
  const ringArea = (ring: any) => {
    const coordinates = ring
      .getCoordinates()
      .map((p: any) => proj4('EPSG:4326', 'EPSG:2326', [p.x, p.y]))
    const [x0, y0] = coordinates[0] ?? [0, 0]
    let twiceArea = 0
    for (let i = 1; i < coordinates.length; i++) {
      const [x, y] = coordinates[i - 1]
      const [nextX, nextY] = coordinates[i]
      twiceArea += (x - x0) * (nextY - y0) - (nextX - x0) * (y - y0)
    }
    return Math.abs(twiceArea) / 2
  }
  if (geometry.isEmpty()) return 0
  if (geometry.getGeometryType() === 'Polygon') {
    let area = ringArea(geometry.getExteriorRing())
    for (let i = 0; i < geometry.getNumInteriorRing(); i++)
      area -= ringArea(geometry.getInteriorRingN(i))
    return Math.max(0, area)
  }
  if (geometry.getDimension() !== 2) return 0
  let area = 0
  for (let i = 0; i < geometry.getNumGeometries(); i++)
    area += hierarchyAreaSquareMetres(geometry.getGeometryN(i))
  return area
}

export function isNegligibleHierarchyArea(area: number, smallerArea: number) {
  return (
    area < MIN_HIERARCHY_OVERLAP_SQUARE_METRES &&
    smallerArea > 0 &&
    area / smallerArea < MIN_HIERARCHY_OVERLAP_FRACTION
  )
}
