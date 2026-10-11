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

export function buildApiReleaseResourceActions(
  resources: ApiReleaseSnapshot[],
  selected: ApiReleaseSnapshot | undefined,
  onSelect: (key: string) => void,
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
      value: getApiResourceKey(selected),
      options: variants.map(resource => ({
        value: getApiResourceKey(resource),
        label:
          resource.variant === 'saanseoi'
            ? 'SaanSeoi'
            : (resource.variant ?? 'default')
                .replaceAll(/[_-]/g, ' ')
                .replace(/\b\w/g, letter => letter.toUpperCase()),
      })),
      onValueChange: onSelect,
    },
  ]
}
