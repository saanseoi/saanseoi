import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'
import { and, currentSchema, eq, sql } from '@repo/db'
import type { AppEnv } from '../../../types'
import { sanitiseResponseUrl } from '../../../lib/api'

const selectionSchema = z.object({
  id: z.string(),
  geographicReleaseSet: z.string(),
  geographicSnapshotId: z.string(),
  geographicAreaSnapshotId: z.string(),
  sourceReleaseSet: z.string(),
  sourceSnapshotId: z.string(),
  sourceAreaSnapshotId: z.string(),
  sourceDomain: z.string(),
  sourceCohort: z.string(),
  policy: z.string(),
  contentHash: z.string(),
})
const membershipSchema = z.object({
  divisionId: z.string(),
  geographicDivisionId: z.string(),
  sourceGeometryHash: z.string(),
  geographicGeometryHash: z.string(),
  overlapSquareMetres: z.number(),
  sourceFraction: z.number(),
  fullyContained: z.boolean(),
})
const route = createRoute({
  method: 'get',
  path: '/divisions/v0.2/crosswalk',
  operationId: 'listDivisionGeographicCrosswalkV02',
  tags: ['Divisions'],
  summary: 'List spatial crosswalk memberships',
  description:
    'Pairs a published TPU, Housing Market Area or New Town release with a SaanSeoi geographic release. Fractions use the whole source polygon area, not population weights or the hierarchy covered-area denominator. Boundary-only contacts and numerical slivers (at most 1 m² or 1e-8 of source area) are excluded. Crosswalks retain all other overlaps, independently of the 5% hierarchy threshold.',
  request: {
    query: z.object({
      sourceReleaseSet: z.string().min(1),
      geographicReleaseSet: z.string().min(1),
      divisionId: z.string().optional(),
      geographicDivisionId: z.string().optional(),
      'page[limit]': z.coerce.number().int().min(1).max(1000).default(100),
      'page[offset]': z.coerce.number().int().min(0).max(1_000_000).default(0),
    }),
  },
  responses: {
    200: {
      description:
        'Release-pinned overlap evidence, ordered by source and geographic Division ID.',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(membershipSchema),
            meta: z.object({
              crosswalk: selectionSchema,
              total: z.number(),
              limit: z.number(),
              offset: z.number(),
            }),
            links: z.object({ self: z.string(), next: z.string().nullable() }),
          }),
        },
      },
    },
    409: {
      description: 'More than one crosswalk policy is retained for this release pair.',
    },
    422: { description: 'Invalid release selectors or pagination.' },
    503: { description: 'The selected release pair has no prepared crosswalk.' },
  },
})
export const divisionGeographicCrosswalkRoute = defineOpenAPIRoute<
  typeof route,
  AppEnv
>({
  route,
  handler: async c => {
    const query = c.req.valid('query')
    const {
      divisionGeographicCrosswalks: crosswalks,
      divisionGeographicMemberships: memberships,
    } = currentSchema
    const selections = await c.var.currentDb
      .select()
      .from(crosswalks)
      .where(
        and(
          eq(crosswalks.sourceReleaseSet, query.sourceReleaseSet),
          eq(crosswalks.geographicReleaseSet, query.geographicReleaseSet),
        ),
      )
      .limit(2)
      .all()
    if (!selections.length)
      return c.json({ error: 'geographic_crosswalk_not_ready' }, 503)
    if (selections.length !== 1)
      return c.json({ error: 'geographic_crosswalk_ambiguous' }, 409)
    const crosswalk = selectionSchema.parse(selections[0])
    const where = and(
      eq(memberships.crosswalkId, crosswalk.id),
      query.divisionId ? eq(memberships.divisionId, query.divisionId) : undefined,
      query.geographicDivisionId
        ? eq(memberships.geographicDivisionId, query.geographicDivisionId)
        : undefined,
    )
    const limit = query['page[limit]'],
      offset = query['page[offset]']
    const [rows, count] = await Promise.all([
      c.var.currentDb
        .select()
        .from(memberships)
        .where(where)
        .orderBy(memberships.divisionId, memberships.geographicDivisionId)
        .limit(limit)
        .offset(offset)
        .all(),
      c.var.currentDb
        .select({ n: sql<number>`count(*)` })
        .from(memberships)
        .where(where)
        .get(),
    ])
    const self = sanitiseResponseUrl(c.req.url)
    const next = new URL(self)
    next.searchParams.set('page[offset]', String(offset + limit))
    const total = count?.n ?? 0
    return c.json(
      {
        data: rows.map(({ crosswalkId: _, ...row }) => row),
        meta: { crosswalk, total, limit, offset },
        links: { self, next: offset + limit < total ? next.toString() : null },
      },
      200,
    )
  },
})
