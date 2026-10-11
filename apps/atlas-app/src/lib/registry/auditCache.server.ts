import { waitUntil } from 'cloudflare:workers'

/** Content-addressed, environment-local derived data; never cache a failed build. */
export async function cachedAuditData<T>(
  key: string,
  build: () => Promise<T>,
): Promise<T> {
  // The Cloudflare adapter supplies the global Cache API in development too.
  const storage = globalThis.caches
  if (!storage) return build()
  const cache = await storage.open('audit-presentation')
  if (!cache) return build()
  // Remote queries prohibit event.url access. This URL names a cache entry only;
  // it is never fetched, and the named cache belongs to the current environment.
  const request = new Request(`https://audit-cache.saanseoi.invalid/v2/${key}`)
  const hit = await cache.match(request)
  if (hit) return hit.json() as Promise<T>
  const value = await build()
  const response = Response.json(value, {
    headers: { 'Cache-Control': 'public, max-age=31536000' },
  })
  const write = cache.put(request, response).catch(error => {
    console.warn('Unable to cache audit presentation data', error)
  })
  waitUntil(write)
  return value
}
