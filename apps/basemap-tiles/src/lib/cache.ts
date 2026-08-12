import { applyAccessHeaders } from './access'

export const DYNAMIC_CACHE_CONTROL = 'public, max-age=300'

type CacheResponseOptions = {
  request: Request
  cacheKey?: string
  env: Pick<CloudflareBindings, 'CACHE_CONTROL'>
  ctx: ExecutionContext
  allowedOrigin: string
  latestRequest: boolean
}

export class ResponseCache {
  readonly #cacheKey: string
  readonly #env: CacheResponseOptions['env']
  readonly #ctx: ExecutionContext
  readonly #allowedOrigin: string
  readonly #latestRequest: boolean

  constructor({
    request,
    cacheKey = request.url,
    env,
    ctx,
    allowedOrigin,
    latestRequest,
  }: CacheResponseOptions) {
    this.#cacheKey = cacheKey
    this.#env = env
    this.#ctx = ctx
    this.#allowedOrigin = allowedOrigin
    this.#latestRequest = latestRequest
  }

  async match(): Promise<Response | undefined> {
    if (this.#latestRequest) return undefined

    const cached = await caches.default.match(this.#cacheKey)
    if (cached?.status === 404) {
      await caches.default.delete(this.#cacheKey)
      return undefined
    }
    if (!cached) return undefined

    return new Response(cached.body, {
      headers: applyAccessHeaders(cached.headers, this.#allowedOrigin),
      status: cached.status,
    })
  }

  response(
    body: ArrayBuffer | string | undefined,
    headers: Headers,
    status: number,
    cacheControl: string = this.#env.CACHE_CONTROL ||
      'public, max-age=31536000, immutable',
  ): Response {
    const cacheable = status !== 404
    headers.set('Cache-Control', cacheable ? cacheControl : 'no-store')
    if (cacheable && !this.#latestRequest) {
      this.#ctx.waitUntil(
        caches.default.put(this.#cacheKey, new Response(body, { headers, status })),
      )
    }
    return new Response(body, {
      headers: applyAccessHeaders(headers, this.#allowedOrigin),
      status,
    })
  }
}

/**
 * Authenticated TileJSON includes the caller's public key in its tile URLs.
 * Tile content is not key-specific once the request has been authenticated, so
 * omit that key from its edge-cache identity while retaining every other query
 * parameter, including a version pin for a promoted latest archive.
 */
export const tileBodyCacheKey = (request: Request): string => {
  const url = new URL(request.url)
  url.searchParams.delete('access_token')
  return url.toString()
}
