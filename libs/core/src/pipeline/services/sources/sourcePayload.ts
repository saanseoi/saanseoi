/**
 * Separate publisher attributes from fields represented once by the source
 * envelope. This is a storage mapping, not canonical normalisation: values are
 * neither corrected nor inferred here.
 */
export function overtureSourcePayload(row: Record<string, unknown>) {
  const { id: _id, geometry, ...rawProperties } = row
  const { sources } = row
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
    sourceGeometry:
      geometry instanceof Uint8Array
        ? {
            encoding: 'wkb-base64',
            data: Buffer.from(
              geometry.buffer,
              geometry.byteOffset,
              geometry.byteLength,
            ).toString('base64'),
          }
        : (geometry ?? null),
    // Acquisition metadata is separate from publisher-authored attribution.
    sourceLocator: null,
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

/** Minimal acquisition locator; dataset, release and publisher attributes live elsewhere. */
export function sourceLocatorFromReferences(
  value: unknown,
): Record<string, unknown> | null {
  if (value == null) return null
  if (!Array.isArray(value)) throw new Error('Acquisition references must be an array.')
  const locator: Record<string, unknown> = {}
  for (const reference of value) {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference))
      throw new Error('Invalid acquisition reference.')
    for (const field of [
      'assetId',
      'sourceFile',
      'featureIndexOneBased',
      'layer',
      'layerName',
      'sourceFeatureRef',
    ] as const) {
      if (!Object.hasOwn(reference, field) || reference[field] == null) continue
      if (
        Object.hasOwn(locator, field) &&
        JSON.stringify(locator[field]) !== JSON.stringify(reference[field])
      )
        throw new Error(
          `Conflicting source locator ${field}; retain distinct source occurrences.`,
        )
      locator[field] = reference[field]
    }
  }
  return Object.keys(locator).length ? locator : null
}
