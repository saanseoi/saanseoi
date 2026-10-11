const levels = ['ppu', 'spu', 'tpu', 'subunit'] as const

type PlanningIdentity = {
  id: string
  class: string
  identifiers: Record<string, unknown> | null
}

/** Require an evidenced, complete path before canonical Planning content is hashed. */
export function validatePlanningHierarchy(
  child: PlanningIdentity,
  parents: readonly PlanningIdentity[],
) {
  if (child.class === 'planning-newtown') {
    if (parents.length) throw new Error(`Unexpected New Town ancestry for ${child.id}.`)
    return
  }
  const index = levels.indexOf(
    child.class.replace('planning-', '') as (typeof levels)[number],
  )
  const expected = levels.slice(0, index)
  if (
    index < 0 ||
    parents.length !== expected.length ||
    parents.some((parent, i) => parent.class !== `planning-${expected[i]}`)
  ) {
    throw new Error(
      `Incomplete Planning hierarchy for ${child.id}; prepare the release again.`,
    )
  }
  const codes = child.identifiers?.['hkgov-pland'] as
    | Record<string, unknown>
    | undefined
  for (const [i, parent] of parents.entries()) {
    const parentCodes = parent.identifiers?.['hkgov-pland'] as
      | Record<string, unknown>
      | undefined
    for (const field of levels.slice(0, i + 1)) {
      if (codes?.[field] == null || parentCodes?.[field] !== codes[field]) {
        throw new Error(`Conflicting Planning ancestor ${parent.id} for ${child.id}.`)
      }
    }
  }
}
