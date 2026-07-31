import type { PMTiles } from 'pmtiles'

type TileJson = Record<string, unknown> & { tiles: string[] }

const isTileJson = (value: unknown): value is TileJson => {
  if (typeof value !== 'object' || value === null) return false
  const tiles = (value as Record<string, unknown>).tiles
  return Array.isArray(tiles) && tiles.every(tileUrl => typeof tileUrl === 'string')
}

type TileJsonOptions = {
  pmtiles: PMTiles
  origin: string
  name: string
  archiveVersion?: string
  insideLabelsOnly: boolean
}

export const getTileJson = async ({
  pmtiles,
  origin,
  name,
  archiveVersion,
  insideLabelsOnly,
}: TileJsonOptions): Promise<TileJson> => {
  const tileJson = await pmtiles.getTileJson(`${origin}/${name}`)
  if (!isTileJson(tileJson)) throw new Error('PMTiles returned invalid TileJSON')

  if (name.endsWith('-latest') && archiveVersion) {
    tileJson.tiles = tileJson.tiles.map(
      tileUrl =>
        `${tileUrl}${tileUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(archiveVersion)}`,
    )
  }
  tileJson['saanseoi:boundary'] = `${origin}/${name}.boundary.geojson`
  if (insideLabelsOnly) {
    tileJson.tiles = tileJson.tiles.map(tileUrl => {
      const delimiter = tileUrl.includes('?') ? '&' : '?'
      return `${tileUrl}${delimiter}labels=inside`
    })
    tileJson['saanseoi:label-filter'] = 'inside-region'
  }
  return tileJson
}
