import {
  divisionTaxonomyBranches,
  type DivisionPolicy,
} from '../../../../../db/src/divisionClassificationBranches'
export { divisionTaxonomyBranches } from '../../../../../db/src/divisionClassificationBranches'
export type { DivisionPolicy } from '../../../../../db/src/divisionClassificationBranches'
import { selectBranch, type BranchCounts } from '../../../provenance/branches'

type Hints = {
  subtype: string
  class: string
  adminLevel: string
  hasParent: boolean
  isHongKongArea: boolean
}

/** Policy order is significant, including the source's substring level matching. */
export function divisionLevel(
  policy: DivisionPolicy,
  hints: Hints,
  counts?: BranchCounts,
  before?: unknown,
): number {
  return selectBranch(
    divisionTaxonomyBranches(policy).filter(b => b.group === 'Level Classification'),
    hints,
    before,
    counts,
  ) as number
}

export function divisionClass(
  policy: DivisionPolicy,
  hints: Hints,
  counts?: BranchCounts,
  before?: unknown,
): string {
  return selectBranch(
    divisionTaxonomyBranches(policy).filter(b => b.group === 'Class Classification'),
    { ...hints, level: divisionLevel(policy, hints) },
    before,
    counts,
  ) as string
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
    policy.subtypeClasses,
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
          ('class' in entry && !text(entry.class)),
      )
    ) {
      throw new Error('Invalid division taxonomy policy entries.')
    }
  }
  if (
    !level(policy.hongKongArea.level) ||
    !text(policy.hongKongArea.class) ||
    !level(policy.fallback.parentLevel) ||
    !level(policy.fallback.rootLevel) ||
    !text(policy.fallback.class) ||
    !policy.fallback.classesByLevel.length ||
    !policy.fallback.classesByLevel.every(text) ||
    !policy.hongKongAreaNames.length ||
    !policy.hongKongAreaNames.every(text) ||
    !policy.hoodClasses.length ||
    policy.hoodClasses.some(
      entry => !text(entry.class) || !entry.tokens.length || !entry.tokens.every(text),
    )
  ) {
    throw new Error('Invalid division taxonomy fallback policy.')
  }
  for (const locale of ['en', 'zh-hant', 'zh-hans'] as const) {
    const priorities = policy.apiLocaleFallbacks[locale]
    if (
      !Array.isArray(priorities) ||
      !priorities.every(text) ||
      priorities.some(source => source === locale) ||
      new Set(priorities).size !== priorities.length
    ) {
      throw new Error(`Invalid division locale priorities for ${locale}.`)
    }
  }
}
