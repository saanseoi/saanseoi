/** Final display derivative used by processLocalDivisionGeometrySqlUpload. */
export function geometryDisplayTransform(
  resourceType: string,
  apiField: string,
  variant: string | null,
) {
  if (
    resourceType !== 'divisionArea' ||
    !variant?.endsWith(':simplified') ||
    !['attributes.geometry', 'attributes.bbox'].includes(apiField)
  )
    return null
  return {
    expression:
      apiField === 'attributes.bbox'
        ? 'calculateGeoJsonBbox(simplified.geometries[index])'
        : 'simplified.geometries[index]',
    steps: [
      'Use all normalised area geometries in their materialisation order as one coverage; preserve the index-to-record identity association.',
      'Run simplifyPolygonCoverageCached with toleranceMetres = 10, using its WGS84 interface and local equirectangular working projection.',
      'Require each resulting geometry to be Polygon or MultiPolygon and pass JSTS IsValidOp; reject the materialisation on failure.',
      'Replace canonical geometry and recalculate canonical bbox from that geometry. Retain publisher SOURCE geometry unchanged.',
    ],
    toleranceMetres: 10,
    implementation: {
      path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalDivisionGeometrySqlUploadPreparation.ts',
      symbol: 'simplifyHkgovDivisionAreas',
    },
    additionalImplementations: [
      {
        path: 'apps/harbour-cli/src/lib/geometry/simplifyPolygonCoverage.ts',
        symbol: 'simplifyPolygonCoverageCached',
      },
      {
        path: 'apps/harbour-cli/src/lib/pipeline/divisions/processLocalDivisionGeometrySqlUploadConfig.ts',
        symbol: 'HKGOV_DISPLAY_SIMPLIFICATION_TOLERANCE_METRES',
      },
    ],
  }
}
