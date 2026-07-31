import { Compression, EtagMismatch, PMTiles, ResolvedValueCache } from 'pmtiles'
import type { RangeResponse, Source } from 'pmtiles'
import { KeyNotFoundError } from './errors'

type BucketEnv = Pick<CloudflareBindings, 'BUCKET'>

const nativeDecompress = async (
  buffer: ArrayBuffer,
  compression: Compression,
): Promise<ArrayBuffer> => {
  if (compression === Compression.None || compression === Compression.Unknown) {
    return buffer
  }
  if (compression === Compression.Gzip) {
    const stream = new Response(buffer).body
    return new Response(
      stream?.pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()
  }
  throw new Error('Compression method not supported')
}

const pmtilesCache = new ResolvedValueCache(25, undefined, nativeDecompress)

class R2Source implements Source {
  constructor(
    private readonly env: BucketEnv,
    private readonly archiveKey: string,
    private readonly cacheKey = archiveKey,
  ) {}

  getKey() {
    return this.cacheKey
  }

  async getBytes(
    offset: number,
    length: number,
    _signal?: AbortSignal,
    etag?: string,
  ): Promise<RangeResponse> {
    const response = await this.env.BUCKET.get(this.archiveKey, {
      range: { offset, length },
      onlyIf: { etagMatches: etag },
    })
    if (!response) throw new KeyNotFoundError('Archive not found')
    const object = response as R2ObjectBody
    if (!object.body) throw new EtagMismatch()

    return {
      data: await object.arrayBuffer(),
      etag: object.etag,
      cacheControl: object.httpMetadata?.cacheControl,
      expires: object.httpMetadata?.cacheExpiry?.toISOString(),
    }
  }
}

export const openPmtiles = (
  env: BucketEnv,
  archiveKey: string,
  archiveVersion?: string,
): PMTiles =>
  new PMTiles(
    new R2Source(
      env,
      archiveKey,
      archiveVersion ? `${archiveKey}:${archiveVersion}` : archiveKey,
    ),
    pmtilesCache,
    nativeDecompress,
  )
