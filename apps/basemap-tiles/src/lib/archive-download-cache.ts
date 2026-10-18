// Bounded chunks keep large archives below per-object cache limits and avoid
// cloning or buffering an entire download when the cache and client differ in speed.
export const ARCHIVE_CACHE_CHUNK_SIZE = 8 * 1024 * 1024

export type ArchiveCache = Pick<Cache, 'match' | 'put'>

export async function cachedArchiveDownload(
  request: Request,
  bucket: R2Bucket,
  key: string,
  cache: ArchiveCache,
): Promise<Response> {
  const metadata = await bucket.head(key)
  if (!metadata)
    return new Response('Artefact not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  const headers = new Headers({
    'Content-Type': 'application/vnd.pmtiles',
    'Content-Length': String(metadata.size),
    'Content-Disposition': `attachment; filename="${key.split('/').at(-1)}"`,
    ETag: metadata.httpEtag,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  if (request.headers.get('If-None-Match') === metadata.httpEtag)
    return new Response(null, { status: 304, headers })
  if (request.method === 'HEAD') return new Response(null, { headers })

  let offset = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset === metadata.size) {
        controller.close()
        return
      }
      const length = Math.min(ARCHIVE_CACHE_CHUNK_SIZE, metadata.size - offset)
      const cacheKey = new URL(request.url)
      cacheKey.pathname = `/__archive-cache/${key}`
      cacheKey.search = new URLSearchParams({
        etag: metadata.etag,
        offset: String(offset),
        length: String(length),
      }).toString()
      let bytes: Uint8Array | undefined
      try {
        const cached = await cache.match(cacheKey.toString())
        if (cached?.status === 200) bytes = new Uint8Array(await cached.arrayBuffer())
      } catch (error) {
        console.warn('Archive cache lookup failed', error)
      }
      if (!bytes || bytes.byteLength !== length) {
        const object = await bucket.get(key, {
          range: { offset, length },
          onlyIf: { etagMatches: metadata.etag },
        })
        if (!object || !('body' in object))
          throw new Error('Archive changed or disappeared during download')
        bytes = new Uint8Array(await object.arrayBuffer())
        if (bytes.byteLength !== length)
          throw new Error('Archive chunk length does not match the requested range')
        try {
          // Await each bounded write so slow cache storage cannot accumulate
          // pending buffers across a multi-gigabyte archive.
          await cache.put(
            cacheKey.toString(),
            new Response(bytes, {
              headers: {
                'Content-Length': String(length),
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            }),
          )
        } catch (error) {
          console.warn('Archive cache write failed', error)
        }
      }
      offset += length
      controller.enqueue(bytes)
    },
  })
  return new Response(body, { headers })
}
