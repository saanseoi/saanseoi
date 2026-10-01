/** Upgrade saved editor data without changing identities, geometry or provenance. */
export function upgradeSavedDrawingVariants<T>(value: T): T {
  const result = structuredClone(value)
  type SavedFeature = { properties?: { variant?: string } }
  const collection = result as {
    variant?: string
    features?: SavedFeature[]
    withheld?: Array<{ feature: SavedFeature }>
  }
  if (!Array.isArray(collection?.features)) return result
  if (collection.variant === 'stub') collection.variant = 'saanseoi'
  for (const feature of [
    ...collection.features,
    ...(collection.withheld ?? []).map(item => item.feature),
  ]) {
    if (feature?.properties?.variant === 'stub') feature.properties.variant = 'saanseoi'
  }
  return result
}
