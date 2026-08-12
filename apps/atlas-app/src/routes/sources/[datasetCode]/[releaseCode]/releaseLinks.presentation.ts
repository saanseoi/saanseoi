import { m } from '$lib/bits/internal/i18n'
import { getApiFamilyTheme } from '$lib/registry/apiFamilyTheme'
import { getReleaseCodeParts } from '$lib/registry/releaseCode'
import type { ReleaseLinksProvenancePresentation } from '$lib/bits/pages/docs/components/releaseLinks'

type ReleasedApi = {
  apiFamily: string
  apiVersion: string
  cohortKey: string | null
  code: string
  domainCode: string
  role: 'primary' | 'supporting'
  resourceType: string
  snapshotCode: string
  variant: string
}

type ReleaseUsage = {
  description: string
  request: {
    path: string
    query: Array<{ key: string; value: string }>
  }
}

const releaseLinkId = (release: ReleasedApi) =>
  `release-${`${release.role}-${release.code}-${release.resourceType}-${release.variant}`.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`

const apiCollectionPath = (family: string) =>
  ({
    addresses: 'addresses',
    divisions: 'divisions',
    places: 'places',
    stats: 'statistics',
    streets: 'streets',
  })[family] ?? family

const titleCase = (value: string) =>
  value
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, letter => letter.toUpperCase())

const interpolate = (message: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    message,
  )

const humanResourceType = (resourceType: string, plural = false) => {
  const labels: Record<string, [string, string]> = {
    address: ['address', 'addresses'],
    division: ['division', 'divisions'],
    divisionArea: ['division area', 'division areas'],
    divisionBoundary: ['division boundary', 'division boundaries'],
    place: ['place', 'places'],
    street: ['street', 'streets'],
  }
  const label = labels[resourceType]
  return label ? label[plural ? 1 : 0] : titleCase(resourceType) + (plural ? 's' : '')
}

const primaryResourceType = (family: string) =>
  ({
    addresses: 'address',
    divisions: 'division',
    places: 'place',
    streets: 'street',
  })[family] ?? family.replace(/s$/, '')

const compareReleasedApis = (left: ReleasedApi, right: ReleasedApi) => {
  if (left.role !== right.role) return left.role === 'primary' ? -1 : 1
  const family = left.apiFamily.localeCompare(right.apiFamily)
  if (family) return family
  return right.code.localeCompare(left.code, undefined, { numeric: true })
}

const releaseTitleParts = (release: ReleasedApi, colour: string) => {
  const code = getReleaseCodeParts(release.code, release.apiFamily)
  const parts = (value: string, muted = false) =>
    value
      .split('-')
      .flatMap((part, index, all) => [
        { colour, muted, value: part },
        ...(index < all.length - 1 ? [{ colour, value: '-' }] : []),
      ])
  return [...parts(code.family, true), { colour, value: '-' }, ...parts(code.version)]
}

const releaseUsage = (release: ReleasedApi): ReleaseUsage => {
  const route = `/v${release.apiVersion}/${apiCollectionPath(release.apiFamily)}`
  if (
    release.role === 'primary' &&
    release.apiFamily === 'addresses' &&
    release.resourceType === 'address'
  ) {
    return {
      description: m.source_released_as_usage_address_primary(),
      request: { path: route, query: [{ key: 'releaseSet', value: release.code }] },
    }
  }
  if (release.apiFamily !== 'divisions') {
    return {
      description: interpolate(m.source_released_as_usage_generic(), {
        resourceType: humanResourceType(release.resourceType, true),
        supportingResourceType: humanResourceType(
          primaryResourceType(release.apiFamily),
        ),
      }),
      request: { path: route, query: [{ key: 'releaseSet', value: release.code }] },
    }
  }
  if (release.resourceType === 'divisionArea') {
    return {
      description: m.source_released_as_usage_area(),
      request: {
        path: route,
        query: [{ key: 'include', value: `areas:${release.variant}` }],
      },
    }
  }
  if (release.resourceType === 'divisionBoundary') {
    return {
      description: m.source_released_as_usage_boundary(),
      request: {
        path: route,
        query: [{ key: 'include', value: `boundaries:${release.variant}` }],
      },
    }
  }
  if (release.resourceType === 'division') {
    return {
      description: interpolate(m.source_released_as_usage_division(), {
        domain: release.domainCode,
      }),
      request: {
        path: route,
        query: [
          { key: 'domain', value: release.domainCode },
          { key: 'releaseSet', value: release.code },
        ],
      },
    }
  }
  return {
    description: interpolate(m.source_released_as_usage_generic(), {
      resourceType: humanResourceType(release.resourceType, true),
      supportingResourceType: humanResourceType(primaryResourceType(release.apiFamily)),
    }),
    request: { path: route, query: [{ key: 'releaseSet', value: release.code }] },
  }
}

export function buildSourceReleaseLinksPresentation(
  releaseAs: ReleasedApi[] | undefined,
): ReleaseLinksProvenancePresentation {
  const releases = [...(releaseAs ?? [])].sort(compareReleasedApis)
  const entries = (items: ReleasedApi[]) =>
    items.map(release => {
      const theme = getApiFamilyTheme(release.apiFamily)
      const accentColour =
        release.apiFamily === 'addresses'
          ? (theme?.colorway.secondary ?? 'var(--accent)')
          : (theme?.colorway.primary ?? 'var(--secondary)')
      const usage = releaseUsage(release)
      return {
        accentColour,
        description: usage.description,
        detail: release.domainCode,
        detailLabel: m.source_released_as_domain(),
        eyebrow: theme?.name ?? titleCase(release.apiFamily),
        eyebrowColour: accentColour,
        expanded: release.role === 'primary',
        facts: [
          {
            description: m.source_released_as_domain_description(),
            label: m.source_released_as_domain(),
            value: release.domainCode,
          },
          ...(release.cohortKey
            ? [
                {
                  description: m.source_released_as_cohort_description(),
                  label: m.source_released_as_cohort(),
                  value: release.cohortKey,
                },
              ]
            : []),
          {
            description: m.source_released_as_snapshot_description(),
            label: m.source_released_as_snapshot(),
            value: release.snapshotCode,
          },
        ],
        href: `/apis/${release.apiFamily}/${release.code}`,
        id: releaseLinkId(release),
        request: usage.request,
        requestLabel: m.source_released_as_request(),
        title: release.code,
        titleColour: accentColour,
        titleParts: releaseTitleParts(release, accentColour),
      }
    })

  return {
    groups: [
      {
        entries: entries(releases.filter(release => release.role === 'primary')),
        label: m.source_released_as_primary(),
        title: m.source_released_as_records(),
      },
      {
        entries: entries(
          releases.filter(
            release =>
              release.role === 'supporting' &&
              (release.resourceType === 'divisionArea' ||
                release.resourceType === 'divisionBoundary'),
          ),
        ),
        label: m.source_released_as_geometry(),
        title: m.source_released_as_records(),
      },
      {
        entries: entries(
          releases.filter(
            release =>
              release.role === 'supporting' &&
              release.resourceType !== 'divisionArea' &&
              release.resourceType !== 'divisionBoundary',
          ),
        ),
        label: m.source_released_as_supporting(),
        title: m.source_released_as_records(),
      },
    ],
  }
}
