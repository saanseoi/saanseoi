<script lang="ts">
import { fade } from 'svelte/transition'
import { navigating } from '$app/state'
import { Popover } from 'bits-ui'

import * as SourceFlowMap from '#lib/bits/pages/sources/components/sourceFlowMap/index.js'
import * as SourcesHeader from '#lib/bits/pages/sources/components/sourcesHeader/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import type {
  SourceFlowInput,
  SourceFlowLane,
} from '#lib/bits/pages/sources/components/sourceFlowMap/index.js'
import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { PageDescription, PageHeader, PageTitle } from '#lib/bits/pages/shared/index.js'
import { apiFamilyThemes } from '#lib/registry/apiFamilyTheme.js'
import type { SourcesPageSource } from '#lib/registry/meta.remote.js'
import { getPublisherLogo } from '#lib/registry/publisherLogo.js'
import {
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from '#lib/registry/referenceDocs.js'
import type { LocalisedRow } from '#lib/registry/types.js'
import { sourceFlowDomain } from './sourceFlowDomain.js'
import SourceReleasePageSkeleton from './[datasetCode]/[releaseCode]/sourceReleasePageSkeleton.svelte'

let { data } = $props()
let sourcesPageData = $derived(data.sourcesPageData)
let locale = $derived(getCurrentLocale())
let isNavigatingToRelease = $derived(
  /^\/sources\/[^/]+\/[^/]+$/.test(navigating.to?.url.pathname ?? ''),
)
const definitionHref = (id: 'api-family' | 'domain') =>
  `saanseoi:${locale.toLowerCase()}:definition/${id}/v1`
let apiFamilyDefinition = $derived(
  getMarkdownTransclusion(definitionHref('api-family')),
)
let domainDefinition = $derived(getMarkdownTransclusion(definitionHref('domain')))
let showPlanned = $state(true)
let expandAll = $state(false)
let sourceSearch = $state('')
let sourceSearchQuery = $derived(sourceSearch.trim().toLocaleLowerCase(locale))
let isSourceSearchActive = $derived(sourceSearchQuery.length >= 2)
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

const sourceVersion = (source: SourcesPageSource) =>
  source.sourceVersions?.find(version => version.status === 'published') ?? null

const sourceLicense = (source: SourcesPageSource) =>
  source.license?.code ?? sourceVersion(source)?.license?.code ?? 'unknown'

const explicitCohort = (value: string) => value.match(/\b(19|20)\d{2}\b/)?.[0]

const sourceCohort = (source: SourcesPageSource) => {
  const releaseCohort = sourceVersion(source)?.cohortKey
  if (releaseCohort) return releaseCohort

  const sourceName = selectLocalisedRow(source.datasetI18n, locale)?.name ?? ''
  const explicitYear = explicitCohort(source.code) ?? explicitCohort(sourceName)
  if (explicitYear) return explicitYear

  return 'CURRENT'
}

const sourceName = (source: SourcesPageSource) => {
  const name = selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.code
  return source.theme === 'stats'
    ? name.replace(/^(?:\d{4}\s+(?:By-)?census):\s*/i, '')
    : name
}

const sourceFrequency = (source: SourcesPageSource) => {
  if (source.releaseFrequency === 'census' || source.sourceVariant === 'census') {
    return '5-yearly'
  }
  return source.releaseFrequency
}

const sourceYear = (source: SourcesPageSource) => {
  if (source.theme === 'stats' || !sourceVersion(source)) return null

  const cohort = sourceCohort(source)
  const year = cohort.slice(0, 4)
  return cohort === 'CURRENT' || year === new Date().getFullYear().toString()
    ? null
    : year
}

const sourceRecordCount = (source: SourcesPageSource) =>
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

const publisherName = (source: SourcesPageSource) =>
  selectLocalisedRow(source.publisher?.publisherI18n, locale)?.name ??
  source.publisherCode

const sourceMatchesSearch = (source: SourcesPageSource) => {
  if (!isSourceSearchActive) return true

  const terms = [
    ...source.datasetI18n.flatMap(row => [row.name, row.description ?? '']),
    ...(source.publisher?.publisherI18n ?? []).map(row => row.name),
  ]

  return terms.some(term => term.toLocaleLowerCase(locale).includes(sourceSearchQuery))
}

const publisherAccent = (publisherCode: string) => {
  if (publisherCode === 'dpang') return sourceAccentColors.dpang
  if (publisherCode === 'overture') return sourceAccentColors.overture
  if (publisherCode.startsWith('hkgov')) return sourceAccentColors.hkgov
  return sourceAccentColors.overture
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

const variantLabel = (source: SourcesPageSource, primaryType: string) => {
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
  source: SourcesPageSource,
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
  !sourcesPageData
    ? []
    : apiFamilyOrder.flatMap(familyType => {
        const { domainsByApiFamily, sources } = sourcesPageData
        const primaryType = primaryTypeByApiFamily[familyType]
        const groupLabel = 'domain'
        const sourceGroup = (source: SourcesPageSource) =>
          sourceFlowDomain(source, familyType)
        const domainMetadata = domainsByApiFamily[familyType]
        const defaultDomainCode = domainMetadata?.defaultDomainCode ?? 'default'
        const familySources = sources
          .filter(
            source =>
              source.theme === familyType &&
              !(familyType === 'addresses' && source.publisherCode === 'overture'),
          )
          .filter(sourceMatchesSearch)
          .sort((left, right) => {
            const leftGroup = sourceGroup(left)
            const rightGroup = sourceGroup(right)
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
            const leftIsPrimary = left.resourceTypes.includes(primaryType)
            const rightIsPrimary = right.resourceTypes.includes(primaryType)
            if (leftIsPrimary !== rightIsPrimary) return leftIsPrimary ? -1 : 1
            return left.code.localeCompare(right.code)
          })

        if (!familySources.length) return []

        const theme = apiFamilyThemes[familyType]
        const domains = [...new Set(familySources.map(sourceGroup))].flatMap(
          groupCode => {
            const domainSources = familySources.filter(
              source => sourceGroup(source) === groupCode,
            )
            const primary =
              domainSources.find(source =>
                source.resourceTypes.includes(primaryType),
              ) ?? domainSources[0]
            if (!primary) return []

            return [
              {
                id: `${familyType}:${groupCode}`,
                label: domainLabel(groupCode, domainMetadata?.i18n[groupCode]),
                primary: sourceFlowInput(primary, primaryType),
                variants: domainSources
                  .filter(source => source.code !== primary.code)
                  .map(source => sourceFlowInput(source, primaryType)),
              },
            ]
          },
        )
        const defaultDomain =
          domains.find(domain => domain.id === `${familyType}:${defaultDomainCode}`) ??
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

<Seo title={m.sources_title()} description={m.sources_meta_description()} />

<Main variant="page" class="py-14">
  {#if isNavigatingToRelease}
    <SourceReleasePageSkeleton />
  {:else}
    <section class="space-y-8">
      <PageHeader class="max-w-none">
        <PageTitle>{m.sources_title()}</PageTitle>
        <PageDescription class="max-w-none">
          <Popover.Root>
            <Popover.Trigger openOnHover openDelay={200}>
              {#snippet child({ props })}
                <button
                  {...props}
                  class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
                  type="button"
                  aria-label={getMarkdownTransclusionDisplayTitle(apiFamilyDefinition, locale)}
                >
                  {m.sources_api_families()}
                </button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                class="z-70 max-w-80 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
                side="bottom"
                sideOffset={8}
                collisionPadding={{ right: 16 }}
                >{@html apiFamilyDefinition?.markdown ?? ''}</Popover.Content
              >
            </Popover.Portal>
          </Popover.Root>
          {m.sources_api_families_description()}
          <Popover.Root>
            <Popover.Trigger openOnHover openDelay={200}>
              {#snippet child({ props })}
                <button
                  {...props}
                  class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
                  type="button"
                  aria-label={getMarkdownTransclusionDisplayTitle(domainDefinition, locale)}
                >
                  {m.sources_domains()}
                </button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                class="z-70 max-w-80 rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover"
                side="bottom"
                sideOffset={8}
                collisionPadding={{ right: 16 }}
                >{@html domainDefinition?.markdown ?? ''}</Popover.Content
              >
            </Popover.Portal>
          </Popover.Root>
          {m.sources_domains_description()}
        </PageDescription>
      </PageHeader>
      <div class="flex justify-end">
        <SourcesHeader.Controls bind:expandAll bind:showPlanned bind:sourceSearch />
      </div>
    </section>

    <div transition:fade>
      {#if sourceFlowLanes.length}
        <SourceFlowMap.Root
          bind:expandAll
          bind:showPlanned
          lanes={sourceFlowLanes}
          sourceFilterActive={isSourceSearchActive}
        />
      {:else}
        <p class="py-12 text-center font-body text-body-lg text-foreground-alt">
          {m.sources_search_empty()}
        </p>
      {/if}
    </div>
  {/if}
</Main>
