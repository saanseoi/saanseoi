import type Geometry from 'jsts/org/locationtech/jts/geom/Geometry.js'
import { GBA_BOUNDARY_RELATIONS, REGIONS, type SOURCE_BUCKET } from './tilesConfig.ts'

export type RegionCode = keyof typeof REGIONS

export type Region = (typeof REGIONS)[RegionCode] & { code: RegionCode }

export const REGION_PROCESSING_ORDER = [
  'gba',
  'hk',
  'mo',
] as const satisfies readonly RegionCode[]

export type PreparedSource = {
  path: string
  planetilerArea: string
  upstream: string
  /** Complete OSM context used only to resolve boundary relation members. */
  borderSourcePath?: string
  boundaryRelations?: typeof GBA_BOUNDARY_RELATIONS
  extractionStrategy?: string
  sourceArchive?: {
    bucket: typeof SOURCE_BUCKET
    key: string
    sha256: string
    size: number
    sourceUrl: string
  }
}

export type HistoricalSources = {
  primary: string
  /** Complete GBA context required by Macao's cross-boundary relation. */
  border?: string
}

export type CoastlineGeometry = Geometry & {
  isEmpty(): boolean
  getGeometryType(): string
  getCoordinates(): Array<{ x: number; y: number }>
  getBoundary(): CoastlineGeometry
}

export const REGION_BOUNDARY_RELATIONS: Record<RegionCode, readonly number[]> = {
  gba: Object.values(GBA_BOUNDARY_RELATIONS),
  hk: [GBA_BOUNDARY_RELATIONS.hongKong],
  mo: [GBA_BOUNDARY_RELATIONS.macau],
}

export function regionsInProcessingOrder(): Region[] {
  return REGION_PROCESSING_ORDER.map(code => ({ code, ...REGIONS[code] }))
}

export function regionProcessingIndex(region: RegionCode) {
  const index = REGION_PROCESSING_ORDER.indexOf(region)
  if (index === -1) throw new Error(`Unknown tile region: ${region}`)
  return index
}

export const LEGACY_IMPORTED_RELEASES = new Set(['hk:2025-04-25', 'hk:2026-03-18'])

export type VersionEntry = {
  version: string
  tileset: string
  key: string
  manifestKey: string
  sha256: string
  size: number
  createdAt: string
}

export type RegionVersions = {
  schemaVersion: 1
  region: { code: RegionCode; name: string; description: string }
  updatedAt: string
  versions: VersionEntry[]
}

export type RegionsIndex = {
  schemaVersion: 1
  updatedAt: string
  regions: Array<{
    code: RegionCode
    name: string
    description: string
    versionsKey: string
  }>
}

export type VersionsIndex = {
  schemaVersion: 1
  updatedAt: string
  regions: Record<string, { name: string; versionsKey: string; latest?: VersionEntry }>
}

export type TilesOperation = 'import' | 'rebuild' | 'refresh'

export type PreviewMode = 'light' | 'dark' | 'postcard' | 'postcard-lit'

export type StylePreviewCamera = { landmark: string; lng: number; lat: number }

type StylePreviewCameras = Record<16 | 19, StylePreviewCamera>

export const STYLE_PREVIEW_CAMERAS: Record<RegionCode, StylePreviewCameras> = {
  gba: {
    16: { landmark: 'canton-tower', lng: 113.3247, lat: 23.1065 },
    19: { landmark: 'beijing-road', lng: 113.2646563, lat: 23.1207302 },
  },
  hk: {
    16: { landmark: 'central', lng: 114.1584, lat: 22.2855 },
    19: { landmark: 'hollywood-road', lng: 114.1535551, lat: 22.2821544 },
  },
  mo: {
    16: { landmark: 'senado-square', lng: 113.5439, lat: 22.1933 },
    19: { landmark: 'grand-lisboa', lng: 113.5433758, lat: 22.1909321 },
  },
}

export type BoundaryGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export type OsmBoundary = {
  osm_id: number
  geojson: BoundaryGeometry
}
