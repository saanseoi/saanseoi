import { env } from 'cloudflare:workers'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'

export function atlasApiBaseUrl(url: URL) {
  const configuredBaseUrl = env.PUBLIC_ATLAS_API_BASE_URL ?? PUBLIC_ATLAS_API_BASE_URL

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }

  return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    ? 'http://localhost:8787'
    : url.origin
}
