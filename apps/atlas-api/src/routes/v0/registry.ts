import { createRoute, defineOpenAPIRoute, z } from '@hono/zod-openapi'

import {
  getRegistryApi,
  getRegistryApiField,
  getRegistryEndpoint,
  getRegistryRelease,
  getRegistrySource,
  getRegistrySourcePublisher,
  getRegistrySourceVersion,
  listRegistryApiFields,
  listRegistryApis,
  listRegistryEndpoints,
  listRegistryReleases,
  listRegistrySourcePublishers,
  listRegistrySources,
  listRegistrySourceVersions,
} from '@repo/core/db/metaRegistry'
import { ErrorResponseSchema, ValidationErrorOpenAPIResponse } from '../../schema'
import { runWithD1ReadRetry } from '../../lib/d1'
import { openApiText } from '../../lib/openapi-i18n'
import type { AppEnv } from '../../types'

const RegistryListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    view: z.enum(['full', 'review']).optional(),
  })
  .openapi('RegistryListQuery')

const RegistryDetailParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .openapi('RegistryDetailParams')

const RegistryListResponseSchema = z
  .object({
    data: z.array(z.object({}).loose()),
  })
  .openapi('RegistryListResponse')

const RegistryDetailResponseSchema = z
  .object({
    data: z.object({}).loose(),
  })
  .openapi('RegistryDetailResponse')

function parseJsonResponse<TSchema extends z.ZodType>(schema: TSchema, value: unknown) {
  return schema.parse(JSON.parse(JSON.stringify(value)))
}

type RegistryResource = {
  publicName: string
  responseLabelKey: Parameters<typeof openApiText>[0]
  tag: string
  listOperationId: string
  detailOperationId: string
  list: (db: AppEnv['Variables']['metaDb'], limit?: number) => Promise<unknown[]>
  detail: (db: AppEnv['Variables']['metaDb'], id: string) => Promise<unknown | null>
}

const REGISTRY_RESOURCES = [
  {
    publicName: 'families',
    responseLabelKey: 'openapi_registry_resource_families',
    tag: 'API Families',
    listOperationId: 'listRegistryApis',
    detailOperationId: 'getRegistryApi',
    list: listRegistryApis,
    detail: getRegistryApi,
  },
  {
    publicName: 'releases',
    responseLabelKey: 'openapi_registry_resource_releases',
    tag: 'API Releases',
    listOperationId: 'listRegistryReleases',
    detailOperationId: 'getRegistryRelease',
    list: listRegistryReleases,
    detail: getRegistryRelease,
  },
  {
    publicName: 'fields',
    responseLabelKey: 'openapi_registry_resource_fields',
    tag: 'API Fields',
    listOperationId: 'listRegistryApiFields',
    detailOperationId: 'getRegistryApiField',
    list: listRegistryApiFields,
    detail: getRegistryApiField,
  },
  {
    publicName: 'endpoints',
    responseLabelKey: 'openapi_registry_resource_endpoints',
    tag: 'API Endpoints',
    listOperationId: 'listRegistryEndpoints',
    detailOperationId: 'getRegistryEndpoint',
    list: listRegistryEndpoints,
    detail: getRegistryEndpoint,
  },
  {
    publicName: 'sources',
    responseLabelKey: 'openapi_registry_resource_sources',
    tag: 'Sources',
    listOperationId: 'listRegistrySources',
    detailOperationId: 'getRegistrySource',
    list: listRegistrySources,
    detail: getRegistrySource,
  },
  {
    publicName: 'sourceVersions',
    responseLabelKey: 'openapi_registry_resource_source_versions',
    tag: 'Source Versions',
    listOperationId: 'listRegistrySourceVersions',
    detailOperationId: 'getRegistrySourceVersion',
    list: listRegistrySourceVersions,
    detail: getRegistrySourceVersion,
  },
  {
    publicName: 'sourcePublishers',
    responseLabelKey: 'openapi_registry_resource_source_publishers',
    tag: 'Source Publishers',
    listOperationId: 'listRegistrySourcePublishers',
    detailOperationId: 'getRegistrySourcePublisher',
    list: listRegistrySourcePublishers,
    detail: getRegistrySourcePublisher,
  },
] as const satisfies readonly RegistryResource[]

function createRegistryListRoute(resource: RegistryResource) {
  return createRoute({
    method: 'get',
    path: `/v0.1/api/${resource.publicName}`,
    operationId: resource.listOperationId,
    tags: [resource.tag],
    request: {
      query: RegistryListQuerySchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: RegistryListResponseSchema,
          },
        },
        description: openApiText('openapi_list_response_description', {
          resource: openApiText(resource.responseLabelKey),
        }),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

function createRegistryDetailRoute(resource: RegistryResource) {
  return createRoute({
    method: 'get',
    path: `/v0.1/api/${resource.publicName}/{id}`,
    operationId: resource.detailOperationId,
    tags: [resource.tag],
    request: {
      params: RegistryDetailParamsSchema,
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: RegistryDetailResponseSchema,
          },
        },
        description: openApiText('openapi_get_response_description', {
          resource: openApiText(resource.responseLabelKey),
        }),
      },
      404: {
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
          },
        },
        description: openApiText('openapi_registry_record_not_found_description'),
      },
      422: ValidationErrorOpenAPIResponse,
    },
  })
}

const listRouteConfigs = REGISTRY_RESOURCES.map(createRegistryListRoute)
const detailRouteConfigs = REGISTRY_RESOURCES.map(createRegistryDetailRoute)

type RegistryReviewReleaseRow = {
  apiFamily: string
  code: string
  sourceCode: string | null
  sourceReleaseCode: string | null
}

async function listRegistryReviewReleases(db: AppEnv['Variables']['metaDb']) {
  const result = await runWithD1ReadRetry(() =>
    db.$client
      .prepare(
        `WITH rankedReleaseSets AS (
          SELECT
            apiReleaseSets.id,
            apiVersions.familyType AS apiFamily,
            apiReleaseSets.code,
            row_number() OVER (
              PARTITION BY
                apiVersions.familyType,
                coalesce(apiReleaseSets.regionCode, ''),
                apiReleaseSets.domainCode
              ORDER BY apiReleaseSets.cohortKey DESC, apiReleaseSets.revision DESC
            ) AS domainRank
          FROM apiReleaseSets
          INNER JOIN apiVersions ON apiVersions.id = apiReleaseSets.apiVersionId
          WHERE apiReleaseSets.status <> 'draft'
            AND apiReleaseSets.cohortKey IS NOT NULL
        )
        SELECT DISTINCT
          rankedReleaseSets.apiFamily,
          rankedReleaseSets.code,
          CASE
            WHEN sourceReleases.id IS NULL THEN NULL
            ELSE datasets.code
          END AS sourceCode,
          sourceReleases.code AS sourceReleaseCode
        FROM rankedReleaseSets
        LEFT JOIN apiReleaseSetSnapshots
          ON apiReleaseSetSnapshots.apiReleaseSetId = rankedReleaseSets.id
        LEFT JOIN snapshotSources
          ON snapshotSources.snapshotId = apiReleaseSetSnapshots.snapshotId
        LEFT JOIN releases
          ON releases.id = snapshotSources.resourceReleaseId
          AND releases.status IN ('published', 'superseded')
          AND releases.revokedAt IS NULL
        LEFT JOIN sourceReleases
          ON sourceReleases.id = releases.sourceReleaseId
          AND sourceReleases.status IN ('published', 'superseded')
          AND sourceReleases.revokedAt IS NULL
        LEFT JOIN datasets ON datasets.id = releases.datasetId
        WHERE rankedReleaseSets.domainRank = 1
        ORDER BY rankedReleaseSets.apiFamily ASC, rankedReleaseSets.code ASC,
          datasets.code ASC, sourceReleases.code ASC`,
      )
      .all<RegistryReviewReleaseRow>(),
  )
  const releases = new Map<
    string,
    {
      apiFamily: string
      code: string
      contributingSources: Array<{ sourceCode: string; sourceReleaseCode: string }>
    }
  >()

  for (const row of result.results) {
    const key = `${row.apiFamily}\u0000${row.code}`
    const release = releases.get(key) ?? {
      apiFamily: row.apiFamily,
      code: row.code,
      contributingSources: [],
    }
    if (row.sourceCode && row.sourceReleaseCode) {
      release.contributingSources.push({
        sourceCode: row.sourceCode,
        sourceReleaseCode: row.sourceReleaseCode,
      })
    }
    releases.set(key, release)
  }

  return [...releases.values()]
}

export const registryRoutes = [
  ...listRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const resource = REGISTRY_RESOURCES[index] ?? REGISTRY_RESOURCES[0]
        const { limit, view } = c.req.valid('query')
        const data =
          resource.publicName === 'releases' && view === 'review'
            ? await listRegistryReviewReleases(c.var.metaDb)
            : await resource.list(c.var.metaDb, limit)

        return c.json(parseJsonResponse(RegistryListResponseSchema, { data }), 200)
      },
    }),
  ),
  ...detailRouteConfigs.map((routeConfig, index) =>
    defineOpenAPIRoute<typeof routeConfig, AppEnv>({
      route: routeConfig,
      handler: async c => {
        const resource = REGISTRY_RESOURCES[index] ?? REGISTRY_RESOURCES[0]
        const { id } = c.req.valid('param')
        const data = await resource.detail(c.var.metaDb, id)

        if (!data) {
          return c.json(
            {
              httpStatus: 404,
              error: 'not_found',
              message: 'Registry record not found.',
            },
            404,
          )
        }

        return c.json(parseJsonResponse(RegistryDetailResponseSchema, { data }), 200)
      },
    }),
  ),
] as const
