import { error, type RequestHandler } from '@sveltejs/kit'
import { atlasApiBaseUrl } from '#lib/server/atlasApi.js'

export const GET: RequestHandler = async ({ fetch, platform, request, url }) => {
  const openApiUrl = new URL(`${atlasApiBaseUrl(url, platform)}/openapi`)
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
