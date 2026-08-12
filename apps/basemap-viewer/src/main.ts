import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { AppState, CameraState } from './lib/types'
import type { Region } from './lib/catalogue'
import { AppContext } from './lib/ctx/app'
import {
  BASEMAP_SOURCE_ID,
  applyLocale,
  applyVisibility,
  type LayerGroups,
} from './lib/style'
import { boundaryBounds, type RegionBoundary } from './lib/boundaries'
import type { Tilejson } from './lib/tilejson'
import { readUrlState, writeUrlState } from './lib/url-state'
import type { DiffStatus } from './lib/diff'
import type { ReleaseMetadata } from './lib/release-metadata'
import { emptyReleaseDiagnostic, type ReleaseDiagnostic } from './diagnostics'
import {
  closeAttributionControls,
  createDefaultMapStyle,
  MapController,
} from './lib/map-controller'
import { LatestLoad, type LoadOperation } from './lib/load-operation'
import { reduceViewerState, type ViewerAction } from './lib/viewer-state'
import { ReleaseRepository } from './lib/release-repository'
import { DiagnosticsCollector } from './lib/diagnostics-collector'
import { createRenderingMode } from './lib/rendering-mode'
import { installSplitTouchBridge } from './lib/split-touch-bridge'
import { ViewportLabelDiff } from './lib/viewport-label-diff'
import './styles.css'

const TILE_ORIGIN = import.meta.env.VITE_TILE_ORIGIN ?? 'https://tiles.saanseoi.hk'
const GLYPH_URL = import.meta.env.VITE_GLYPH_URL
const renderingMode = createRenderingMode(window.location.search)
const HEADLESS_MODE = renderingMode.headless
const POSTCARD_RENDERING = renderingMode.postcard
const POSTCARD_ILLUMINATED = renderingMode.illuminated

const DEFAULT_REGION_CODE = 'hk'
const MAX_VIEWER_ZOOM = 22
const REGION_RELEASE_PREFETCH_CONCURRENCY = 3
const repository = new ReleaseRepository(TILE_ORIGIN)

const preferredTheme: AppState['theme'] = window.matchMedia(
  '(prefers-color-scheme: light)',
).matches
  ? 'light'
  : 'midnight'
const preferredLocale: AppState['locale'] = resolvePreferredLocale(navigator.languages)
let state: AppState = readUrlState(
  window.location.search,
  preferredTheme,
  preferredLocale,
)
let regions: Region[] = []
let versions: string[] = []
let releaseMetadata: ReleaseMetadata[] = []
let currentBounds: Tilejson['bounds'] = null
let map: MapLibreMap | null = null
let comparisonMap: MapLibreMap | null = null
let comparisonController: MapController | null = null
let groups: LayerGroups | null = null
let currentTilejsonUrl: string | null = null
let currentBoundary: RegionBoundary | null = null
let primaryVectorLayers: string[] = []
let comparisonVectorLayers: string[] = []
let comparisonGroups: LayerGroups | null = null
const primaryLoad = new LatestLoad()
const comparisonLoad = new LatestLoad()
let synchronisingComparison = false
let diffRefreshTimer: number | null = null
let diagnosticsCollector!: DiagnosticsCollector
let viewportLabelDiff!: ViewportLabelDiff

const primaryController = new MapController({
  role: 'primary',
  container: 'map',
  headless: HEADLESS_MODE,
  postcardRendering: POSTCARD_RENDERING,
  getTheme: () => state.theme,
  getRegionCode: () => state.regionCode,
  createStyle: tilejsonUrl =>
    createDefaultMapStyle(
      tilejsonUrl,
      state.regionCode,
      GLYPH_URL,
      state.theme,
      POSTCARD_RENDERING,
      POSTCARD_ILLUMINATED,
    ),
  applyState: (target, targetGroups) => applyMapState(target, targetGroups),
  installDiagnostics,
  resetTileWeight,
  onCreated: target => {
    map = target
  },
  onDisposed: () => {
    map = null
    groups = null
  },
  onMove: target => syncComparison(target, comparisonMap),
  onMoveEnd: () => {
    syncUrl()
    scheduleDiffRefresh()
  },
})

document.addEventListener('pointerdown', closeAttributionControls)

function resolvePreferredLocale(languages: readonly string[]): AppState['locale'] {
  const locale = languages[0]?.toLowerCase() ?? 'en'
  if (locale.startsWith('zh-hant') || /(^|-)zh-(hk|mo|tw)(-|$)/.test(locale))
    return 'zh-Hant'
  if (locale.startsWith('zh-hans') || /(^|-)zh-(cn|sg)(-|$)/.test(locale))
    return 'zh-Hans'
  return 'en'
}

function dispatch(action: ViewerAction, sync = false): void {
  state = reduceViewerState(state, action)
  controls.setState(state)
  if (sync) syncUrl()
}

const controls = new AppContext(
  requiredElement('app'),
  {
    onRegion: code => void changeRegion(code),
    onVersion: version => void changeVersion(version),
    onComparisonVersion: version => void changeComparisonVersion(version),
    onComparisonMode: mode => changeComparisonMode(mode),
    onDiffVisibility: (status, enabled) => changeDiffVisibility(status, enabled),
    onDiffLabel: change => viewportLabelDiff.flyTo(change),
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

diagnosticsCollector = new DiagnosticsCollector(diagnostics =>
  controls.setDiagnostics(diagnostics),
)
diagnosticsCollector.setOpen(state.diagnosticsOpen)
viewportLabelDiff = new ViewportLabelDiff({
  getState: () => state,
  getVersions: () => versions,
  getPrimaryMap: () => map,
  getComparisonMap: () => comparisonMap,
  onSummary: summary => controls.setDiffSummary(summary),
})
installSplitTouchBridge({
  canBridge: canBridgeSplitTouch,
  getPrimaryMap: () => map,
  getComparisonMap: () => comparisonMap,
  getCamera: mapCamera,
  maxZoom: MAX_VIEWER_ZOOM,
})

void start()

async function start(): Promise<void> {
  controls.setEnabled(false)
  try {
    const catalogue = await repository.getCatalogue()
    regions = catalogue.regions
    const selected =
      regions.find(region => region.code === state.regionCode) ??
      regions.find(region => region.code === DEFAULT_REGION_CODE) ??
      regions[0]
    if (!selected) throw new Error('The regions catalogue has no regions.')
    await repository.getReleases(selected)
    void preloadRegionReleases(regions.filter(region => region.code !== selected.code))
    dispatch({ type: 'setRegion', regionCode: selected.code })
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
  let nextRegionIndex = 0
  const workers = Array.from(
    {
      length: Math.min(REGION_RELEASE_PREFETCH_CONCURRENCY, catalogue.length),
    },
    async () => {
      while (nextRegionIndex < catalogue.length) {
        const region = catalogue[nextRegionIndex++]
        if (!region) break
        try {
          await preloadRegionRelease(region)
        } catch (error) {
          console.warn(`Could not prefetch ${region.description} versions.`, error)
        }
      }
    },
  )
  await Promise.allSettled(workers)
}

async function preloadRegionRelease(region: Region): Promise<void> {
  await repository.getReleases(region)
}

async function changeRegion(code: string): Promise<void> {
  const region = regions.find(candidate => candidate.code === code)
  if (!region || region.code === state.regionCode) return
  dispatch({ type: 'setRegion', regionCode: region.code }, true)
  await loadRegion(region, false, true)
}

async function loadRegion(
  region: Region,
  initial: boolean,
  fitWhenReady: boolean,
): Promise<void> {
  const operation = primaryLoad.begin()
  if (!repository.hasCachedReleases(region.code)) controls.setCatalogueReady(false)
  setStatus(`Loading ${region.description} versions…`)
  try {
    const published = await repository.getReleases(
      region,
      operation.abortController.signal,
    )
    if (!primaryLoad.isCurrent(operation)) return
    versions = published.versions
    releaseMetadata = published.releaseMetadata
    diagnosticsCollector.setLatestVersion(versions[0] ?? null)
    const selectedVersion =
      state.version !== 'latest' && !versions.includes(state.version)
        ? 'latest'
        : state.version
    const selectedComparisonVersion =
      state.comparisonVersion !== null &&
      state.comparisonVersion !== 'latest' &&
      !versions.includes(state.comparisonVersion)
        ? previousVersion(versions, selectedVersion)
        : state.comparisonVersion
    if (
      selectedVersion !== state.version ||
      selectedComparisonVersion !== state.comparisonVersion
    )
      dispatch({
        type: 'setReleaseSelection',
        version: selectedVersion,
        comparisonVersion: selectedComparisonVersion,
      })
    controls.setVersions(versions)
    controls.setCatalogueReady(true)
    controls.setState(state)
    await loadTileset(region, initial, fitWhenReady, operation)
  } catch (error) {
    if (isAbort(error) || !primaryLoad.isCurrent(operation)) return
    showError('Could not load versions for this region.', error)
    controls.setCatalogueReady(repository.hasCachedReleases(region.code))
    controls.setEnabled(map !== null)
  }
}

async function changeVersion(version: string): Promise<void> {
  if (version !== 'latest' && !versions.includes(version)) return
  if (version === state.version) return
  dispatch({ type: 'setVersion', version }, true)
  const region = currentRegion()
  if (region) await loadPrimaryTileset(region, false, false)
}

async function changeComparisonVersion(version: string | null): Promise<void> {
  if (version !== null && version !== 'latest' && !versions.includes(version)) return
  if (version === state.comparisonVersion) return
  const needsResize =
    state.comparisonMode === 'side-by-side' &&
    (state.comparisonVersion !== null || version !== null)
  dispatch({ type: 'setComparisonVersion', version }, true)
  viewportLabelDiff.clearAll()
  applyMapState()
  controls.setDiffSummary(null)
  if (needsResize) await resizeComparisonView()
  if (!version) {
    comparisonLoad.cancel()
    disposeComparisonMap()
    comparisonVectorLayers = []
    diagnosticsCollector.clearRelease('comparison')
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
  dispatch({ type: 'setComparisonMode', mode }, true)
  if (needsResize) void resizeComparisonView()
  applyMapState()
  applyMapState(comparisonMap)
  if (isLabelsMode()) scheduleDiffRefresh()
  else {
    viewportLabelDiff.clearAll()
    controls.setDiffSummary(null)
  }
}

function changeDiffVisibility(status: DiffStatus, enabled: boolean): void {
  dispatch({ type: 'setDiffVisibility', status, enabled })
  viewportLabelDiff.applyVisibility(map)
  viewportLabelDiff.applyVisibility(comparisonMap)
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
  operation: LoadOperation,
): Promise<void> {
  setStatus(`Loading ${region.description} · ${state.version}…`)
  try {
    const signal = operation.abortController.signal
    const release = await repository.getRelease(region, state.version, signal)
    const { url, tilejson, boundary } = release
    if (!primaryLoad.isCurrent(operation)) return
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
      await createMap(url, signal)
    } else {
      await primaryController.replaceSource(url, currentBoundary, signal)
    }
    if (!primaryLoad.isCurrent(operation) || !map || !groups) return
    applyMapState()
    viewportLabelDiff.clear(map)
    controls.setDiffSummary(null)
    if (comparisonMap && state.comparisonVersion) {
      disposeComparisonMap()
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
    if (HEADLESS_MODE && primaryLoad.isCurrent(operation)) await markHeadlessReady()
  } catch (error) {
    if (isAbort(error) || !primaryLoad.isCurrent(operation)) return
    showError('Could not load this tileset.', error)
    controls.setEnabled(map !== null)
    controls.setState(state)
  }
}

async function loadPrimaryTileset(
  region: Region,
  initial: boolean,
  fitWhenReady: boolean,
): Promise<void> {
  await loadTileset(region, initial, fitWhenReady, primaryLoad.begin())
}

async function loadComparison(region: Region, version: string): Promise<void> {
  const operation = comparisonLoad.begin()
  const signal = operation.abortController.signal
  try {
    const release = await repository.getRelease(region, version, signal)
    const { url, tilejson, boundary } = release
    if (!comparisonLoad.isCurrent(operation) || state.comparisonVersion !== version)
      return
    comparisonVectorLayers = tilejson.vectorLayers
    updateReleaseDiagnostic('comparison', region, version, url, tilejson, boundary)
    if (!comparisonMap) {
      await createComparisonMap(url, boundary, signal)
    } else {
      await comparisonController?.replaceSource(url, boundary, signal)
      comparisonGroups = comparisonController?.groups ?? comparisonGroups
      applyMapState(comparisonMap)
    }
    if (!comparisonLoad.isCurrent(operation) || state.comparisonVersion !== version)
      return
    scheduleDiffRefresh()
  } catch (error) {
    if (isAbort(error) || !comparisonLoad.isCurrent(operation)) return
    showError('Could not load the comparison release.', error)
  }
}

async function createMap(tilejsonUrl: string, signal?: AbortSignal): Promise<void> {
  try {
    map = await primaryController.create(tilejsonUrl, {
      camera: state.camera,
      boundary: currentBoundary,
      signal,
    })
    groups = primaryController.groups
  } catch (error) {
    map = null
    groups = null
    throw error
  }
}

async function createComparisonMap(
  tilejsonUrl: string,
  boundary: RegionBoundary | null,
  signal?: AbortSignal,
): Promise<void> {
  if (!comparisonController) {
    comparisonController = new MapController({
      role: 'comparison',
      container: 'comparison-map',
      headless: HEADLESS_MODE,
      postcardRendering: POSTCARD_RENDERING,
      getTheme: () => state.theme,
      getRegionCode: () => state.regionCode,
      createStyle: url =>
        createDefaultMapStyle(
          url,
          state.regionCode,
          GLYPH_URL,
          state.theme,
          POSTCARD_RENDERING,
          POSTCARD_ILLUMINATED,
        ),
      applyState: (target, targetGroups) => applyMapState(target, targetGroups),
      installDiagnostics,
      resetTileWeight,
      onCreated: target => {
        comparisonMap = target
      },
      onDisposed: () => {
        comparisonMap = null
        comparisonGroups = null
      },
      onMove: target => syncComparison(target, map),
    })
  }
  comparisonMap = await comparisonController.create(tilejsonUrl, {
    camera: map ? mapCamera(map) : state.camera,
    boundary,
    waitForContainer: true,
    signal,
  })
  comparisonGroups = comparisonController.groups
  await resizeComparisonView()
}

function disposeComparisonMap(): void {
  comparisonController?.dispose()
  comparisonController = null
  comparisonMap = null
  comparisonGroups = null
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

function applyMapState(
  target: MapLibreMap | null = map,
  targetGroupsOverride?: LayerGroups,
): void {
  const targetGroups =
    targetGroupsOverride ?? (target === comparisonMap ? comparisonGroups : groups)
  if (!target || !targetGroups) return
  if (isLabelsMode() && target !== viewportLabelDiff.presentationMap()) {
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

function scheduleDiffRefresh(): void {
  if (!isLabelsMode()) return
  if (diffRefreshTimer !== null) window.clearTimeout(diffRefreshTimer)
  diffRefreshTimer = window.setTimeout(() => {
    diffRefreshTimer = null
    viewportLabelDiff.refresh(primaryVectorLayers, comparisonVectorLayers)
  }, 180)
}

function changeLocale(locale: AppState['locale']): void {
  dispatch({ type: 'setLocale', locale }, true)
  applyMapState()
  applyMapState(comparisonMap)
  scheduleDiffRefresh()
}

async function changeTheme(theme: AppState['theme']): Promise<void> {
  if (theme === state.theme) return
  dispatch({ type: 'setTheme', theme }, true)
  if (!map || !currentTilejsonUrl) return

  const operation = primaryLoad.begin()
  controls.setEnabled(false)
  setStatus(`Applying ${theme} theme…`)
  try {
    await primaryController.replaceStyle(
      currentTilejsonUrl,
      operation.abortController.signal,
    )
    if (!primaryLoad.isCurrent(operation)) return
    groups = primaryController.groups
    if (!map) return
    applyMapState()
    if (comparisonMap && state.comparisonVersion) {
      disposeComparisonMap()
      const region = currentRegion()
      if (region) await loadComparison(region, state.comparisonVersion)
    }
    controls.setEnabled(true)
    controls.setState(state)
  } catch (error) {
    if (isAbort(error) || !primaryLoad.isCurrent(operation)) return
    showError('Could not apply this basemap theme.', error)
    controls.setEnabled(true)
    controls.setState(state)
  }
}

function changeFeature(key: keyof AppState['features'], enabled: boolean): void {
  dispatch({ type: 'setFeature', key, enabled }, true)
  applyMapState()
  applyMapState(comparisonMap)
  scheduleDiffRefresh()
}

function changeLabel(key: keyof AppState['labels'], enabled: boolean): void {
  if (
    (key === 'roads' && !state.features.roads) ||
    (key === 'pois' && !state.features.pois)
  )
    return
  dispatch({ type: 'setLabel', key, enabled }, true)
  applyMapState()
  applyMapState(comparisonMap)
  scheduleDiffRefresh()
}

function fitCurrentBounds(duration = 250): void {
  if (!map) return
  const bounds = renderingMode.bounds(state.regionCode) ?? currentBounds
  if (!bounds) {
    showWarning('This tileset has no valid bounds; the current camera was retained.')
    return
  }
  const mobile =
    !HEADLESS_MODE && window.innerWidth <= (state.comparisonVersion ? 894 : 720)
  const padding = POSTCARD_RENDERING
    ? renderingMode.padding(state.regionCode)
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
  map.fitBounds(bounds, {
    bearing: renderingMode.bearing(state.regionCode),
    padding,
    duration,
  })
  const offset = renderingMode.offset(state.regionCode)
  if (offset[0] !== 0 || offset[1] !== 0) map.panBy(offset, { duration: 0 })
  const zoom = renderingMode.zoomAdjustment(state.regionCode)
  if (zoom !== 0) map.zoomTo(map.getZoom() + zoom, { duration: 0 })
  if (mobile && duration === 0)
    window.requestAnimationFrame(() => {
      map?.resize()
      fitVertically()
    })
}

async function markHeadlessReady(): Promise<void> {
  if (!map) return
  await renderingMode.waitUntilReady(map, () =>
    primaryController.waitForSource(map as MapLibreMap, BASEMAP_SOURCE_ID, 60_000),
  )
}

function currentRegion(): Region | undefined {
  return regions.find(region => region.code === state.regionCode)
}

function syncUrl(): void {
  if (map) dispatch({ type: 'setCamera', camera: mapCamera(map) })
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
  diagnosticsCollector.setRelease(target, release)
}

function recordError(error: string): void {
  diagnosticsCollector.recordError(error)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function installDiagnostics(
  target: MapLibreMap,
  release: 'primary' | 'comparison',
): void {
  diagnosticsCollector.install(target, release)
}

function resetTileWeight(release: 'primary' | 'comparison'): void {
  diagnosticsCollector.resetTileWeight(release)
}

function changeDiagnostics(open: boolean): void {
  diagnosticsCollector.setOpen(open)
  dispatch({ type: 'setDiagnosticsOpen', open }, true)
}

function changeInspect(enabled: boolean): void {
  diagnosticsCollector.setInspect(enabled)
  for (const target of [map, comparisonMap]) {
    target?.getCanvas().classList.toggle('is-inspecting', enabled)
  }
}

function changeDebug(key: 'tiles' | 'collisions' | 'overdraw', enabled: boolean): void {
  diagnosticsCollector.setDebug(key, enabled)
  for (const target of [map, comparisonMap]) {
    if (!target) continue
    if (key === 'tiles') target.showTileBoundaries = enabled
    if (key === 'collisions') target.showCollisionBoxes = enabled
    if (key === 'overdraw') target.showOverdrawInspector = enabled
  }
}

async function copyReport(): Promise<void> {
  const diagnostics = diagnosticsCollector.snapshot
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
