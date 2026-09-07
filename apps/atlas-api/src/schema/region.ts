import { openApiText } from '../lib/openapi-i18n'
import { z } from '@hono/zod-openapi'

export const RegionFilterSchema = z
  .enum(['hk', 'mo', 'gba'])
  .default('hk')
  .openapi({
    description: openApiText('openapi_region_filter_description'),
  })

export const RegionQuerySchema = z.object({ region: RegionFilterSchema })

export const EmptyRegionCollectionSchema = z
  .object({
    jsonapi: z.object({ version: z.literal('1.1') }),
    data: z.array(z.unknown()).length(0),
    links: z.object({ self: z.string() }),
    meta: z.object({
      region: z.literal('mo'),
      page: z.object({ total: z.literal(0) }),
    }),
  })
  .openapi('EmptyRegionCollection', {
    description: openApiText('openapi_empty_region_collection_description'),
  })

export type ApiRegion = 'hk' | 'mo' | 'gba'

export function resolveDataRegion(region: ApiRegion = 'hk'): 'hk' | 'mo' {
  return region === 'gba' ? 'hk' : region
}
