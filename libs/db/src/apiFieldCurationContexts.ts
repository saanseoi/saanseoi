/** Logical curation inputs. Values retain the identifiers used by processing/audit contexts;
 * collection identifiers do not imply a single curation fixture.
 */
export const apiFieldCurationContexts: Readonly<Record<string, string>> = Object.freeze(
  {
    alsCurations: 'als-curations',
    divisionClassification: 'division-classification',
    divisionGeometryCurations: 'division-geometry-curations',
    geographyIdentityBridges: 'geography-identity-bridges',
    overturePlaceAddress: 'overture-place-address',
    statisticFields: 'statistic-fields',
  },
)

export function resolveApiFieldCurationInput(fieldPath: string) {
  const root = fieldPath.split(/[.[]/, 1)[0] ?? ''
  if (!Object.hasOwn(apiFieldCurationContexts, root))
    throw new Error(`Unknown API-field curation context: ${root}`)
  const suffix = fieldPath.slice(root.length)
  // Selector values are identifiers, not property names: preserve their spelling.
  const propertyPath = fieldPath.replace(/\[[^\]]*\]/g, '')
  if (!propertyPath.split('.').every(part => /^[a-z][a-zA-Z0-9]*$/.test(part)))
    throw new Error(`Curation field path must use camelCase: ${fieldPath}`)
  return {
    contextId: apiFieldCurationContexts[root]!,
    fieldPath: suffix.replace(/^\./, ''),
  }
}
