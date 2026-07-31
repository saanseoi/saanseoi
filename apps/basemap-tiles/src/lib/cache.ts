import { applyAccessHeaders } from './access'

export const DYNAMIC_CACHE_CONTROL = 'public, max-age=300'

type CacheResponseOptions = {
  request: Request
  env: Pick<CloudflareBindings, 'CACHE_CONTROL'>
  ctx: ExecutionContext
  allowedOrigin: string
  latestRequest: boolean
}

export class ResponseCache {
  readonly #request: Request
  readonly #env: CacheResponseOptions['env']
  readonly #ctx: ExecutionContext
  readonly #allowedOrigin: string
  readonly #latestRequest: boolean

  constructor({
    request,
    env,
    ctx,
    allowedOrigin,
    latestRequest,
  }: CacheResponseOptions) {
    this.#request = request
    this.#env = env
    this.#ctx = ctx
    this.#allowedOrigin = allowedOrigin
    this.#latestRequest = latestRequest
  }

  async match(): Promise<Response | undefined> {
    if (this.#latestRequest) return undefined

    const cached = await caches.default.match(this.#request.url)
    if (cached?.status === 404) {
      await caches.default.delete(this.#request.url)
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
        caches.default.put(this.#request.url, new Response(body, { headers, status })),
      )
    }
    return new Response(body, {
      headers: applyAccessHeaders(headers, this.#allowedOrigin),
      status,
    })
  }
}
