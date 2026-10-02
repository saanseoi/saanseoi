import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types'

type ApiVersionStatusRow = { status: string }

/** Keep archived APIs readable and stop retired API versions at the route boundary. */
export const apiVersionLifecycleMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next,
) => {
  const pathSegments = c.req.path.split('/').filter(Boolean)
  if (pathSegments.length < 2) return next()

  const routePrefix = `/${pathSegments.slice(0, 2).join('/')}`
  const matchingVersions = await c
    .get('metaDb')
    .$client.prepare(
      `SELECT DISTINCT apiVersions.status AS status
       FROM apiEndpoints
       INNER JOIN apiVersions ON apiVersions.id = apiEndpoints.apiVersionId
       WHERE apiEndpoints.path = ? OR apiEndpoints.path LIKE ?`,
    )
    .bind(routePrefix, `${routePrefix}/%`)
    .all<ApiVersionStatusRow>()

  if (
    matchingVersions.results.length > 0 &&
    matchingVersions.results.every(version => version.status === 'retired')
  ) {
    return c.json(
      {
        error: 'api_version_retired',
        message: 'This API version is no longer available.',
      },
      410,
    )
  }

  if (
    matchingVersions.results.length > 0 &&
    matchingVersions.results.every(version => version.status === 'draft')
  ) {
    return c.notFound()
  }

  return next()
}
