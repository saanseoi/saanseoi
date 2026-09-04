import type { ResourceTheme, UploadPlan } from '@repo/core'

import type { CacheTableProfile } from '../dbCache/localDbCache.ts'

/** The public API families which have an ingestion lifecycle. */
export type ApiFamily = 'addresses' | 'divisions' | 'places' | 'stats' | 'streets'

export type ApiFamilyLifecycle = {
  family: ApiFamily
  theme: ResourceTheme
  cacheProfile?: CacheTableProfile
  resetDomains: readonly string[]
}

/**
 * Family-level policy is deliberately data-only. Source adapters still own
 * publisher parsing and resource processors still own normalisation; this
 * registry owns the shared command lifecycle's routing and cache contract.
 */
export const apiFamilyLifecycles: readonly ApiFamilyLifecycle[] = [
  {
    family: 'addresses',
    theme: 'addresses',
    cacheProfile: 'address',
    resetDomains: ['official'],
  },
  {
    family: 'divisions',
    theme: 'divisions',
    cacheProfile: 'division',
    resetDomains: [
      'geographic',
      'hkgov-landsd',
      'hkgov-pland-pu',
      'hkgov-pland-new-town',
    ],
  },
  {
    family: 'places',
    theme: 'places',
    cacheProfile: 'places',
    resetDomains: ['overture'],
  },
  {
    family: 'stats',
    theme: 'stats',
    cacheProfile: 'statistics',
    resetDomains: ['official'],
  },
  {
    family: 'streets',
    theme: 'streets',
    cacheProfile: 'street',
    resetDomains: ['official'],
  },
]

export function resolveApiFamilyForTheme(theme: string): ApiFamily | undefined {
  return apiFamilyLifecycles.find(lifecycle => lifecycle.theme === theme)?.family
}

export function resolveApiFamilyLifecycle(family: string) {
  return apiFamilyLifecycles.find(lifecycle => lifecycle.family === family)
}

export function resolveApiFamilyCacheProfile(
  family: string | undefined,
): CacheTableProfile | undefined {
  return family === undefined
    ? undefined
    : resolveApiFamilyLifecycle(family)?.cacheProfile
}

/** Resolve the cache superset required by a resource upload. */
export function resolveUploadCacheProfile(plan: Pick<UploadPlan, 'type' | 'source'>) {
  if (plan.type === 'place') return 'places' satisfies CacheTableProfile
  if (plan.type === 'division') return 'division' satisfies CacheTableProfile
  if (plan.type === 'divisionArea' || plan.type === 'divisionBoundary') {
    return plan.source === 'hkgov-pland-pu' || plan.source === 'hkgov-pland-new-town'
      ? ('planningDivisionGeometry' satisfies CacheTableProfile)
      : ('divisionGeometry' satisfies CacheTableProfile)
  }
  if (plan.type === 'street') return 'street' satisfies CacheTableProfile
  if (plan.type === 'divisionStatistic') return 'statistics' satisfies CacheTableProfile
  return 'address' satisfies CacheTableProfile
}

export function isApiFamily(value: unknown): value is ApiFamily {
  return (
    typeof value === 'string' &&
    apiFamilyLifecycles.some(lifecycle => lifecycle.family === value)
  )
}
