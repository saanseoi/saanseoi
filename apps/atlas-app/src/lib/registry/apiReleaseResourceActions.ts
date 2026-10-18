import type { ReleaseNavAction } from '#lib/bits/pages/docs/components/releaseNav/releaseNav.types.js'
import type { ApiReleaseSnapshot } from './types'
import { resourceLabel } from './resourceLabels'

const resourceTypeOrder: Record<string, number> = {
  division: 0,
  divisionArea: 1,
  divisionBoundary: 2,
}

export const getApiResourceKey = (resource: ApiReleaseSnapshot) =>
  `${resource.snapshot.resourceType}:${resource.variant ?? 'default'}`

export const getApiResourceVariantLabel = (variant: string) =>
  variant === 'saanseoi'
    ? 'SaanSeoi'
    : (variant || 'default')
        .replaceAll(/[_-]/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase())

export function selectApiReleaseResources(
  resources: ApiReleaseSnapshot[],
  key: string | null,
) {
  const exact = resources.find(resource => getApiResourceKey(resource) === key)
  const resource =
    exact ??
    resources.find(resource => `${resource.snapshot.resourceType}:all` === key) ??
    resources.find(resource => resource.role === 'primary') ??
    resources[0]
  const allVariants = !exact
  return {
    resource,
    allVariants,
    key: resource
      ? allVariants
        ? `${resource.snapshot.resourceType}:all`
        : getApiResourceKey(resource)
      : undefined,
    resources: resource
      ? allVariants
        ? resources
            .filter(
              item => item.snapshot.resourceType === resource.snapshot.resourceType,
            )
            .sort(
              (left, right) =>
                Number(right.role === 'primary') - Number(left.role === 'primary'),
            )
        : [resource]
      : [],
  }
}

export function buildApiReleaseResourceActions(
  resources: ApiReleaseSnapshot[],
  selected: ApiReleaseSnapshot | undefined,
  onSelect: (key: string) => void,
  allVariants = false,
): ReleaseNavAction[] {
  if (!selected) return []
  const resourceType = selected.snapshot.resourceType
  const variants = resources.filter(
    resource => resource.snapshot.resourceType === resourceType,
  )
  return [
    {
      id: 'resourceType',
      label: 'resourceType',
      value: resourceType,
      options: [...new Set(resources.map(resource => resource.snapshot.resourceType))]
        .sort(
          (left, right) =>
            (resourceTypeOrder[left] ?? 3) - (resourceTypeOrder[right] ?? 3),
        )
        .map(value => ({ value, label: resourceLabel(value) })),
      onValueChange: value => {
        if (allVariants) {
          onSelect(`${value}:all`)
          return
        }
        const matches = resources.filter(
          resource => resource.snapshot.resourceType === value,
        )
        const next =
          matches.find(resource => resource.variant === selected.variant) ??
          matches.find(resource => resource.role === 'primary') ??
          matches[0]
        if (next) onSelect(getApiResourceKey(next))
      },
    },
    {
      id: 'variant',
      label: 'variant',
      value: allVariants ? `${resourceType}:all` : getApiResourceKey(selected),
      options: [
        { value: `${resourceType}:all`, label: 'All' },
        ...variants.map(resource => ({
          value: getApiResourceKey(resource),
          label: getApiResourceVariantLabel(resource.variant),
        })),
      ],
      onValueChange: onSelect,
    },
  ]
}
