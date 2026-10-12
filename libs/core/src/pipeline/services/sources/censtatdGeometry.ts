import { createHash } from 'node:crypto'
import { stableJsonStringify } from '../../utils'
import { compressJsonBrotli } from '../storage/brotliJson'

export function censtatdContentHash(value: unknown): string {
  const content = stableJsonStringify(value)
  if (typeof content !== 'string') throw new Error('Missing C&SD geometry content.')
  return createHash('sha256').update(content).digest('hex')
}

/** Preserve native coordinates and CRS; never round or simplify for identity. */
export function censtatdGeometryId(sourceGeometry: unknown): string {
  if (sourceGeometry == null) throw new Error('Missing C&SD source geometry.')
  return censtatdContentHash(sourceGeometry)
}

export function censtatdGeometryRow(sourceGeometry: unknown) {
  const content = stableJsonStringify(sourceGeometry)
  if (typeof content !== 'string') throw new Error('Missing C&SD geometry content.')
  return {
    id: censtatdGeometryId(sourceGeometry),
    sourceGeometry: compressJsonBrotli(JSON.parse(content)),
  }
}

/** Coverage simplification also depends on neighbouring input geometry. */
export function censtatdDerivativeRow(input: {
  geometryId: string
  transform: string
  derivation: unknown
  coverageGeometryIds: string[]
  geometry: unknown
  bbox: unknown
}) {
  const derivation = {
    ...(input.derivation as Record<string, unknown>),
    coverageGeometryIds: [...input.coverageGeometryIds].sort(),
  }
  return {
    geometryId: input.geometryId,
    transform: input.transform,
    transformHash: censtatdContentHash({ transform: input.transform, derivation }),
    versionHash: censtatdContentHash({ geometry: input.geometry, bbox: input.bbox }),
    derivation,
    geometry: input.geometry,
    bbox: input.bbox,
  }
}
