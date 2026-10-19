/** Run Hype's existing geocoder functions against the unchanged florist fixture.
 * Hype is imported read-only; requests are bounded and credentials are not recorded.
 */
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
const { values } = parseArgs({
  options: {
    'hype-repo': { type: 'string', default: resolve('..', 'hype') },
    'direct-als': { type: 'boolean', default: false },
    output: { type: 'string', default: '/tmp/geocoder-hype-comparison.json' },
  },
})
const hype = values['hype-repo']!
const geocodingPath = resolve(hype, 'src/lib/api/external/geocoding.ts')
const utilityPath = resolve(hype, 'src/lib/utils/geocoding.ts')
const { fetchALSResultFromAddress, processForwardGeocodeResult, reverseGeocode } =
  await import(geocodingPath)
const { getAddressForQuery, toLocalParseResult } = await import(utilityPath)
const fixture = await Bun.file(
  'scripts/geocoding/fixtures/florists-2026-10-18.json',
).json()
const direct = values['direct-als']
const output = values.output!
const nativeFetch = globalThis.fetch
let requests: Array<Record<string, unknown>> = []
// Sequential calls avoid provider load and preserve which enrichment belongs to a lookup.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  await Bun.sleep(500)
  const url = new URL(input instanceof Request ? input.url : String(input))
  const safe = new URL(url)
  safe.searchParams.delete('key')
  const started = performance.now()
  try {
    const response = await nativeFetch(input, {
      ...init,
      signal: AbortSignal.timeout(30000),
    })
    const text = await response.clone().text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = { nonJson: true, length: text.length }
    }
    requests.push({
      url: safe.toString(),
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      body,
    })
    return response
  } catch (error) {
    requests.push({
      url: safe.toString(),
      status: null,
      error: error instanceof Error ? error.name : 'Error',
      durationMs: Math.round(performance.now() - started),
    })
    throw error
  }
}) as typeof fetch
const results: Array<Record<string, unknown>> = []
const record = {
  runAt: new Date().toISOString(),
  sourceFiles: Object.fromEntries(
    await Promise.all(
      [geocodingPath, utilityPath].map(async path => [
        path,
        createHash('sha256')
          .update(await Bun.file(path).text())
          .digest('hex'),
      ]),
    ),
  ),
  method: direct
    ? 'Direct ALS with original strings, Hype fetch/processing functions, t=60 n=1 3d=0; no preprocessing; timeout 30s, 500ms pacing'
    : 'Hype actual forward import preprocessing and reverseGeocode functions; no cache, locale en, ALS defaults t=60 n=1 3d=0; network timeout 30s, 500ms pacing; no translation credentials',
  results,
}
for (const place of fixture.places) {
  for (const mode of direct
    ? ['forward_raw', 'forward_core']
    : ['reverse', 'forward_raw', 'forward_core']) {
    requests = []
    const started = performance.now()
    let parsed: {
      queryAddress: string
      neighbourhood: string | null
      subpremisesRaw: string | null
    } | null = null
    let result:
      | ({ addressMeta?: { addressForwardGeocoder?: string } } & Record<
          string,
          unknown
        >)
      | null = null
    let error: string | undefined
    const input =
      mode === 'reverse'
        ? place.coordinates
        : mode === 'forward_raw'
          ? place.googleAddress
          : place.addressCore
    try {
      if (mode === 'reverse') result = await reverseGeocode(...place.coordinates)
      else {
        parsed = direct
          ? { queryAddress: input, neighbourhood: null, subpremisesRaw: null }
          : getAddressForQuery(input, 'en')
        if (!parsed) throw new Error('Hype returned no parsed query')
        result = parsed.queryAddress
          ? await processForwardGeocodeResult(
              await fetchALSResultFromAddress(parsed.queryAddress),
              parsed.neighbourhood,
              true,
              0,
              0,
              parsed.subpremisesRaw,
              input,
            )
          : toLocalParseResult(parsed)
      }
    } catch (e) {
      error = e instanceof Error ? e.name : 'Error'
    }
    const outcome = error
      ? 'error'
      : result
        ? result.addressMeta?.addressForwardGeocoder === 'invalid'
          ? 'local_parse_only'
          : 'results'
        : 'no_match'
    results.push({
      id: place.id,
      mode,
      input,
      queryAddress: parsed?.queryAddress,
      outcome,
      error,
      durationMs: Math.round(performance.now() - started),
      requests,
      result: result ?? null,
    })
    await Bun.write(output, `${JSON.stringify(record, null, 2)}\n`)
    console.log(place.id, mode, outcome, requests.map(r => r.status).join(','))
  }
}
console.log('Saved', output)
