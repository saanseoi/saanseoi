import * as maplibregl from 'maplibre-gl'
import type {
  Map as MapLibreMap,
  MapSourceDataEvent,
  VectorTileSource,
} from 'maplibre-gl'
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { BASEMAP_ATTRIBUTION } from '@repo/basemap'
import type { CameraState, Theme } from './types'
import {
  BASEMAP_SOURCE_ID,
  createPostcardStyle,
  createStyle,
  firstTextSymbolLayerId,
  postcardPalette,
  type LayerGroups,
} from './style'
import { outsideBoundaryMask, type RegionBoundary } from './boundaries'

maplibregl.setWorkerUrl(maplibreWorkerUrl)

const BOUNDARY_MASK_SOURCE_ID = 'region-boundary-mask'
const BOUNDARY_MASK_LAYER_ID = 'region-boundary-mask-fill'
const BOUNDARY_SOURCE_ID = 'region-boundary'
const BOUNDARY_LAYER_ID = 'region-boundary-line'
const MAX_VIEWER_ZOOM = 22
const MAX_TILE_CACHE_ZOOM_LEVELS = 10
const STYLE_LOAD_TIMEOUT_MS = 15_000

const attributionControls = new Set<HTMLElement>()

export type MapControllerRole = 'primary' | 'comparison'

export type MapControllerOptions = {
  role: MapControllerRole
  container: string
  headless: boolean
  postcardRendering: boolean
  getTheme: () => Theme
  getRegionCode: () => string | null
  createStyle: (tilejsonUrl: string) => {
    style: StyleSpecification
    groups: LayerGroups
  }
  applyState: (target: MapLibreMap, groups: LayerGroups) => void
  installDiagnostics: (target: MapLibreMap, role: MapControllerRole) => void
  resetTileWeight: (role: MapControllerRole) => void
  onCreated?: (target: MapLibreMap) => void
  onDisposed?: () => void
  onMove?: (target: MapLibreMap) => void
  onMoveEnd?: (target: MapLibreMap) => void
}

export type MapControllerCreateOptions = {
  camera: CameraState | null
  boundary: RegionBoundary | null
  waitForContainer?: boolean
  signal?: AbortSignal
}

export class MapController {
  private target: MapLibreMap | null = null
  private currentGroups: LayerGroups | null = null
  private currentBoundary: RegionBoundary | null = null
  private readonly options: MapControllerOptions

  constructor(options: MapControllerOptions) {
    this.options = options
  }

  get map(): MapLibreMap | null {
    return this.target
  }

  get groups(): LayerGroups | null {
    return this.currentGroups
  }

  get boundary(): RegionBoundary | null {
    return this.currentBoundary
  }

  async create(
    tilejsonUrl: string,
    options: MapControllerCreateOptions,
  ): Promise<MapLibreMap> {
    this.options.resetTileWeight(this.options.role)
    if (options.waitForContainer)
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))

    const generated = this.options.createStyle(tilejsonUrl)
    this.currentGroups = generated.groups
    this.currentBoundary = options.boundary
    const camera = options.camera
    const createdMap = new maplibregl.Map({
      container: this.options.container,
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
    this.target = createdMap
    this.options.onCreated?.(createdMap)
    if (!this.options.headless) {
      createdMap.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-right',
      )
      createdMap.addControl(
        new maplibregl.NavigationControl({ showCompass: true }),
        'bottom-right',
      )
    }
    createdMap.on('move', () => this.options.onMove?.(createdMap))
    createdMap.on('moveend', () => this.options.onMoveEnd?.(createdMap))
    this.options.installDiagnostics(createdMap, this.options.role)
    try {
      await this.waitForMapLoad(createdMap, 15_000, options.signal)
      if (!this.options.postcardRendering || this.options.role === 'comparison')
        await this.waitForSource(createdMap, BASEMAP_SOURCE_ID, 15_000, options.signal)
    } catch (error) {
      this.dispose()
      this.options.onDisposed?.()
      throw error
    }
    createdMap.resize()
    this.updateAttribution(createdMap, true)
    this.applyBoundary(createdMap, options.boundary)
    this.options.applyState(createdMap, generated.groups)
    return createdMap
  }

  async replaceSource(
    tilejsonUrl: string,
    boundary: RegionBoundary | null,
    signal?: AbortSignal,
  ): Promise<void> {
    const target = this.requireMap()
    this.options.resetTileWeight(this.options.role)
    const source = target.getSource(BASEMAP_SOURCE_ID)
    if (source?.type !== 'vector') throw new Error('The basemap source is unavailable.')
    ;(source as VectorTileSource).setUrl(tilejsonUrl)
    await this.waitForSource(target, BASEMAP_SOURCE_ID, 15_000, signal)
    this.currentBoundary = boundary
    this.updateAttribution(target)
    this.applyBoundary(target, boundary)
  }

  async replaceStyle(tilejsonUrl: string, signal?: AbortSignal): Promise<void> {
    const target = this.requireMap()
    this.options.resetTileWeight(this.options.role)
    const generated = this.options.createStyle(tilejsonUrl)
    this.currentGroups = generated.groups
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('Timed out while loading the map style.'))
      }, STYLE_LOAD_TIMEOUT_MS)
      const onLoad = () => {
        cleanup()
        resolve()
      }
      const onError = (event: { error?: unknown; sourceId?: string }) => {
        if (event.sourceId !== undefined) return
        cleanup()
        reject(event.error ?? new Error('Could not load the map style.'))
      }
      const onAbort = () => {
        cleanup()
        reject(
          signal?.reason ??
            new DOMException('The operation was aborted.', 'AbortError'),
        )
      }
      const cleanup = () => {
        window.clearTimeout(timeout)
        target.off('style.load', onLoad)
        target.off('error', onError)
        signal?.removeEventListener('abort', onAbort)
      }
      target.on('style.load', onLoad)
      target.on('error', onError)
      if (signal?.aborted) onAbort()
      else {
        signal?.addEventListener('abort', onAbort, { once: true })
        try {
          target.setStyle(generated.style)
        } catch (error) {
          cleanup()
          reject(error)
        }
      }
    })
    await this.waitForSource(target, BASEMAP_SOURCE_ID, 15_000, signal)
    this.updateAttribution(target)
    this.options.applyState(target, generated.groups)
    this.applyBoundary(target, this.currentBoundary)
  }

  applyState(): void {
    const target = this.requireMap()
    if (!this.currentGroups) return
    this.options.applyState(target, this.currentGroups)
  }

  syncFrom(source: MapLibreMap): void {
    const target = this.target
    if (!target) return
    target.jumpTo({
      center: source.getCenter(),
      zoom: source.getZoom(),
      bearing: source.getBearing(),
      pitch: source.getPitch(),
    })
  }

  dispose(): void {
    if (!this.target) return
    const attribution = this.target
      .getContainer()
      .querySelector<HTMLElement>('.maplibregl-ctrl-attrib')
    if (attribution) attributionControls.delete(attribution)
    this.target.remove()
    this.target = null
    this.currentGroups = null
    this.currentBoundary = null
  }

  private requireMap(): MapLibreMap {
    if (!this.target) throw new Error(`${this.options.role} map is unavailable.`)
    return this.target
  }

  private applyBoundary(target: MapLibreMap, boundary: RegionBoundary | null): void {
    for (const layerId of [BOUNDARY_LAYER_ID, BOUNDARY_MASK_LAYER_ID]) {
      if (target.getLayer(layerId)) target.removeLayer(layerId)
    }
    for (const sourceId of [BOUNDARY_SOURCE_ID, BOUNDARY_MASK_SOURCE_ID]) {
      if (target.getSource(sourceId)) target.removeSource(sourceId)
    }
    if (this.options.postcardRendering || !boundary) return

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
        paint: { 'fill-color': this.boundaryMaskColor() },
      },
      beforeLayerId,
    )
    target.addLayer(
      {
        id: BOUNDARY_LAYER_ID,
        type: 'line',
        source: BOUNDARY_SOURCE_ID,
        paint: {
          'line-color': this.boundaryLineColor(),
          'line-width': 1,
          'line-opacity': 0.65,
        },
      },
      beforeLayerId,
    )
  }

  private boundaryMaskColor(): string {
    if (this.options.postcardRendering) return '#F8F2E6'
    const theme = this.options.getTheme()
    if (theme === 'dark' || theme === 'black') return '#14181a'
    if (theme === 'midnight') return '#020617'
    return '#e7edf1'
  }

  private boundaryLineColor(): string {
    if (this.options.postcardRendering)
      return postcardPalette(this.options.getRegionCode()).accent
    const theme = this.options.getTheme()
    if (theme === 'dark' || theme === 'black') return '#536169'
    if (theme === 'midnight') return '#6beaf5'
    return '#82929a'
  }

  private updateAttribution(target: MapLibreMap, collapse = false): void {
    const source = target.getSource(BASEMAP_SOURCE_ID)
    if (source) source.attribution = BASEMAP_ATTRIBUTION

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
      openStreetMapLink.textContent = 'OpenStreetMap (ODbL)'
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

  private waitForMapLoad(
    target: MapLibreMap,
    timeoutMs = 15_000,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('Timed out while loading the map style.'))
      }, timeoutMs)
      const onLoad = () => {
        cleanup()
        resolve()
      }
      const cleanup = () => {
        window.clearTimeout(timeout)
        target.off('load', onLoad)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        cleanup()
        reject(
          signal?.reason ??
            new DOMException('The operation was aborted.', 'AbortError'),
        )
      }
      target.once('load', onLoad)
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  waitForSource(
    target: MapLibreMap,
    sourceId: string,
    timeoutMs = 15_000,
    signal?: AbortSignal,
  ): Promise<void> {
    if (target.isSourceLoaded(sourceId) && !signal?.aborted) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup()
        reject(new Error('Timed out while loading map tiles.'))
      }, timeoutMs)
      const onData = (event: MapSourceDataEvent) => {
        if (event.sourceId === sourceId && target.isSourceLoaded(sourceId)) {
          cleanup()
          resolve()
        }
      }
      const cleanup = () => {
        window.clearTimeout(timeout)
        target.off('sourcedata', onData)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        cleanup()
        reject(
          signal?.reason ??
            new DOMException('The operation was aborted.', 'AbortError'),
        )
      }
      target.on('sourcedata', onData)
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export function createDefaultMapStyle(
  tilejsonUrl: string,
  regionCode: string | null,
  glyphUrl: string | undefined,
  theme: Theme,
  postcardRendering: boolean,
  postcardIlluminated: boolean,
) {
  return postcardRendering
    ? createPostcardStyle(tilejsonUrl, regionCode, glyphUrl, postcardIlluminated)
    : createStyle(tilejsonUrl, glyphUrl, theme)
}

export function closeAttributionControls(event: PointerEvent): void {
  for (const attribution of attributionControls) {
    if (!attribution.isConnected) {
      attributionControls.delete(attribution)
      continue
    }
    if (attribution.contains(event.target as Node)) continue
    attribution.classList.remove('maplibregl-compact-show')
    attribution.removeAttribute('open')
  }
}
