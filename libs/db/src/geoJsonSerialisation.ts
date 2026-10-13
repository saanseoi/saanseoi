import { sourceAttributionFieldOrder } from './sourceAttribution'

const coordinateTypes = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
])

/** Presentation order only: coordinates, bounds and foreign members are preserved. */
function orderedGeometry(_key: string, value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const object = value as Record<string, unknown>
  if (typeof object.publisherCode === 'string' && typeof object.dataset === 'string') {
    const keys: readonly string[] = sourceAttributionFieldOrder
    return Object.fromEntries([
      ...keys.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]),
      ...Object.entries(object).filter(([key]) => !keys.includes(key)),
    ])
  }
  const member =
    object.type === 'GeometryCollection'
      ? 'geometries'
      : typeof object.type === 'string' && coordinateTypes.has(object.type)
        ? 'coordinates'
        : null
  if (!member || !Object.hasOwn(object, member)) return value
  const keys = ['type', 'bbox', member]
  return Object.fromEntries([
    ...keys.filter(key => Object.hasOwn(object, key)).map(key => [key, object[key]]),
    ...Object.entries(object).filter(([key]) => !keys.includes(key)),
  ])
}

/** Orders nested geometries and canonical attribution in prepared and stored records. */
export function stringifyGeoJson(value: unknown): string {
  return JSON.stringify(value, orderedGeometry)
}

/** SQL staging can supply JSON that has already been serialised. */
export function orderGeoJsonText(value: string): string {
  if (
    !/^\s*[[{]/.test(value) ||
    !/"(?:coordinates|geometries|publisherCode)"\s*:/.test(value)
  )
    return value
  try {
    return stringifyGeoJson(JSON.parse(value))
  } catch {
    return value
  }
}
