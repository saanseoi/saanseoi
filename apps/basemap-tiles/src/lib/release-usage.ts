import { recordProductUsage, type ProductUsageDataset } from '@repo/core/productUsage'

const names: Record<string, string> = { hongkong: 'hk', macau: 'mo', gba: 'gba' }

/** Only immutable date pins can be attributed without guessing which archive was served. */
export function pinnedRelease(pathname: string): string | null {
  const download = pathname.match(
    /^\/downloads\/(hk|mo|gba)\/(\d{4}-\d{2}-\d{2})\.pmtiles$/,
  )
  if (download) return `${download[1]}/${download[2]}`
  const tile = pathname.match(
    /^\/(hongkong|macau|gba)-(\d{4}-\d{2}-\d{2})(?:\.json|\/\d+\/\d+\/\d+\.(?:mvt|pbf))$/,
  )
  return tile ? `${names[tile[1]!]}/${tile[2]}` : null
}

export function recordBasemapAccess(
  dataset: ProductUsageDataset | undefined,
  release: string,
  pathname: string,
  metricKey: 'apiRequests' | 'downloads',
  status: number,
) {
  recordProductUsage(dataset, {
    event: 'api.access',
    producer: 'basemap-tiles',
    surface: 'access',
    route: pathname,
    entityType: 'basemap_release',
    entityId: release,
    outcome: 'success',
    httpStatus: status,
    metricKey,
    count: 1,
  })
}

/** Preserve streaming/backpressure and count only a fully consumed response. */
export function observeDownload(response: Response, complete: () => void): Response {
  if (!response.body) return response
  const reader = response.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read()
        if (result.done) {
          complete()
          controller.close()
        } else controller.enqueue(result.value)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  return new Response(body, response)
}

// Cache only immutable ETag-to-release identities; never cache a mutable latest alias.
const resolvedEtags = new Map<string, string>()
export async function resolveLatestRelease(
  pathname: string,
  etag: string,
  bucket: Pick<R2Bucket, 'get' | 'head'>,
): Promise<string | null> {
  const match = pathname.match(
    /^\/(hongkong|macau|gba)-latest(?:\.json|\/\d+\/\d+\/\d+\.(?:mvt|pbf))$/,
  )
  if (!match) return null
  const region = names[match[1]!]
  const normalised = etag.replaceAll('"', '')
  const cacheKey = `${region}/${normalised}`
  const cached = resolvedEtags.get(cacheKey)
  if (cached) return cached
  const object = await bucket.get(`basemap/${region}/versions.json`)
  if (!object) return null
  const catalogue = await object.json<{
    versions: Array<{ version: string; key: string }>
  }>()
  for (const entry of catalogue.versions) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.version) ||
      entry.key !== `basemap/${region}/${match[1]}-${entry.version}.pmtiles`
    )
      continue
    const archive = await bucket.head(entry.key)
    if (archive?.etag === normalised) {
      const id = `${region}/${entry.version}`
      if (resolvedEtags.size >= 32) resolvedEtags.clear()
      resolvedEtags.set(cacheKey, id)
      return id
    }
  }
  return null
}
