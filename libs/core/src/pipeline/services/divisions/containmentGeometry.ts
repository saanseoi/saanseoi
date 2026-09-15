import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { Polygon, MultiPolygon } from 'geojson'

export type ContainmentArea = Polygon | MultiPolygon

/** Stable across row order and Polygon/MultiPolygon packaging, without rounding. */
export function containmentGeometryKey(areas: ContainmentArea[]): string {
  const polygons = areas.flatMap(area =>
    area.type === 'Polygon' ? [area.coordinates] : area.coordinates,
  )
  return `[${polygons
    .map(polygon => JSON.stringify(polygon))
    .sort()
    .join(',')}]`
}

export function containmentGeometryHash(areas: ContainmentArea[]): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(containmentGeometryKey(areas))))}`
}
