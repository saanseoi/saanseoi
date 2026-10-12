import type fixture from '../../../fixtures/meta/processing-rules/assembly/division-normalisation.json'
export type DivisionPolicy = typeof fixture.parameters
export type BranchCondition =
  | { field: string; equals: string | number | boolean | null }
  | { field: string; contains: string }
  | { all: BranchCondition[] }
  | { any: BranchCondition[] }

export type RuleBranch = {
  id: string
  group: string
  precedence: number
  condition: BranchCondition
  result: string | number
}

const branchCache = new WeakMap<DivisionPolicy, RuleBranch[]>()
/** The executor and retained declaration consume this same ordered condition tree. */
export function divisionTaxonomyBranches(policy: DivisionPolicy): RuleBranch[] {
  const cached = branchCache.get(policy)
  if (cached) return cached
  const branches: RuleBranch[] = []
  const eq = (field: string, equals: string | number | boolean): BranchCondition => ({
    field,
    equals,
  })
  for (const kind of ['level', 'class'] as const) {
    let precedence = 0
    const add = (id: string, condition: BranchCondition, result: string | number) =>
      branches.push({
        id: `${kind}.${id}`,
        group: kind === 'level' ? 'Level Classification' : 'Class Classification',
        precedence: ++precedence,
        condition,
        result,
      })
    add('hong-kong-area', eq('isHongKongArea', true), policy.hongKongArea[kind])
    for (const entry of kind === 'level' ? policy.subtypeLevels : policy.subtypeClasses)
      add(
        `subtype.${entry.token}`,
        eq('subtype', entry.token),
        'level' in entry ? entry.level : entry.class,
      )
    for (const entry of policy.localityClasses)
      add(
        `locality.${entry.token}`,
        kind === 'class'
          ? eq('class', entry.token)
          : { all: [eq('subtype', 'locality'), eq('class', entry.token)] },
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
      for (const entry of policy.hoodClasses)
        add(
          `neighbourhood.${entry.class}`,
          {
            any: entry.tokens.flatMap(token => [
              eq('subtype', token),
              eq('class', token),
            ]),
          },
          entry.class,
        )
    }
  }
  if (Object.isFrozen(policy)) branchCache.set(policy, branches)
  return branches
}
