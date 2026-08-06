import type { Region } from '@repo/basemap'
import { KeyNotFoundError } from './errors'

export type RegionsIndex = { regions: Region[] }
type BucketEnv = Pick<CloudflareBindings, 'BUCKET'>

let regionsIndexCache: { expiresAt: number; value: RegionsIndex } | undefined
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
