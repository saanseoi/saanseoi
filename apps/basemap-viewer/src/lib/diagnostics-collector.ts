import type { Map as MapLibreMap, MapSourceDataEvent } from 'maplibre-gl'
import { BASEMAP_SOURCE_ID } from './style'
import {
  defaultDiagnostics,
  emptyReleaseDiagnostic,
  type FeatureDiagnostic,
  type ReleaseDiagnostic,
  type ViewerDiagnostics,
} from '../diagnostics'
import {
  createTileWeightCollection,
  knownTimingBytes,
  knownTimingDuration,
  type BasemapTileSource,
} from './tile-weight'

export type DiagnosticRelease = 'primary' | 'comparison'

export type DiagnosticEvent =
  | { type: 'mapError'; message: string; release: DiagnosticRelease; sourceId?: string }
  | {
      type: 'tileRequested'
      release: DiagnosticRelease
      sourceId: string
      key?: string
    }
  | {
      type: 'tileLoaded'
      release: DiagnosticRelease
      sourceId: string
      key?: string
      resourceTimings: readonly PerformanceResourceTiming[]
      tileTimings: readonly PerformanceResourceTiming[]
    }
  | { type: 'featureInspected'; feature: FeatureDiagnostic }

type ChangeListener = (diagnostics: ViewerDiagnostics) => void

export class DiagnosticsCollector {
  private readonly value: ViewerDiagnostics = defaultDiagnostics()
  private readonly tileLoadStartedAt = new Map<string, number>()
  private readonly tileWeightCollections = {
    primary: createTileWeightCollection(),
    comparison: createTileWeightCollection(),
  }
  private readonly onChange: ChangeListener
  private publishScheduled = false

  constructor(onChange: ChangeListener) {
    this.onChange = onChange
  }

  get snapshot(): ViewerDiagnostics {
    return cloneDiagnostics(this.value)
  }

  setOpen(open: boolean): void {
    this.value.open = open
    this.publish()
  }

  setInspect(enabled: boolean): void {
    this.value.inspect = enabled
    if (!enabled) this.value.feature = null
    this.publish()
  }

  setDebug(key: keyof ViewerDiagnostics['debug'], enabled: boolean): void {
    this.value.debug[key] = enabled
    this.publish()
  }

  setLatestVersion(version: string | null): void {
    this.value.latestVersion = version
    this.publish()
  }

  setRelease(target: DiagnosticRelease, release: ReleaseDiagnostic): void {
    this.value[target] = release
    this.publish()
  }

  clearRelease(target: DiagnosticRelease): void {
    if (target === 'primary') this.value.primary = emptyReleaseDiagnostic()
    else this.value.comparison = null
    this.resetTileWeight(target, false)
    this.publish()
  }

  resetTileWeight(target: DiagnosticRelease, publish = true): void {
    this.tileWeightCollections[target].reset()
    if (target === 'primary')
      this.value.tileWeight.primary = this.tileWeightCollections.primary.summary()
    else this.value.tileWeight.comparison = null
    for (const key of this.tileLoadStartedAt.keys()) {
      if (key.startsWith(`${target}:`)) this.tileLoadStartedAt.delete(key)
    }
    if (publish) this.publish()
  }

  recordError(error: string): void {
    this.appendError(error)
    this.publish()
  }

  record(event: DiagnosticEvent): void {
    if (event.type === 'mapError') {
      this.appendError(event.message)
      if (this.basemapSource(event.sourceId)) {
        this.value.tileFailures += 1
        this.tileWeightCollections[event.release].recordFailure()
        this.updateTileWeight(event.release)
        this.publish(true)
      } else {
        this.publish()
      }
      return
    }
    if (event.type === 'tileRequested') {
      this.value.tileRequests += 1
      this.tileWeightCollections[event.release].recordRequest()
      this.updateTileWeight(event.release)
      const key = this.tileKey(event.release, event.sourceId, event.key)
      if (key) this.tileLoadStartedAt.set(key, performance.now())
      this.publish(true)
      return
    }
    if (event.type === 'tileLoaded') {
      const key = this.tileKey(event.release, event.sourceId, event.key)
      const startedAt = key ? this.tileLoadStartedAt.get(key) : undefined
      if (key) this.tileLoadStartedAt.delete(key)
      let observedDuration: number | null = null
      for (const timing of [...event.resourceTimings, ...event.tileTimings]) {
        const duration = knownTimingDuration(timing.duration)
        if (duration !== null)
          observedDuration = Math.max(observedDuration ?? 0, duration)
        this.tileWeightCollections[event.release].add({
          identity: `${event.release}:${event.sourceId}:${timing.name}:${timing.startTime}`,
          source: BASEMAP_SOURCE_ID,
          tile: event.key ?? null,
          url: timing.name,
          durationMs: duration,
          transferBytes: knownTimingBytes(timing.transferSize),
          encodedBodyBytes: knownTimingBytes(timing.encodedBodySize),
          decodedBodyBytes: knownTimingBytes(timing.decodedBodySize),
        })
      }
      this.updateTileWeight(event.release)
      const duration =
        observedDuration ??
        (startedAt !== undefined ? performance.now() - startedAt : null)
      if (duration !== null) this.value.lastTileDurationMs = Math.round(duration)
      this.publish(true)
      return
    }
    this.value.feature = event.feature
    this.publish()
  }

  install(target: MapLibreMap, release: DiagnosticRelease): void {
    target.showTileBoundaries = this.value.debug.tiles
    target.showCollisionBoxes = this.value.debug.collisions
    target.showOverdrawInspector = this.value.debug.overdraw
    target.getCanvas().classList.toggle('is-inspecting', this.value.inspect)
    target.on('dragstart', () => target.getCanvas().classList.add('is-dragging'))
    target.on('dragend', () => target.getCanvas().classList.remove('is-dragging'))
    target.on('error', event => {
      const sourceId = (event as { sourceId?: string }).sourceId
      this.record({
        type: 'mapError',
        message: `${release}: ${errorMessage(event.error)}`,
        release,
        sourceId,
      })
    })
    target.on('sourcedataloading', event => {
      if (!this.basemapSource(event.sourceId)) return
      this.record({
        type: 'tileRequested',
        release,
        sourceId: event.sourceId,
        key: event.coord?.key,
      })
    })
    target.on('sourcedata', (event: MapSourceDataEvent) => {
      if (!this.basemapSource(event.sourceId)) return
      if (!event.tile) return
      const tileTimings = (
        event.tile as { resourceTiming?: PerformanceResourceTiming[] }
      )?.resourceTiming
      this.record({
        type: 'tileLoaded',
        release,
        sourceId: event.sourceId,
        key: event.coord?.key,
        resourceTimings: event.resourceTiming ?? [],
        tileTimings: tileTimings ?? [],
      })
    })
    target.on('click', event => {
      if (!this.value.inspect) return
      const layers = target.queryRenderedFeatures(event.point).slice(0, 12)
      this.record({
        type: 'featureInspected',
        feature: {
          release,
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          zoom: target.getZoom(),
          layers: layers.map(layer => ({
            id: layer.layer.id,
            sourceLayer: layer.sourceLayer,
            properties: layer.properties,
          })),
        },
      })
    })
  }

  private updateTileWeight(release: DiagnosticRelease): void {
    this.value.tileWeight[release] = this.tileWeightCollections[release].summary()
  }

  private appendError(error: string): void {
    this.value.errors = [...this.value.errors, error].slice(-8)
  }

  private basemapSource(sourceId: string | undefined): BasemapTileSource | null {
    return sourceId === BASEMAP_SOURCE_ID ? BASEMAP_SOURCE_ID : null
  }

  private tileKey(
    release: DiagnosticRelease,
    sourceId: string | undefined,
    key: string | undefined,
  ): string | null {
    return sourceId && key ? `${release}:${sourceId}:${key}` : null
  }

  private publish(defer = false): void {
    if (defer) {
      if (this.publishScheduled) return
      this.publishScheduled = true
      const publish = () => {
        if (!this.publishScheduled) return
        this.publishScheduled = false
        this.onChange(this.snapshot)
      }
      if (typeof window !== 'undefined' && window.requestAnimationFrame)
        window.requestAnimationFrame(publish)
      else queueMicrotask(publish)
      return
    }
    this.publishScheduled = false
    this.onChange(this.snapshot)
  }
}

function cloneDiagnostics(value: ViewerDiagnostics): ViewerDiagnostics {
  return {
    ...value,
    debug: { ...value.debug },
    errors: [...value.errors],
    primary: { ...value.primary },
    comparison: value.comparison ? { ...value.comparison } : null,
    tileWeight: {
      primary: { ...value.tileWeight.primary },
      comparison: value.tileWeight.comparison
        ? { ...value.tileWeight.comparison }
        : null,
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
