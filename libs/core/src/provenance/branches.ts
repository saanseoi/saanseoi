import type { JsonRecord } from './types'

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
export type BranchCounts = Record<string, { matched: number; changed: number }>

export function matchesBranch(condition: BranchCondition, facts: JsonRecord): boolean {
  if ('all' in condition) return condition.all.every(item => matchesBranch(item, facts))
  if ('any' in condition) return condition.any.some(item => matchesBranch(item, facts))
  const value = facts[condition.field]
  return 'equals' in condition
    ? value === condition.equals
    : typeof value === 'string' && value.includes(condition.contains)
}

/** Count only the selected branch, after precedence; never count shadowed matches. */
export function selectBranch(
  branches: readonly RuleBranch[],
  facts: JsonRecord,
  before: unknown,
  counts?: BranchCounts,
) {
  let branch: RuleBranch | undefined
  for (const candidate of branches) {
    if (
      (!branch || candidate.precedence < branch.precedence) &&
      matchesBranch(candidate.condition, facts)
    )
      branch = candidate
  }
  if (!branch) throw new Error('No matching processing branch.')
  if (counts) {
    const count = counts[branch.id]
    if (!count) throw new Error(`Unregistered processing branch: ${branch.id}`)
    count.matched++
    if (before !== branch.result) count.changed++
  }
  return branch.result
}

export function createBranchCounts(branches: readonly RuleBranch[]): BranchCounts {
  if (new Set(branches.map(branch => branch.id)).size !== branches.length)
    throw new Error('Processing branch IDs must be unique.')
  return Object.fromEntries(
    branches.map(branch => [branch.id, { matched: 0, changed: 0 }]),
  )
}
