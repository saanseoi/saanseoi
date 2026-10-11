import {
  validateSaanseoiEstimatedAreas,
  type ReviewInventory,
  type SaanseoiEstimatedAreas,
} from './geographicReview'

/** Preserve withheld geometry while keeping active editor inputs consistent with curation. */
export function reconcileReviewEstimatedAreas(
  value: SaanseoiEstimatedAreas,
  inventory: ReviewInventory,
  holds: ReadonlyMap<string, string>,
): SaanseoiEstimatedAreas {
  if (!Array.isArray(value?.features)) validateSaanseoiEstimatedAreas(value, inventory)
  const result: SaanseoiEstimatedAreas = { ...value, features: [], withheld: [] }
  const known = new Set(inventory.divisions.map(division => division.id))
  const seen = new Set<string>()
  for (const item of [
    ...value.features.map(feature => ({
      feature,
      reason: undefined as string | undefined,
    })),
    ...(value.withheld ?? []),
  ]) {
    const id = item.feature?.properties?.divisionId
    if (!id || seen.has(id))
      throw new Error(`Duplicate or missing drawing identity: ${id ?? '(missing)'}.`)
    seen.add(id)
    const reason = holds.get(id) ?? (!known.has(id) ? item.reason : undefined)
    if (reason) result.withheld!.push({ feature: item.feature, reason })
    else result.features.push(item.feature)
  }
  validateSaanseoiEstimatedAreas(result, inventory)
  // Withheld drawings still need valid geometry; only their eligibility differs.
  if (result.withheld!.length) {
    const withheldInventory = {
      ...inventory,
      divisions: result.withheld!.map(({ feature }) => ({
        id: feature.properties.divisionId,
        category: null,
        class: 'withheld',
        level: null,
        names: {},
        point: null,
        hierarchies: { full: [] },
      })),
    }
    validateSaanseoiEstimatedAreas(
      { ...result, features: result.withheld!.map(item => item.feature) },
      withheldInventory,
    )
  } else delete result.withheld
  return result
}

/** Import replaces matching drawings and retains every unrelated active/withheld drawing. */
export function mergeReviewEstimatedAreas(
  current: SaanseoiEstimatedAreas,
  imported: SaanseoiEstimatedAreas,
): SaanseoiEstimatedAreas {
  const replaced = new Set([
    ...imported.features.map(feature => feature.properties.divisionId),
    ...(imported.withheld ?? []).map(item => item.feature.properties.divisionId),
  ])
  return {
    ...current,
    features: [
      ...current.features.filter(
        feature => !replaced.has(feature.properties.divisionId),
      ),
      ...imported.features,
    ],
    withheld: [
      ...(current.withheld ?? []).filter(
        item => !replaced.has(item.feature.properties.divisionId),
      ),
      ...(imported.withheld ?? []),
    ],
  }
}
