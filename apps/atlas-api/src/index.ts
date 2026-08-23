import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { Scalar } from '@scalar/hono-api-reference'
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown'
import { cors } from 'hono/cors'
import { poweredBy } from 'hono/powered-by'
import { prettyJSON } from 'hono/pretty-json'

import { createCurrentDb, createHistoryDb, createMetaDb } from '@repo/db'
import { isTransientD1ReadError } from './lib/d1'
import { defaultOpenAPIHook } from './lib/openapi'
import { resolvePublicKeyLease } from './lib/public-key-lease'
import {
  PublicKeyLeaseUnavailableError,
  isPublicKeyOriginAllowed,
  readPublicApiKey,
  type PublicKeyLease,
} from '@repo/core/publicApiKey'
export { PublicKeyLeaseCoordinator } from './publicKeyLeaseCoordinator'
import { metaRoutes } from './routes/v0/meta'
import { probeRoutes } from './routes/v0/probe'
import { divisionRoutes } from './routes/divisions/v0/divisions'
import { addressRoutes } from './routes/addresses/v0/addresses'
import { placeRoutes } from './routes/places/v0/places'
import { registryRoutes } from './routes/v0/registry'
import { managedAssetRoutes } from './routes/v0/assets'
import { styleRoutes } from './routes/v0/styles'
import { streetRoutes } from './routes/streets/v0/streets'
import { statisticRoutes } from './routes/statistics/v0/statistics'
import {
  sourceRoutes,
  streamSourceRecordsMiddleware,
} from './routes/api-family/v0/sources'
import { rollUpApiKeyUsage } from './services/apiKeyUsageRollup'
import {
  completeAccessAnalyticsDownload,
  recordAccessAnalyticsEvent,
} from './services/accessAnalytics'
import { rollUpAccessAnalyticsDaily } from './services/accessAnalyticsRollup'
import { asRollupJobError, type RollupPhase } from './services/rollupRetry'
import {
  isFirstPartyWebOrigin,
  productApiOutcome,
  writeProductUsage,
} from './lib/productUsage'
import type { AppBindings, AppEnv } from './types'

const app = new OpenAPIHono<AppEnv>({
  defaultHook: defaultOpenAPIHook,
})
const majorAliasRequestPaths = new WeakMap<Request, string>()
const openApiConfig = {
  openapi: '3.1.0' as const,
  info: {
    title: 'SaanSeoi API',
    version: '0',
  },
  tags: [
    { name: 'API Families' },
    { name: 'API Releases' },
    { name: 'API Fields' },
    { name: 'API Endpoints' },
    { name: 'Sources' },
    { name: 'Source Versions' },
    { name: 'Source Publishers' },
    { name: 'Addresses' },
    { name: 'Divisions' },
    { name: 'Places' },
    { name: 'Statistics' },
    { name: 'Streets' },
    { name: 'Source assets' },
    { name: 'Map styles' },
    { name: 'Meta' },
  ],
  'x-tagGroups': [
    {
      name: 'Registry',
      tags: [
        'API Families',
        'API Releases',
        'API Fields',
        'API Endpoints',
        'Sources',
        'Source Versions',
        'Source Publishers',
      ],
    },
    {
      name: 'API Family',
      tags: ['Addresses', 'Divisions', 'Places', 'Statistics', 'Streets'],
    },
    {
      name: 'Assets',
      tags: ['Source assets'],
    },
    {
      name: 'Styles',
      tags: ['Map styles'],
    },
    {
      name: 'System',
      tags: ['Meta'],
    },
  ],
}

const apiFamilyTags = new Set(
  openApiConfig['x-tagGroups'].find(group => group.name === 'API Family')?.tags,
)

const apiProducts = ['addresses', 'divisions', 'places', 'stats', 'streets'] as const
type ApiProduct = (typeof apiProducts)[number]

function isApiProduct(value: string | undefined): value is ApiProduct {
  return apiProducts.some(product => product === value)
}

const apiProductTags: Record<ApiProduct, string> = {
  addresses: 'Addresses',
  divisions: 'Divisions',
  places: 'Places',
  stats: 'Statistics',
  streets: 'Streets',
}

const apiProductIntroductions: Record<ApiProduct, string> = {
  addresses:
    'Addresses is a SaanSeoi API product for address records. Use the Registry to discover available API families, releases, fields, endpoints, and source metadata; use this product to retrieve addresses. Addresses versions independently of every other API product.',
  divisions:
    'Divisions is a SaanSeoi API product for administrative and other geographic divisions. Use the Registry to discover available API families, releases, fields, endpoints, and source metadata; use this product to retrieve division records and geometries. Divisions versions independently of every other API product.',
  places:
    'Places is a SaanSeoi API product for place records and search. Use the Registry to discover available API families, releases, fields, endpoints, and source metadata; use this product to retrieve places. Places versions independently of every other API product.',
  stats:
    'Statistics is a SaanSeoi API product for published statistical observations and their geographic context. Use the Registry to discover available API families, releases, fields, endpoints, and source metadata; use this product to retrieve statistics. Statistics versions independently of every other API product.',
  streets:
    'Streets is a SaanSeoi API product for Hong Kong street records and their version history. Use the Registry to discover available API families, releases, fields, endpoints, and source metadata; use this product to retrieve streets. Streets versions independently of every other API product.',
}

const registryIntroduction =
  'The Registry is the shared catalogue for SaanSeoi API products. It discovers API families, releases, fields, endpoints, sources, source versions, and publishers. Use a family product such as Addresses, Divisions, Places, Statistics, or Streets to retrieve its records. Each family has its own release cadence and version history; a family version does not describe the version of another product.'

function scalarSourcesForProduct(product: ApiProduct | 'registry') {
  if (product === 'registry') {
    return (['v0', 'v0.1'] as const).map((version, index) => ({
      title: `Registry ${version}`,
      slug: `registry-${version}`,
      url: `/openapi/registry/${version}`,
      default: index === 1,
    }))
  }

  return (['v0', 'v0.1'] as const).map((version, index) => ({
    title: `${apiProductTags[product]} ${version}`,
    slug: `${product}-${version}`,
    url: `/openapi/${product}/${version}`,
    default: index === 1,
  }))
}

const apiRoutePaths = [
  '/v0.1/*',
  ...apiProducts.flatMap(product => [`/${product}/v0/*`, `/${product}/v0.1/*`]),
] as const

function tagsForPathItem(pathItem: unknown) {
  if (pathItem === null || typeof pathItem !== 'object') {
    return []
  }

  return Object.values(pathItem).flatMap(operation => {
    if (
      operation === null ||
      typeof operation !== 'object' ||
      !('tags' in operation) ||
      !Array.isArray(operation.tags)
    ) {
      return []
    }

    return operation.tags.filter(
      (tag: unknown): tag is string => typeof tag === 'string',
    )
  })
}

export const sortOperations = (first: { path: string }, second: { path: string }) => {
  const firstPathOrder = first.path.endsWith('/source-releases')
    ? 3
    : first.path.endsWith('/sources') && !first.path.includes('/api/')
      ? 2
      : /\/\{[^}]+\}$/.test(first.path)
        ? 1
        : 0
  const secondPathOrder = second.path.endsWith('/source-releases')
    ? 3
    : second.path.endsWith('/sources') && !second.path.includes('/api/')
      ? 2
      : /\/\{[^}]+\}$/.test(second.path)
        ? 1
        : 0
  const orderDifference = firstPathOrder - secondPathOrder
  if (orderDifference !== 0) {
    return orderDifference
  }

  return first.path.localeCompare(second.path)
}

app.use('*', poweredBy())
for (const path of apiRoutePaths) {
  app.use(path, prettyJSON())
}
for (const path of apiRoutePaths) {
  app.use(
    path,
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
    }),
  )
}
app.use(
  '/v0.1/meta/substack',
  cors({
    origin: '*',
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)
for (const path of apiRoutePaths) {
  app.use(path, async (c, next) => {
    c.set('metaDb', createMetaDb(c.env.DB_META))
    c.set('currentDb', createCurrentDb(c.env.DB_CURRENT))
    const historyDbsByBinding = {
      DB_HISTORY_HK_BEFORE: createHistoryDb(c.env.DB_HISTORY_HK_BEFORE),
      DB_HISTORY_HK_2025: createHistoryDb(c.env.DB_HISTORY_HK_2025),
      DB_HISTORY_HK_2026: createHistoryDb(c.env.DB_HISTORY_HK_2026),
    }
    c.set('historyDbs', Object.values(historyDbsByBinding))
    c.set('historyDbsByBinding', historyDbsByBinding)
    await next()
  })
}

for (const path of apiRoutePaths) {
  app.use(path, async (c, next) => {
    const startedAt = performance.now()
    let requestStatus = 500
    try {
      await next()
      requestStatus = c.res.status
    } catch (error) {
      requestStatus = isTransientD1ReadError(error) ? 503 : 500
      throw error
    } finally {
      const requestPath = majorAliasRequestPaths.get(c.req.raw) ?? c.req.path
      const status = requestStatus
      const outcome = productApiOutcome(status)
      const origin = c.req.header('origin')
      const assetMatch = requestPath.match(/^\/v0(?:\.1)?\/assets\/([^/]+)$/)
      const styleMatch = requestPath.match(
        /^\/v0(?:\.1)?\/styles\/([a-z0-9-]+)\/(\d+\.\d+\.\d+\.json)$/,
      )

      if (assetMatch) {
        writeProductUsage(c, {
          event: 'api.asset_download',
          surface: 'asset_request',
          route: requestPath,
          entityType: 'asset',
          entityId: assetMatch[1],
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      } else if (styleMatch?.[1] && styleMatch[2]) {
        writeProductUsage(c, {
          event: 'api.style_request',
          surface: 'style_request',
          route: requestPath,
          entityType: 'style',
          entityId: `${styleMatch[1]}:${styleMatch[2].replace('.json', '')}`,
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      } else if (
        requestPath === '/v0/meta/substack' ||
        requestPath === '/v0.1/meta/substack'
      ) {
        writeProductUsage(c, {
          event: 'newsletter.subscription',
          surface: 'newsletter',
          route: requestPath,
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      } else if (
        isFirstPartyWebOrigin(origin) &&
        !/^\/v0(?:\.1)?\/meta\/health/.test(requestPath)
      ) {
        writeProductUsage(c, {
          event: 'api.request',
          surface: 'api',
          route: requestPath,
          outcome,
          httpStatus: status,
          durationMs: performance.now() - startedAt,
        })
      }
    }
  })
}

// Attribution is attached by the route after it has selected the exact
// source release or API ReleaseSet. This middleware runs after the
// key/rate-limit gate and the product-status middleware so an analytics
// acknowledgement failure is visible as the final 503 response.
for (const path of apiRoutePaths) {
  app.use(path, async (c, next) => {
    await next()
    const attribution = c.get('accessAttribution')
    if (!attribution) return c.res

    const status = c.res.status
    const event = {
      ...attribution,
      eventType: 'api_request' as const,
      route: c.req.path,
      httpStatus: status,
    }

    recordAccessAnalyticsEvent(c.env.PRODUCT_USAGE, event)

    if (isCompletedDownloadRequest(c) && isSuccessfulStatus(status) && c.res.body) {
      const downloadEvent = { ...event, eventType: 'download' as const }
      const body = c.res.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(chunk)
          },
          async flush() {
            completeAccessAnalyticsDownload(c.env.PRODUCT_USAGE, downloadEvent)
          },
        }),
      )
      return new Response(body, {
        headers: c.res.headers,
        status: c.res.status,
        statusText: c.res.statusText,
      })
    }

    return c.res
  })
}
for (const path of apiRoutePaths) {
  app.use(path, async (c, next) => {
    if (
      isPublicMetadataPath(c.req.path) ||
      isAuthDisabled(c.env) ||
      isSaanSeoiSiteOrigin(c.req.header('origin'))
    ) {
      return next()
    }
    const rawKey = readPublicApiKey(c.req.raw)
    if (!rawKey) {
      return c.json(
        {
          error: 'invalid_api_key',
          message: 'A valid SaanSeoi public API key is required.',
        },
        401,
      )
    }
    let lease: PublicKeyLease | null
    try {
      lease = await resolvePublicKeyLease(rawKey, c.env)
    } catch (error) {
      if (!(error instanceof PublicKeyLeaseUnavailableError)) throw error
      return c.json(
        {
          error: 'public_key_validation_unavailable',
          message:
            'Public API key validation is temporarily unavailable. Please retry.',
        },
        503,
      )
    }
    if (!lease) {
      return c.json(
        {
          error: 'invalid_api_key',
          message: 'This public API key is invalid or revoked.',
        },
        401,
      )
    }
    if (!isPublicKeyOriginAllowed(lease, c.req.header('origin') ?? null)) {
      return c.json(
        {
          error: 'api_key_origin_not_allowed',
          message: 'This public API key is not allowed from this origin.',
        },
        403,
      )
    }
    const rateLimit = await c.env.API_RATE_LIMIT.limit({ key: lease.keyId })
    if (!rateLimit.success) {
      return c.json(
        {
          error: 'rate_limit_exceeded',
          message: 'The API rate limit has been exceeded.',
        },
        429,
      )
    }
    c.env.API_USAGE.writeDataPoint({
      indexes: [lease.keyId],
      blobs: [c.req.path, requestOrigin(c.req.header('origin'))],
      doubles: [1],
    })
    return next()
  })
}

for (const family of ['addresses', 'divisions', 'stats'] as const) {
  for (const version of ['v0', 'v0.1'] as const) {
    app.use(`/${family}/${version}/sources`, (c, next) =>
      streamSourceRecordsMiddleware(family, c, next),
    )
  }
}

function isPublicMetadataPath(path: string) {
  return (
    path.startsWith('/v0.1/meta/') ||
    path.startsWith('/v0.1/api/') ||
    path.startsWith('/v0.1/assets/') ||
    path.startsWith('/v0.1/styles/')
  )
}

function isAuthDisabled(env: AppBindings) {
  return env.AUTH_MODE === 'disabled'
}

function isSaanSeoiSiteOrigin(origin: string | undefined) {
  if (!origin) return false
  try {
    const url = new URL(origin)
    return url.protocol === 'https:' && url.hostname === 'saanseoi.hk' && !url.port
  } catch {
    return false
  }
}

function requestOrigin(origin: string | undefined) {
  if (!origin) return '(none)'
  try {
    return new URL(origin).host
  } catch {
    return '(invalid)'
  }
}

function isSuccessfulStatus(status: number) {
  return status >= 200 && status < 300
}

function isCompletedDownloadRequest(c: Context<AppEnv>) {
  return (
    c.res.headers.get('content-disposition')?.toLowerCase().startsWith('attachment') ===
    true
  )
}

app.onError((error, c) => {
  console.error(error)
  if (isTransientD1ReadError(error)) {
    return c.json(
      {
        error: 'service_unavailable',
        message: 'The atlas API is temporarily unavailable.',
      },
      503,
    )
  }

  return c.json(
    {
      error: 'internal_error',
      message: 'The atlas API request failed.',
    },
    500,
  )
})

app.notFound(c =>
  c.json(
    {
      error: 'not_found',
      message: 'Route not found.',
    },
    404,
  ),
)

app.get('/', c => c.redirect('/openapi', 302))

app.openapiRoutes([
  ...metaRoutes,
  ...probeRoutes,
  ...registryRoutes,
  ...sourceRoutes,
  ...divisionRoutes,
  ...addressRoutes,
  ...placeRoutes,
  ...managedAssetRoutes,
  ...styleRoutes,
  ...streetRoutes,
  ...statisticRoutes,
] as const)

function getOpenApiDocument(
  baseUrl: string,
  product: ApiProduct | 'registry' = 'registry',
  productVersion?: 'v0' | 'v0.1',
) {
  const document = app.getOpenAPI31Document({
    ...openApiConfig,
    servers: [{ url: baseUrl }],
  })
  const productHasExplicitMajorAlias =
    product !== 'registry' &&
    Object.keys(document.paths ?? {}).some(
      path => path === `/${product}/v0` || path.startsWith(`/${product}/v0/`),
    )
  const documentPathVersion =
    productVersion === 'v0' && !productHasExplicitMajorAlias ? 'v0.1' : productVersion

  const retainedPaths = Object.entries(document.paths ?? {}).filter(
    ([path, pathItem]) => {
      const pathTags = tagsForPathItem(pathItem)
      const isApiFamilyPath = pathTags.some(tag => apiFamilyTags.has(tag))
      return product === 'registry'
        ? !isApiFamilyPath
        : pathTags.includes(apiProductTags[product]) &&
            (!productVersion ||
              path === `/${product}/${documentPathVersion}` ||
              path.startsWith(`/${product}/${documentPathVersion}/`))
    },
  )
  const visibleTags = new Set(
    retainedPaths.flatMap(([, pathItem]) => tagsForPathItem(pathItem)),
  )

  document.paths = Object.fromEntries(
    retainedPaths.map(([path, pathItem]) => [
      productVersion === 'v0'
        ? product === 'registry'
          ? path.replace(/^\/v0\.1(?=\/)/, '/v0')
          : path.replace(new RegExp(`^/${product}/v0\\.1(?=/|$)`), `/${product}/v0`)
        : path,
      pathItem,
    ]),
  )
  document.info = {
    ...document.info,
    title:
      product === 'registry'
        ? 'SaanSeoi API Registry'
        : `SaanSeoi ${apiProductTags[product]} API`,
    description:
      product === 'registry'
        ? registryIntroduction
        : `${apiProductIntroductions[product]}\n\nThis document describes ${productVersion === 'v0' ? 'the `v0` current-family alias' : 'the explicit `v0.1` contract'}. Use an explicit version in integrations that need a pinned contract.`,
    version: productVersion?.replace(/^v/, '') ?? '0.1',
  }
  document.tags = document.tags?.filter(tag => visibleTags.has(tag.name))
  document['x-tagGroups'] = openApiConfig['x-tagGroups']
    .map(group => ({
      ...group,
      tags: group.tags.filter(tag => visibleTags.has(tag)),
    }))
    .filter(group => group.tags.length > 0)

  return document
}

app.get('/openapi', c => c.json(getOpenApiDocument(c.env.ATLAS_BASE_URL)))
for (const version of ['v0', 'v0.1'] as const) {
  app.get(`/openapi/registry/${version}`, c =>
    c.json(getOpenApiDocument(c.env.ATLAS_BASE_URL, 'registry', version)),
  )
}
for (const product of apiProducts) {
  for (const version of ['v0', 'v0.1'] as const) {
    app.get(`/openapi/${product}/${version}`, c =>
      c.json(getOpenApiDocument(c.env.ATLAS_BASE_URL, product, version)),
    )
  }
}
app.get(
  '/docs',
  Scalar(c => {
    const requestedFamily = c.req.query('family')
    return {
      pageTitle: 'SaanSeoi API Reference',
      sources: scalarSourcesForProduct(
        requestedFamily === 'registry'
          ? 'registry'
          : isApiProduct(requestedFamily)
            ? requestedFamily
            : 'addresses',
      ),
      operationsSorter: sortOperations,
    }
  }),
)

function forwardMajorVersionAlias(c: Context<AppEnv>, majorPath: string) {
  const targetUrl = new URL(c.req.url)
  targetUrl.pathname = targetUrl.pathname.replace(majorPath, `${majorPath}.1`)
  const request = new Request(targetUrl, c.req.raw)
  majorAliasRequestPaths.set(request, c.req.path)

  try {
    return app.fetch(request, c.env, c.executionCtx)
  } catch {
    return app.fetch(request, c.env)
  }
}

app.all('/v0/*', c => forwardMajorVersionAlias(c, '/v0'))
app.all('/places/v0/*', c => forwardMajorVersionAlias(c, '/places/v0'))
app.all('/streets/v0/*', c => forwardMajorVersionAlias(c, '/streets/v0'))

app.get('/llms.txt', async c => {
  const document = getOpenApiDocument(c.env.ATLAS_BASE_URL)
  const markdown = createMarkdownFromOpenApi(JSON.stringify(document, undefined, 2))
  return c.text(await markdown)
})

const worker = Object.assign(app, {
  async scheduled(
    controller: ScheduledController,
    env: AppBindings,
    ctx: ExecutionContext,
  ) {
    if (controller.cron === '*/5 * * * *') {
      ctx.waitUntil(
        runScheduledRollup({
          job: 'api_key_usage_rollup',
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          task: () => rollUpApiKeyUsage(env, controller.scheduledTime),
        }),
      )
      return
    }
    if (controller.cron === '15 0 * * *') {
      ctx.waitUntil(
        runScheduledRollup({
          job: 'access_analytics_daily_rollup',
          cron: controller.cron,
          scheduledTime: controller.scheduledTime,
          task: () => rollUpAccessAnalyticsDaily(env, controller.scheduledTime),
        }),
      )
    }
  },
})

export default worker

type ScheduledRollup = {
  job: 'api_key_usage_rollup' | 'access_analytics_daily_rollup'
  cron: string
  scheduledTime: number
  task: () => Promise<unknown>
}

async function runScheduledRollup({ job, cron, scheduledTime, task }: ScheduledRollup) {
  try {
    return await task()
  } catch (error) {
    const rollupError = asRollupJobError('d1_write', error)
    console.error(
      JSON.stringify({
        job,
        cron,
        scheduledTime: new Date(scheduledTime).toISOString(),
        phase: rollupError.phase satisfies RollupPhase,
        httpStatus: rollupError.httpStatus,
        message: sanitiseScheduledErrorMessage(rollupError.message),
      }),
    )
    throw error
  }
}

function sanitiseScheduledErrorMessage(message: string) {
  return message
    .replace(
      /((?:token|secret|authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi,
      '$1[REDACTED]',
    )
    .replace(/(bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(0, 500)
}
