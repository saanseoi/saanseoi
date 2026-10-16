import type { ReviewArea } from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'

/** Preserve the saved shape and its processing history without claiming it is the original. */
export function adoptCurrentGeometryBaseline(feature: ReviewArea): ReviewArea {
  const processing = Object.fromEntries(
    Object.entries(feature.properties).filter(
      ([key]) =>
        key.startsWith('geometryCleanup') ||
        key.startsWith('geometrySimplification') ||
        key === 'geometryUnsimplifiedSource',
    ),
  )
  const properties = Object.fromEntries(
    Object.entries(feature.properties).filter(([key]) => !(key in processing)),
  )
  return {
    ...feature,
    geometry: structuredClone(feature.geometry),
    properties: {
      ...properties,
      divisionId: feature.properties.divisionId,
      variant: feature.properties.variant,
      geometryWorkingBaseline: {
        geometry: structuredClone(feature.geometry),
        processing,
      },
    },
  }
}
