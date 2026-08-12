import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { FilterSpecification } from '@maplibre/maplibre-gl-style-spec'
import type { Geometry } from 'geojson'
import type { AppState } from './types'
import { BASEMAP_SOURCE_ID } from './style'
import {
  buildDiff,
  type DiffFeatureCollection,
  type DiffInputFeature,
  type DiffLabelChange,
  type DiffSummary,
} from './diff'
import { isSameRelease, orderComparisonReleases } from './release-order'

const DIFF_SOURCE_ID = 'release-diff'
const DIFF_LAYER_PREFIX = 'release-diff'
const DIFF_STATUSES = ['added', 'removed'] as const

export type ViewportLabelDiffOptions = {
  getState: () => AppState
  getVersions: () => readonly string[]
  getPrimaryMap: () => MapLibreMap | null
  getComparisonMap: () => MapLibreMap | null
  onSummary: (summary: DiffSummary | null) => void
}

/** A deliberately viewport-scoped label diff, distinct from a release diff. */
export class ViewportLabelDiff {
  private readonly options: ViewportLabelDiffOptions

  constructor(options: ViewportLabelDiffOptions) {
    this.options = options
  }

  isLabelsMode(): boolean {
    const state = this.options.getState()
    return state.comparisonVersion !== null && state.comparisonMode === 'labels'
  }

  presentationMap(): MapLibreMap | null {
    const order = this.comparisonOrder()
    if (!order) return null
    return order.newest === 'primary'
      ? this.options.getPrimaryMap()
      : this.options.getComparisonMap()
  }

  refresh(primaryLayers: readonly string[], comparisonLayers: readonly string[]): void {
    if (!this.isLabelsMode()) return
    const primary = this.options.getPrimaryMap()
    const comparison = this.options.getComparisonMap()
    if (!primary || !comparison) return
    const comparisonVersion = this.options.getState().comparisonVersion
    if (!comparisonVersion) return
    if (
      isSameRelease(
        this.options.getState().version,
        comparisonVersion,
        this.options.getVersions(),
      )
    ) {
      this.clear(primary)
      this.clear(comparison)
      this.options.onSummary({ added: 0, removed: 0, labelChanges: [] })
      return
    }
    const order = this.comparisonOrder()
    if (!order) return
    const sourceLayers = [...new Set([...primaryLayers, ...comparisonLayers])]
    const oldestMap = order.oldest === 'primary' ? primary : comparison
    const newestMap = order.newest === 'primary' ? primary : comparison
    const result = buildDiff(
      this.queryFeatures(oldestMap, sourceLayers),
      this.queryFeatures(newestMap, sourceLayers),
    )
    this.clear(oldestMap)
    this.set(newestMap, result.data)
    this.options.onSummary(result.summary)
  }

  clearAll(): void {
    this.clear(this.options.getPrimaryMap())
    this.clear(this.options.getComparisonMap())
    this.options.onSummary(null)
  }

  clear(target: MapLibreMap | null): void {
    if (!target) return
    for (const status of DIFF_STATUSES) {
      for (const geometry of ['label-point', 'label-line']) {
        const layerId = `${DIFF_LAYER_PREFIX}-${status}-${geometry}`
        if (target.getLayer(layerId)) target.removeLayer(layerId)
      }
    }
    if (target.getSource(DIFF_SOURCE_ID)) target.removeSource(DIFF_SOURCE_ID)
  }

  applyVisibility(target: MapLibreMap | null): void {
    if (!target) return
    const state = this.options.getState()
    for (const status of DIFF_STATUSES) {
      const visibility = state.diffVisibility[status] ? 'visible' : 'none'
      for (const geometry of ['label-point', 'label-line']) {
        const layerId = `${DIFF_LAYER_PREFIX}-${status}-${geometry}`
        if (target.getLayer(layerId))
          target.setLayoutProperty(layerId, 'visibility', visibility)
      }
    }
  }

  flyTo(change: DiffLabelChange): void {
    const order = this.comparisonOrder()
    if (!order) return
    const primary = this.options.getPrimaryMap()
    const comparison = this.options.getComparisonMap()
    const source =
      change.status === 'added'
        ? order.newest === 'primary'
          ? primary
          : comparison
        : order.oldest === 'primary'
          ? primary
          : comparison
    const visibleMap = this.presentationMap()
    if (!source || !visibleMap) return
    if (!change.centre) return
    visibleMap.flyTo({
      center: change.centre,
      zoom: Math.max(visibleMap.getZoom(), 14),
      duration: 700,
      essential: true,
    })
  }

  private comparisonOrder() {
    const state = this.options.getState()
    if (!state.comparisonVersion) return null
    return orderComparisonReleases(
      state.version,
      state.comparisonVersion,
      this.options.getVersions(),
    )
  }

  private queryFeatures(
    target: MapLibreMap,
    sourceLayers: readonly string[],
  ): DiffInputFeature[] {
    return sourceLayers.flatMap(sourceLayer =>
      this.layerVisible(sourceLayer)
        ? target
            .querySourceFeatures(BASEMAP_SOURCE_ID, { sourceLayer })
            .map(feature => ({
              id: feature.id,
              sourceLayer,
              geometry: feature.geometry,
              properties: feature.properties,
              label: this.featureLabel(feature.properties),
            }))
            .filter(feature => geometryIntersectsViewport(feature.geometry, target))
        : [],
    )
  }

  private layerVisible(sourceLayer: string): boolean {
    const labels = this.options.getState().labels
    if (sourceLayer === 'roads') return labels.roads
    if (sourceLayer === 'pois') return labels.pois
    if (sourceLayer === 'places') return labels.places
    if (sourceLayer === 'water') return labels.water
    return true
  }

  private featureLabel(properties: Record<string, unknown> | null): string | undefined {
    if (!properties) return undefined
    const locale = this.options.getState().locale
    const localized = properties[`name:${locale}`]
    if (typeof localized === 'string' && localized.trim()) return localized
    const name = properties.name
    return typeof name === 'string' && name.trim() ? name : undefined
  }

  private set(target: MapLibreMap, data: DiffFeatureCollection): void {
    const existingSource = target.getSource(DIFF_SOURCE_ID)
    if (existingSource) {
      if (existingSource.type === 'geojson') {
        ;(existingSource as GeoJSONSource).setData(data)
        this.applyVisibility(target)
      }
      return
    }
    target.addSource(DIFF_SOURCE_ID, { type: 'geojson', data })
    const labelColours = { added: '#16a34a', removed: '#dc2626' }
    const labelHalo = '#ffffff'
    const state = this.options.getState()
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
  if (geometry.type === 'GeometryCollection') {
    for (const nested of geometry.geometries) {
      const nestedBounds = geometryBounds(nested)
      if (!nestedBounds) continue
      bounds[0] = Math.min(bounds[0], nestedBounds[0])
      bounds[1] = Math.min(bounds[1], nestedBounds[1])
      bounds[2] = Math.max(bounds[2], nestedBounds[2])
      bounds[3] = Math.max(bounds[3], nestedBounds[3])
    }
  } else visitCoordinates(geometry.coordinates)
  return Number.isFinite(bounds[0]) ? bounds : null
}
