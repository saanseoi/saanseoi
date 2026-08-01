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
  insideLabelsTilejsonUrl,
  tilejsonUrl,
  type Region,
} from './lib/catalogue'
import { AppContext } from './lib/ctx/app'
import {
  BASEMAP_LABEL_SOURCE_ID,
  BASEMAP_SOURCE_ID,
  applyLocale,
  applyVisibility,
  createStyle,
  firstTextSymbolLayerId,
  type LayerGroups,
} from './lib/style'
import {
  boundaryBounds,
  outsideBoundaryMask,
  parseRegionBoundary,
  type RegionBoundary,
} from './lib/boundaries'
import { canUseFilteredLabels, parseTilejson, type Tilejson } from './lib/tilejson'
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
const DEFAULT_REGION_CODE = 'hk'
const BOUNDARY_MASK_SOURCE_ID = 'region-boundary-mask'
const BOUNDARY_MASK_LAYER_ID = 'region-boundary-mask-fill'
const BOUNDARY_SOURCE_ID = 'region-boundary'
const BOUNDARY_LAYER_ID = 'region-boundary-line'
const DIFF_SOURCE_ID = 'release-diff'
const DIFF_LAYER_PREFIX = 'release-diff'
const DIFF_STATUSES = ['added', 'removed'] as const
const MAX_VIEWER_ZOOM = 22

const preferredTheme: AppState['theme'] = 'dark'
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
let currentLabelTilejsonUrl: string | null = null
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
const diagnostics: ViewerDiagnostics = defaultDiagnostics()
const attributionControls = new Set<HTMLElement>()

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

function resolvePreferredLocale(languages: readonly string[]): AppState['locale'] {
  const locale = languages[0]?.toLowerCase() ?? 'en'
  if (locale.startsWith('zh-hant') || /(^|-)zh-(hk|mo|tw)(-|$)/.test(locale))
    return 'zh-Hant'
  if (locale.startsWith('zh-hans') || /(^|-)zh-(cn|sg)(-|$)/.test(locale))
    return 'zh-Hans'
  return 'en'
}

const controls = new AppContext(requiredElement('app'), {
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
})

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
  if (isDiffMode()) scheduleDiffRefresh()
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
  const labelUrl = insideLabelsTilejsonUrl(url)
  try {
    const tilejsonValue = await fetchJson(url, controller.signal)
    const tilejson = parseTilejson(tilejsonValue)
    const [labelTilejsonValue, boundaryValue] = await Promise.all([
      fetchJson(labelUrl, controller.signal).catch(() => null),
      tilejson.boundary
        ? fetchJson(tilejson.boundary, controller.signal).catch(() => null)
        : Promise.resolve(null),
    ])
    const boundary = boundaryValue ? parseRegionBoundary(boundaryValue) : null
    const labelsAreFiltered = canUseFilteredLabels(
      state.labelClip,
      labelTilejsonValue,
      boundary !== null,
    )
    const labelSourceUrl = labelsAreFiltered ? labelUrl : url
    if (id !== requestId) return
    currentTilejsonUrl = url
    currentLabelTilejsonUrl = labelSourceUrl
    currentBoundary = boundary
    primaryVectorLayers = tilejson.vectorLayers
    updateReleaseDiagnostic(
      'primary',
      region,
      state.version,
      url,
      tilejson,
      labelsAreFiltered,
      currentBoundary,
    )
    currentBounds = currentBoundary ? boundaryBounds(currentBoundary) : tilejson.bounds
    // Region bounds come from TileJSON, so move the existing map as soon as
    // they are available. Waiting for replacement tile sources can otherwise
    // leave the old region in view while their loading is delayed or fails.
    const fittedExistingMap = fitWhenReady && map !== null
    if (fittedExistingMap) fitCurrentBounds(initial ? 0 : 250)
    if (!map) {
      await createMap(url, labelSourceUrl)
    } else {
      await updateSources(map, url, labelSourceUrl)
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
    }
    controls.setEnabled(true)
    controls.setState(state)
    if (fitWhenReady && !fittedExistingMap) fitCurrentBounds(initial ? 0 : 250)
    if (!currentBounds)
      showWarning('This tileset has no valid bounds; the current camera was retained.')
    else if (!currentBoundary)
      showWarning('The release boundary is unavailable; the clipping mask is disabled.')
    else if (state.labelClip && !labelsAreFiltered)
      showWarning(
        'Inside-region label clipping is unavailable; unfiltered labels are shown.',
      )
    else hideWarning()
    syncUrl()
    if (state.comparisonVersion) await loadComparison(region, state.comparisonVersion)
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
  const labelUrl = insideLabelsTilejsonUrl(url)
  try {
    const tilejson = parseTilejson(await fetchJson(url))
    const [filtered, boundaryValue] = await Promise.all([
      fetchJson(labelUrl).catch(() => null),
      tilejson.boundary ? fetchJson(tilejson.boundary).catch(() => null) : null,
    ])
    if (id !== comparisonRequestId || state.comparisonVersion !== version) return
    const boundary = boundaryValue ? parseRegionBoundary(boundaryValue) : null
    const filteredLabels = canUseFilteredLabels(
      state.labelClip,
      filtered,
      boundary !== null,
    )
    const comparisonLabelUrl = filteredLabels ? labelUrl : url
    comparisonVectorLayers = tilejson.vectorLayers
    updateReleaseDiagnostic(
      'comparison',
      region,
      version,
      url,
      tilejson,
      filteredLabels,
      boundary,
    )
    if (!comparisonMap) {
      await createComparisonMap(url, comparisonLabelUrl, boundary)
    } else {
      await updateSources(comparisonMap, url, comparisonLabelUrl)
      applyBoundaryPresentation(comparisonMap, boundary)
      applyMapState(comparisonMap)
    }
    scheduleDiffRefresh()
  } catch (error) {
    if (id !== comparisonRequestId) return
    showError('Could not load the comparison release.', error)
  }
}

async function createMap(tilejsonUrl: string, labelTilejsonUrl: string): Promise<void> {
  const generated = createStyle(tilejsonUrl, GLYPH_URL, state.theme, labelTilejsonUrl)
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
    attributionControl: false,
    collectResourceTiming: true,
  })
  map = createdMap
  createdMap.addControl(
    new maplibregl.AttributionControl({ compact: true }),
    'bottom-right',
  )
  createdMap.addControl(
    new maplibregl.NavigationControl({ showCompass: true }),
    'bottom-right',
  )
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
  await waitForSource(createdMap, BASEMAP_SOURCE_ID)
  await waitForSource(createdMap, BASEMAP_LABEL_SOURCE_ID)
  updateAttribution(createdMap, true)
}

async function createComparisonMap(
  tilejsonUrl: string,
  labelTilejsonUrl: string,
  boundary: RegionBoundary | null,
): Promise<void> {
  // Selecting a comparison release makes its Svelte container visible. Give
  // that DOM update a frame before MapLibre measures it; constructing against
  // the previous display:none size leaves the map with a zero-sized viewport
  // and no visible tiles.
  await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  const generated = createStyle(tilejsonUrl, GLYPH_URL, state.theme, labelTilejsonUrl)
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
  await waitForSource(createdMap, BASEMAP_LABEL_SOURCE_ID)
  updateAttribution(createdMap, true)
  applyMapState(createdMap)
  applyBoundaryPresentation(createdMap, boundary)
  // The primary map can change from a full-width canvas to a half-width canvas
  // while the comparison source is loading. Resize once both sources are ready
  // so side-by-side mode reliably renders both releases.
  await resizeComparisonView()
}

async function updateSources(
  target: MapLibreMap,
  tilejsonUrl: string,
  labelTilejsonUrl: string,
): Promise<void> {
  const sourceUrls: Array<[string, string]> = [
    [BASEMAP_SOURCE_ID, tilejsonUrl],
    [BASEMAP_LABEL_SOURCE_ID, labelTilejsonUrl],
  ]
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

function updateAttribution(target: MapLibreMap, collapse = false): void {
  for (const sourceId of [BASEMAP_SOURCE_ID, BASEMAP_LABEL_SOURCE_ID]) {
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

function waitForSource(target: MapLibreMap, sourceId: string): Promise<void> {
  if (target.isSourceLoaded(sourceId)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Timed out while loading map tiles.'))
    }, 15_000)
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
  if (isDiffMode() && target !== diffPresentationMap()) {
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

function isDiffMode(): boolean {
  return state.comparisonVersion !== null && state.comparisonMode === 'diff'
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
  if (!isDiffMode()) return
  if (diffRefreshTimer !== null) window.clearTimeout(diffRefreshTimer)
  diffRefreshTimer = window.setTimeout(() => {
    diffRefreshTimer = null
    refreshDiffPresentation()
  }, 180)
}

function refreshDiffPresentation(): void {
  if (!isDiffMode() || !map || !comparisonMap) return
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
  if (theme === 'dark') return '#14181a'
  if (theme === 'midnight') return '#020617'
  return '#e7edf1'
}

function boundaryLineColor(theme: AppState['theme']): string {
  if (theme === 'dark') return '#536169'
  if (theme === 'midnight') return '#6beaf5'
  return '#82929a'
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
  if (!map || !currentTilejsonUrl || !currentLabelTilejsonUrl) return

  controls.setEnabled(false)
  setStatus(`Applying ${theme} theme…`)
  const generated = createStyle(
    currentTilejsonUrl,
    GLYPH_URL,
    theme,
    currentLabelTilejsonUrl,
  )
  groups = generated.groups
  try {
    await new Promise<void>((resolve, reject) => {
      map?.once('style.load', resolve)
      map?.once('error', event => reject(event.error))
      map?.setStyle(generated.style)
    })
    if (!map) return
    await waitForSource(map, BASEMAP_SOURCE_ID)
    await waitForSource(map, BASEMAP_LABEL_SOURCE_ID)
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
  if (!currentBounds) {
    showWarning('This tileset has no valid bounds; the current camera was retained.')
    return
  }
  const mobile = window.innerWidth <= (state.comparisonVersion ? 894 : 720)
  const padding = mobile
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
  map.fitBounds(currentBounds, { padding, duration })
  if (mobile && duration === 0)
    window.requestAnimationFrame(() => {
      map?.resize()
      fitVertically()
    })
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
  filteredLabels: boolean,
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
    labelClipping: state.labelClip
      ? filteredLabels
        ? 'active'
        : 'unavailable'
      : 'disabled',
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
  })
}

function recordError(error: string): void {
  diagnostics.errors = [...diagnostics.errors, error].slice(-8)
  diagnostics.tileFailures += 1
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
  target.on('error', event => recordError(`${release}: ${errorMessage(event.error)}`))
  const isBasemapTile = (sourceId: string | undefined): boolean =>
    sourceId === BASEMAP_SOURCE_ID || sourceId === BASEMAP_LABEL_SOURCE_ID
  const tileKey = (
    sourceId: string | undefined,
    key: string | undefined,
  ): string | null => (sourceId && key ? `${release}:${sourceId}:${key}` : null)
  target.on('sourcedataloading', event => {
    if (!isBasemapTile(event.sourceId)) return
    diagnostics.tileRequests += 1
    const key = tileKey(event.sourceId, event.coord?.key)
    if (key) tileLoadStartedAt.set(key, performance.now())
    publishDiagnostics()
  })
  target.on('sourcedata', event => {
    if (!isBasemapTile(event.sourceId)) return
    const key = tileKey(event.sourceId, event.coord?.key)
    const startedAt = key ? tileLoadStartedAt.get(key) : undefined
    if (key) tileLoadStartedAt.delete(key)
    const latest = event.resourceTiming?.at(-1)
    const duration =
      latest?.duration ??
      (startedAt !== undefined ? performance.now() - startedAt : null)
    if (duration === null) return
    diagnostics.lastTileDurationMs = Math.round(duration)
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

function changeDiagnostics(open: boolean): void {
  diagnostics.open = open
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
