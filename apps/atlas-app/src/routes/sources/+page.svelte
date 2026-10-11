<script lang="ts">
import curatedDivisionRelationship from '../../../../../fixtures/meta/datasetInputs/saanseoi-division.json'
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
import { getPublisherLogo, publisherLogoPadding } from '#lib/registry/publisherLogo.js'
import { publisherAccent } from '#lib/bits/pages/publishers/publisherPresentation.js'
import {
  getMarkdownTransclusion,
  getMarkdownTransclusionDisplayTitle,
} from '#lib/registry/referenceDocs.js'
import type { LocalisedRow } from '#lib/registry/types.js'
import { sourceFlowDomain, sourceFlowPriority } from './sourceFlowDomain.js'
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

const streetGeometryLabels: Record<string, string> = {
  'ds-hk-hkgov-hyd-pedestrian-street': 'GEOMETRY',
  'ds-hk-hkgov-hyd-sensitive-street': 'POLYGON',
  'ds-hk-hkgov-hyd-strategic-street': 'POLYGON',
  'ds-hk-hkgov-hyd-street': 'POINT',
  'ds-hk-hkgov-landsd-road-centreline': 'LINE',
}

const sourceVersion = (source: SourcesPageSource) =>
  source.sourceVersions?.find(version => version.status === 'current') ?? null

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
  if (source.releaseFrequency === 'census') {
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
      stat.category === 'records' &&
      stat.measure === 'count' &&
      stat.unit === 'count' &&
      !stat.dimension &&
      !stat.dimensionValue,
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
    ...Object.values(source.datasetI18n).flatMap(row => [
      row.name,
      row.description ?? '',
    ]),
    ...Object.values(source.publisher?.publisherI18n ?? {}).map(row => row.name),
  ]

  return terms.some(term => term.toLocaleLowerCase(locale).includes(sourceSearchQuery))
}

const domainLabel = (domain: string, i18n?: Record<string, LocalisedRow>) =>
  selectLocalisedRow(i18n, locale)?.name ??
  {
    geographic: 'GEOGRAPHICAL',
    planning: 'PLANNING',
    'new-town': 'NEW TOWN',
    default: 'DEFAULT',
  }[domain] ??
  domain.replaceAll('-', ' ').toUpperCase()

const variantLabel = (
  source: SourcesPageSource,
  primaryType: string,
  familyType: string,
) => {
  if (familyType === 'addresses' && source.publisherCode === 'overture')
    return 'SUPPLEMENTARY'
  if (familyType === 'streets') return streetGeometryLabels[source.code]
  if (source.resourceTypes.includes('divisionArea')) return 'AREA'
  if (source.resourceTypes.includes('divisionBoundary')) return 'BOUNDARY'

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
  familyType: string,
): SourceFlowInput => {
  const variant =
    familyType === 'divisions' || familyType === 'streets' || familyType === 'addresses'
      ? variantLabel(source, primaryType, familyType)
      : undefined
  const release = sourceVersion(source)
  const recordCount = formatRecordCount(sourceRecordCount(source))
  const year = sourceYear(source)

  return {
    id: source.code,
    publisher: publisherName(source),
    source: sourceName(source),
    href: `/sources/${source.code}${release ? `/${release.code}` : ''}`,
    icon: getPublisherLogo(source.publisherCode),
    iconPadding: publisherLogoPadding(source.publisherCode),
    cardTone:
      source.publisherCode === 'saanseoi' || source.publisherCode === 'protomaps'
        ? 'soft'
        : undefined,
    iconBorder: source.publisherCode.startsWith('hkgov')
      ? 'hkgov'
      : source.publisherCode === 'saanseoi' ||
          source.publisherCode === 'protomaps' ||
          source.publisherCode === 'dpang'
        ? source.publisherCode
        : 'overture',
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
    planned:
      !release ||
      (familyType === 'addresses' &&
        source.publisherCode === 'overture' &&
        !source.sourceVersions?.some(
          version =>
            version.status === 'current' &&
            version.releaseAs.some(release => release.apiFamily === 'addresses'),
        )),
    variant,
  }
}

const curatedRelationships = [curatedDivisionRelationship]
const curatedInputsByDataset = new Map(
  curatedRelationships.map(relationship => [
    relationship.datasetCode,
    relationship.inputs,
  ]),
)

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
              source.theme === familyType ||
              (familyType === 'addresses' &&
                source.resourceTypes.includes('address')) ||
              (familyType === 'divisions' &&
                source.resourceTypes.some(resourceType =>
                  ['division', 'divisionArea', 'divisionBoundary'].includes(
                    resourceType,
                  ),
                )),
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
            const priorityDifference =
              sourceFlowPriority(left, familyType, leftGroup, primaryType) -
              sourceFlowPriority(right, familyType, rightGroup, primaryType)
            if (priorityDifference) return priorityDifference
            return left.code.localeCompare(right.code)
          })

        if (familyType === 'divisions') {
          for (const relationship of curatedRelationships) {
            const parent = familySources.find(
              source => source.code === relationship.datasetCode,
            )
            const matchedInput = sources.some(
              source =>
                relationship.inputs.includes(source.code) &&
                sourceMatchesSearch(source),
            )
            if (!parent && matchedInput) {
              const curated = sources.find(
                source => source.code === relationship.datasetCode,
              )
              if (curated) familySources.unshift(curated)
            }
          }
        }
        const nestedInputCodes = new Set(
          familyType === 'divisions'
            ? curatedRelationships.flatMap(relationship =>
                familySources.some(source => source.code === relationship.datasetCode)
                  ? relationship.inputs.filter(
                      code => code !== 'ds-hk-hkgov-landsd-division',
                    )
                  : [],
              )
            : [],
        )
        const inputWithSources = (source: SourcesPageSource): SourceFlowInput => ({
          ...sourceFlowInput(source, primaryType, familyType),
          inputs: (curatedInputsByDataset.get(source.code) ?? []).flatMap(code => {
            const upstream = sources.find(item => item.code === code)
            if (!upstream) return []
            const input = sourceFlowInput(upstream, primaryType, familyType)
            // Islands also contribute area geometry to the curated divisions.
            if (
              source.code === 'ds-hk-saanseoi-division' &&
              upstream.code !== 'ds-hk-protomaps-island'
            )
              input.variant = undefined
            return [input]
          }),
        })
        if (!familySources.length) return []

        const theme = apiFamilyThemes[familyType]
        const domains = [...new Set(familySources.map(sourceGroup))].flatMap(
          groupCode => {
            const domainSources = familySources.filter(
              source =>
                sourceGroup(source) === groupCode && !nestedInputCodes.has(source.code),
            )
            const primary = domainSources[0]
            if (!primary) return []

            return [
              {
                id: `${familyType}:${groupCode}`,
                label: domainLabel(
                  groupCode,
                  domainMetadata?.members.find(
                    member => member.domainCode === groupCode,
                  )?.i18n,
                ),
                primary: inputWithSources(primary),
                variants: domainSources
                  .filter(source => source.code !== primary.code)
                  .map(inputWithSources),
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
              {#snippet child({
                props,
              })}
                <button
                  {...props}
                  class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
                  type="button"
                  aria-label={getMarkdownTransclusionDisplayTitle(
                    apiFamilyDefinition,
                    locale,
                  )}
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
              {#snippet child({
                props,
              })}
                <button
                  {...props}
                  class="font-inherit font-semibold text-secondary underline decoration-dotted underline-offset-4 hover:text-primary"
                  type="button"
                  aria-label={getMarkdownTransclusionDisplayTitle(
                    domainDefinition,
                    locale,
                  )}
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
