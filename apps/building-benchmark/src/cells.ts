import type { Bounds } from './spatial'

export const COHORT_POINTS = [
  { name: 'Mong Kok', lng: 114.1704, lat: 22.3193 },
  { name: 'Tsim Sha Tsui', lng: 114.1722, lat: 22.2986 },
  { name: 'Central', lng: 114.1577, lat: 22.2819 },
  { name: 'Quarry Bay', lng: 114.211, lat: 22.284 },
  { name: 'Sha Tin', lng: 114.1898, lat: 22.3832 },
  { name: 'Kam Tin', lng: 114.066, lat: 22.446 },
] as const
export const COHORT_PADDING = 0.0015

/** Reject searches outside the explicitly sampled cell-index coverage.
 * @param bounds Conservative query envelope.
 * @returns Whether the entire envelope lies in one indexed cohort area.
 */
export function withinCohort(bounds: Bounds): boolean {
  return COHORT_POINTS.some(
    p =>
      bounds.minX >= p.lng - COHORT_PADDING &&
      bounds.maxX <= p.lng + COHORT_PADDING &&
      bounds.minY >= p.lat - COHORT_PADDING &&
      bounds.maxY <= p.lat + COHORT_PADDING,
  )
}

/** Enumerate all 0.001-degree cells touched by a conservative query envelope.
 * @param bounds Hong Kong bounding box with positive coordinates.
 * @returns Integer keys matching the sampled preview SQL cell index.
 * @remarks Index each building in every bounding-box cell, never only its centroid.
 */
export function searchCells(bounds: Bounds): number[] {
  const keys: number[] = []
  for (let x = Math.floor(bounds.minX * 1000); x <= Math.floor(bounds.maxX * 1000); x++)
    for (
      let y = Math.floor(bounds.minY * 1000);
      y <= Math.floor(bounds.maxY * 1000);
      y++
    )
      keys.push(x * 100000 + y)
  if (keys.length > 1024) throw new Error('Too many spatial cells.')
  return keys
}
