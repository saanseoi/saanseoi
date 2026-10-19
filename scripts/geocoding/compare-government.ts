import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { alsUrl, requestGovernment, reverseUrl } from './government'

const { values } = parseArgs({
  options: {
    fixture: {
      type: 'string',
      default: 'scripts/geocoding/fixtures/florists-2026-10-18.json',
    },
    output: { type: 'string', default: '/tmp/geocoder-government.json' },
    mode: { type: 'string', default: 'all' },
  },
})
if (!['all', 'forward', 'reverse'].includes(values.mode!))
  throw new Error('Mode must be all, forward or reverse')
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Standalone live benchmark is not a cached Turbo task.
const key = process.env.HK_MAP_SERVICE_KEY ?? ''
if (values.mode !== 'forward' && !key)
  throw new Error('Set HK_MAP_SERVICE_KEY for reverse comparisons')
const fixtureText = await Bun.file(values.fixture!).text()
const fixture = JSON.parse(fixtureText) as {
  places: Array<{
    id: string
    coordinates: [number, number]
    googleAddress: string
    addressCore: string
  }>
}
const results: Array<Record<string, unknown>> = []
const record = {
  runAt: new Date().toISOString(),
  fixtureSha256: createHash('sha256').update(fixtureText).digest('hex'),
  method:
    'Direct ALS t=60 n=1 3d=0, original strings; direct HK Map Service radius=500m EPSG:3857; no enrichment; 30s timeout; 500ms pacing; no retries',
  results,
}
for (const place of fixture.places) {
  for (const mode of ['reverse', 'forward_raw', 'forward_core']) {
    if (
      (values.mode === 'forward' && mode === 'reverse') ||
      (values.mode === 'reverse' && mode !== 'reverse')
    )
      continue
    const input =
      mode === 'reverse'
        ? place.coordinates
        : mode === 'forward_raw'
          ? place.googleAddress
          : place.addressCore
    const url =
      mode === 'reverse'
        ? reverseUrl(...place.coordinates, key)
        : alsUrl(input as string)
    await Bun.sleep(500)
    const result = await requestGovernment(
      url,
      mode === 'reverse' ? 'hk-map-service' : 'als',
    )
    results.push({ id: place.id, mode, input, ...result })
    await Bun.write(values.output!, `${JSON.stringify(record, null, 2)}\n`)
    console.log(place.id, mode, result.outcome, result.status)
  }
}
console.log('Saved', values.output)
