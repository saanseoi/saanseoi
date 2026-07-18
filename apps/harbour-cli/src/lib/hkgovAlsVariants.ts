export type HkgovAlsPrecedenceVariantDecision = {
  blockDescriptorPrecedenceIndicator: string | null
  identityKey: string
}

export type HkgovAlsPrecedenceVariantDecisions = {
  authority: 'hkgov-dpo'
  decisions: HkgovAlsPrecedenceVariantDecision[]
  version: 1
}

export function emptyHkgovAlsPrecedenceVariantDecisions(): HkgovAlsPrecedenceVariantDecisions {
  return { authority: 'hkgov-dpo', decisions: [], version: 1 }
}

export function parseHkgovAlsPrecedenceVariantDecisions(
  value: unknown,
): HkgovAlsPrecedenceVariantDecisions {
  const decisions = value as Partial<HkgovAlsPrecedenceVariantDecisions>
  if (
    decisions?.authority !== 'hkgov-dpo' ||
    decisions.version !== 1 ||
    !Array.isArray(decisions.decisions)
  ) {
    throw new Error('Invalid HKGov ALS precedence-variant decisions file.')
  }
  return decisions as HkgovAlsPrecedenceVariantDecisions
}
