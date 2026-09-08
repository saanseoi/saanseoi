import type { RuleBranch } from '../../provenance/branches'
import type { DivisionPolicy } from './divisionTaxonomy'
const branchCache = new WeakMap<DivisionPolicy, RuleBranch[]>()

export function divisionLocaleBranches(policy: DivisionPolicy): RuleBranch[] {
  const cached = branchCache.get(policy)
  if (cached) return cached
  const branches: RuleBranch[] = Object.entries(policy.apiLocaleFallbacks).flatMap(
    ([locale, candidates]) => [
      {
        id: `locale.${locale}.existing`,
        group: `Locale Normalisation: ${locale}`,
        precedence: 1,
        condition: { field: locale, equals: true },
        result: locale,
      },
      ...candidates.map((source, index) => ({
        id: `locale.${locale}.source.${source}`,
        group: `Locale Normalisation: ${locale}`,
        precedence: index + 2,
        condition: { field: source, equals: true },
        result: source,
      })),
      {
        id: `locale.${locale}.absent`,
        group: `Locale Normalisation: ${locale}`,
        precedence: candidates.length + 2,
        condition: { all: [] },
        result: 'none',
      },
    ],
  )
  if (Object.isFrozen(policy)) branchCache.set(policy, branches)
  return branches
}
