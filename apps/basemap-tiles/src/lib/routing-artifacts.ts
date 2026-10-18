/** Public immutable routing artefacts, release manifests and archived OSM inputs. */
type RoutingStorage = { BUCKET: R2Bucket; SOURCES: R2Bucket }

/**
 * Serves only recognised artefact paths; unrelated bucket keys are never exposed.
 * @param request - Public GET or HEAD request.
 * @param env - Published companion artefacts and archived Guangdong sources.
 * @returns A streamed public response, or null for a non-artefact route.
 */
export async function routingArtifact(
  request: Request,
  env: RoutingStorage,
): Promise<Response | null> {
  const path = new URL(request.url).pathname
  const match = path.match(
    /^\/routing\/(hk|mo|gba)\/(\d{4}-\d{2}-\d{2})\/(manifest\.json|recipe\.json|rebuild\.py|region\.osm\.pbf|valhalla\.tar\.gz|graphhopper\.tar\.gz)$/,
  )
  const latest = path.match(
    /^\/routing\/(hk|mo|gba)\/(?:(valhalla|graphhopper)\/(\d+(?:\.\d+){1,2})\/)?latest\.json$/,
  )
  const source = path.match(/^\/sources\/guangdong\/(\d{4}-\d{2}-\d{2})\.osm\.pbf$/)
  const pbf = path.match(/^\/downloads\/(hk|mo|gba)\/(\d{4}-\d{2}-\d{2})\.osm\.pbf$/)
  const pmtiles = path.match(/^\/downloads\/(hk|mo|gba)\/(\d{4}-\d{2}-\d{2})\.pmtiles$/)
  const release = path.match(/^\/routing\/(hk|mo|gba)\/(\d{4}-\d{2}-\d{2})\.json$/)
  if (!match && !latest && !source && !pbf && !release && !pmtiles) return null
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      },
    })
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405 })
  if (request.headers.has('Range'))
    return new Response('Full artefact downloads only.', { status: 416 })
  let key: string
  let bucket = env.BUCKET
  if (pmtiles)
    key = `basemap/${pmtiles[1]}/${({ hk: 'hongkong', mo: 'macau', gba: 'gba' } as const)[pmtiles[1] as 'hk' | 'mo' | 'gba']}-${pmtiles[2]}.pmtiles`
  else if (source) {
    key = `osm/geofabrik/guangdong/${source[1]}.osm.pbf`
    bucket = env.SOURCES
  } else if (latest)
    key = `routing/${latest[1]}/${latest[2] ? `${latest[2]}/${latest[3]}/` : ''}latest.json`
  else if (release) key = `routing/${release[1]}/${release[2]}/manifest.json`
  else if (pbf) key = `routing/${pbf[1]}/${pbf[2]}/region.osm.pbf`
  else {
    if (!match) return null
    key = `routing/${match[1]}/${match[2]}/${match[3]}`
  }
  const prefix = match
    ? `routing/${match[1]}/${match[2]}`
    : pbf
      ? `routing/${pbf[1]}/${pbf[2]}`
      : null
  const payload =
    (match &&
      !['manifest.json', 'recipe.json', 'rebuild.py'].includes(match[3] ?? '')) ||
    Boolean(pbf)
  if (prefix && payload) {
    const manifest = await env.BUCKET.get(`${prefix}/manifest.json`)
    const value = manifest ? await manifest.json<{ status: string }>() : null
    if (!value) return new Response('Routing edition not found', { status: 404 })
    if (value.status !== 'available')
      return new Response(
        'Download retired; see the release page for its rebuild recipe.',
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
      )
  }
  // Metadata stays fresh so retirement is visible immediately; payloads stream directly from R2.
  const object = await bucket.get(key)
  if (!object) return new Response('Artefact not found', { status: 404 })
  const filename = source
    ? `guangdong-${source[1]}.osm.pbf`
    : match && payload
      ? `${match[1]}-${match[2]}-${match[3]}`
      : pbf
        ? `${pbf[1]}-${pbf[2]}.osm.pbf`
        : (key.split('/').at(-1) ?? 'download')
  const contentType = key.endsWith('.pmtiles')
    ? 'application/vnd.pmtiles'
    : key.endsWith('.json')
      ? 'application/json'
      : key.endsWith('.py')
        ? 'text/x-python; charset=utf-8'
        : key.endsWith('.gz')
          ? 'application/gzip'
          : 'application/x-protobuf'
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Length': String(object.size),
    ETag: object.httpEtag,
    'Cache-Control': key.endsWith('.json') ? 'no-store' : 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
  })
  if (!key.endsWith('.json'))
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)
  if (request.headers.get('If-None-Match') === object.httpEtag)
    return new Response(null, { status: 304, headers })
  return new Response(request.method === 'HEAD' ? null : object.body, { headers })
}
