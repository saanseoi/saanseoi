import { TileType } from 'pmtiles'
import Pbf from 'pbf'
import { VectorTile } from '@mapbox/vector-tile'
import vectorTilePbf from 'vt-pbf'
import {
  boundary_name,
  boundary_path,
  metadata_path,
  pmtiles_path,
  tile_path,
} from '@repo/basemap'
import { getAllowedOrigin } from './lib/access'
import { authenticateTileRequest } from './lib/token-access'
import { ResponseCache, DYNAMIC_CACHE_CONTROL } from './lib/cache'
import { getRegionBoundary, getRegionsIndex } from './lib/catalogue'
import { KeyNotFoundError } from './lib/errors'
import { openPmtiles } from './lib/pmtiles'
import { getTileJson } from './lib/tilejson'
import { filterInsideRegionLabels } from './region-labels'

type Env = CloudflareBindings

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method.toUpperCase() === 'POST') {
      return new Response(undefined, { status: 405 })
    }

    const url = new URL(request.url)
    const { ok, name, tile, ext } = tile_path(url.pathname)
    const metadataKey = metadata_path(url.pathname)
    const boundaryName = boundary_name(url.pathname)
    if (!ok && !metadataKey && !boundaryName) {
      return new Response('Invalid URL', { status: 404 })
    }

    const access = await authenticateTileRequest(request, env)
    if (!access) {
      return new Response('A valid basemap access token is required.', { status: 401 })
    }
    if (!access.unmetered) {
      const rateLimit = await env.TILE_RATE_LIMIT.limit({ key: access.claims.sub })
      if (!rateLimit.success)
        return new Response('Tile rate limit exceeded.', { status: 429 })
      env.TILE_USAGE.writeDataPoint({
        indexes: [access.claims.sub],
        blobs: [url.pathname],
        doubles: [1],
      })
    }

    const insideLabelsOnly = url.searchParams.get('labels') === 'inside'
    const latestRequest = (boundaryName ?? name).endsWith('-latest')
    const responseCache = new ResponseCache({
      request,
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

      // A forced `-latest` rebuild retains its R2 key. Version the PMTiles
      // source cache by its ETag so a warm Worker cannot read new bytes with a
      // directory cached for the archive it replaced.
      const latestArchive = name.endsWith('-latest')
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
              pmtiles,
              origin,
              name,
              archiveVersion,
              insideLabelsOnly,
            }),
          ),
          headers,
          200,
          insideLabelsOnly || name.endsWith('-latest')
            ? DYNAMIC_CACHE_CONTROL
            : undefined,
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
      const boundaryKey = insideLabelsOnly
        ? boundary_path(name, regions.regions)
        : undefined
      if (insideLabelsOnly && !boundaryKey) {
        return responseCache.response('Boundary not found', headers, 404)
      }

      const contentType = tileContentType(header.tileType)
      if (contentType) headers.set('Content-Type', contentType)
      if (!tileData) return responseCache.response(undefined, headers, 204)

      let data = tileData.data
      if (insideLabelsOnly && header.tileType === TileType.Mvt) {
        if (!boundaryKey)
          return responseCache.response('Boundary not found', headers, 404)
        data = filterInsideRegionLabels(
          tileData.data,
          await getRegionBoundary(env, boundaryKey),
          tile[0],
          tile[1],
          tile[2],
          VectorTile,
          Pbf,
          vectorTilePbf.fromVectorTileJs,
        )
      }
      return responseCache.response(
        data,
        headers,
        200,
        insideLabelsOnly ? DYNAMIC_CACHE_CONTROL : undefined,
      )
    } catch (error) {
      if (error instanceof KeyNotFoundError) {
        return responseCache.response('Archive not found', headers, 404)
      }
      throw error
    }
  },
}
