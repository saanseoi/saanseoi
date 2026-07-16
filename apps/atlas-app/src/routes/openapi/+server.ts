import { env } from '$env/dynamic/public'
import { error, type RequestHandler } from '@sveltejs/kit'

function atlasApiBaseUrl(url: URL, platform: App.Platform | undefined) {
  const configuredBaseUrl =
    platform?.env.PUBLIC_ATLAS_API_BASE_URL ?? env.PUBLIC_ATLAS_API_BASE_URL

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }

  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : url.origin
}

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
