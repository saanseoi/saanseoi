import { TileType } from 'pmtiles'
import { PublicKeyLeaseUnavailableError } from '@repo/core/publicApiKey'
import {
  boundary_name,
  boundary_path,
  metadata_path,
  pmtiles_path,
  release_manifest_request,
  render_request,
  tile_path,
} from '@repo/basemap'
import { getAllowedOrigin } from './lib/access'
import { authenticatePublicKeyRequest } from './lib/public-key-access'
import { ResponseCache, DYNAMIC_CACHE_CONTROL, tileBodyCacheKey } from './lib/cache'
import { getRegionsIndex } from './lib/catalogue'
import { KeyNotFoundError } from './lib/errors'
import { openPmtiles } from './lib/pmtiles'
import { getTileJson } from './lib/tilejson'

type Env = CloudflareBindings & {
  PUBLIC_KEY_LEASE_COORDINATOR: DurableObjectNamespace
  PUBLIC_KEY_LEASES: KVNamespace
}

const tileContentType = (tileType: TileType): string | undefined => {
  switch (tileType) {
    case TileType.Mvt:
      return 'application/x-protobuf'
    case TileType.Png:
      return 'image/png'
    case TileType.Jpeg:
      return 'image/jpeg'
    case TileType.Webp:
      return 'image/webp'
  }
}

const expectedExtension = (tileType: TileType): string | undefined => {
  switch (tileType) {
    case TileType.Mvt:
      return 'mvt'
    case TileType.Png:
      return 'png'
    case TileType.Jpeg:
      return 'jpg'
    case TileType.Webp:
      return 'webp'
    case TileType.Avif:
      return 'avif'
  }
}

export const isLatestRequest = (
  name: string,
  renderLatest: boolean,
  archiveVersion: string | null,
): boolean => (name.endsWith('-latest') && !archiveVersion) || renderLatest

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method.toUpperCase() === 'OPTIONS') {
      const allowedOrigin = getAllowedOrigin(request.headers.get('Origin'), env)
      const headers = new Headers({
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-API-Key',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400',
      })
      if (allowedOrigin) headers.set('Access-Control-Allow-Origin', allowedOrigin)
      headers.set('Vary', 'Origin')
      return new Response(undefined, { headers, status: 204 })
    }
    if (request.method.toUpperCase() === 'POST') {
      return new Response(undefined, { status: 405 })
    }

    const url = new URL(request.url)
    const { ok, name, tile, ext } = tile_path(url.pathname)
    const metadataKey = metadata_path(url.pathname)
    const manifestRequest = release_manifest_request(url.pathname)
    const renderRequest = render_request(url.pathname)
    const boundaryName = boundary_name(url.pathname)
    if (!ok && !metadataKey && !manifestRequest && !renderRequest && !boundaryName) {
      return new Response('Invalid URL', { status: 404 })
    }

    let access: Awaited<ReturnType<typeof authenticatePublicKeyRequest>>
    try {
      access = await authenticatePublicKeyRequest(request, env)
    } catch (error) {
      if (!(error instanceof PublicKeyLeaseUnavailableError)) throw error
      return new Response(
        'Public API key validation is temporarily unavailable. Please retry.',
        {
          status: 503,
        },
      )
    }
    // Release manifests contain immutable, non-sensitive provenance and must be
    // linkable from the viewer's diagnostic report. Unlike tile data, they are
    // intentionally readable without a browser Origin or public key.
    if (!access && !manifestRequest && !renderRequest) {
      return new Response('A valid SaanSeoi public API key is required.', {
        status: 401,
      })
    }
    if (access && !access.unmetered && !access.originAllowed) {
      return new Response('This public API key is not allowed from this origin.', {
        status: 403,
      })
    }
    if (access && !access.unmetered) {
      const rateLimit = await env.TILE_RATE_LIMIT.limit({ key: access.lease.keyId })
      if (!rateLimit.success)
        return new Response('Tile rate limit exceeded.', { status: 429 })
      env.TILE_USAGE.writeDataPoint({
        indexes: [access.lease.keyId],
        blobs: [url.pathname, requestOrigin(request.headers.get('Origin'))],
        doubles: [1],
      })
    }

    const latestRequest = isLatestRequest(
      boundaryName ?? name,
      Boolean(renderRequest?.latest),
      url.searchParams.get('v'),
    )
    const responseCache = new ResponseCache({
      request,
      // TileJSON contains this caller's public key and therefore retains its
      // complete URL cache key. Tile bodies are identical once authenticated.
      cacheKey: tile ? tileBodyCacheKey(request) : undefined,
      env,
      ctx,
      allowedOrigin: getAllowedOrigin(request.headers.get('Origin'), env),
      latestRequest,
    })
    const cached = await responseCache.match()
    if (cached) return cached

    const headers = new Headers()
    if (metadataKey) {
      const object = await env.BUCKET.get(metadataKey)
      if (!object) {
        return responseCache.response(
          'Catalogue not found',
          headers,
          404,
          DYNAMIC_CACHE_CONTROL,
        )
      }
      headers.set('Content-Type', 'application/json')
      return responseCache.response(
        await object.text(),
        headers,
        200,
        DYNAMIC_CACHE_CONTROL,
      )
    }

    try {
      const regions = await getRegionsIndex(env)
      if (renderRequest) {
        const region = regions.regions.find(
          candidate => candidate.code === renderRequest.regionCode,
        )
        if (!region || !renderRequest.name.startsWith(`${region.name}-`)) {
          return responseCache.response('Basemap preview not found', headers, 404)
        }
        const preview = await env.BUCKET.get(
          `basemap/${region.code}/${renderRequest.name}.webp`,
        )
        if (!preview) {
          return responseCache.response('Basemap preview not found', headers, 404)
        }
        headers.set('Content-Type', 'image/webp')
        return responseCache.response(
          await preview.arrayBuffer(),
          headers,
          200,
          renderRequest.latest ? DYNAMIC_CACHE_CONTROL : undefined,
        )
      }
      if (manifestRequest) {
        const region = regions.regions.find(
          candidate => candidate.code === manifestRequest.regionCode,
        )
        if (!region)
          return responseCache.response('Release manifest not found', headers, 404)
        const manifestKey = `basemap/${region.code}/${region.name}-${manifestRequest.version}.json`
        const manifest = await env.BUCKET.get(manifestKey)
        if (!manifest)
          return responseCache.response('Release manifest not found', headers, 404)
        headers.set('Content-Type', 'application/json')
        return responseCache.response(
          JSON.stringify(publicReleaseManifest(await manifest.json())),
          headers,
          200,
        )
      }
      const requestedName = boundaryName ?? name
      const region = regions.regions.find(candidate =>
        requestedName.startsWith(`${candidate.name}-`),
      )
      if (!region) return responseCache.response('Archive not found', headers, 404)

      if (boundaryName) {
        const boundaryKey = boundary_path(boundaryName, regions.regions)
        if (!boundaryKey) {
          return responseCache.response('Boundary not found', headers, 404)
        }
        const boundary = await env.BUCKET.get(boundaryKey)
        if (!boundary) {
          return responseCache.response('Boundary not found', headers, 404)
        }
        headers.set('Content-Type', 'application/geo+json')
        return responseCache.response(
          await boundary.text(),
          headers,
          200,
          boundaryName.endsWith('-latest') ? DYNAMIC_CACHE_CONTROL : undefined,
        )
      }

      const archiveKey = pmtiles_path(name, regions.regions)
      if (!archiveKey) return responseCache.response('Archive not found', headers, 404)

      // TileJSON requests need the current ETag so clients can cache-bust a
      // newly promoted `-latest` archive. Do not issue this R2 HEAD for every
      // tile request: a map loads many tiles in parallel, and PMTiles already
      // detects a replaced object through its conditional range reads.
      const latestArchive =
        name.endsWith('-latest') && !tile
          ? await env.BUCKET.head(archiveKey)
          : undefined
      const archiveVersion = latestArchive?.httpEtag ?? latestArchive?.etag
      const pmtiles = openPmtiles(env, archiveKey, archiveVersion)
      const header = await pmtiles.getHeader()

      if (!tile) {
        headers.set('Content-Type', 'application/json')
        const origin = `https://${env.PUBLIC_HOSTNAME || url.hostname}`
        return responseCache.response(
          JSON.stringify(
            await getTileJson({
              accessToken: url.searchParams.get('access_token') ?? undefined,
              pmtiles,
              origin,
              name,
              archiveVersion,
            }),
          ),
          headers,
          200,
          name.endsWith('-latest') ? DYNAMIC_CACHE_CONTROL : undefined,
        )
      }

      if (tile[0] < header.minZoom || tile[0] > header.maxZoom) {
        return responseCache.response(undefined, headers, 404)
      }

      const expected = expectedExtension(header.tileType)
      if (
        expected &&
        ext !== expected &&
        !(header.tileType === TileType.Mvt && ext === 'pbf')
      ) {
        return responseCache.response(
          `Bad request: requested .${ext} but archive has type .${expected}`,
          headers,
          400,
        )
      }

      const tileData = await pmtiles.getZxy(tile[0], tile[1], tile[2])
      const contentType = tileContentType(header.tileType)
      if (contentType) headers.set('Content-Type', contentType)
      if (!tileData) return responseCache.response(undefined, headers, 204)

      return responseCache.response(tileData.data, headers, 200)
    } catch (error) {
      if (error instanceof KeyNotFoundError) {
        return responseCache.response('Archive not found', headers, 404)
      }
      throw error
    }
  },
}

function requestOrigin(origin: string | null) {
  if (!origin) return '(none)'
  try {
    return new URL(origin).host
  } catch {
    return '(invalid)'
  }
}

export function publicReleaseManifest(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {}
  const manifest = value as Record<string, unknown>
  // The CLI's top-level command may contain local file paths. Publish only the
  // structured release provenance, whose command has already been normalised
  // by the release builder, rather than echoing the operator's raw argv.
  return {
    schemaVersion: manifest.schemaVersion,
    createdAt: manifest.createdAt,
    region: manifest.region,
    release: manifest.release,
    provenance: manifest.provenance,
  }
}
