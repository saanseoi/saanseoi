import type fixture from '../../../../../fixtures/meta/processing-rules/division-normalisation.json'

export type DivisionPolicy = typeof fixture.parameters
type Hints = {
  subtype: string
  class: string
  adminLevel: string
  hasParent: boolean
  isHongKongArea: boolean
}

/** Policy order is significant, including the source's substring level matching. */
export function divisionLevel(policy: DivisionPolicy, hints: Hints): number {
  if (hints.isHongKongArea) return policy.hongKongArea.level
  const subtype = policy.subtypeLevels.find(entry => entry.token === hints.subtype)
  if (subtype) return subtype.level
  if (hints.subtype === 'locality') {
    const locality = policy.localityClasses.find(entry => entry.token === hints.class)
    if (locality) return locality.level
  }
  for (const candidate of [hints.subtype, hints.class, hints.adminLevel]) {
    if (!candidate) continue
    const match = policy.levelTokens.find(entry => candidate.includes(entry.token))
    if (match) return match.level
  }
  return hints.hasParent ? policy.fallback.parentLevel : policy.fallback.rootLevel
}

export function divisionType(policy: DivisionPolicy, hints: Hints): string {
  if (hints.isHongKongArea) return policy.hongKongArea.type
  const subtype = policy.subtypeTypes.find(entry => entry.token === hints.subtype)
  if (subtype) return subtype.type
  if (hints.subtype === 'locality') {
    const locality = policy.localityClasses.find(entry => entry.token === hints.class)
    if (locality) return locality.type
  }
  const neighbourhood = policy.neighbourhoodTypes.find(
    entry => entry.tokens.includes(hints.subtype) || entry.tokens.includes(hints.class),
  )
  if (neighbourhood) return neighbourhood.type
  return (
    policy.fallback.typesByLevel[divisionLevel(policy, hints)] ?? policy.fallback.type
  )
}

export function hierarchyClassification(policy: DivisionPolicy, subtype: string) {
  const classification = policy.hierarchySubtypes.find(entry => entry.token === subtype)
  if (classification) return classification
  if (subtype === 'locality') {
    throw new Error(
      'Cannot normalise hierarchy subtype `locality` without a class value.',
    )
  }
  throw new Error(`Unsupported hierarchy subtype: ${subtype || 'null'}.`)
}

export function validateDivisionPolicy(policy: DivisionPolicy): void {
  const text = (value: string) => typeof value === 'string' && value.trim().length > 0
  const level = (value: number) => Number.isSafeInteger(value) && value >= 0
  for (const entries of [
    policy.levelTokens,
    policy.subtypeLevels,
    policy.subtypeTypes,
    policy.localityClasses,
    policy.hierarchySubtypes,
  ]) {
    if (
      !entries.length ||
      new Set(entries.map(entry => entry.token)).size !== entries.length ||
      entries.some(
        entry =>
          !text(entry.token) ||
          ('level' in entry && !level(entry.level)) ||
          ('type' in entry && !text(entry.type)),
      )
    ) {
      throw new Error('Invalid division taxonomy policy entries.')
    }
  }
  if (
    !level(policy.hongKongArea.level) ||
    !text(policy.hongKongArea.type) ||
    !level(policy.fallback.parentLevel) ||
    !level(policy.fallback.rootLevel) ||
    !text(policy.fallback.type) ||
    !policy.fallback.typesByLevel.length ||
    !policy.fallback.typesByLevel.every(text) ||
    !policy.hongKongAreaNames.length ||
    !policy.hongKongAreaNames.every(text) ||
    !policy.neighbourhoodTypes.length ||
    policy.neighbourhoodTypes.some(
      entry => !text(entry.type) || !entry.tokens.length || !entry.tokens.every(text),
    )
  ) {
    throw new Error('Invalid division taxonomy fallback policy.')
  }
  for (const locale of ['en', 'zh-hant', 'zh-hans'] as const) {
    const priorities = policy.apiLocaleFallbacks[locale]
    if (
      !priorities?.length ||
      !priorities.every(text) ||
      new Set(priorities).size !== priorities.length
    ) {
      throw new Error(`Invalid division locale priorities for ${locale}.`)
    }
  }
}
