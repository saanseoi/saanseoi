import { resolve } from 'node:path'

export const REPO_ROOT = resolve(import.meta.dir, '../../../../..')

export const TILES_ROOT = resolve(REPO_ROOT, '.local/tiles')

export const REPOSITORIES_ROOT = resolve(TILES_ROOT, 'repositories')

export const OUTPUT_ROOT = resolve(TILES_ROOT, 'data')

export const SOURCES_ROOT = resolve(TILES_ROOT, 'sources')

export const HISTORICAL_SOURCES_ROOT = resolve(TILES_ROOT, 'historical', 'sources')

export const BUCKET = 'ss-pmtiles'

export const SOURCE_BUCKET = 'ss-basemap-sources'

export const CLOUDFLARE_ACCOUNT_ID = 'a6eeace4b6d9f8e07ab307964e74d801'

export const WRANGLER = resolve(REPO_ROOT, 'node_modules/.bin/wrangler')

export const PREFIX = 'basemap'

export const VIEWER_ORIGIN = 'https://viewer.saanseoi.hk'

export const BROWSER_RENDER_ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/browser-rendering/screenshot`

export const BASEMAPS_REPOSITORY = 'https://github.com/protomaps/basemaps.git'

export const SAANSEOI_REPOSITORY = 'https://github.com/saanseoi/saanseoi.git'

export const GUANGDONG_EXTRACT_URL =
  'https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf'

const GBA_SOURCE_NAME = 'gba'

export const REGIONAL_COASTLINE_PATCH = resolve(
  import.meta.dir,
  'protomaps-regional-coastline.patch',
)

export const GBA_BOUNDARY_RELATIONS = {
  guangzhou: 3287346,
  shenzhen: 3464353,
  zhuhai: 3464829,
  foshan: 3464719,
  huizhou: 3209912,
  dongguan: 3464319,
  zhongshan: 3464878,
  jiangmen: 3463901,
  zhaoqing: 3205802,
  hongKong: 913110,
  macau: 1867188,
} as const

export const REGIONS = {
  gba: {
    name: 'gba',
    area: GBA_SOURCE_NAME,
    description: 'Greater Bay Area',
  },
  hk: { name: 'hongkong', area: 'hong kong', description: 'Hong Kong' },
  mo: { name: 'macau', area: 'macau', description: 'Macao' },
} as const
