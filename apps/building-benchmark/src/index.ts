import { readFootprints } from './fgb'
import { searchCells, withinCohort } from './cells'
import { cachedRanges } from './range-cache'
import { footprintDistance, parseSearch, searchBounds } from './spatial'
import type { Footprint } from './spatial'
import type { Feature } from 'geojson'

type Row = { id: string; name: string; geometry: string }

/** Compare bounded nearby reads against two strictly separate preview inventories.
 * @param request Authenticated benchmark request.
 * @param env Preview-only D1 and R2 bindings generated from Wrangler configuration.
 * @returns Nearby source footprints and measured D1/R2 timings.
 */
async function handle(request: Request, env: Env): Promise<Response> {
  const encoder = new TextEncoder()
  const expected = encoder.encode(`Bearer ${env.BENCHMARK_TOKEN}`)
  const actual = encoder.encode(request.headers.get('authorization') ?? '')
  if (
    !env.BENCHMARK_TOKEN ||
    actual.length !== expected.length ||
    !crypto.subtle.timingSafeEqual(actual, expected)
  )
    return new Response('Unauthorised', { status: 401 })
  if (request.method !== 'GET')
    return new Response('Method not allowed', { status: 405 })
  const url = new URL(request.url)
  if (url.pathname === '/health')
    return Response.json({
      environment: env.ENVIRONMENT,
      inventories: ['landsd', 'overture'],
    })
  if (url.pathname !== '/nearby') return new Response('Not found', { status: 404 })
  let query: ReturnType<typeof parseSearch>
  try {
    query = parseSearch(url)
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 })
  }
  const { inventory, engine, lng, lat, radius } = query
  const namespace = url.searchParams.get('cacheRun') ?? 'shared'
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(namespace))
    return new Response('Invalid cache namespace', { status: 400 })
  const bounds = searchBounds(lng, lat, radius)
  if (engine === 'd1-cells' && !withinCohort(bounds))
    return new Response('Outside sampled spatial-index coverage', { status: 400 })
  const started = performance.now()
  let rangeRequests = 0,
    rangeBytes = 0,
    d1Ms = 0,
    rowsRead = 0
  let candidates: Feature<Footprint>[]
  const cacheMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    cacheBytes: 0,
    rangeRequests: 0,
    rangeBytes: 0,
  }
  if (engine === 'fgb-cache') {
    candidates = await readFootprints(
      cachedRanges(
        env.GEOMETRY,
        `${env.OBJECT_PREFIX}/${inventory}.fgb`,
        caches.default,
        namespace,
        url.origin,
        cacheMetrics,
      ),
      bounds,
    )
    rangeRequests = cacheMetrics.rangeRequests
    rangeBytes = cacheMetrics.rangeBytes
  } else if (engine === 'fgb') {
    candidates = await readFootprints(
      {
        async getRange(offset, length) {
          if (length > 8 * 1024 * 1024) throw new Error('Unexpected range size.')
          const object = await env.GEOMETRY.get(
            `${env.OBJECT_PREFIX}/${inventory}.fgb`,
            { range: { offset, length } },
          )
          if (!object) throw new Error('Preview geometry object missing.')
          const bytes = await object.arrayBuffer()
          rangeRequests++
          rangeBytes += bytes.byteLength
          return bytes
        },
      },
      bounds,
    )
  } else {
    const table =
      inventory === 'landsd' ? 'benchmarkLandsdBuilding' : 'benchmarkOvertureBuilding'
    // Exact cell keys use one JSON binding, with full bbox and footprint filtering after lookup.
    const statement =
      engine === 'd1-cells'
        ? env.DB.prepare(
            `SELECT id,name,geometry FROM ${table} WHERE id IN (SELECT id FROM ${table}CellSample WHERE cell IN (SELECT value FROM json_each(?))) AND minX<=? AND maxX>=? AND minY<=? AND maxY>=? LIMIT 10001`,
          ).bind(
            JSON.stringify(searchCells(bounds)),
            bounds.maxX,
            bounds.minX,
            bounds.maxY,
            bounds.minY,
          )
        : env.DB.prepare(
            `SELECT id,name,geometry FROM ${table} WHERE minX<=? AND maxX>=? AND minY<=? AND maxY>=? LIMIT 10001`,
          ).bind(bounds.maxX, bounds.minX, bounds.maxY, bounds.minY)
    const result = await statement.all<Row>()
    if (result.results.length > 10000)
      throw new Error('Too many candidates; reduce the radius.')
    d1Ms = result.meta.duration
    rowsRead = result.meta.rows_read
    candidates = result.results.map(row => ({
      type: 'Feature',
      geometry: JSON.parse(row.geometry) as Footprint,
      properties: { id: row.id, name: row.name },
    }))
  }
  const fetched = performance.now()
  const features = candidates
    .map(feature => ({
      ...feature,
      id: String(feature.properties?.id),
      properties: {
        ...feature.properties,
        inventory,
        distanceMetres: footprintDistance(feature.geometry, lng, lat),
      },
    }))
    .filter(feature => feature.properties.distanceMetres <= radius)
    .sort(
      (a, b) =>
        a.properties.distanceMetres - b.properties.distanceMetres ||
        a.id.localeCompare(b.id),
    )
  return Response.json(
    {
      type: 'FeatureCollection',
      inventory,
      release: inventory === 'landsd' ? '2026-09-21' : '2026-09-23.1',
      features,
      metrics: {
        engine,
        candidates: candidates.length,
        matches: features.length,
        rangeRequests,
        rangeBytes,
        cacheHits: cacheMetrics.cacheHits,
        cacheMisses: cacheMetrics.cacheMisses,
        cacheBytes: cacheMetrics.cacheBytes,
        d1Ms,
        rowsRead,
        fetchMs: fetched - started,
        workerMs: performance.now() - started,
      },
      colo: request.cf?.colo,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env)
    } catch (error) {
      console.error('Building benchmark failed', String(error))
      return Response.json(
        { error: 'Benchmark failed; inspect preview Worker logs.' },
        { status: 500 },
      )
    }
  },
} satisfies ExportedHandler<Env>
