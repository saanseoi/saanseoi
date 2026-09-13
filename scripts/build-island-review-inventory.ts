import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type JsonObject = Record<string, unknown>
type Geometry = { type: string; coordinates: unknown }
type Feature = { geometry: Geometry | null; properties?: JsonObject }

const root = resolve(import.meta.dir, '..')
const outputPath = resolve(
  process.argv.find(value => value.startsWith('--out='))?.slice('--out='.length) ??
    'apps/basemap-viewer/src/local-review/islands/inventory.json',
)

const sourcePaths = [
  resolve('/tmp/hk-island-tags.geojson'),
  resolve('/tmp/hk-archipelago.geojson'),
]

// This is the exact name-difference set from the 253-name comparison. Keeping it
// explicit makes the generated review inventory auditable when source exports change.
const basemapOnlyNames = [
  '四排尾',
  'Ap Chau Mei Pak Tun Pai',
  'Ap Chau Pak Tun Pai',
  'Ap Lo Chun',
  'Ap Tau Pai',
  'Bun Sha Pui',
  'Cha Yue Pai',
  'Cham Keng Chau',
  'Cham Pai',
  'Chau Tsai Kok',
  'Che Lei Pai',
  'Chu Shek',
  'Chuk U Pai',
  'Comber Rock',
  'Cross-Connection Chamber',
  'Fan Tap Pai',
  'Fat Tau Chau',
  '火燒排 Fo Siu Pai',
  'Fury Rocks',
  'Ha Sha Chau',
  'Ha So Pai',
  'Heung Lo Tun',
  'High Island',
  'Hin Chau',
  'Hin Pai',
  'Ho Tsai Pai',
  'Hok Tsai Chau',
  'Hung Ngam Pai',
  'Hung Pai',
  'Kai Pei Ngam',
  'Kak Shan Chau',
  'Kam Chung Ngam',
  'Kau Tau Shek',
  'Kei Yan Shek',
  'Kok Tai Pai',
  'Kowloon Rock',
  'Kwo Mun Shek',
  'Kwun Tsoi Pai',
  'La Ka Chau',
  'Lai Chi Pai',
  'Lak Lei Mei',
  'Lan Pai',
  'Lan Shek Pai',
  'Lan Shuen Pai',
  'Lan Tau Pai',
  'Lo Fu Tiu Pai',
  'Lo Pai',
  'Loaf Rock',
  'Lung Ngan Hok',
  'Lung Ngan Yuen Pai',
  'Lung Shan Pai',
  'Lung Shuen Pai',
  'Ma Tsai Pai',
  'Man Tau Pai',
  'Mat Chau Pai',
  'Mei Pai',
  'Muk Yu Chau',
  'Ngam Hau Shek',
  'Ngan Chau Ngam Pai',
  'Ngan Chau Tan Pai',
  'Ngau Tau',
  'North Rock',
  'P17',
  'P18',
  'P19',
  'P20',
  'Pak Pai',
  'Po Yue Pai',
  'Pun Shan Shek',
  'Sai Pai',
  'Sam Long Pai',
  'Sam Mun Tsai Chau',
  'Sha Pai',
  'Sham Shai Pai',
  'Shek Lam Chau',
  'Sheung Pai',
  'Sheung Sha Chau',
  'Shui Cham Tsui Pai',
  'Siu Ko Pai',
  'Siu Ma Kong',
  'Siu Po Pin',
  'Siu Yuen Chau',
  'Ta Long Pai',
  'Ta Ma Kong',
  'Ta Shek Shan',
  'Tai Ko Pai',
  'Tai Long Pai',
  'Tai Yuen Chau',
  'Tiu Chung',
  'Tiu Chung Pai',
  'Tong Hau Pai',
  'Tsim Shek Pai',
  'Tsui Pai',
  'Tuk Chau',
  'Tuk Shek',
  'Tung Kok Pai',
  'Tung Ping Chau',
  'Ung Kong Group',
  'Waglan Pai',
  'Wai Kap Pai',
  'Wai Kap Shek',
  'Wang Pai',
  'Wong Fa Pai',
  'Wu Lo Chau',
  'Wu Long Tau',
  'Wu Pai',
  'Wu Ying Pai',
  'Yam Tong Ha',
  'Yat Lup Mei',
  'Yi Long Pai',
  'Yim Tin Pai',
]

const normaliseName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-HK')

const featureName = (feature: Feature) => {
  const properties = feature.properties ?? {}
  return String(properties['name:en'] ?? properties.name ?? '').trim()
}

const featureNames = (feature: Feature) => {
  const properties = feature.properties ?? {}
  return [
    properties['name:en'],
    properties.name,
    properties['alt_name:en'],
    properties.alt_name,
    properties['loc_name:en'],
    properties.loc_name,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)
}

const relevantTags = (properties: JsonObject) => {
  const keys = [
    'place',
    'name',
    'name:en',
    'name:zh',
    'natural',
    'wikidata',
    'wikipedia',
    'source',
    'source_1',
    'ref',
    'alt_name',
    'loc_name',
    'note',
    'fixme',
  ]
  return Object.fromEntries(
    keys
      .filter(key => properties[key] !== undefined)
      .map(key => [key, properties[key]]),
  )
}

const walkCoordinates = (value: unknown, output: number[][]) => {
  if (!Array.isArray(value)) return
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    output.push([value[0], value[1]])
    return
  }
  value.forEach(item => {
    walkCoordinates(item, output)
  })
}

const boundsFor = (geometry: Geometry) => {
  const coordinates: number[][] = []
  walkCoordinates(geometry.coordinates, coordinates)
  if (!coordinates.length) return [0, 0, 0, 0]
  return [
    Math.min(...coordinates.map(([longitude]) => longitude)),
    Math.min(...coordinates.map(([, latitude]) => latitude)),
    Math.max(...coordinates.map(([longitude]) => longitude)),
    Math.max(...coordinates.map(([, latitude]) => latitude)),
  ]
}

const pointFor = (geometry: Geometry) => {
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
  }
  const [west, south, east, north] = boundsFor(geometry)
  return [(west + east) / 2, (south + north) / 2]
}

const geometryAreaKm2 = (geometry: Geometry) => {
  if (!['Polygon', 'MultiPolygon'].includes(geometry.type)) return 0
  const coordinates =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  if (!Array.isArray(coordinates)) return 0
  const latitudeCoordinates: number[][] = []
  walkCoordinates(geometry.coordinates, latitudeCoordinates)
  if (latitudeCoordinates.length < 3) return 0
  const latitude =
    latitudeCoordinates.reduce((sum, [, value]) => sum + value, 0) /
    latitudeCoordinates.length
  const longitudeScale = 111.32 * Math.cos((latitude * Math.PI) / 180)
  const latitudeScale = 111.32
  const degreeArea = coordinates.reduce<number>((total, polygon) => {
    if (!Array.isArray(polygon)) return total
    return (
      total +
      polygon.reduce<number>((polygonTotal, ring, ringIndex) => {
        const ringCoordinates: number[][] = []
        walkCoordinates(ring, ringCoordinates)
        let twiceArea = 0
        for (let index = 0; index < ringCoordinates.length; index += 1) {
          const [x1, y1] = ringCoordinates[index]!
          const [x2, y2] = ringCoordinates[(index + 1) % ringCoordinates.length]!
          twiceArea += x1 * y2 - x2 * y1
        }
        return polygonTotal + ((ringIndex === 0 ? 1 : -1) * Math.abs(twiceArea)) / 2
      }, 0)
    )
  }, 0)
  return Math.abs(degreeArea) * longitudeScale * latitudeScale
}

const geometryRank = (geometry: Geometry) =>
  ({ MultiPolygon: 0, Polygon: 1, LineString: 2, Point: 3 })[geometry.type as string] ??
  4

const readFeatureCollection = async (path: string) => {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { features?: Feature[] }
  return parsed.features ?? []
}

const [islandFeatures, archipelagoFeatures] = await Promise.all(
  sourcePaths.map(readFeatureCollection),
)
const features = [...islandFeatures, ...archipelagoFeatures].filter(feature =>
  ['island', 'islet', 'archipelago'].includes(String(feature.properties?.place)),
)

const entries = basemapOnlyNames.map(requestedName => {
  const matches = features.filter(feature =>
    featureNames(feature).some(
      name => normaliseName(name) === normaliseName(requestedName),
    ),
  )
  if (!matches.length) {
    throw new Error(`No OSM geometry found for ${requestedName}`)
  }

  const uniqueMatches = [
    ...new Map(
      matches.map(feature => [JSON.stringify(feature.geometry), feature]),
    ).values(),
  ].filter((feature): feature is Feature & { geometry: Geometry } =>
    Boolean(feature.geometry),
  )
  uniqueMatches.sort(
    (left, right) => geometryRank(left.geometry) - geometryRank(right.geometry),
  )
  const preferred = uniqueMatches[0]!
  const pointMatch = uniqueMatches.find(feature => feature.geometry.type === 'Point')
  const name = featureName(preferred)
  const tags = relevantTags(preferred.properties ?? {})
  const options = uniqueMatches.map((feature, index) => ({
    label: `${index + 1}. ${feature.geometry.type}`,
    geometry: feature.geometry,
    bounds: boundsFor(feature.geometry),
    sourceTags: relevantTags(feature.properties ?? {}),
  }))
  const id = createHash('sha256')
    .update(normaliseName(requestedName))
    .digest('hex')
    .slice(0, 16)

  return {
    id: `BASEMAP:ISLAND:${id}`,
    name: name || requestedName,
    zh: preferred.properties?.['name:zh'] ?? undefined,
    point: pointMatch ? pointFor(pointMatch.geometry!) : pointFor(preferred.geometry),
    areaKm2: geometryAreaKm2(preferred.geometry),
    bounds: boundsFor(preferred.geometry),
    geometry: preferred.geometry,
    geometryOptions: options,
    matches: [],
    coverage: 'basemap-only',
    source: 'OpenStreetMap',
    sourceRelease: 'refresh-hk-2026-09-01',
    sourceTags: tags,
    identifiers: [],
  }
})

const landsdEntries = (
  JSON.parse(
    await readFile(
      resolve(root, 'apps/basemap-viewer/src/local-review/islands/inventory.json'),
      'utf8',
    ),
  ) as Array<JsonObject>
).filter(entry => entry.coverage !== 'basemap-only')
const enrichedLandsdEntries = landsdEntries.map(entry => {
  const matches = features.filter(feature =>
    featureNames(feature).some(
      name => normaliseName(name) === normaliseName(String(entry.name ?? '')),
    ),
  )
  const geometryOptions = [
    ...new Map(
      matches
        .filter((feature): feature is Feature & { geometry: Geometry } =>
          Boolean(feature.geometry),
        )
        .map(feature => [JSON.stringify(feature.geometry), feature]),
    ).values(),
  ]
    .sort((left, right) => geometryRank(left.geometry) - geometryRank(right.geometry))
    .map((feature, index) => ({
      label: `Basemap named geometry ${index + 1}. ${feature.geometry.type}`,
      geometry: feature.geometry,
      bounds: boundsFor(feature.geometry),
      sourceTags: relevantTags(feature.properties ?? {}),
    }))
  return geometryOptions.length ? { ...entry, geometryOptions } : entry
})
const output = [
  ...enrichedLandsdEntries.map(entry => ({
    ...entry,
    coverage: entry.coverage ?? 'landsd-gazetteer',
    source: entry.source ?? 'LandsD Place Name',
    sourceRelease: entry.sourceRelease ?? '2026-06-10.0',
  })),
  ...entries,
]
await mkdir(resolve(outputPath, '..'), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      landsd: landsdEntries.length,
      basemapOnly: entries.length,
      total: output.length,
      outputPath,
    },
    null,
    2,
  ),
)
