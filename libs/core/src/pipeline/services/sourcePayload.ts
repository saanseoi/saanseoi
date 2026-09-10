import type { SourceReference } from '@repo/db/sourceSchema'
/**
 * Separate publisher attributes from fields represented once by the source
 * envelope. This is a storage mapping, not canonical normalisation: values are
 * neither corrected nor inferred here.
 */
export function overtureSourcePayload(row: Record<string, unknown>) {
  const { id: _id, geometry, sources, ...rawProperties } = row
  if (
    sources != null &&
    (!Array.isArray(sources) ||
      !sources.every(
        source =>
          source && typeof source === 'object' && typeof source.dataset === 'string',
      ))
  ) {
    throw new Error(
      'Overture publisher sources must be an array of attribution records or null.',
    )
  }
  return {
    rawProperties,
    sourceGeometry: geometry ?? null,
    sources: (sources ?? null) as SourceReference[] | null,
  }
}

/** Native properties and geometry are versioned independently of acquisition or repair. */
export function nativeSourcePayloadHashInput(row: {
  rawProperties: unknown
  sourceGeometry?: unknown
  placeNames?: unknown
}) {
  return {
    rawProperties: row.rawProperties,
    sourceGeometry: row.sourceGeometry ?? null,
    ...(row.placeNames === undefined ? {} : { placeNames: row.placeNames }),
  }
}
