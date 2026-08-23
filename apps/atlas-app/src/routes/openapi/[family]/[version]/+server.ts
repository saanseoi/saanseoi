import { error, type RequestHandler } from '@sveltejs/kit'
import { atlasApiBaseUrl } from '#lib/server/atlasApi.js'

const apiFamilies = new Set([
  'addresses',
  'divisions',
  'places',
  'registry',
  'stats',
  'streets',
])

export const GET: RequestHandler = async ({
  fetch,
  params,
  platform,
  request,
  url,
}) => {
  const family = params.family
  const version = params.version
  if (
    typeof family !== 'string' ||
    !apiFamilies.has(family) ||
    (version !== 'v0' && version !== 'v0.1')
  ) {
    error(404, 'OpenAPI document is unavailable.')
  }

  const openApiUrl = new URL(
    family === 'registry'
      ? `${atlasApiBaseUrl(url, platform)}/openapi/registry/${version}`
      : `${atlasApiBaseUrl(url, platform)}/openapi/${family}/${version}`,
  )
  openApiUrl.search = url.search

  const response = await fetch(openApiUrl, {
    headers: {
      'accept-language': request.headers.get('accept-language') ?? '',
    },
  })

  if (!response.ok) {
    error(response.status, 'OpenAPI document is unavailable.')
  }

  return new Response(response.body, {
    headers: {
      'cache-control': response.headers.get('cache-control') ?? 'public, max-age=300',
      'content-type': response.headers.get('content-type') ?? 'application/json',
      vary: response.headers.get('vary') ?? 'accept-language',
    },
    status: 200,
  })
}
