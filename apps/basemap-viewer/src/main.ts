import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MapLibreMap, VectorTileSource } from 'maplibre-gl'
import type { FilterSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { Geometry } from 'geojson'
import { BASEMAP_ATTRIBUTION } from '@repo/basemap'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { AppState, CameraState } from './lib/types'
import {
  parseCatalogue,
  parseVersions,
  fetchJson,
  tilejsonUrl,
  type Region,
} from './lib/catalogue'
import { AppContext } from './lib/ctx/app'
import {
  BASEMAP_SOURCE_ID,
  applyLocale,
  applyVisibility,
  createPostcardStyle,
  createStyle,
  firstTextSymbolLayerId,
  postcardPalette,
  type LayerGroups,
} from './lib/style'
import {
  boundaryBounds,
  outsideBoundaryMask,
  parseRegionBoundary,
  type RegionBoundary,
} from './lib/boundaries'
import { parseTilejson, type Tilejson } from './lib/tilejson'
import { readUrlState, writeUrlState } from './lib/url-state'
import {
  buildDiff,
  type DiffLabelChange,
  type DiffInputFeature,
  type DiffFeatureCollection,
  type DiffStatus,
} from './lib/diff'
import { isSameRelease, orderComparisonReleases } from './lib/release-order'
import { parseReleaseMetadata, type ReleaseMetadata } from './lib/release-metadata'
import {
  createTileWeightCollection,
  knownTimingBytes,
  knownTimingDuration,
  type BasemapTileSource,
} from './lib/tile-weight'
import {
  defaultDiagnostics,
  emptyReleaseDiagnostic,
  type FeatureDiagnostic,
  type ReleaseDiagnostic,
  type ViewerDiagnostics,
} from './diagnostics'
import './styles.css'

// Vite optimizes MapLibre's main module but does not automatically expose the
// worker file that MapLibre otherwise resolves beside that optimized module.
// Build it as a worker before taking its URL, so Vite also bundles MapLibre's
// runtime dependencies into the emitted worker asset.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

const TILE_ORIGIN = import.meta.env.VITE_TILE_ORIGIN ?? 'https://tiles.saanseoi.hk'
const GLYPH_URL = import.meta.env.VITE_GLYPH_URL
const HEADLESS_MODE =
  new URLSearchParams(window.location.search).get('headless') === 'true'
const POSTCARD_RENDER_MODE = new URLSearchParams(window.location.search).get('render')
const POSTCARD_RENDERING =
  HEADLESS_MODE &&
  (POSTCARD_RENDER_MODE === 'postcard' || POSTCARD_RENDER_MODE === 'postcard-lit')
const POSTCARD_ILLUMINATED =
  POSTCARD_RENDERING && POSTCARD_RENDER_MODE === 'postcard-lit'
const POSTCARD_BOUNDS = {
  gba: [112.4, 21.6, 115.2, 23.5],
  hk: [113.82, 22.14, 114.48, 22.58],
  mo: [113.48, 22.1, 113.62, 22.25],
} as const
const POSTCARD_BEARING = { gba: 0, hk: 0, mo: 90 } as const
const POSTCARD_OFFSET = { gba: [-240, -160], hk: [-60, 70], mo: [80, -80] } as const
const POSTCARD_ZOOM = { gba: 0.14, hk: 0, mo: 0.7 } as const

const DEFAULT_REGION_CODE = 'hk'
const BOUNDARY_MASK_SOURCE_ID = 'region-boundary-mask'
const BOUNDARY_MASK_LAYER_ID = 'region-boundary-mask-fill'
const BOUNDARY_SOURCE_ID = 'region-boundary'
const BOUNDARY_LAYER_ID = 'region-boundary-line'
const DIFF_SOURCE_ID = 'release-diff'
const DIFF_LAYER_PREFIX = 'release-diff'
const DIFF_STATUSES = ['added', 'removed'] as const
const MAX_VIEWER_ZOOM = 22
const MAX_TILE_CACHE_ZOOM_LEVELS = 10

const preferredTheme: AppState['theme'] = window.matchMedia(
  '(prefers-color-scheme: light)',
).matches
  ? 'light'
  : 'midnight'
const preferredLocale: AppState['locale'] = resolvePreferredLocale(navigator.languages)
const state: AppState = readUrlState(
  window.location.search,
  preferredTheme,
  preferredLocale,
)
let regions: Region[] = []
let versions: string[] = []
let releaseMetadata: ReleaseMetadata[] = []
const regionReleaseCache = new Map<
  string,
  { versions: string[]; releaseMetadata: ReleaseMetadata[] }
>()
let currentBounds: Tilejson['bounds'] = null
let map: MapLibreMap | null = null
let comparisonMap: MapLibreMap | null = null
let groups: LayerGroups | null = null
let currentTilejsonUrl: string | null = null
let currentBoundary: RegionBoundary | null = null
let primaryVectorLayers: string[] = []
let comparisonVectorLayers: string[] = []
let comparisonGroups: LayerGroups | null = null
let requestId = 0
let comparisonRequestId = 0
let controller: AbortController | null = null
let synchronisingComparison = false
let diffRefreshTimer: number | null = null
const tileLoadStartedAt = new Map<string, number>()
const tileWeightCollections = {
  primary: createTileWeightCollection(),
  comparison: createTileWeightCollection(),
}
const diagnostics: ViewerDiagnostics = defaultDiagnostics()
diagnostics.open = state.diagnosticsOpen
const attributionControls = new Set<HTMLElement>()
const splitTouchPointers = new Map<number, SplitTouchPointer>()
let splitTouchGesture: SplitTouchGesture | null = null

type SplitTouchPointer = {
  map: MapLibreMap
  x: number
  y: number
}

type SplitTouchGesture = {
  pointers: readonly [number, number]
  initialCamera: CameraState
  initialDistance: number
}

document.addEventListener('pointerdown', event => {
  for (const attribution of attributionControls) {
    if (!attribution.isConnected) {
      attributionControls.delete(attribution)
      continue
    }
    if (attribution.contains(event.target as Node)) continue
    attribution.classList.remove('maplibregl-compact-show')
    attribution.removeAttribute('open')
  }
})
document.addEventListener('touchstart', handleSplitTouchStart, {
  capture: true,
  passive: false,
})
document.addEventListener('touchmove', handleSplitTouchMove, {
  capture: true,
  passive: false,
})
document.addEventListener('touchend', handleSplitTouchEnd, { capture: true })
document.addEventListener('touchcancel', handleSplitTouchEnd, { capture: true })

function resolvePreferredLocale(languages: readonly string[]): AppState['locale'] {
  const locale = languages[0]?.toLowerCase() ?? 'en'
  if (locale.startsWith('zh-hant') || /(^|-)zh-(hk|mo|tw)(-|$)/.test(locale))
    return 'zh-Hant'
  if (locale.startsWith('zh-hans') || /(^|-)zh-(cn|sg)(-|$)/.test(locale))
    return 'zh-Hans'
  return 'en'
}

const controls = new AppContext(
  requiredElement('app'),
  {
    onRegion: code => void changeRegion(code),
    onVersion: version => void changeVersion(version),
    onComparisonVersion: version => void changeComparisonVersion(version),
    onComparisonMode: mode => changeComparisonMode(mode),
    onDiffVisibility: (status, enabled) => changeDiffVisibility(status, enabled),
    onDiffLabel: change => flyToDiffLabel(change),
    onTheme: theme => void changeTheme(theme),
    onLocale: locale => changeLocale(locale),
    onFeature: (key, enabled) => changeFeature(key, enabled),
    onLabel: (key, enabled) => changeLabel(key, enabled),
    onFit: () => fitCurrentBounds(),
    onDiagnostics: open => changeDiagnostics(open),
    onInspect: enabled => changeInspect(enabled),
    onDebug: (key, enabled) => changeDebug(key, enabled),
    onCopyReport: () => void copyReport(),
    onDismissNotice: () => controls.setNotice(null),
  },
  state,
)

void start()

async function start(): Promise<void> {
  controls.setEnabled(false)
  try {
    const catalogue = parseCatalogue(await fetchJson(`${TILE_ORIGIN}/regions.json`))
    regions = catalogue.regions
    const selected =
      regions.find(region => region.code === state.regionCode) ??
      regions.find(region => region.code === DEFAULT_REGION_CODE) ??
      regions[0]
    if (!selected) throw new Error('The regions catalogue has no regions.')
    await preloadRegionReleases(regions)
    state.regionCode = selected.code
    controls.setRegions(regions)
    controls.setCatalogueReady(true)
    controls.setState(state)
    await loadRegion(selected, true, state.camera === null)
  } catch (error) {
    showError('Could not load the regions catalogue.', error)
    controls.setEnabled(false)
  }
}

async function preloadRegionReleases(catalogue: Region[]): Promise<void> {
  await Promise.all(
    catalogue.map(async region => {
      const versionsValue = await fetchJson(
        `${TILE_ORIGIN}/${region.code}/versions.json`,
      )
      regionReleaseCache.set(region.code, {
        versions: parseVersions(versionsValue).versions,
        releaseMetadata: parseReleaseMetadata(versionsValue),
      })
    }),
  )
}

async function changeRegion(code: string): Promise<void> {
  const region = regions.find(candidate => candidate.code === code)
  if (!region || region.code === state.regionCode) return
  state.regionCode = region.code
  controls.setState(state)
  syncUrl()
  await loadRegion(region, false, true)
}

async function loadRegion(
  region: Region,
  initial: boolean,
  fitWhenReady: boolean,
): Promise<void> {
  const id = ++requestId
  controller?.abort()
  controller = new AbortController()
  if (!regionReleaseCache.has(region.code)) controls.setCatalogueReady(false)
  setStatus(`Loading ${region.description} versions…`)
  try {
    let published = regionReleaseCache.get(region.code)
    if (!published) {
      const versionsValue = await fetchJson(
        `${TILE_ORIGIN}/${region.code}/versions.json`,
        controller.signal,
      )
      published = {
        versions: parseVersions(versionsValue).versions,
        releaseMetadata: parseReleaseMetadata(versionsValue),
      }
      regionReleaseCache.set(region.code, published)
    }
    if (id !== requestId) return
    versions = published.versions
    releaseMetadata = published.releaseMetadata
    diagnostics.latestVersion = versions[0] ?? null
    publishDiagnostics()
    if (state.version !== 'latest' && !versions.includes(state.version))
      state.version = 'latest'
    if (
      state.comparisonVersion !== null &&
      state.comparisonVersion !== 'latest' &&
      !versions.includes(state.comparisonVersion)
    )
      state.comparisonVersion = previousVersion(versions, state.version)
    controls.setVersions(versions)
    controls.setCatalogueReady(true)
    controls.setState(state)
    await loadTileset(region, initial, fitWhenReady, id)
  } catch (error) {
    if (isAbort(error) || id !== requestId) return
    showError('Could not load versions for this region.', error)
    controls.setCatalogueReady(regionReleaseCache.size > 0)
    controls.setEnabled(map !== null)
  }
}

async function changeVersion(version: string): Promise<void> {
  if (version !== 'latest' && !versions.includes(version)) return
  if (version === state.version) return
  state.version = version
  controls.setState(state)
  syncUrl()
  const region = currentRegion()
  if (region) await loadTileset(region, false, false, ++requestId)
}

async function changeComparisonVersion(version: string | null): Promise<void> {
  if (version !== null && version !== 'latest' && !versions.includes(version)) return
  if (version === state.comparisonVersion) return
  const needsResize =
    state.comparisonMode === 'side-by-side' &&
    (state.comparisonVersion !== null || version !== null)
  state.comparisonVersion = version
  controls.setState(state)
  syncUrl()
  clearDiffPresentation(map)
  clearDiffPresentation(comparisonMap)
  applyMapState()
  controls.setDiffSummary(null)
  if (needsResize) await resizeComparisonView()
  if (!version) {
    ++comparisonRequestId
    comparisonMap?.remove()
    comparisonMap = null
    comparisonGroups = null
    comparisonVectorLayers = []
    diagnostics.comparison = null
    diagnostics.tileWeight.comparison = null
    publishDiagnostics()
    return
  }
  const region = currentRegion()
  if (region) await loadComparison(region, version)
}

function changeComparisonMode(mode: AppState['comparisonMode']): void {
  if (mode === state.comparisonMode) return
  const needsResize =
    state.comparisonVersion !== null &&
    (state.comparisonMode === 'side-by-side' || mode === 'side-by-side')
  state.comparisonMode = mode
  controls.setState(state)
  syncUrl()
  if (needsResize) void resizeComparisonView()
  applyMapState()
  applyMapState(comparisonMap)
  if (isLabelsMode()) scheduleDiffRefresh()
  else {
    clearDiffPresentation(map)
    clearDiffPresentation(comparisonMap)
    controls.setDiffSummary(null)
  }
}

function changeDiffVisibility(status: DiffStatus, enabled: boolean): void {
  state.diffVisibility[status] = enabled
  controls.setState(state)
  applyDiffVisibility(map)
  applyDiffVisibility(comparisonMap)
}

function geometryBounds(geometry: Geometry): [number, number, number, number] | null {
  const bounds: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
  ]
  const visitCoordinates = (value: unknown): void => {
    if (!Array.isArray(value)) return
    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      bounds[0] = Math.min(bounds[0], value[0])
      bounds[1] = Math.min(bounds[1], value[1])
      bounds[2] = Math.max(bounds[2], value[0])
      bounds[3] = Math.max(bounds[3], value[1])
      return
    }
    for (const nested of value) visitCoordinates(nested)
  }
  const visitGeometry = (value: Geometry): void => {
    if (value.type === 'GeometryCollection') {
      for (const nested of value.geometries) visitGeometry(nested)
    } else {
      visitCoordinates(value.coordinates)
    }
  }
  visitGeometry(geometry)
  return Number.isFinite(bounds[0]) ? bounds : null
}

function geometryCentre(geometry: Geometry): [number, number] | null {
  const bounds = geometryBounds(geometry)
  return bounds ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] : null
}

function geometryIntersectsViewport(geometry: Geometry, target: MapLibreMap): boolean {
  const featureBounds = geometryBounds(geometry)
  if (!featureBounds) return false
  const viewport = target.getBounds()
  return !(
    featureBounds[2] < viewport.getWest() ||
    featureBounds[0] > viewport.getEast() ||
    featureBounds[3] < viewport.getSouth() ||
    featureBounds[1] > viewport.getNorth()
  )
}

function flyToDiffLabel(change: DiffLabelChange): void {
  const order = comparisonReleaseOrder()
  if (!order) return
  const source =
    change.status === 'added'
      ? order.newest === 'primary'
        ? map
        : comparisonMap
      : order.oldest === 'primary'
        ? map
        : comparisonMap
  const visibleMap = diffPresentationMap()
  if (!source || !visibleMap) return
  const feature = queryDiffFeatures(source, [change.sourceLayer]).find(
    candidate => candidate.label?.trim() === change.label,
  )
  const centre = feature ? geometryCentre(feature.geometry) : null
  if (!centre) return
  visibleMap.flyTo({
    center: centre,
    zoom: Math.max(visibleMap.getZoom(), 14),
    duration: 700,
    essential: true,
  })
}

async function resizeComparisonView(): Promise<void> {
  const primaryCamera = map ? mapCamera(map) : null
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  map?.resize()
  comparisonMap?.resize()
  if (primaryCamera && map) {
    map.jumpTo(primaryCamera)
    syncComparison(map, comparisonMap)
  }
}

function previousVersion(available: string[], current: string): string | null {
  const datedCurrent = current === 'latest' ? available[0] : current
  return available.find(version => version !== datedCurrent) ?? null
}

async function loadTileset(
  region: Region,
  initial: boolean,
  fitWhenReady: boolean,
  id: number,
): Promise<void> {
  controller?.abort()
  controller = new AbortController()
  setStatus(`Loading ${region.description} · ${state.version}…`)
  const url = tilejsonUrl(TILE_ORIGIN, region, state.version)
  try {
    const tilejsonValue = await fetchJson(url, controller.signal)
    const tilejson = parseTilejson(tilejsonValue)
    const boundaryValue = await (tilejson.boundary
      ? fetchJson(tilejson.boundary, controller.signal).catch(() => null)
      : Promise.resolve(null))
    const boundary = boundaryValue ? parseRegionBoundary(boundaryValue) : null
    if (id !== requestId) return
    currentTilejsonUrl = url
    currentBoundary = boundary
    primaryVectorLayers = tilejson.vectorLayers
    updateReleaseDiagnostic(
      'primary',
      region,
      state.version,
      url,
      tilejson,
      currentBoundary,
    )
    currentBounds = currentBoundary ? boundaryBounds(currentBoundary) : tilejson.bounds
    // Region bounds come from TileJSON, so move the existing map as soon as
    // they are available. Waiting for replacement tile sources can otherwise
    // leave the old region in view while their loading is delayed or fails.
    const fittedExistingMap = fitWhenReady && map !== null
    if (fittedExistingMap) fitCurrentBounds(initial ? 0 : 250)
    if (!map) {
      await createMap(url)
    } else {
      await updateSources(map, url)
    }
    if (id !== requestId || !map || !groups) return
    updateAttribution(map)
    applyMapState()
    applyBoundaryPresentation(map, currentBoundary)
    clearDiffPresentation(map)
    controls.setDiffSummary(null)
    if (comparisonMap && state.comparisonVersion) {
      comparisonMap.remove()
      comparisonMap = null
      comparisonGroups = null
      resetTileWeight('comparison')
    }
    controls.setEnabled(true)
    controls.setState(state)
    if (fitWhenReady && !fittedExistingMap) fitCurrentBounds(initial ? 0 : 250)
    if (!currentBounds)
      showWarning('This tileset has no valid bounds; the current camera was retained.')
    else if (!currentBoundary)
      showWarning('The release boundary is unavailable; the clipping mask is disabled.')
    else hideWarning()
    syncUrl()
    if (state.comparisonVersion) await loadComparison(region, state.comparisonVersion)
    if (HEADLESS_MODE && id === requestId) await markHeadlessReady()
  } catch (error) {
    if (isAbort(error) || id !== requestId) return
    showError('Could not load this tileset.', error)
    controls.setEnabled(map !== null)
    controls.setState(state)
  }
}

async function loadComparison(region: Region, version: string): Promise<void> {
  const id = ++comparisonRequestId
  const url = tilejsonUrl(TILE_ORIGIN, region, version)
  try {
    const tilejson = parseTilejson(await fetchJson(url))
    const boundaryValue = await (tilejson.boundary
      ? fetchJson(tilejson.boundary).catch(() => null)
      : null)
    if (id !== comparisonRequestId || state.comparisonVersion !== version) return
    const boundary = boundaryValue ? parseRegionBoundary(boundaryValue) : null
    comparisonVectorLayers = tilejson.vectorLayers
    updateReleaseDiagnostic('comparison', region, version, url, tilejson, boundary)
    if (!comparisonMap) {
      await createComparisonMap(url, boundary)
    } else {
      await updateSources(comparisonMap, url)
      applyBoundaryPresentation(comparisonMap, boundary)
      applyMapState(comparisonMap)
    }
    scheduleDiffRefresh()
  } catch (error) {
    if (id !== comparisonRequestId) return
    showError('Could not load the comparison release.', error)
  }
}

async function createMap(tilejsonUrl: string): Promise<void> {
  resetTileWeight('primary')
  const generated = createMapStyle(tilejsonUrl)
  groups = generated.groups
  const camera = state.camera
  const createdMap = new maplibregl.Map({
    container: 'map',
    style: generated.style,
    center: camera ? [camera.lng, camera.lat] : [114.169, 22.319],
    zoom: camera?.zoom ?? 10,
    bearing: camera?.bearing ?? 0,
    pitch: camera?.pitch ?? 0,
    maxZoom: MAX_VIEWER_ZOOM,
    maxTileCacheZoomLevels: MAX_TILE_CACHE_ZOOM_LEVELS,
    attributionControl: false,
    collectResourceTiming: true,
  })
  map = createdMap
  if (!HEADLESS_MODE) {
    createdMap.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    )
    createdMap.addControl(
      new maplibregl.NavigationControl({ showCompass: true }),
      'bottom-right',
    )
  }
  createdMap.on('moveend', () => {
    syncUrl()
    scheduleDiffRefresh()
  })
  createdMap.on('move', () => syncComparison(createdMap, comparisonMap))
  installDiagnostics(createdMap, 'primary')
  await new Promise<void>((resolve, reject) => {
    createdMap.once('load', resolve)
    createdMap.once('error', event => reject(event.error))
  })
  if (!POSTCARD_RENDERING) await waitForSource(createdMap, BASEMAP_SOURCE_ID)
  updateAttribution(createdMap, true)
}

async function createComparisonMap(
  tilejsonUrl: string,
  boundary: RegionBoundary | null,
): Promise<void> {
  resetTileWeight('comparison')
  // Selecting a comparison release makes its Svelte container visible. Give
  // that DOM update a frame before MapLibre measures it; constructing against
  // the previous display:none size leaves the map with a zero-sized viewport
  // and no visible tiles.
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  const generated = createMapStyle(tilejsonUrl)
  comparisonGroups = generated.groups
  const primary = map
  const createdMap = new maplibregl.Map({
    container: 'comparison-map',
    style: generated.style,
    center: primary ? primary.getCenter().toArray() : [114.169, 22.319],
    zoom: primary?.getZoom() ?? 10,
    bearing: primary?.getBearing() ?? 0,
    pitch: primary?.getPitch() ?? 0,
    maxZoom: MAX_VIEWER_ZOOM,
    maxTileCacheZoomLevels: MAX_TILE_CACHE_ZOOM_LEVELS,
    attributionControl: false,
    collectResourceTiming: true,
  })
  comparisonMap = createdMap
  createdMap.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    'bottom-right',
  )
  createdMap.addControl(
    new maplibregl.NavigationControl({ showCompass: true }),
    'bottom-right',
  )
  createdMap.on('move', () => syncComparison(createdMap, map))
  installDiagnostics(createdMap, 'comparison')
  await new Promise<void>((resolve, reject) => {
    createdMap.once('load', resolve)
    createdMap.once('error', event => reject(event.error))
  })
  createdMap.resize()
  await resizeComparisonView()
  await waitForSource(createdMap, BASEMAP_SOURCE_ID)
  updateAttribution(createdMap, true)
  applyMapState(createdMap)
  applyBoundaryPresentation(createdMap, boundary)
  // The primary map can change from a full-width canvas to a half-width canvas
  // while the comparison source is loading. Resize once both sources are ready
  // so side-by-side mode reliably renders both releases.
  await resizeComparisonView()
}

async function updateSources(target: MapLibreMap, tilejsonUrl: string): Promise<void> {
  resetTileWeight(target === map ? 'primary' : 'comparison')
  const sourceUrls: Array<[string, string]> = [[BASEMAP_SOURCE_ID, tilejsonUrl]]
  for (const [sourceId, sourceUrl] of sourceUrls) {
    const source = target.getSource(sourceId)
    if (source?.type !== 'vector') throw new Error('The basemap source is unavailable.')
    ;(source as VectorTileSource).setUrl(sourceUrl)
  }
  await Promise.all(sourceUrls.map(([sourceId]) => waitForSource(target, sourceId)))
  updateAttribution(target)
}

function syncComparison(source: MapLibreMap, target: MapLibreMap | null): void {
  if (!target || synchronisingComparison) return
  synchronisingComparison = true
  target.jumpTo({
    center: source.getCenter(),
    zoom: source.getZoom(),
    bearing: source.getBearing(),
    pitch: source.getPitch(),
  })
  synchronisingComparison = false
}

function canBridgeSplitTouch(): boolean {
  return (
    window.innerWidth <= 894 &&
    state.comparisonVersion !== null &&
    state.comparisonMode === 'split' &&
    map !== null &&
    comparisonMap !== null
  )
}

function mapForTouchTarget(target: EventTarget | null): MapLibreMap | null {
  if (!(target instanceof Node)) return null
  if (map?.getContainer().contains(target)) return map
  if (comparisonMap?.getContainer().contains(target)) return comparisonMap
  return null
}

function touchDistance(first: SplitTouchPointer, second: SplitTouchPointer): number {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

/**
 * MapLibre receives touches per canvas. In a split comparison, one finger on
 * each canvas therefore cannot form a native pinch. This bridge activates only
 * for that cross-canvas gesture; every other touch continues to reach MapLibre.
 */
function handleSplitTouchStart(event: TouchEvent): void {
  if (!canBridgeSplitTouch()) {
    splitTouchPointers.clear()
    splitTouchGesture = null
    return
  }
  for (const touch of event.changedTouches) {
    const target = mapForTouchTarget(touch.target)
    if (!target) continue
    splitTouchPointers.set(touch.identifier, {
      map: target,
      x: touch.clientX,
      y: touch.clientY,
    })
  }
  if (splitTouchGesture || !map) return

  const pointers = [...splitTouchPointers.entries()]
  const first = pointers.at(-2)
  const second = pointers.at(-1)
  if (!first || !second || first[1].map === second[1].map) return

  const initialDistance = touchDistance(first[1], second[1])
  if (initialDistance === 0) return
  splitTouchGesture = {
    pointers: [first[0], second[0]],
    initialCamera: mapCamera(map),
    initialDistance,
  }
  if (event.cancelable) event.preventDefault()
  event.stopImmediatePropagation()
}

function handleSplitTouchMove(event: TouchEvent): void {
  if (!splitTouchGesture || !canBridgeSplitTouch() || !map) return
  for (const touch of event.changedTouches) {
    const pointer = splitTouchPointers.get(touch.identifier)
    if (!pointer) continue
    pointer.x = touch.clientX
    pointer.y = touch.clientY
  }

  const [firstId, secondId] = splitTouchGesture.pointers
  const first = splitTouchPointers.get(firstId)
  const second = splitTouchPointers.get(secondId)
  if (!first || !second) return
  const distance = touchDistance(first, second)
  if (distance === 0) return

  const zoom = Math.min(
    MAX_VIEWER_ZOOM,
    Math.max(
      0,
      splitTouchGesture.initialCamera.zoom +
        Math.log2(distance / splitTouchGesture.initialDistance),
    ),
  )
  map.jumpTo({ ...splitTouchGesture.initialCamera, zoom })
  if (event.cancelable) event.preventDefault()
  event.stopImmediatePropagation()
}

function handleSplitTouchEnd(event: TouchEvent): void {
  for (const touch of event.changedTouches) splitTouchPointers.delete(touch.identifier)
  if (
    splitTouchGesture?.pointers.some(identifier => !splitTouchPointers.has(identifier))
  ) {
    splitTouchGesture = null
  }
}

function updateAttribution(target: MapLibreMap, collapse = false): void {
  for (const sourceId of [BASEMAP_SOURCE_ID]) {
    const source = target.getSource(sourceId)
    if (source) source.attribution = BASEMAP_ATTRIBUTION
  }

  const attribution = target
    .getContainer()
    .querySelector<HTMLElement>('.maplibregl-ctrl-attrib')
  const attributionContent = attribution?.querySelector<HTMLElement>(
    '.maplibregl-ctrl-attrib-inner',
  )
  if (attribution) attributionControls.add(attribution)
  if (attributionContent) {
    const openStreetMapLink = document.createElement('a')
    openStreetMapLink.href = 'https://openstreetmap.org/copyright'
    openStreetMapLink.textContent = 'OpenStreetMaps (ODbL)'
    const protomapsLink = document.createElement('a')
    protomapsLink.href = 'https://protomaps.com/legal'
    protomapsLink.textContent = 'Protomaps'
    attributionContent.replaceChildren(
      openStreetMapLink,
      document.createTextNode('; '),
      protomapsLink,
    )
  }
  if (collapse) {
    attribution?.classList.remove('maplibregl-compact-show')
    attribution?.removeAttribute('open')
  }
}

function waitForSource(
  target: MapLibreMap,
  sourceId: string,
  timeoutMs = 15_000,
): Promise<void> {
  if (target.isSourceLoaded(sourceId)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Timed out while loading map tiles.'))
    }, timeoutMs)
    const onData = (event: { sourceId?: string }) => {
      if (event.sourceId === sourceId && target.isSourceLoaded(sourceId)) {
        cleanup()
        resolve()
      }
    }
    const onError = (event: { error?: Error }) => {
      cleanup()
      reject(event.error ?? new Error('The map source failed to load.'))
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      target.off('sourcedata', onData)
      target.off('error', onError)
    }
    target.on('sourcedata', onData)
    target.on('error', onError)
  })
}

function applyMapState(target: MapLibreMap | null = map): void {
  const targetGroups = target === comparisonMap ? comparisonGroups : groups
  if (!target || !targetGroups) return
  if (isLabelsMode() && target !== diffPresentationMap()) {
    for (const layerIds of Object.values(targetGroups))
      for (const layerId of layerIds)
        target.setLayoutProperty(layerId, 'visibility', 'none')
  } else {
    applyVisibility(
      (id, visibility) => target.setLayoutProperty(id, 'visibility', visibility),
      targetGroups,
      state,
    )
  }
  applyLocale(
    (id, expression) => target.setLayoutProperty(id, 'text-field', expression),
    targetGroups,
    state.locale,
  )
}

function isLabelsMode(): boolean {
  return state.comparisonVersion !== null && state.comparisonMode === 'labels'
}

function comparisonReleaseOrder() {
  if (!state.comparisonVersion) return null
  return orderComparisonReleases(state.version, state.comparisonVersion, versions)
}

function diffPresentationMap(): MapLibreMap | null {
  const order = comparisonReleaseOrder()
  if (!order) return null
  return order.newest === 'primary' ? map : comparisonMap
}

function diffLayerVisible(sourceLayer: string): boolean {
  if (sourceLayer === 'roads') return state.labels.roads
  if (sourceLayer === 'pois') return state.labels.pois
  if (sourceLayer === 'places') return state.labels.places
  if (sourceLayer === 'water') return state.labels.water
  return true
}

function featureLabel(properties: Record<string, unknown> | null): string | undefined {
  if (!properties) return undefined
  const localized = properties[`name:${state.locale}`]
  if (typeof localized === 'string' && localized.trim()) return localized
  const name = properties.name
  return typeof name === 'string' && name.trim() ? name : undefined
}

function queryDiffFeatures(
  target: MapLibreMap,
  sourceLayers: readonly string[],
): DiffInputFeature[] {
  return sourceLayers.flatMap(sourceLayer =>
    diffLayerVisible(sourceLayer)
      ? target
          .querySourceFeatures(BASEMAP_SOURCE_ID, { sourceLayer })
          .map(feature => ({
            id: feature.id,
            sourceLayer,
            geometry: feature.geometry,
            properties: feature.properties,
            label: featureLabel(feature.properties),
          }))
          .filter(feature => geometryIntersectsViewport(feature.geometry, target))
      : [],
  )
}

function scheduleDiffRefresh(): void {
  if (!isLabelsMode()) return
  if (diffRefreshTimer !== null) window.clearTimeout(diffRefreshTimer)
  diffRefreshTimer = window.setTimeout(() => {
    diffRefreshTimer = null
    refreshDiffPresentation()
  }, 180)
}

function refreshDiffPresentation(): void {
  if (!isLabelsMode() || !map || !comparisonMap) return
  const comparisonVersion = state.comparisonVersion
  if (!comparisonVersion) return
  if (isSameRelease(state.version, comparisonVersion, versions)) {
    clearDiffPresentation(map)
    clearDiffPresentation(comparisonMap)
    controls.setDiffSummary({ added: 0, removed: 0, labelChanges: [] })
    return
  }
  const order = comparisonReleaseOrder()
  if (!order) return
  const sourceLayers = [...new Set([...primaryVectorLayers, ...comparisonVectorLayers])]
  const oldestMap = order.oldest === 'primary' ? map : comparisonMap
  const newestMap = order.newest === 'primary' ? map : comparisonMap
  const result = buildDiff(
    queryDiffFeatures(oldestMap, sourceLayers),
    queryDiffFeatures(newestMap, sourceLayers),
  )
  clearDiffPresentation(oldestMap)
  setDiffPresentation(newestMap, result.data)
  controls.setDiffSummary(result.summary)
}

function clearDiffPresentation(target: MapLibreMap | null): void {
  if (!target) return
  for (const status of DIFF_STATUSES) {
    for (const geometry of ['label-point', 'label-line']) {
      const layerId = `${DIFF_LAYER_PREFIX}-${status}-${geometry}`
      if (target.getLayer(layerId)) target.removeLayer(layerId)
    }
  }
  if (target.getSource(DIFF_SOURCE_ID)) target.removeSource(DIFF_SOURCE_ID)
}

function setDiffPresentation(target: MapLibreMap, data: DiffFeatureCollection): void {
  const existingSource = target.getSource(DIFF_SOURCE_ID)
  if (existingSource) {
    if (existingSource.type === 'geojson') {
      ;(existingSource as GeoJSONSource).setData(data)
      applyDiffVisibility(target)
    }
    return
  }

  target.addSource(DIFF_SOURCE_ID, { type: 'geojson', data })
  const labelColours = { added: '#16a34a', removed: '#dc2626' }
  const labelHalo = '#ffffff'
  for (const status of DIFF_STATUSES) {
    const filter: FilterSpecification = ['==', ['get', 'diffStatus'], status]
    target.addLayer({
      id: `${DIFF_LAYER_PREFIX}-${status}-label-point`,
      type: 'symbol',
      source: DIFF_SOURCE_ID,
      filter: [
        'all',
        filter,
        ['has', 'diffLabel'],
        ['!=', ['get', 'diffGeometry'], 'line'],
      ],
      layout: {
        visibility: state.diffVisibility[status] ? 'visible' : 'none',
        'text-field': ['get', 'diffLabel'],
        'text-font': ['KlokanTech Noto Sans CJK Regular'],
        'text-size': 12,
        'text-padding': 2,
        // Added labels also exist in the newest basemap layer. Render the
        // diff label above that layer and do not let it lose the placement
        // collision to the ordinary, white label.
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': labelColours[status],
        'text-halo-color': labelHalo,
        'text-halo-width': 1.75,
      },
    })
    target.addLayer({
      id: `${DIFF_LAYER_PREFIX}-${status}-label-line`,
      type: 'symbol',
      source: DIFF_SOURCE_ID,
      filter: [
        'all',
        filter,
        ['has', 'diffLabel'],
        ['==', ['get', 'diffGeometry'], 'line'],
      ],
      layout: {
        visibility: state.diffVisibility[status] ? 'visible' : 'none',
        'symbol-placement': 'line',
        'text-field': ['get', 'diffLabel'],
        'text-font': ['KlokanTech Noto Sans CJK Regular'],
        'text-size': 12,
        'text-padding': 2,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': labelColours[status],
        'text-halo-color': labelHalo,
        'text-halo-width': 1.75,
      },
    })
  }
}

function applyDiffVisibility(target: MapLibreMap | null): void {
  if (!target) return
  for (const status of DIFF_STATUSES) {
    const visibility = state.diffVisibility[status] ? 'visible' : 'none'
    for (const geometry of ['label-point', 'label-line']) {
      const layerId = `${DIFF_LAYER_PREFIX}-${status}-${geometry}`
      if (target.getLayer(layerId))
        target.setLayoutProperty(layerId, 'visibility', visibility)
    }
  }
}

function applyBoundaryPresentation(
  target: MapLibreMap | null,
  boundary: RegionBoundary | null,
): void {
  if (!target) return
  for (const layerId of [BOUNDARY_LAYER_ID, BOUNDARY_MASK_LAYER_ID]) {
    if (target.getLayer(layerId)) target.removeLayer(layerId)
  }
  for (const sourceId of [BOUNDARY_SOURCE_ID, BOUNDARY_MASK_SOURCE_ID]) {
    if (target.getSource(sourceId)) target.removeSource(sourceId)
  }
  if (POSTCARD_RENDERING) return
  if (!boundary) return

  target.addSource(BOUNDARY_SOURCE_ID, { type: 'geojson', data: boundary })

  const beforeLayerId = firstTextSymbolLayerId(target.getStyle().layers)
  target.addSource(BOUNDARY_MASK_SOURCE_ID, {
    type: 'geojson',
    data: outsideBoundaryMask(boundary),
  })
  target.addLayer(
    {
      id: BOUNDARY_MASK_LAYER_ID,
      type: 'fill',
      source: BOUNDARY_MASK_SOURCE_ID,
      paint: { 'fill-color': boundaryMaskColor(state.theme) },
    },
    beforeLayerId,
  )
  target.addLayer(
    {
      id: BOUNDARY_LAYER_ID,
      type: 'line',
      source: BOUNDARY_SOURCE_ID,
      paint: {
        'line-color': boundaryLineColor(state.theme),
        'line-width': 1,
        'line-opacity': 0.65,
      },
    },
    beforeLayerId,
  )
}

function boundaryMaskColor(theme: AppState['theme']): string {
  if (POSTCARD_RENDERING) return '#F8F2E6'
  if (theme === 'dark') return '#14181a'
  if (theme === 'midnight') return '#020617'
  return '#e7edf1'
}

function boundaryLineColor(theme: AppState['theme']): string {
  if (POSTCARD_RENDERING) return postcardPalette(state.regionCode).accent
  if (theme === 'dark') return '#536169'
  if (theme === 'midnight') return '#6beaf5'
  return '#82929a'
}

function createMapStyle(tilejsonUrl: string) {
  return POSTCARD_RENDERING
    ? createPostcardStyle(
        tilejsonUrl,
        state.regionCode,
        GLYPH_URL,
        POSTCARD_ILLUMINATED,
      )
    : createStyle(tilejsonUrl, GLYPH_URL, state.theme)
}

function changeLocale(locale: AppState['locale']): void {
  state.locale = locale
  applyMapState()
  applyMapState(comparisonMap)
  scheduleDiffRefresh()
  controls.setState(state)
  syncUrl()
}

async function changeTheme(theme: AppState['theme']): Promise<void> {
  if (theme === state.theme) return
  state.theme = theme
  controls.setState(state)
  syncUrl()
  if (!map || !currentTilejsonUrl) return

  controls.setEnabled(false)
  setStatus(`Applying ${theme} theme…`)
  const generated = createMapStyle(currentTilejsonUrl)
  groups = generated.groups
  try {
    resetTileWeight('primary')
    await new Promise<void>((resolve, reject) => {
      map?.once('style.load', resolve)
      map?.once('error', event => reject(event.error))
      map?.setStyle(generated.style)
    })
    if (!map) return
    await waitForSource(map, BASEMAP_SOURCE_ID)
    updateAttribution(map)
    applyMapState()
    applyBoundaryPresentation(map, currentBoundary)
    if (comparisonMap && state.comparisonVersion) {
      comparisonMap.remove()
      comparisonMap = null
      comparisonGroups = null
      const region = currentRegion()
      if (region) await loadComparison(region, state.comparisonVersion)
    }
    controls.setEnabled(true)
    controls.setState(state)
  } catch (error) {
    showError('Could not apply this basemap theme.', error)
    controls.setEnabled(true)
    controls.setState(state)
  }
}

function changeFeature(key: keyof AppState['features'], enabled: boolean): void {
  state.features[key] = enabled
  applyMapState()
  applyMapState(comparisonMap)
  scheduleDiffRefresh()
  controls.setState(state)
  syncUrl()
}

function changeLabel(key: keyof AppState['labels'], enabled: boolean): void {
  if (
    (key === 'roads' && !state.features.roads) ||
    (key === 'pois' && !state.features.pois)
  )
    return
  state.labels[key] = enabled
  applyMapState()
  applyMapState(comparisonMap)
  scheduleDiffRefresh()
  controls.setState(state)
  syncUrl()
}

function fitCurrentBounds(duration = 250): void {
  if (!map) return
  const bounds = postcardBounds() ?? currentBounds
  if (!bounds) {
    showWarning('This tileset has no valid bounds; the current camera was retained.')
    return
  }
  const mobile =
    !HEADLESS_MODE && window.innerWidth <= (state.comparisonVersion ? 894 : 720)
  const padding = POSTCARD_RENDERING
    ? postcardPadding()
    : HEADLESS_MODE
      ? { top: 24, right: 24, bottom: 24, left: 24 }
      : mobile
        ? { top: 24, right: 24, bottom: 24, left: 24 }
        : { top: 88, right: 32, bottom: 32, left: 32 }
  const fitVertically = () => {
    if (!map || !currentBounds) return
    const southWest = map.project([currentBounds[0], currentBounds[1]])
    const northEast = map.project([currentBounds[2], currentBounds[3]])
    const boundsHeight = Math.abs(southWest.y - northEast.y)
    const availableHeight =
      map.getContainer().clientHeight - padding.top - padding.bottom
    if (boundsHeight <= 0 || availableHeight <= 0) return
    map.jumpTo({
      zoom: map.getZoom() + Math.log2(availableHeight / boundsHeight),
    })
  }

  if (mobile && duration > 0)
    map.once('moveend', () => window.requestAnimationFrame(fitVertically))
  map.fitBounds(bounds, { bearing: postcardBearing(), padding, duration })
  const offset = postcardOffset()
  if (offset[0] !== 0 || offset[1] !== 0) map.panBy(offset, { duration: 0 })
  const zoom = postcardZoom()
  if (zoom !== 0) map.zoomTo(map.getZoom() + zoom, { duration: 0 })
  if (mobile && duration === 0)
    window.requestAnimationFrame(() => {
      map?.resize()
      fitVertically()
    })
}

function postcardBounds(): [number, number, number, number] | null {
  if (!POSTCARD_RENDERING) return null
  const bounds = state.regionCode
    ? POSTCARD_BOUNDS[state.regionCode as keyof typeof POSTCARD_BOUNDS]
    : undefined
  return bounds ? [...bounds] : null
}

function postcardBearing(): number {
  if (!POSTCARD_RENDERING || !state.regionCode) return 0
  return POSTCARD_BEARING[state.regionCode as keyof typeof POSTCARD_BEARING] ?? 0
}

function postcardPadding() {
  if (state.regionCode === 'gba') return { top: 48, right: 48, bottom: 48, left: 48 }
  return { top: 0, right: 0, bottom: 0, left: 0 }
}

function postcardOffset(): [number, number] {
  if (!POSTCARD_RENDERING || !state.regionCode) return [0, 0]
  const offset = POSTCARD_OFFSET[state.regionCode as keyof typeof POSTCARD_OFFSET]
  return offset ? [...offset] : [0, 0]
}

function postcardZoom(): number {
  if (!POSTCARD_RENDERING || !state.regionCode) return 0
  return POSTCARD_ZOOM[state.regionCode as keyof typeof POSTCARD_ZOOM] ?? 0
}

async function markHeadlessReady(): Promise<void> {
  if (!map) return
  if (POSTCARD_RENDERING) {
    // The illuminated postcard often follows the standard capture in the same
    // Browser Rendering session. A fixed delay can therefore capture Hong
    // Kong before its dense land-cover tiles finish, while the warmed follow-up
    // capture appears complete. Wait for the final postcard camera instead.
    await waitForSource(map, BASEMAP_SOURCE_ID, 60_000)
  } else if (!(map.loaded() && map.areTilesLoaded())) {
    await new Promise<void>(resolve => map?.once('idle', () => resolve()))
  }
  await new Promise<void>(resolve =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
  )
  signalHeadlessReady()
}

function signalHeadlessReady(): void {
  if (document.querySelector('#basemap-render-ready')) return
  const signal = document.createElement('span')
  signal.id = 'basemap-render-ready'
  signal.dataset.ready = 'true'
  signal.hidden = true
  document.body.append(signal)
}

function currentRegion(): Region | undefined {
  return regions.find(region => region.code === state.regionCode)
}

function syncUrl(): void {
  if (map) state.camera = mapCamera(map)
  history.replaceState(null, '', `${window.location.pathname}${writeUrlState(state)}`)
}

function mapCamera(target: MapLibreMap): CameraState {
  const center = target.getCenter()
  return {
    lng: center.lng,
    lat: center.lat,
    zoom: target.getZoom(),
    bearing: target.getBearing(),
    pitch: target.getPitch(),
  }
}

function setStatus(message: string): void {
  if (message.startsWith('Could not')) controls.setNotice(message)
}

function showWarning(message: string): void {
  controls.setNotice(message)
}

function hideWarning(): void {
  controls.setNotice(null)
}

function showError(message: string, error: unknown): void {
  console.error(message, error)
  recordError(`${message} ${errorMessage(error)}`)
  setStatus(message)
  showWarning(message)
}

function updateReleaseDiagnostic(
  target: 'primary' | 'comparison',
  region: Region,
  selectedVersion: string,
  tilejsonUrl: string,
  tilejson: Tilejson,
  boundary: RegionBoundary | null,
): void {
  const resolvedVersion = selectedVersion === 'latest' ? versions[0] : selectedVersion
  const metadata = releaseMetadata.find(entry => entry.version === resolvedVersion)
  const release: ReleaseDiagnostic = {
    ...emptyReleaseDiagnostic(),
    version: resolvedVersion ?? selectedVersion,
    tilejsonUrl,
    boundaryUrl: tilejson.boundary,
    manifestUrl: resolvedVersion
      ? `${TILE_ORIGIN}/releases/${region.code}/${resolvedVersion}.json`
      : null,
    bounds: tilejson.bounds,
    minZoom: tilejson.minZoom,
    maxZoom: Math.max(tilejson.maxZoom ?? MAX_VIEWER_ZOOM, MAX_VIEWER_ZOOM),
    vectorLayers: tilejson.vectorLayers,
    boundary: tilejson.boundary ? (boundary ? 'active' : 'unavailable') : 'unavailable',
    archiveSize: metadata?.size ?? null,
    archiveSha256: metadata?.sha256 ?? null,
    createdAt: metadata?.createdAt ?? null,
  }
  if (target === 'primary') diagnostics.primary = release
  else diagnostics.comparison = release
  publishDiagnostics()
}

function publishDiagnostics(): void {
  controls.setDiagnostics({
    ...diagnostics,
    debug: { ...diagnostics.debug },
    errors: [...diagnostics.errors],
    primary: { ...diagnostics.primary },
    comparison: diagnostics.comparison ? { ...diagnostics.comparison } : null,
    tileWeight: {
      primary: { ...diagnostics.tileWeight.primary },
      comparison: diagnostics.tileWeight.comparison
        ? { ...diagnostics.tileWeight.comparison }
        : null,
    },
  })
}

function recordError(
  error: string,
  release?: 'primary' | 'comparison',
  sourceId?: string,
): void {
  diagnostics.errors = [...diagnostics.errors, error].slice(-8)
  diagnostics.tileFailures += 1
  const source = basemapTileSource(sourceId)
  if (release && source) {
    tileWeightCollections[release].recordFailure()
    diagnostics.tileWeight[release] = tileWeightCollections[release].summary()
  }
  publishDiagnostics()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function installDiagnostics(
  target: MapLibreMap,
  release: 'primary' | 'comparison',
): void {
  target.showTileBoundaries = diagnostics.debug.tiles
  target.showCollisionBoxes = diagnostics.debug.collisions
  target.showOverdrawInspector = diagnostics.debug.overdraw
  target.getCanvas().classList.toggle('is-inspecting', diagnostics.inspect)
  target.on('dragstart', () => {
    target.getCanvas().classList.add('is-dragging')
  })
  target.on('dragend', () => {
    target.getCanvas().classList.remove('is-dragging')
  })
  target.on('error', event => {
    const sourceId = (event as { sourceId?: string }).sourceId
    recordError(`${release}: ${errorMessage(event.error)}`, release, sourceId)
  })
  target.on('sourcedataloading', event => {
    const source = basemapTileSource(event.sourceId)
    if (!source) return
    diagnostics.tileRequests += 1
    tileWeightCollections[release].recordRequest()
    diagnostics.tileWeight[release] = tileWeightCollections[release].summary()
    const key = tileKey(release, event.sourceId, event.coord?.key)
    if (key) tileLoadStartedAt.set(key, performance.now())
    publishDiagnostics()
  })
  target.on('sourcedata', event => {
    const source = basemapTileSource(event.sourceId)
    if (!source) return
    const key = tileKey(release, event.sourceId, event.coord?.key)
    const startedAt = key ? tileLoadStartedAt.get(key) : undefined
    if (key) tileLoadStartedAt.delete(key)
    const tileTimings = (event.tile as { resourceTiming?: PerformanceResourceTiming[] })
      ?.resourceTiming
    let observedDuration: number | null = null
    for (const timing of [...(event.resourceTiming ?? []), ...(tileTimings ?? [])]) {
      const duration = knownTimingDuration(timing.duration)
      if (duration !== null) observedDuration = duration
      tileWeightCollections[release].add({
        identity: `${release}:${source}:${timing.name}:${timing.startTime}`,
        source,
        tile: event.coord?.key ?? null,
        url: timing.name,
        durationMs: duration,
        transferBytes: knownTimingBytes(timing.transferSize),
        encodedBodyBytes: knownTimingBytes(timing.encodedBodySize),
        decodedBodyBytes: knownTimingBytes(timing.decodedBodySize),
      })
    }
    diagnostics.tileWeight[release] = tileWeightCollections[release].summary()
    const duration =
      observedDuration ??
      (startedAt !== undefined ? performance.now() - startedAt : null)
    if (duration !== null) diagnostics.lastTileDurationMs = Math.round(duration)
    publishDiagnostics()
  })
  target.on('click', event => {
    if (!diagnostics.inspect) return
    const layers = target.queryRenderedFeatures(event.point).slice(0, 12)
    const feature: FeatureDiagnostic = {
      release,
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      zoom: target.getZoom(),
      layers: layers.map(layer => ({
        id: layer.layer.id,
        sourceLayer: layer.sourceLayer,
        properties: layer.properties,
      })),
    }
    diagnostics.feature = feature
    publishDiagnostics()
  })
}

function basemapTileSource(sourceId: string | undefined): BasemapTileSource | null {
  if (sourceId === BASEMAP_SOURCE_ID) return BASEMAP_SOURCE_ID
  return null
}

function tileKey(
  release: 'primary' | 'comparison',
  sourceId: string | undefined,
  key: string | undefined,
): string | null {
  return sourceId && key ? `${release}:${sourceId}:${key}` : null
}

function resetTileWeight(release: 'primary' | 'comparison'): void {
  tileWeightCollections[release].reset()
  diagnostics.tileWeight[release] = tileWeightCollections[release].summary()
  for (const key of tileLoadStartedAt.keys()) {
    if (key.startsWith(`${release}:`)) tileLoadStartedAt.delete(key)
  }
}

function changeDiagnostics(open: boolean): void {
  diagnostics.open = open
  state.diagnosticsOpen = open
  controls.setState(state)
  syncUrl()
  publishDiagnostics()
}

function changeInspect(enabled: boolean): void {
  diagnostics.inspect = enabled
  if (!enabled) diagnostics.feature = null
  for (const target of [map, comparisonMap]) {
    target?.getCanvas().classList.toggle('is-inspecting', enabled)
  }
  publishDiagnostics()
}

function changeDebug(key: 'tiles' | 'collisions' | 'overdraw', enabled: boolean): void {
  diagnostics.debug[key] = enabled
  for (const target of [map, comparisonMap]) {
    if (!target) continue
    if (key === 'tiles') target.showTileBoundaries = enabled
    if (key === 'collisions') target.showCollisionBoxes = enabled
    if (key === 'overdraw') target.showOverdrawInspector = enabled
  }
  publishDiagnostics()
}

async function copyReport(): Promise<void> {
  const report = {
    url: window.location.href,
    primary: diagnostics.primary,
    comparison: diagnostics.comparison,
    tileRequests: diagnostics.tileRequests,
    tileFailures: diagnostics.tileFailures,
    lastTileDurationMs: diagnostics.lastTileDurationMs,
    tileWeight: diagnostics.tileWeight,
    errors: diagnostics.errors,
    inspectedFeature: diagnostics.feature,
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    showWarning('Diagnostic report copied to the clipboard.')
  } catch (error) {
    showError('Could not copy the diagnostic report.', error)
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function requiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (!found) throw new Error(`Missing #${id}.`)
  return found as T
}
