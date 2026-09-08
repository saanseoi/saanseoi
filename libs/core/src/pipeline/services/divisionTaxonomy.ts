import type fixture from '../../../../../fixtures/meta/processing-rules/division-normalisation.json'
import {
  selectBranch,
  type BranchCondition,
  type BranchCounts,
  type RuleBranch,
} from '../../provenance/branches'

export type DivisionPolicy = typeof fixture.parameters
const branchCache = new WeakMap<DivisionPolicy, RuleBranch[]>()
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

export function divisionType(
  policy: DivisionPolicy,
  hints: Hints,
  counts?: BranchCounts,
  before?: unknown,
): string {
  return selectBranch(
    divisionTaxonomyBranches(policy).filter(b => b.group === 'Type Classification'),
    { ...hints, level: divisionLevel(policy, hints) },
    before,
    counts,
  ) as string
}

/** The executor and retained declaration consume this same ordered condition tree. */
export function divisionTaxonomyBranches(policy: DivisionPolicy): RuleBranch[] {
  const cached = branchCache.get(policy)
  if (cached) return cached
  const branches: RuleBranch[] = []
  const eq = (field: string, equals: string | number | boolean): BranchCondition => ({
    field,
    equals,
  })
  for (const kind of ['level', 'type'] as const) {
    let precedence = 0
    const add = (id: string, condition: BranchCondition, result: string | number) =>
      branches.push({
        id: `${kind}.${id}`,
        group: kind === 'level' ? 'Level Classification' : 'Type Classification',
        precedence: ++precedence,
        condition,
        result,
      })
    add('hong-kong-area', eq('isHongKongArea', true), policy.hongKongArea[kind])
    for (const entry of kind === 'level' ? policy.subtypeLevels : policy.subtypeTypes)
      add(
        `subtype.${entry.token}`,
        eq('subtype', entry.token),
        'level' in entry ? entry.level : entry.type,
      )
    for (const entry of policy.localityClasses)
      add(
        `locality.${entry.token}`,
        { all: [eq('subtype', 'locality'), eq('class', entry.token)] },
        entry[kind],
      )
    if (kind === 'level') {
      for (const field of ['subtype', 'class', 'adminLevel'])
        for (const entry of policy.levelTokens)
          add(
            `contains.${field}.${entry.token}`,
            { field, contains: entry.token },
            entry.level,
          )
      add('fallback.parent', eq('hasParent', true), policy.fallback.parentLevel)
      add('fallback.root', { all: [] }, policy.fallback.rootLevel)
    } else {
      for (const entry of policy.neighbourhoodTypes)
        add(
          `neighbourhood.${entry.type}`,
          {
            any: entry.tokens.flatMap(token => [
              eq('subtype', token),
              eq('class', token),
            ]),
          },
          entry.type,
        )
      for (const [level, type] of policy.fallback.typesByLevel.entries())
        add(`fallback.level.${level}`, eq('level', level), type)
      add('fallback.other', { all: [] }, policy.fallback.type)
    }
  }
  if (Object.isFrozen(policy)) branchCache.set(policy, branches)
  return branches
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
