import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, VectorTileSource } from 'maplibre-gl'
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
import { parseTilejson, type Tilejson } from './lib/tilejson'
import { readUrlState, writeUrlState } from './lib/url-state'
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
const BOUNDARY_MASK_SOURCE_ID = 'region-boundary-mask'
const BOUNDARY_MASK_LAYER_ID = 'region-boundary-mask-fill'
const BOUNDARY_SOURCE_ID = 'region-boundary'
const BOUNDARY_LAYER_ID = 'region-boundary-line'

const preferredTheme: AppState['theme'] = window.matchMedia(
  '(prefers-color-scheme: dark)',
).matches
  ? 'dark'
  : 'light'
const state: AppState = readUrlState(window.location.search, preferredTheme)
let regions: Region[] = []
let versions: string[] = []
let releaseMetadata: ReleaseMetadata[] = []
let currentBounds: Tilejson['bounds'] = null
let map: MapLibreMap | null = null
let comparisonMap: MapLibreMap | null = null
let groups: LayerGroups | null = null
let currentTilejsonUrl: string | null = null
let currentLabelTilejsonUrl: string | null = null
let currentBoundary: RegionBoundary | null = null
let requestId = 0
let comparisonRequestId = 0
let controller: AbortController | null = null
let synchronisingComparison = false
const diagnostics: ViewerDiagnostics = defaultDiagnostics()

const controls = new AppContext(requiredElement('app'), {
  onRegion: code => void changeRegion(code),
  onVersion: version => void changeVersion(version),
  onComparisonVersion: version => void changeComparisonVersion(version),
  onTheme: theme => void changeTheme(theme),
  onLocale: locale => changeLocale(locale),
  onFeature: (key, enabled) => changeFeature(key, enabled),
  onLabel: (key, enabled) => changeLabel(key, enabled),
  onFit: () => fitCurrentBounds(),
  onDiagnostics: open => changeDiagnostics(open),
  onInspect: enabled => changeInspect(enabled),
  onDebug: (key, enabled) => changeDebug(key, enabled),
  onCopyReport: () => void copyReport(),
})

void start()

async function start(): Promise<void> {
  controls.setEnabled(false)
  try {
    const catalogue = parseCatalogue(await fetchJson(`${TILE_ORIGIN}/regions.json`))
    regions = catalogue.regions
    const selected =
      regions.find(region => region.code === state.regionCode) ?? regions[0]
    if (!selected) throw new Error('The regions catalogue has no regions.')
    state.regionCode = selected.code
    controls.setRegions(regions)
    controls.setState(state)
    await loadRegion(selected, true, state.camera === null)
  } catch (error) {
    showError('Could not load the regions catalogue.', error)
    controls.setEnabled(false)
  }
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
  controls.setEnabled(false)
  controls.setVersions([])
  setStatus(`Loading ${region.description} versions…`)
  try {
    const versionsValue = await fetchJson(
      `${TILE_ORIGIN}/${region.code}/versions.json`,
      controller.signal,
    )
    const published = parseVersions(versionsValue)
    if (id !== requestId) return
    versions = published.versions
    releaseMetadata = parseReleaseMetadata(versionsValue)
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
    controls.setState(state)
    await loadTileset(region, initial, fitWhenReady, id)
  } catch (error) {
    if (isAbort(error) || id !== requestId) return
    showError('Could not load versions for this region.', error)
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
  state.comparisonVersion = version
  controls.setState(state)
  syncUrl()
  if (!version) {
    comparisonMap?.remove()
    comparisonMap = null
    return
  }
  const region = currentRegion()
  if (region) await loadComparison(region, version)
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
  controls.setEnabled(false)
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
    const labelsAreFiltered =
      state.labelClip &&
      labelTilejsonValue !== null &&
      parseTilejson(labelTilejsonValue).insideRegionLabels
    const labelSourceUrl = labelsAreFiltered ? labelUrl : url
    if (id !== requestId) return
    currentTilejsonUrl = url
    currentLabelTilejsonUrl = labelSourceUrl
    currentBoundary = boundaryValue ? parseRegionBoundary(boundaryValue) : null
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
    if (comparisonMap && state.comparisonVersion) {
      comparisonMap.remove()
      comparisonMap = null
      const region = currentRegion()
      if (region) await loadComparison(region, state.comparisonVersion)
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
    const filteredLabels =
      state.labelClip && filtered !== null && parseTilejson(filtered).insideRegionLabels
    const comparisonLabelUrl = filteredLabels ? labelUrl : url
    const boundary = boundaryValue ? parseRegionBoundary(boundaryValue) : null
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
    maxZoom: 18,
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
  createdMap.on('moveend', () => syncUrl())
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
  const generated = createStyle(tilejsonUrl, GLYPH_URL, state.theme, labelTilejsonUrl)
  groups = generated.groups
  const primary = map
  const createdMap = new maplibregl.Map({
    container: 'comparison-map',
    style: generated.style,
    center: primary ? primary.getCenter().toArray() : [114.169, 22.319],
    zoom: primary?.getZoom() ?? 10,
    bearing: primary?.getBearing() ?? 0,
    pitch: primary?.getPitch() ?? 0,
    maxZoom: 18,
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
  await waitForSource(createdMap, BASEMAP_SOURCE_ID)
  await waitForSource(createdMap, BASEMAP_LABEL_SOURCE_ID)
  updateAttribution(createdMap, true)
  applyMapState(createdMap)
  applyBoundaryPresentation(createdMap, boundary)
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
  const attribution = target
    .getContainer()
    .querySelector<HTMLElement>('.maplibregl-ctrl-attrib')
  const openStreetMapLink = attribution?.querySelector<HTMLAnchorElement>(
    'a[href*="openstreetmap.org/copyright"]',
  )
  if (openStreetMapLink) {
    openStreetMapLink.href = 'https://openstreetmap.org/copyright'
    openStreetMapLink.textContent = 'OpenStreetMaps (ODbL)'
  } else {
    const attributionContent = attribution?.querySelector<HTMLElement>(
      '.maplibregl-ctrl-attrib-inner',
    )
    if (attributionContent?.textContent?.includes('OpenStreetMap')) {
      const odblLink = document.createElement('a')
      odblLink.href = 'https://openstreetmap.org/copyright'
      odblLink.textContent = 'OpenStreetMaps (ODbL)'
      attributionContent.replaceChildren(odblLink)
    }
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
  if (!target || !groups) return
  applyVisibility(
    (id, visibility) => target.setLayoutProperty(id, 'visibility', visibility),
    groups,
    state,
  )
  applyLocale(
    (id, expression) => target.setLayoutProperty(id, 'text-field', expression),
    groups,
    state.locale,
  )
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
  controls.setState(state)
  syncUrl()
}

function fitCurrentBounds(duration = 250): void {
  if (!map) return
  if (!currentBounds) {
    showWarning('This tileset has no valid bounds; the current camera was retained.')
    return
  }
  map.fitBounds(currentBounds, {
    padding: { top: 88, right: 32, bottom: 32, left: 32 },
    duration,
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
    maxZoom: tilejson.maxZoom,
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
  target.on('error', event => recordError(`${release}: ${errorMessage(event.error)}`))
  target.on('sourcedataloading', event => {
    if (event.sourceId === BASEMAP_SOURCE_ID) {
      diagnostics.tileRequests += 1
      publishDiagnostics()
    }
  })
  target.on('sourcedata', event => {
    if (event.sourceId !== BASEMAP_SOURCE_ID || !event.resourceTiming?.length) return
    const latest = event.resourceTiming.at(-1)
    if (!latest) return
    diagnostics.lastTileDurationMs = Math.round(latest.duration)
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
