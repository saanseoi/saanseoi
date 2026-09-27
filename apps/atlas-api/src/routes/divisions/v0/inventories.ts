import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import {
  resolveApiReleaseSetForRequest,
  listApiReleaseSetSnapshots,
} from '@repo/core/db/metaRegistry'
import { selectApiInventory } from '@repo/core/db/apiInventory'
import { RegionFilterSchema, resolveDataRegion } from '../../../schema/region'
import type { AppEnv } from '../../../types'

const route = createRoute({
  method: 'get',
  path: '/divisions/v0.2/inventories',
  operationId: 'listDivisionInventoriesV02',
  tags: ['Divisions'],
  summary: 'List published domain inventories',
  request: {
    query: z.object({
      region: RegionFilterSchema.optional(),
      domain: z.string().default('geographic'),
      releaseSet: z.string().optional(),
      cohort: z.string().optional(),
      catalogRevision: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Inventory choices pinned to the selected release.',
      content: {
        'application/json': {
          schema: z.object({
            domain: z.string(),
            primaryResourceType: z.literal('division'),
            defaultInventory: z.string(),
            releaseSet: z.string(),
            inventories: z.array(
              z.object({
                code: z.string(),
                snapshotId: z.string(),
                defaultAreaVariant: z.string().nullable(),
                areaVariants: z.array(z.string()),
              }),
            ),
          }),
        },
      },
    },
    503: { description: 'No published release is available.' },
  },
})
export const divisionInventoriesRoute = defineOpenAPIRoute<typeof route, AppEnv>({
  route,
  handler: async c => {
    const query = c.req.valid('query')
    const release = await resolveApiReleaseSetForRequest(
      c.var.metaDb as never,
      'division',
      {
        apiVersion: 'api-divisions-v0.2',
        domainCode: query.domain,
        regionCode: resolveDataRegion(query.region),
        releaseSet: query.releaseSet,
        cohortKey: query.cohort,
        catalogRevision: query.catalogRevision,
      },
    )
    if (!release) return c.json({ error: 'snapshot_not_ready' }, 503)
    const snapshots = await listApiReleaseSetSnapshots(
      c.var.metaDb as never,
      release.id,
    )
    const inventories = snapshots.filter(
      s =>
        s.snapshotResourceType === 'division' &&
        ['primary', 'inventory'].includes(s.role),
    )
    return c.json(
      {
        domain: release.domainCode,
        primaryResourceType: 'division' as const,
        defaultInventory: inventories.find(s => s.role === 'primary')!.variant,
        releaseSet: release.code,
        inventories: inventories.map(s => {
          const selected = selectApiInventory(snapshots, 'division', s.variant)
          const areas = selected.snapshots.filter(
            s => s.snapshotResourceType === 'divisionArea',
          )
          return {
            code: s.variant,
            snapshotId: s.snapshotId,
            defaultAreaVariant:
              areas.find(a => a.variant === s.variant)?.variant ?? null,
            areaVariants: areas.map(a => a.variant),
          }
        }),
      },
      200,
    )
  },
})
