<script lang="ts">
import { Main, SourceFlowMap, SourcesHeader } from '$lib/bits'
import type { SourceFlowInput, SourceFlowLane } from '$lib/bits'
import { getCurrentLocale, selectLocalisedRow } from '$lib/bits/internal/i18n'
import { apiFamilyThemes } from '$lib/registry/apiFamilyTheme'
import { getSourcesPageData } from '$lib/registry/meta.remote'
import { getPublisherLogo } from '$lib/registry/publisherLogo'
import type { LocalisedRow, RegistrySource } from '$lib/registry/types'

let { sources, domainsByApiFamily } = $derived(await getSourcesPageData())
let locale = $derived(getCurrentLocale())
let showPlanned = $state(true)
let expandAll = $state(false)
const apiFamilyOrder = ['divisions', 'addresses', 'places', 'streets', 'stats'] as const
const primaryTypeByApiFamily = {
  stats: 'divisionStatistic',
  divisions: 'division',
  addresses: 'address',
  places: 'place',
  streets: 'street',
} as const

const sourceAccentColors = {
  dpang: '#76b85b',
  overture: '#4c5ee8',
  hkgov: '#ee2b24',
} as const

const sourceVersion = (source: RegistrySource) =>
  source.sourceVersions?.find(version => version.status === 'published') ?? null

const sourceLicense = (source: RegistrySource) =>
  source.license?.code ?? sourceVersion(source)?.license?.code ?? 'unknown'

const explicitCohort = (value: string) => value.match(/\b(19|20)\d{2}\b/)?.[0]

const sourceCohort = (source: RegistrySource) => {
  const releaseCohort = sourceVersion(source)?.cohortKey
  if (releaseCohort) return releaseCohort

  const sourceName = selectLocalisedRow(source.datasetI18n, locale)?.name ?? ''
  const explicitYear = explicitCohort(source.code) ?? explicitCohort(sourceName)
  if (explicitYear) return explicitYear

  // The remaining C&SD statistics are published against the 2021 census geography.
  if (source.theme === 'stats' && source.publisherCode === 'hkgov-censtatd') {
    return '2021'
  }

  return 'CURRENT'
}

const sourceName = (source: RegistrySource) => {
  const name = selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.code
  return source.theme === 'stats'
    ? name.replace(/^(?:\d{4}\s+(?:By-)?census):\s*/i, '')
    : name
}

const sourceFrequency = (source: RegistrySource) => {
  if (
    source.releaseFrequency === 'census' ||
    source.publisherCode === 'hkgov-censtatd'
  ) {
    return '5-yearly'
  }
  return source.releaseFrequency
}

const sourceYear = (source: RegistrySource) => {
  if (source.theme === 'stats' || !sourceVersion(source)) return null

  const cohort = sourceCohort(source)
  const year = cohort.slice(0, 4)
  return cohort === 'CURRENT' || year === new Date().getFullYear().toString()
    ? null
    : year
}

const sourceRecordCount = (source: RegistrySource) =>
  sourceVersion(source)?.stats?.find(
    stat =>
      stat.dimension === 'records' &&
      stat.metric === 'count' &&
      stat.metricUnit === 'count' &&
      !stat.groupBy &&
      !stat.groupValue,
  )?.value

const formatRecordCount = (count: number | undefined) => {
  if (count === undefined) return null

  const format = (value: number, suffix: 'K' | 'M') =>
    `${Number(value.toFixed(1)).toLocaleString(locale)}${suffix}`

  if (count >= 1_000_000) return format(count / 1_000_000, 'M')
  if (count >= 1_000) return format(count / 1_000, 'K')
  return count.toLocaleString(locale)
}

const publisherName = (source: RegistrySource) =>
  selectLocalisedRow(source.publisher?.publisherI18n, locale)?.name ??
  source.publisherCode

const publisherAccent = (publisherCode: string) => {
  if (publisherCode === 'dpang') return sourceAccentColors.dpang
  if (publisherCode === 'overture') return sourceAccentColors.overture
  if (publisherCode.startsWith('hkgov')) return sourceAccentColors.hkgov
  return sourceAccentColors.overture
}

const sourceDomain = (source: RegistrySource, familyType: string) => {
  if (source.theme !== 'divisions') return 'default'

  const publishedDomain = sourceVersion(source)?.releaseAs?.find(
    release => release.apiFamily === familyType,
  )?.domainCode
  if (publishedDomain) return publishedDomain

  return source.sourceVariant === 'default'
    ? source.publisherCode
    : source.sourceVariant
}

const domainLabel = (domain: string, i18n?: LocalisedRow[]) =>
  selectLocalisedRow(i18n, locale)?.name ??
  {
    geographic: 'GEOGRAPHICAL',
    planning: 'PLANNING',
    'new-town': 'NEW TOWN',
    default: 'DEFAULT',
  }[domain] ??
  domain.replaceAll('-', ' ').toUpperCase()

const variantLabel = (source: RegistrySource, primaryType: string) => {
  if (source.resourceTypes.includes(primaryType)) {
    if (source.resourceTypes.length === 1) return undefined
    return 'GEOMETRY'
  }

  return source.resourceTypes
    .map(type => {
      if (type === 'divisionArea') return 'AREA'
      if (type === 'divisionBoundary') return 'BOUNDARY'
      return type.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()
    })
    .join(' + ')
}

const sourceFlowInput = (
  source: RegistrySource,
  primaryType: string,
): SourceFlowInput => {
  const variant = variantLabel(source, primaryType)
  const release = sourceVersion(source)
  const recordCount = formatRecordCount(sourceRecordCount(source))
  const year = sourceYear(source)

  return {
    id: source.code,
    publisher: publisherName(source),
    source: sourceName(source),
    href: `/sources/${source.code}${release ? `/${release.code}` : ''}`,
    icon: getPublisherLogo(source.publisherCode),
    iconTone:
      source.publisherCode === 'overture'
        ? 'light'
        : source.publisherCode.startsWith('hkgov')
          ? 'hkgov'
          : source.publisherCode === 'dpang'
            ? 'diana'
            : undefined,
    accent: publisherAccent(source.publisherCode),
    fallbackIcon: publisherName(source)
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2),
    fields: [
      { label: 'freq', value: sourceFrequency(source) },
      { label: 'licence', value: sourceLicense(source) },
      ...(recordCount ? [{ label: 'records', value: recordCount }] : []),
      ...(year ? [{ label: 'year', value: year }] : []),
    ],
    planned: !release,
    variant,
  }
}

const sourceFlowLanes = $derived.by<SourceFlowLane[]>(() =>
  apiFamilyOrder.flatMap(familyType => {
    const primaryType = primaryTypeByApiFamily[familyType]
    const groupLabel = familyType === 'stats' ? 'cohort' : 'domain'
    const sourceGroup =
      familyType === 'stats'
        ? sourceCohort
        : (source: RegistrySource) => sourceDomain(source, familyType)
    const domainMetadata = domainsByApiFamily[familyType]
    const defaultDomainCode = domainMetadata?.defaultDomainCode ?? 'default'
    const familySources = sources
      .filter(
        source =>
          source.theme === familyType &&
          !(familyType === 'addresses' && source.publisherCode === 'overture'),
      )
      .sort((left, right) => {
        const leftGroup = sourceGroup(left)
        const rightGroup = sourceGroup(right)
        if (familyType === 'stats' && leftGroup !== rightGroup) {
          return rightGroup.localeCompare(leftGroup, undefined, { numeric: true })
        }
        if (familyType !== 'stats') {
          const domainOrder = [
            defaultDomainCode,
            'default',
            'overture',
            'hkgov-pland-pu',
            'hkgov-pland-new-town',
            'hkgov-landsd',
          ]
          const domainRank = (domain: string) => {
            const index = domainOrder.indexOf(domain)
            return index === -1 ? domainOrder.length : index
          }
          const domainDifference = domainRank(leftGroup) - domainRank(rightGroup)
          if (domainDifference) return domainDifference
        }
        const leftIsPrimary = left.resourceTypes.includes(primaryType)
        const rightIsPrimary = right.resourceTypes.includes(primaryType)
        if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1
        return left.code.localeCompare(right.code)
      })

    if (!familySources.length) return []

    const theme = apiFamilyThemes[familyType]
    const domains = [...new Set(familySources.map(sourceGroup))].flatMap(groupCode => {
      const domainSources = familySources.filter(
        source => sourceGroup(source) === groupCode,
      )
      const primary =
        domainSources.find(source => source.resourceTypes.includes(primaryType)) ??
        domainSources[0]
      if (!primary) return []

      return [
        {
          id: `${familyType}:${groupCode}`,
          label:
            familyType === 'stats'
              ? groupCode
              : domainLabel(groupCode, domainMetadata?.i18n[groupCode]),
          primary: sourceFlowInput(primary, primaryType),
          variants: domainSources
            .filter(source => source.id !== primary.id)
            .map(source => sourceFlowInput(source, primaryType)),
        },
      ]
    })
    const defaultDomain =
      (familyType === 'stats'
        ? domains.find(domain => domain.label !== 'CURRENT')
        : domains.find(domain => domain.id === `${familyType}:${defaultDomainCode}`)) ??
      domains[0]
    if (!defaultDomain) return []

    return [
      {
        id: familyType,
        label: theme.name,
        href: `/apis/${familyType}`,
        accent: theme.colorway.primary,
        secondary: theme.colorway.secondary,
        ink: '#fffaf0',
        image: theme.image,
        primary: defaultDomain.primary,
        primaryGroupLabel: defaultDomain.label,
        groupLabel,
        defaultGroupExpanded: familyType === 'stats',
        defaultAllGroupsExpanded: familyType === 'stats',
        defaultInputLimit: familyType === 'stats' ? 3 : undefined,
        domains,
      },
    ]
  }),
)
</script>

<Main variant="page" class="py-14">
  <SourcesHeader.Root>
    <SourcesHeader.Path />
    <SourcesHeader.Title />
    {#snippet actions()}
      <SourcesHeader.Controls bind:expandAll bind:showPlanned />
    {/snippet}
  </SourcesHeader.Root>

  <SourceFlowMap.Root bind:expandAll bind:showPlanned lanes={sourceFlowLanes} />
</Main>
