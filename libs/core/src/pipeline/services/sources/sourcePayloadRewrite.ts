import { retainSourceProperties } from './retainedProperties'
import { overtureSourcePayload } from './sourcePayload'

export const overtureSourceTables = [
  'overturePlaces',
  'overtureDivisions',
  'overtureDivisionAreas',
  'overtureDivisionBoundaries',
] as const

export function isSupplementalDivisionPayload(raw: Record<string, unknown>) {
  const fixture = raw.fixture as { code?: unknown } | undefined
  const identifiers = raw.identifiers as { saanseoiCorrection?: unknown } | undefined
  return (
    fixture?.code === 'overture-hk-prc-country-anchor' ||
    identifiers?.saanseoiCorrection !== undefined
  )
}

/** Lossless storage relocation. ALS prepared rows require upstream replay instead. */
export function rewriteOvertureSourcePayload(row: {
  sourceRecordId: string
  properties: Record<string, unknown>
  sourceGeometry: unknown
  sources: unknown
}) {
  const raw = row.properties
  if (isSupplementalDivisionPayload(raw))
    throw new Error(
      `Supplemental division requires upstream replay: ${row.sourceRecordId}`,
    )
  if (
    !['id', 'geometry'].some(key => Object.hasOwn(raw, key)) &&
    row.sources == null &&
    JSON.stringify(raw) === JSON.stringify(retainSourceProperties(raw))
  )
    return null
  if (Object.hasOwn(raw, 'id') && raw.id !== row.sourceRecordId) {
    throw new Error(`Publisher/source identity mismatch for ${row.sourceRecordId}`)
  }
  for (const [key, sibling] of [
    ['geometry', row.sourceGeometry],
    ['sources', row.sources],
  ] as const) {
    const comparable =
      key === 'sources' &&
      sibling &&
      typeof sibling === 'object' &&
      !Array.isArray(sibling) &&
      Object.keys(sibling).length === 1 &&
      Object.hasOwn(sibling, 'overture')
        ? (sibling as { overture: unknown }).overture
        : sibling
    if (
      Object.hasOwn(raw, key) &&
      sibling != null &&
      JSON.stringify(raw[key]) !== JSON.stringify(comparable)
    ) {
      throw new Error(`Conflicting retained ${key} for ${row.sourceRecordId}`)
    }
  }
  const attribution =
    row.sources &&
    typeof row.sources === 'object' &&
    !Array.isArray(row.sources) &&
    Object.keys(row.sources).length === 1 &&
    Object.hasOwn(row.sources, 'overture')
      ? (row.sources as { overture: unknown }).overture
      : row.sources
  return overtureSourcePayload({
    ...raw,
    geometry: raw.geometry ?? row.sourceGeometry,
    ...(Object.hasOwn(raw, 'sources')
      ? { sources: raw.sources }
      : attribution == null
        ? {}
        : { sources: attribution }),
  })
}
