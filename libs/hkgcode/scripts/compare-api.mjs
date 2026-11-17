// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import proj4 from 'proj4'
import { HKGeoCodeError, hk80ToHkgeocode } from '../dist/index.js'
import { wgs84ToHkgcode } from '../dist/wgs84.js'

const replay = process.argv.includes('--replay')
const output = fileURLToPath(
  new URL('../tests/fixtures/api-comparison.json', import.meta.url),
)
const recorded = replay ? JSON.parse(await readFile(output, 'utf8')) : null
const endpoint = 'https://transform.geodetic.gov.hk/TransformationService/v3'
const hk1980 =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs'
const locations = [
  ['Central', 114.1589, 22.2819],
  ['North Point', 114.20839, 22.29241],
  ['Stanley', 114.213, 22.219],
  ['Aberdeen', 114.155, 22.248],
  ['Chai Wan', 114.237, 22.264],
  ['Tsim Sha Tsui', 114.1696, 22.2936],
  ['Kwun Tong', 114.225, 22.312],
  ['Sham Shui Po', 114.162, 22.331],
  ['Tsuen Wan', 114.115, 22.371],
  ['Sha Tin', 114.188, 22.382],
  ['Tai Po', 114.17, 22.45],
  ['Fanling', 114.139, 22.493],
  ['Sheung Shui', 114.128, 22.503],
  ['Yuen Long', 114.028, 22.444],
  ['Tuen Mun', 113.973, 22.391],
  ['Tin Shui Wai', 114.001, 22.46],
  ['Sai Kung', 114.272, 22.383],
  ['Tseung Kwan O', 114.261, 22.308],
  ['Tung Chung', 113.942, 22.289],
  ['Tai O', 113.863, 22.254],
  ['Cheung Chau', 114.028, 22.208],
  ['Lamma', 114.11, 22.225],
  ['Po Toi', 114.26, 22.17],
  ['Tung Ping Chau', 114.429, 22.544],
]
const points = locations.map(([label, longitude, latitude], index) => ({
  id: `place-${index}`,
  group: 'locations',
  label,
  longitude,
  latitude,
}))
// Cover every 2 km region, including offshore cells, without introducing a land mask.
for (let x = 0; x < 32; x++)
  for (let y = 0; y < 24; y++) {
    const easting = 801000 + x * 2000
    const northing = 801000 + y * 2000
    const [longitude, latitude] = proj4(hk1980, 'EPSG:4326', [easting, northing])
    points.push({
      id: `region-${x}-${y}`,
      group: 'regions',
      easting,
      northing,
      longitude,
      latitude,
    })
  }
// Exercise both sides of each precision boundary near twelve widely separated places.
for (const [label, lng, lat] of locations.filter((_, index) => index % 2 === 0)) {
  const [e, n] = proj4('EPSG:4326', hk1980, [lng, lat])
  for (const size of [2000, 100, 5])
    for (const axis of ['e', 'n']) {
      for (const offset of [
        -1, -0.01, -0.001, -0.0005, -0.0001, 0, 0.0001, 0.0005, 0.001, 0.01, 1,
      ]) {
        const easting =
          axis === 'e' ? 800000 + Math.round((e - 800000) / size) * size + offset : e
        const northing =
          axis === 'n' ? 800000 + Math.round((n - 800000) / size) * size + offset : n
        const [longitude, latitude] = proj4(hk1980, 'EPSG:4326', [easting, northing])
        points.push({
          id: `edge-${label}-${size}-${axis}-${offset}`,
          group: 'boundaries',
          label,
          size,
          axis,
          offset,
          easting,
          northing,
          longitude,
          latitude,
        })
      }
    }
}

// A fixed seed adds cell interiors independently of the hand-picked boundary cases.
let seed = 20261117
/** Generates the next deterministic sample fraction. @returns A number in [0,1). */
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}
for (let index = 0; index < 512; index++) {
  const easting = 800010 + random() * 63980
  const northing = 800010 + random() * 47980
  const [longitude, latitude] = proj4(hk1980, 'EPSG:4326', [easting, northing])
  points.push({
    id: `random-${index}`,
    group: 'random',
    easting,
    northing,
    longitude,
    latitude,
  })
}
// Probe the documented geographic range limits, including points just outside them.
for (const axis of ['longitude', 'latitude'])
  for (const edge of axis === 'longitude' ? [113.82, 114.48] : [22.13, 22.57]) {
    for (const offset of [-1e-8, 0, 1e-8])
      points.push({
        id: `range-${axis}-${edge}-${offset}`,
        group: 'range',
        longitude: axis === 'longitude' ? edge + offset : 114.15,
        latitude: axis === 'latitude' ? edge + offset : 22.35,
      })
  }
if (recorded) points.splice(0, points.length, ...recorded.points)

/** Calls the official conversion service in bounded batches and retains raw evidence. */
async function convert(parameters, requests, captures) {
  if (recorded) {
    const matching = recorded.captures.filter(capture =>
      Object.entries(parameters).every(
        ([key, value]) => capture.request[key] === value,
      ),
    )
    const rows = new Map(
      matching
        .flatMap(capture =>
          capture.response.result.map(row => ({
            ...row,
            id:
              row.id ??
              (capture.request.requests.length === 1
                ? capture.request.requests[0].id
                : null),
          })),
        )
        .map(row => [String(row.id), row]),
    )
    if (requests.some(request => !rows.has(request.id)))
      throw new Error('Missing recorded API row')
    return rows
  }
  const rows = []
  const regular = requests.filter(request => !request.id.startsWith('range-'))
  const batches = []
  for (let start = 0; start < regular.length; start += 400)
    batches.push(regular.slice(start, start + 400))
  // The API drops IDs on some range errors; singleton probes avoid ambiguous correlation.
  batches.push(
    ...requests
      .filter(request => request.id.startsWith('range-'))
      .map(request => [request]),
  )
  for (const batch of batches) {
    const request = { ...parameters, requests: batch }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok && response.status !== 400)
      throw new Error(`API HTTP ${response.status}`)
    const data = await response.json()
    captures.push({ request, httpStatus: response.status, response: data })
    if (!Array.isArray(data.result) || data.result.length !== request.requests.length)
      throw new Error(`Unexpected API result: ${JSON.stringify(data).slice(0, 1000)}`)
    rows.push(
      ...data.result.map(row => ({
        ...row,
        id: row.id ?? (batch.length === 1 ? batch[0].id : null),
      })),
    )
  }
  return new Map(rows.map(row => [String(row.id), row]))
}

/** Converts a validation rejection into an outcome comparable with API error 101.
 * @param operation Library conversion callback.
 * @returns The code or null for an out-of-range input.
 */
function outcome(operation) {
  try {
    return operation()
  } catch (error) {
    if (error instanceof HKGeoCodeError) return null
    throw error
  }
}
const captures = []
const comparisons = []
for (const length of [2, 4, 6]) {
  const rows = await convert(
    {
      inDatum: 'ITRF96',
      inCs: 'GEOG',
      inUnit: 'decdeg',
      outDatum: 'HK1980',
      outCs: 'HKGCode',
      outUnit: `L${length / 2}`,
    },
    points.map(point => ({ id: point.id, lat: point.latitude, long: point.longitude })),
    captures,
  )
  for (const point of points) {
    const actual = outcome(() =>
      wgs84ToHkgcode([point.longitude, point.latitude], length),
    )
    const row = rows.get(point.id)
    if (!row?.code && row?.error !== '101')
      throw new Error(`Unexpected API outcome for ${point.id}: ${JSON.stringify(row)}`)
    const expected = row.code ?? null
    comparisons.push({
      id: point.id,
      group: point.group,
      input: 'geographic',
      length,
      actual,
      expected,
      match: actual === expected,
    })
  }
  const grid = points.filter(point => point.easting !== undefined)
  const gridRows = await convert(
    {
      inDatum: 'HK1980',
      inCs: 'GRID',
      outDatum: 'HK1980',
      outCs: 'HKGCode',
      outUnit: `L${length / 2}`,
    },
    grid.map(point => ({ id: point.id, e: point.easting, n: point.northing })),
    captures,
  )
  for (const point of grid) {
    const actual = outcome(() => hk80ToHkgeocode(point.easting, point.northing, length))
    const row = gridRows.get(point.id)
    if (!row?.code && row?.error !== '101')
      throw new Error(`Unexpected API outcome: ${JSON.stringify(row)}`)
    const expected = row.code ?? null
    comparisons.push({
      id: point.id,
      group: point.group,
      input: 'grid',
      length,
      actual,
      expected,
      match: actual === expected,
    })
  }
  console.log(
    `Length ${length}: ${comparisons.filter(row => row.length === length && !row.match).length} mismatches`,
  )
}
const summary = []
for (const input of ['geographic', 'grid'])
  for (const length of [2, 4, 6]) {
    const rows = comparisons.filter(row => row.input === input && row.length === length)
    summary.push({
      input,
      length,
      total: rows.length,
      matches: rows.filter(row => row.match).length,
      codeMatches: rows.filter(row => row.match && row.expected !== null).length,
      rejectionMatches: rows.filter(row => row.match && row.expected === null).length,
    })
  }
const require = createRequire(import.meta.url)
const sourceHashes = Object.fromEntries(
  await Promise.all(
    ['grid.ts', 'wgs84.ts'].map(async name => [
      name,
      createHash('sha256')
        .update(await readFile(new URL(`../src/${name}`, import.meta.url)))
        .digest('hex'),
    ]),
  ),
)
if (!replay) {
  await mkdir(fileURLToPath(new URL('../tests/fixtures/', import.meta.url)), {
    recursive: true,
  })
  await writeFile(
    output,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), endpoint, nodeVersion: process.version, proj4Version: require('proj4/package.json').version, sourceHashes, points, summary, comparisons, captures })}\n`,
  )
}
console.log(
  JSON.stringify(
    {
      replay,
      output,
      summary,
      mismatches: comparisons.filter(row => !row.match).slice(0, 30),
    },
    null,
    2,
  ),
)
if (comparisons.some(row => !row.match)) process.exitCode = 1
