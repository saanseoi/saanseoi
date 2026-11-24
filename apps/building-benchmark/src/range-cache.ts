/** Public immutable FGB bytes are cached; readers and I/O remain request-local. */
export const CHUNK_BYTES = 64 * 1024
export type CacheMetrics = {
  cacheHits: number
  cacheMisses: number
  cacheBytes: number
  rangeRequests: number
  rangeBytes: number
}

/** Build a request-scoped range reader with colo-local Workers Cache API storage.
 * @param bucket Preview R2 bucket.
 * @param objectKey Release-pinned key, immutable throughout the experiment.
 * @param cache Cache API instance.
 * @param namespace Isolated run namespace for first-access measurements.
 * @param origin Worker origin for internal cache keys.
 * @param metrics Counters owned exclusively by this request.
 * @returns FlatGeobuf range transport with at most eight parallel chunk reads.
 * @remarks Await cache writes for repeatable tests; final query results are never cached.
 */
export function cachedRanges(
  bucket: R2Bucket,
  objectKey: string,
  cache: Cache,
  namespace: string,
  origin: string,
  metrics: CacheMetrics,
): { getRange(offset: number, length: number): Promise<ArrayBuffer> } {
  const local = new Map<number, ArrayBuffer>()
  /** Read a fixed chunk, sharing it through Cache API and then within this request. */
  async function chunk(start: number): Promise<ArrayBuffer> {
    const existing = local.get(start)
    if (existing) return existing
    const key = new Request(
      `${origin}/__fgb-chunks/v1/${namespace}/${objectKey}/${start}`,
    )
    const hit = await cache.match(key)
    let bytes: ArrayBuffer
    if (hit) {
      bytes = await hit.arrayBuffer()
      metrics.cacheHits++
      metrics.cacheBytes += bytes.byteLength
    } else {
      metrics.cacheMisses++
      const object = await bucket.get(objectKey, {
        range: { offset: start, length: CHUNK_BYTES },
      })
      if (!object) throw new Error('Preview geometry object missing.')
      bytes = await object.arrayBuffer()
      metrics.rangeRequests++
      metrics.rangeBytes += bytes.byteLength
      await cache.put(
        key,
        new Response(bytes, {
          headers: {
            'Cache-Control': 'public, max-age=3600',
            'Content-Type': 'application/octet-stream',
          },
        }),
      )
    }
    local.set(start, bytes)
    return bytes
  }
  return {
    async getRange(offset, length) {
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(length) ||
        length <= 0 ||
        length > 8 * 1024 * 1024
      )
        throw new Error('Unexpected range size.')
      const starts: number[] = []
      for (
        let start = Math.floor(offset / CHUNK_BYTES) * CHUNK_BYTES;
        start < offset + length;
        start += CHUNK_BYTES
      )
        starts.push(start)
      const chunks: ArrayBuffer[] = []
      for (let i = 0; i < starts.length; i += 8)
        chunks.push(...(await Promise.all(starts.slice(i, i + 8).map(chunk))))
      const available = chunks.reduce((n, bytes) => n + bytes.byteLength, 0)
      const skip = offset - starts[0]
      if (available < skip) throw new Error('Range starts beyond object end.')
      const result = new Uint8Array(Math.min(length, available - skip))
      let written = 0
      for (let i = 0; i < chunks.length && written < result.length; i++) {
        const source = new Uint8Array(chunks[i])
        const begin = i === 0 ? skip : 0
        const count = Math.min(source.length - begin, result.length - written)
        result.set(source.subarray(begin, begin + count), written)
        written += count
      }
      return result.buffer
    },
  }
}
