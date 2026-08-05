import type { TileWeightSummary } from './lib/tile-weight'

export type CheckStatus = 'active' | 'disabled' | 'unavailable' | 'unknown'

export type ReleaseDiagnostic = {
  version: string | null
  tilejsonUrl: string | null
  boundaryUrl: string | null
  manifestUrl: string | null
  bounds: [number, number, number, number] | null
  minZoom: number | null
  maxZoom: number | null
  vectorLayers: string[]
  labelClipping: CheckStatus
  boundary: CheckStatus
  archiveSize: number | null
  archiveSha256: string | null
  createdAt: string | null
}

export type FeatureDiagnostic = {
  release: 'primary' | 'comparison'
  longitude: number
  latitude: number
  zoom: number
  layers: Array<{
    id: string
    sourceLayer: string | undefined
    properties: Record<string, unknown>
  }>
}

export type ViewerDiagnostics = {
  open: boolean
  inspect: boolean
  debug: { tiles: boolean; collisions: boolean; overdraw: boolean }
  primary: ReleaseDiagnostic
  comparison: ReleaseDiagnostic | null
  feature: FeatureDiagnostic | null
  errors: string[]
  tileRequests: number
  tileFailures: number
  lastTileDurationMs: number | null
  tileWeight: { primary: TileWeightSummary; comparison: TileWeightSummary | null }
  latestVersion: string | null
}

export const emptyReleaseDiagnostic = (): ReleaseDiagnostic => ({
  version: null,
  tilejsonUrl: null,
  boundaryUrl: null,
  manifestUrl: null,
  bounds: null,
  minZoom: null,
  maxZoom: null,
  vectorLayers: [],
  labelClipping: 'unknown',
  boundary: 'unknown',
  archiveSize: null,
  archiveSha256: null,
  createdAt: null,
})

export const defaultDiagnostics = (): ViewerDiagnostics => ({
  open: false,
  inspect: false,
  debug: { tiles: false, collisions: false, overdraw: false },
  primary: emptyReleaseDiagnostic(),
  comparison: null,
  feature: null,
  errors: [],
  tileRequests: 0,
  tileFailures: 0,
  lastTileDurationMs: null,
  tileWeight: {
    primary: {
      tileRequests: 0,
      completedLoads: 0,
      failedLoads: 0,
      normalBasemapRequests: 0,
      labelOnlyRequests: 0,
      totalTransferBytes: null,
      totalEncodedBodyBytes: null,
      totalDecodedBodyBytes: null,
      meanDurationMs: null,
      p95DurationMs: null,
      meanTransferBytes: null,
      p95TransferBytes: null,
      largestTile: null,
    },
    comparison: null,
  },
  latestVersion: null,
})
