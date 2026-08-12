import type { PMTiles } from 'pmtiles'
import { BASEMAP_ATTRIBUTION } from '@repo/basemap'

type TileJson = Record<string, unknown> & { tiles: string[] }

const isTileJson = (value: unknown): value is TileJson => {
  if (typeof value !== 'object' || value === null) return false
  const tiles = (value as Record<string, unknown>).tiles
  return Array.isArray(tiles) && tiles.every(tileUrl => typeof tileUrl === 'string')
}

type TileJsonOptions = {
  accessToken?: string
  pmtiles: Pick<PMTiles, 'getTileJson'>
  origin: string
  name: string
  archiveVersion?: string
}

export const getTileJson = async ({
  accessToken,
  pmtiles,
  origin,
  name,
  archiveVersion,
}: TileJsonOptions): Promise<TileJson> => {
  const tileJson = await pmtiles.getTileJson(`${origin}/${name}`)
  if (!isTileJson(tileJson)) throw new Error('PMTiles returned invalid TileJSON')

  tileJson.attribution = BASEMAP_ATTRIBUTION

  if (name.endsWith('-latest') && archiveVersion) {
    tileJson.tiles = tileJson.tiles.map(
      tileUrl =>
        `${tileUrl}${tileUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(archiveVersion)}`,
    )
  }
  if (accessToken) {
    tileJson.tiles = tileJson.tiles.map(
      tileUrl =>
        `${tileUrl}${tileUrl.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(accessToken)}`,
    )
  }
  const boundaryUrl = new URL(`${origin}/${name}.boundary.geojson`)
  if (accessToken) boundaryUrl.searchParams.set('access_token', accessToken)
  tileJson['saanseoi:boundary'] = boundaryUrl.toString()
  return tileJson
}
