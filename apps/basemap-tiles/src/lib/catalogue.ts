import type { Region } from '@repo/basemap'
import type { RegionBoundary } from '../region-labels'
import { KeyNotFoundError } from './errors'

export type RegionsIndex = { regions: Region[] }
type BucketEnv = Pick<CloudflareBindings, 'BUCKET'>

let regionsIndexCache: { expiresAt: number; value: RegionsIndex } | undefined
const boundaryCache = new Map<string, { expiresAt: number; value: RegionBoundary }>()

const isRegionBoundary = (value: unknown): value is RegionBoundary => {
  if (typeof value !== 'object' || value === null) return false
  const feature = value as Record<string, unknown>
  if (feature.type !== 'Feature' || typeof feature.geometry !== 'object') return false
  const geometry = feature.geometry as Record<string, unknown>
  return (
    (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') &&
    Array.isArray(geometry.coordinates)
  )
}

export const getRegionBoundary = async (
  env: BucketEnv,
  key: string,
): Promise<RegionBoundary> => {
  const cached = boundaryCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const object = await env.BUCKET.get(key)
  if (!object) throw new KeyNotFoundError('Boundary not found')
  const value = await object.json()
  if (!isRegionBoundary(value)) throw new Error('Invalid region boundary')

  boundaryCache.set(key, { expiresAt: Date.now() + 60_000, value })
  return value
}

export const getRegionsIndex = async (env: BucketEnv): Promise<RegionsIndex> => {
  if (regionsIndexCache && regionsIndexCache.expiresAt > Date.now()) {
    return regionsIndexCache.value
  }

  const object = await env.BUCKET.get('basemap/regions.json')
  if (!object) throw new KeyNotFoundError('Regions catalogue not found')
  const value = (await object.json()) as RegionsIndex
  if (!Array.isArray(value.regions)) throw new Error('Invalid regions catalogue')

  regionsIndexCache = { expiresAt: Date.now() + 60_000, value }
  return value
}
