import { getRequestEvent } from '$app/server'

/** Content-addressed, environment-local derived data; never cache a failed build. */
export async function cachedAuditData<T>(
  key: string,
  build: () => Promise<T>,
): Promise<T> {
  const event = getRequestEvent()
  const cache = await event.platform?.caches?.open('audit-presentation')
  if (!cache) return build()
  const request = new Request(new URL(`/__audit-cache/v1/${key}`, event.url.origin))
  const hit = await cache.match(request)
  if (hit) return hit.json() as Promise<T>
  const value = await build()
  const response = Response.json(value, {
    headers: { 'Cache-Control': 'public, max-age=31536000' },
  })
  const write = cache.put(request, response).catch(error => {
    console.warn('Unable to cache audit presentation data', error)
  })
  if (event.platform?.ctx) event.platform.ctx.waitUntil(write)
  else await write
  return value
}
