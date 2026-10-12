import type { HumanOperation } from './fieldLineageHuman'

/** Explicit field effects for scalar corrections; identity/inventory rewrites remain unfiltered. */
export function withHumanFieldEffects(
  human: HumanOperation,
  specification: Record<string, unknown>,
): HumanOperation {
  const symbol = (specification.implementation as { symbol?: string })?.symbol
  const inputs = specification.inputs as string[] | undefined
  const first = inputs?.[0]
  if (!symbol || !first) return human
  const names = ['i18n.*', 'granularity', 'sources', 'relationships.divisions']
  const effects: Record<string, string[]> = {
    suppressReviewedYueWanPremise: ['sources'],
    suppressAlsUnnamedPremises: ['sources'],
    applyAlsNestedPremises: ['parentAddressId', 'granularity', 'sources'],
    linkReviewedHouseStreetParents: ['parentAddressId'],
    restoreAlsEstateGaps: [...names, 'id'],
    applyAlsEstateNames: names,
    applyAlsLocalities: names,
    restoreAlsEstateComponents: names,
    applyReviewedPremiseRenames: [...names, 'id'],
    applyReviewedBuildingOverrides: [...names, 'id'],
    applyReviewedBlockDetailBackfills: [...names, 'id'],
    correctHkgovAddressComponents: names,
    applyAlsDivisionMembership: [
      'relationships.divisions',
      'divisionSnapshotId',
      'sources',
    ],
    backfillAlsCoordinates: [
      'geometry',
      'i18n.*',
      'sources',
      'relationships.divisions',
    ],
    backfillOiHei: ['geometry', 'sources', 'relationships.divisions'],
  }
  const fields = effects[symbol]
  return fields ? { ...human, fieldScope: { fields, otherwiseInput: first } } : human
}
