export interface Tilejson {
  bounds: [number, number, number, number] | null
  boundary: string | null
  insideRegionLabels: boolean
  minZoom: number | null
  maxZoom: number | null
  vectorLayers: string[]
}

function zoom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function vectorLayers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(layer => {
    if (typeof layer !== 'object' || layer === null) return []
    const id = (layer as Record<string, unknown>).id
    return typeof id === 'string' ? [id] : []
  })
}

function isValidBounds(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate),
    ) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[2] >= -180 &&
    value[2] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90 &&
    value[3] >= -90 &&
    value[3] <= 90 &&
    value[0] < value[2] &&
    value[1] < value[3]
  )
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function parseTilejson(value: unknown): Tilejson {
  if (typeof value !== 'object' || value === null)
    throw new Error('The TileJSON document is invalid.')
  const document = value as Record<string, unknown>
  const bounds = document.bounds
  return {
    bounds: isValidBounds(bounds) ? bounds : null,
    boundary: isHttpUrl(document['saanseoi:boundary'])
      ? document['saanseoi:boundary']
      : null,
    insideRegionLabels: document['saanseoi:label-filter'] === 'inside-region',
    minZoom: zoom(document.minzoom),
    maxZoom: zoom(document.maxzoom),
    vectorLayers: vectorLayers(document.vector_layers),
  }
}

/** Label-filtered tiles depend on the release's boundary artefact. */
export function canUseFilteredLabels(
  labelClippingEnabled: boolean,
  filteredTilejson: unknown,
  hasBoundary: boolean,
): boolean {
  return (
    labelClippingEnabled &&
    hasBoundary &&
    filteredTilejson !== null &&
    parseTilejson(filteredTilejson).insideRegionLabels
  )
}
