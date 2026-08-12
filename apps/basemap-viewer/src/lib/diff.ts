import type { Feature, FeatureCollection, Geometry } from 'geojson'

export type DiffStatus = 'added' | 'removed'

export interface DiffInputFeature {
  id: number | string | undefined
  sourceLayer: string
  geometry: Geometry
  properties: Record<string, unknown> | null
  label?: string
}

export interface DiffLabelChange {
  status: DiffStatus
  label: string
  sourceLayer: string
  featureId: number | string | undefined
  centre: [number, number] | null
}

export interface DiffSummary {
  added: number
  removed: number
  labelChanges: DiffLabelChange[]
}

export type DiffFeature = Feature<
  Geometry,
  {
    diffStatus: DiffStatus
    diffGeometry: 'point' | 'line' | 'area'
    sourceLayer: string
    diffLabel: string
  }
>

export type DiffFeatureCollection = FeatureCollection<
  Geometry,
  DiffFeature['properties']
>

interface LabelEntry {
  feature: DiffInputFeature
  label: string
  sourceLayer: string
}

function geometryKind(geometry: Geometry): 'point' | 'line' | 'area' {
  if (geometry.type === 'Point' || geometry.type === 'MultiPoint') return 'point'
  if (geometry.type === 'LineString' || geometry.type === 'MultiLineString')
    return 'line'
  return 'area'
}

function labelKey(sourceLayer: string, label: string): string {
  return `${sourceLayer}\u0000${label}`
}

function geometryCentre(geometry: Geometry): [number, number] | null {
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
    } else visitCoordinates(value.coordinates)
  }
  visitGeometry(geometry)
  return Number.isFinite(bounds[0])
    ? [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
    : null
}

function labelledFeatures(
  features: readonly DiffInputFeature[],
): Map<string, LabelEntry> {
  const labels = new Map<string, LabelEntry>()
  for (const feature of features) {
    const label = feature.label?.trim()
    if (!label) continue
    const entry = { feature, label, sourceLayer: feature.sourceLayer }
    const key = labelKey(entry.sourceLayer, entry.label)
    if (!labels.has(key)) labels.set(key, entry)
  }
  return labels
}

function outputFeature(entry: LabelEntry, status: DiffStatus): DiffFeature {
  return {
    type: 'Feature',
    id: entry.feature.id,
    // Geometry is retained only as the anchor for MapLibre's text placement.
    // It is never rendered as a diff fill or line.
    geometry: entry.feature.geometry,
    properties: {
      diffStatus: status,
      diffGeometry: geometryKind(entry.feature.geometry),
      sourceLayer: entry.sourceLayer,
      diffLabel: entry.label,
    },
  }
}

function compareEntries(left: LabelEntry, right: LabelEntry): number {
  return (
    left.label.localeCompare(right.label) ||
    left.sourceLayer.localeCompare(right.sourceLayer)
  )
}

/**
 * Compares the oldest release against the newest release. Geometry, feature
 * IDs, and coverage properties are deliberately ignored so that a relocated
 * or reshaped feature is not shown as a map difference.
 */
export function buildDiff(
  oldestFeatures: readonly DiffInputFeature[],
  newestFeatures: readonly DiffInputFeature[],
): { data: DiffFeatureCollection; summary: DiffSummary } {
  const oldestLabels = labelledFeatures(oldestFeatures)
  const newestLabels = labelledFeatures(newestFeatures)
  const added = [...newestLabels.entries()]
    .filter(([key]) => !oldestLabels.has(key))
    .map(([, entry]) => entry)
    .sort(compareEntries)
  const removed = [...oldestLabels.entries()]
    .filter(([key]) => !newestLabels.has(key))
    .map(([, entry]) => entry)
    .sort(compareEntries)
  const labelChanges = [
    ...added.map(entry => ({
      status: 'added' as const,
      label: entry.label,
      sourceLayer: entry.sourceLayer,
      featureId: entry.feature.id,
      centre: geometryCentre(entry.feature.geometry),
    })),
    ...removed.map(entry => ({
      status: 'removed' as const,
      label: entry.label,
      sourceLayer: entry.sourceLayer,
      featureId: entry.feature.id,
      centre: geometryCentre(entry.feature.geometry),
    })),
  ].sort(
    (left, right) =>
      left.label.localeCompare(right.label) ||
      left.sourceLayer.localeCompare(right.sourceLayer) ||
      left.status.localeCompare(right.status),
  )

  return {
    data: {
      type: 'FeatureCollection',
      features: [
        ...added.map(entry => outputFeature(entry, 'added')),
        ...removed.map(entry => outputFeature(entry, 'removed')),
      ],
    },
    summary: {
      added: added.length,
      removed: removed.length,
      labelChanges,
    },
  }
}
