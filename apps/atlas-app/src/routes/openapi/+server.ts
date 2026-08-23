import { error, type RequestHandler } from '@sveltejs/kit'
import { atlasApiBaseUrl } from '#lib/server/atlasApi.js'

export const GET: RequestHandler = async ({ fetch, platform, url }) => {
  const response = await fetch(`${atlasApiBaseUrl(url, platform)}/openapi`)

  if (!response.ok) {
    error(response.status, 'OpenAPI document is unavailable.')
  }

  return new Response(response.body, {
    headers: {
      'cache-control': response.headers.get('cache-control') ?? 'public, max-age=300',
      'content-type': response.headers.get('content-type') ?? 'application/json',
    },
    status: 200,
  })
}
