const IDENTIFIER = /^[a-z0-9-]+$/
const VERSION = /^\d{4}-\d{2}-\d{2}$/

export type Region = {
  code: string
  name: string
  description: string
  label?: string
}

export type Catalogue = { regions: Region[] }
export type RegionVersions = { versions: string[] }

type TilePath = {
  ok: boolean
  name: string
  tile?: [number, number, number]
  ext: string
}

const TILE =
  /^\/(?<NAME>[0-9a-zA-Z/!\-_.*'()]+)\/(?<Z>\d+)\/(?<X>\d+)\/(?<Y>\d+).(?<EXT>[a-z]+)$/
const TILESET = /^\/(?<NAME>[0-9a-zA-Z/!\-_.*'()]+).json$/
const BOUNDARY = /^\/(?<NAME>[0-9a-zA-Z/!\-_.*'()]+)\.boundary\.geojson$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function parseCatalogue(value: unknown): Catalogue {
  if (!isRecord(value) || !Array.isArray(value.regions)) {
    throw new Error('The regions catalogue is invalid.')
  }

  const regions = value.regions.flatMap((candidate): Region[] => {
    if (!isRecord(candidate)) return []
    const code = readString(candidate.code)
    const name = readString(candidate.name)
    if (!code || !name || !IDENTIFIER.test(code) || !IDENTIFIER.test(name)) return []
    const description = readString(candidate.description) ?? name
    return [
      {
        code,
        name,
        description,
        label: code === 'gba' ? 'Greater Bay Area' : description,
      },
    ]
  })

  if (regions.length === 0) throw new Error('No valid regions were published.')
  return { regions }
}

export function parseVersions(value: unknown): RegionVersions {
  if (!isRecord(value) || !Array.isArray(value.versions)) {
    throw new Error('The version catalogue is invalid.')
  }
  const versions = value.versions.flatMap((candidate): string[] => {
    if (!isRecord(candidate)) return []
    const version = readString(candidate.version)
    return version && VERSION.test(version) ? [version] : []
  })
  return { versions: [...new Set(versions)].sort().reverse() }
}

export function metadata_path(path: string): string | undefined {
  if (path === '/regions.json') return 'basemap/regions.json'
  if (path === '/versions.json') return 'basemap/versions.json'

  const match = path.match(/^\/([a-z0-9-]+)\/versions\.json$/)
  return match ? `basemap/${match[1]}/versions.json` : undefined
}

export function release_manifest_request(
  path: string,
): { regionCode: string; version: string } | undefined {
  const match = path.match(/^\/releases\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\.json$/)
  if (!match) return undefined
  const [, regionCode, version] = match
  return regionCode && version ? { regionCode, version } : undefined
}

function regionForTileset(name: string, regions: Region[]): Region | undefined {
  return regions.find(candidate => name.startsWith(`${candidate.name}-`))
}

export function pmtiles_path(name: string, regions: Region[]): string | undefined {
  const region = regionForTileset(name, regions)
  return region ? `basemap/${region.code}/${name}.pmtiles` : undefined
}

export function boundary_path(name: string, regions: Region[]): string | undefined {
  const region = regionForTileset(name, regions)
  return region ? `basemap/${region.code}/${name}.boundary.geojson` : undefined
}

export const boundary_name = (path: string): string | undefined =>
  path.match(BOUNDARY)?.groups?.NAME

export function tile_path(path: string): TilePath {
  const tileMatch = path.match(TILE)
  if (tileMatch?.groups) {
    const groups = tileMatch.groups
    if (!groups.NAME || !groups.Z || !groups.X || !groups.Y || !groups.EXT) {
      return { ok: false, name: '', tile: [0, 0, 0], ext: '' }
    }
    return {
      ok: true,
      name: groups.NAME,
      tile: [+groups.Z, +groups.X, +groups.Y],
      ext: groups.EXT,
    }
  }

  const tilesetMatch = path.match(TILESET)
  if (tilesetMatch?.groups) {
    const name = tilesetMatch.groups.NAME
    if (name) return { ok: true, name, ext: 'json' }
  }

  return { ok: false, name: '', tile: [0, 0, 0], ext: '' }
}

export function tilejsonUrl(
  tileOrigin: string,
  region: Region,
  version: string,
): string {
  if (!IDENTIFIER.test(region.name)) throw new Error('Invalid region name.')
  if (version !== 'latest' && !VERSION.test(version)) {
    throw new Error('Invalid version.')
  }
  const tilesetName =
    version === 'latest' ? `${region.name}-latest` : `${region.name}-${version}`
  return `${tileOrigin.replace(/\/$/, '')}/${tilesetName}.json`
}

export function insideLabelsTilejsonUrl(tilejson: string): string {
  const url = new URL(tilejson)
  url.searchParams.set('labels', 'inside')
  return url.toString()
}

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Request failed (${response.status}).`)
  return response.json()
}

/** Returns the release date in the HKT civil day, rather than the UTC day. */
export function hktReleaseDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}
