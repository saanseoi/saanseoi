<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { source_geometry_district_fallback } from '@repo/i18n/messages'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'
import * as ReleaseAudit from '#lib/bits/pages/docs/components/releaseAudit/index.js'
import * as ReleaseDiff from '#lib/bits/pages/docs/components/releaseDiff/index.js'
import * as ReleaseHeader from '#lib/bits/pages/docs/components/releaseHeader/index.js'
import * as ReleaseLinks from '#lib/bits/pages/docs/components/releaseLinks/index.js'
import * as ReleaseNav from '#lib/bits/pages/docs/components/releaseNav/index.js'
import * as ReleaseNotes from '#lib/bits/pages/docs/components/releaseNotes/index.js'
import * as ReleaseSamples from '#lib/bits/pages/docs/components/releaseSamples/index.js'
import * as ReleaseStats from '#lib/bits/pages/docs/components/releaseStats/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'

import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { createDeferredRemoteResource } from '#lib/remote/createDeferredRemoteResource.svelte.js'
import {
  getApiReleasePageData,
  getDistrictCoverageMapData,
} from '#lib/registry/meta.remote.js'
import { diffMarkdown } from '#lib/registry/markdown.js'
import { getReleaseVersionLabel } from '#lib/registry/releaseCode.js'
import {
  compareApiReleaseVersions,
  getVisibleApiReleaseVersions,
} from '#lib/registry/apiReleaseVersions.js'
import { getReleaseHeaderDomainOptions } from '#lib/bits/pages/docs/components/releaseHeader/releaseHeaderDomainOptions.js'
import {
  buildReleaseNotesPresentation,
  selectReleaseNotesMarkdown,
} from '#lib/registry/releaseNotesPresentation.js'
import { supportsReleaseSamples } from '#lib/bits/pages/docs/components/releaseSamples/releaseSamplesPresentation.js'
import type {
  ReleaseNavAction,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
} from '#lib/bits/pages/docs/components/releaseNav/releaseNav.types.js'
import type { ReleaseContentHeading } from '#lib/bits/pages/docs/components/releaseContentOutline/index.js'
import type {
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
} from '#lib/bits/pages/docs/components/releaseStats/index.js'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import { error } from '@sveltejs/kit'
import ApiReleaseContentSkeleton from './apiReleaseContentSkeleton.svelte'
import { buildApiReleaseLinksPresentation } from './releaseLinks.presentation'

let { params, data } = $props()
let initialShell = $derived(data.apiReleaseShell)
let lastReadyShell = $state<typeof initialShell | null>(null)
$effect(() => {
  if (initialShell) lastReadyShell = initialShell
})
let shell = $derived(initialShell ?? lastReadyShell)
let contentResource = createDeferredRemoteResource({
  createQuery: familyType => getApiReleasePageData(familyType),
  getInput: () => params.familyType,
  getKey: familyType => familyType,
  hasShell: () => Boolean(shell),
})
let api = $derived.by(() => {
  const value = contentResource.current ?? shell
  if (!value) error(500, 'API release data unavailable.')
  return value
})
let isContentLoading = $derived(contentResource.loading)

let release = $derived.by(() => {
  const selected = api.releases?.find(item => item.code === params.releaseCode)

  if (!selected) error(404, 'API release not found.')

  return selected
})

let seoTitle = $derived(
  `${release.apiFamily} API ${getReleaseVersionLabel(release.code, release.apiFamily)}`,
)
let seoDescription = $derived(`${m.api_release_notes()}: ${seoTitle}.`)

let locale = $derived(getCurrentLocale())
let currentDomainCode = $derived(release.domainCode ?? 'default')
let domainReleases = $derived(
  (api.releases ?? [])
    .filter(item => (item.domainCode ?? 'default') === currentDomainCode)
    .sort((left, right) =>
      compareApiReleaseVersions(
        { label: getReleaseVersionLabel(left.code, api.familyType) },
        { label: getReleaseVersionLabel(right.code, api.familyType) },
      ),
    ),
)

let previousRelease = $derived.by(() => {
  const releases = domainReleases
  const currentIndex = releases.findIndex(item => item.code === release.code)

  return currentIndex >= 0 ? releases[currentIndex + 1] : undefined
})

let notes = $derived(selectReleaseNotesMarkdown(release.notes, locale))
let previousNotes = $derived(selectReleaseNotesMarkdown(previousRelease?.notes, locale))
let notesPresentation = $derived(
  buildReleaseNotesPresentation(notes, locale, [previousNotes]),
)
let noteDiff = $derived(diffMarkdown(previousNotes, notes))
let noteHeadings = $derived(notesPresentation.headings)
type ApiReleaseTab = 'notes' | 'samples' | 'stats' | 'audit' | 'sources'
type ApiReleaseUrl = {
  searchParams: {
    get(name: string): string | null
  }
}
const getApiReleaseTabFromUrl = (url: ApiReleaseUrl): ApiReleaseTab => {
  const tab = url.searchParams.get('tab') ?? ''
  return ['notes', 'samples', 'stats', 'audit', 'sources'].includes(tab)
    ? (tab as ApiReleaseTab)
    : 'notes'
}
let activeTab = $state<ApiReleaseTab>(getApiReleaseTabFromUrl(page.url))
let showAllRevisions = $state(false)
let activeHeadingId = $state<string | null>(null)
let statsHeadings = $state<ReleaseContentHeading[]>([])
let activeStatsHeadingId = $state<string | null>(null)
let auditHeadings = $state<MarkdownHeading[]>([])
let activeAuditHeadingId = $state<string | null>(null)
let showNoteDiff = $state(page.url.searchParams.get('view') === 'diff')
$effect(() => {
  showNoteDiff = page.url.searchParams.get('view') === 'diff'
})
let showBulkActions = $state(false)
let sampleRequest = $state(0)
let sampleCount = $state(0)
let sampleView = $state<'distinct' | 'grouped'>('distinct')
let sampleTarget = $state<string | null>(null)
$effect(() => {
  const nextTarget = `${release.apiVersion}:${release.code}`
  if (sampleTarget === nextTarget) return
  sampleTarget = nextTarget
  sampleRequest = 0
  sampleCount = 0
  sampleView = 'distinct'
})
let districtMapData = $derived(
  activeTab === 'stats' ? getDistrictCoverageMapData(locale) : null,
)

const humaniseStat = (value: string | null | undefined) =>
  !value
    ? 'Unspecified'
    : value
        .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll(/[_-]/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase())

const isDistrictGeometry = (
  geometry: unknown,
): geometry is ReleaseStatsDistrictArea['geometry'] =>
  Boolean(
    geometry &&
      typeof geometry === 'object' &&
      'type' in geometry &&
      'coordinates' in geometry &&
      ((geometry as { type?: unknown }).type === 'Polygon' ||
        (geometry as { type?: unknown }).type === 'MultiPolygon'),
  )
let districtAreas = $state<ReleaseStatsDistrictArea[]>([])

$effect(() => {
  const request = districtMapData
  let cancelled = false
  if (!request) {
    districtAreas = []
    return
  }

  void request
    .then(rows => {
      if (!cancelled)
        districtAreas = rows.flatMap(row =>
          isDistrictGeometry(row.geometry)
            ? [
                {
                  divisionId: row.divisionId,
                  geometry: row.geometry,
                  name: row.name,
                },
              ]
            : [],
        )
    })
    .catch(() => {
      if (!cancelled) districtAreas = []
    })

  return () => {
    cancelled = true
  }
})

let statsPresentation = $derived<ReleaseStatsCopy>({
  labels: {
    added: m.source_added(),
    changed: m.source_changed(),
    removed: m.source_removed(),
    unchanged: m.source_unchanged(),
    dataset: m.source_primary_records(),
    records: m.source_records(),
    overview: m.source_change_summary(),
    changeSummary: m.source_change_summary(),
    comparisonBaseline: m.source_comparison_baseline(),
    comparisonPrevious: m.source_comparison_previous(),
    coverage: m.source_coverage(),
    completeness: m.source_completeness(),
    namesByLocale: m.source_names_by_locale(),
    provided: m.source_locale_provided(),
    inferred: m.source_locale_inferred(),
    localeLegend: 'Provided locale and inferred locale',
    completenessInfo: m.source_completeness_info(),
    completenessInfoDescription: m.source_completeness_info_description(),
    addressComponents: 'Address components',
    changeDistribution: m.source_change_distribution(),
    recordsByType: m.source_records_by_type(),
    recordsByGeometryClass: m.source_records_by_geometry_class(),
    typeLegend: 'Added, changed, removed, and unchanged records',
    changeDistributionInfo: m.source_change_distribution_info(),
    changeDistributionInfoDescription: m.source_change_distribution_info_description(),
    processingActions: m.source_processing_actions(),
    processingActionsInfo: m.source_processing_actions_info(),
    processingActionsInfoDescription: m.source_processing_actions_info_description(),
    qualityChecks: m.source_quality_checks(),
    qualityInfo: m.source_quality_info(),
    qualityInfoDescription: m.source_quality_info_description(),
    qualityNone: m.source_quality_none(),
    noStats: m.source_stats_unavailable(),
    stats: m.source_tab_stats(),
    recordsByDistrict: 'Records by district',
    district: 'District',
    geometry: m.source_geometry(),
    geometryByDistrict: m.source_geometry_by_district(),
    geometryInfo: m.source_geometry_info(),
    geometryInfoDescription: m.source_geometry_info_description(),
    geometryFeatures: m.source_geometry_features(),
    geometryPolygons: m.source_geometry_polygons(),
    geometryArea: m.source_geometry_area(),
    geometryBoundarySegments: m.source_geometry_boundary_segments(),
    geometryBoundaryLength: m.source_geometry_boundary_length(),
    geometryUnofficial: m.source_geometry_unofficial(),
    notApplicable: m.source_not_applicable(),
  },

  localeName: code =>
    ({
      en: m.source_locale_en(),
      'zh-hant': m.source_locale_zh_hant(),
      'zh-hans': m.source_locale_zh_hans(),
    })[code] ?? code,
  statLabel: value =>
    value === 'missing_street_count' ? 'Missing street linkage' : humaniseStat(value),
  districtFallback: districtId =>
    source_geometry_district_fallback({ district: districtId }),
  processingAction: code => {
    const [mode, ...action] = code.split(':')
    return {
      issue: humaniseStat(action.join(':')),
      outcome: 'Processed',
      mode: mode === 'manual' ? 'Manual' : 'Automatic',
    }
  },
  qualityDescription: dimension =>
    dimension === 'missing_street_count'
      ? 'Addresses in this API release that could not be linked to a SaanSeoi street record. This does not mean the publisher omitted a street name.'
      : humaniseStat(dimension),
})
let allVersions = $derived(
  domainReleases.map((item, index, releases) => ({
    code: item.code,
    cohortKey: item.cohortKey,
    href: (() => {
      const searchParams = new URLSearchParams()
      if (activeTab !== 'notes') searchParams.set('tab', activeTab)
      if (activeTab === 'notes' && showNoteDiff && index < releases.length - 1)
        searchParams.set('view', 'diff')

      const search = searchParams.toString()
      return `/apis/${api.familyType}/${item.code}${search ? `?${search}` : ''}`
    })(),
    label: getReleaseVersionLabel(item.code, api.familyType),
    revision: item.revision,
  })),
)
let versions = $derived(
  getVisibleApiReleaseVersions(allVersions, showAllRevisions, release.code),
)
let navigationVersions = $derived(
  getVisibleApiReleaseVersions(allVersions, showAllRevisions),
)

let currentComposition = $derived(
  api.apiComposition
    ?.filter(item => item.status === 'current')
    .sort((left, right) => right.version - left.version)[0],
)

let domains = $derived(
  getReleaseHeaderDomainOptions(api, release).map(option => ({
    ...option,
    label:
      selectLocalisedRow(currentComposition?.i18n?.[option.code], locale)?.name ??
      option.code,
  })),
)
function setShowNoteDiff(enabled: boolean) {
  showNoteDiff = enabled
  const url = new URL(page.url.href)
  if (enabled) url.searchParams.set('view', 'diff')
  else url.searchParams.delete('view')
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    replace: true,
    shallow: true,
    state: {},
  })
}
function setActiveTab(tab: string) {
  activeTab = tab as ApiReleaseTab
  const url = new URL(page.url.href)
  if (tab === 'notes') url.searchParams.delete('tab')
  else url.searchParams.set('tab', tab)
  url.hash = ''
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    shallow: true,
    state: {},
  })
}
let tabs = $derived<ReleaseNavTab[]>([
  { compactLabel: m.source_notes(), id: 'notes', label: m.api_release_notes() },
  { id: 'stats', label: m.api_release_stats() },
  ...(release.processingActions?.length || release.bulkActions?.length
    ? [{ id: 'audit', label: 'Audit' }]
    : []),
  { id: 'samples', label: 'Samples' },
  { id: 'sources', label: m.pipeline_sources_eyebrow() },
])

$effect(() => {
  const tab = getApiReleaseTabFromUrl(page.url)
  activeTab = tabs.some(({ id }) => id === tab) ? tab : 'notes'
})

let actions = $derived<ReleaseNavAction[]>(
  activeTab === 'notes' && versions[1]
    ? [
        {
          icon: 'proicons:diff',
          id: 'diff',
          label: m.source_diff_since_last_release(),
          onSelect: () => setShowNoteDiff(!showNoteDiff),
          pressed: showNoteDiff,
        },
      ]
    : activeTab === 'samples' && supportsReleaseSamples(release.apiVersion)
      ? [
          {
            id: 'more-samples',
            label: 'Show more',
            onSelect: () => (sampleRequest += 1),
          },
          ...(sampleCount > 1
            ? [
                {
                  id: 'sample-view',
                  label: sampleView === 'grouped' ? 'Distinct' : 'Group by key',
                  onSelect: () =>
                    (sampleView = sampleView === 'grouped' ? 'distinct' : 'grouped'),
                },
              ]
            : []),
        ]
      : activeTab === 'audit' && release.bulkActions?.length
        ? [
            {
              icon: 'ion:layers-outline',
              id: 'bulk',
              label: m.source_bulk_actions(),
              onSelect: () => (showBulkActions = !showBulkActions),
              pressed: showBulkActions,
            },
          ]
        : [],
)

let sourceReleaseLinksPresentation = $derived(
  buildApiReleaseLinksPresentation(
    release.contributingSources,
    api.familyType,
    (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(/\/+$/, ''),
  ),
)
let sourceOutline = $derived(
  ReleaseLinks.getReleaseLinksOutline(sourceReleaseLinksPresentation, 'groups'),
)

let tocHeadings = $derived(
  activeTab === 'notes'
    ? noteHeadings
    : activeTab === 'stats'
      ? statsHeadings
      : activeTab === 'audit'
        ? auditHeadings
        : [],
)
let activeTocHeadingId = $derived(
  activeTab === 'notes'
    ? activeHeadingId
    : activeTab === 'stats'
      ? activeStatsHeadingId
      : activeTab === 'audit'
        ? activeAuditHeadingId
        : null,
)
let outline = $derived<ReleaseNavOutlineItem[]>(
  activeTab === 'sources'
    ? sourceOutline
    : tocHeadings.map(heading => ({
        depth: heading.level,
        id: heading.id,
        label: 'label' in heading ? heading.label : heading.text,
      })),
)
let hasContent = $derived.by(() => {
  if (isContentLoading) return true
  if (activeTab === 'notes') {
    return showNoteDiff
      ? noteDiff.changes.length > 0
      : Boolean(notesPresentation.markdown.trim())
  }
  if (activeTab === 'stats') return Boolean(release.stats?.length)
  if (activeTab === 'samples') return true
  if (activeTab === 'audit') {
    return Boolean(release.processingActions?.length || release.bulkActions?.length)
  }
  return Boolean(release.contributingSources?.length)
})

$effect(() => {
  release.code
  activeHeadingId = null
  activeStatsHeadingId = null
  activeAuditHeadingId = null
})
</script>

<Seo
  title={seoTitle}
  description={seoDescription}
  type="article"
  publishedTime={release.publishedAt ?? release.createdAt}
  modifiedTime={release.updatedAt}
  noindex={page.url.searchParams.size > 0}
/>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  <ReleaseHeader.ApiVariant {api} {release} {locale} />

  <ReleaseNav.Root
    {versions}
    {navigationVersions}
    currentVersionCohortKey={release.cohortKey}
    onToggleRevisions={() => (showAllRevisions = !showAllRevisions)}
    {showAllRevisions}
    showRevisionToggle={allVersions.some(version => (version.revision ?? 0) > 0)}
    {domains}
    domainTitle="Domains"
    {currentDomainCode}
    currentVersionCode={release.code}
    loading={isContentLoading}
    activeOutlineId={activeTocHeadingId}
    {hasContent}
    nestedContent={activeTab === 'notes' && !showNoteDiff}
    {outline}
    {actions}
    versionTitle={m.api_release_versions()}
    {tabs}
    onTabChange={setActiveTab}
    bind:activeTab
  >
    {#if isContentLoading && contentResource.showSkeleton}
      <ApiReleaseContentSkeleton tab={activeTab} diff={showNoteDiff} />
    {:else if contentResource.error}
      <section
        class="rounded-md border border-error/30 bg-error-container px-5 py-4 font-body text-body-md text-on-error-container"
        role="alert"
      >
        <p>API release content could not be loaded.</p>
        <button
          class="mt-3 font-semibold underline underline-offset-4"
          onclick={() => void contentResource.query.refresh()}
          type="button"
        >
          Retry
        </button>
      </section>
    {:else}
      <div
        class="h-full min-h-0"
        transition:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
      >
        {#if activeTab === 'notes'}
          <div class:contents={showNoteDiff} class="h-full min-h-0">
            {#if showNoteDiff && previousRelease}
              <ReleaseDiff.Root
                changes={noteDiff.changes}
                labels={{
                  added: m.source_added(),
                  removed: m.source_removed(),
                  empty: m.source_diff_no_changes(),
                }}
                markdown={notesPresentation}
              />
            {:else}
              <ReleaseNotes.Root
                markdown={notesPresentation.markdown}
                headings={noteHeadings}
                labels={notesPresentation.labels}
                transclusions={notesPresentation.transclusions}
                bind:activeHeadingId
              />
            {/if}
          </div>
        {:else if activeTab === 'stats'}
          <ReleaseStats.Root
            stats={release.stats}
            {districtAreas}
            {locale}
            presentation={statsPresentation}
            bind:headings={statsHeadings}
            bind:activeHeadingId={activeStatsHeadingId}
          />
        {:else if activeTab === 'samples'}
          {#key `${release.apiVersion}:${release.code}`}
            <ReleaseSamples.Root
              apiVersion={release.apiVersion}
              apiFamily={release.apiFamily}
              releaseSet={release.code}
              request={sampleRequest}
              bind:sampleCount
              bind:view={sampleView}
            />
          {/key}
        {:else if activeTab === 'audit'}
          <ReleaseAudit.Root
            actions={release.processingActions}
            bulkActions={release.bulkActions}
            {locale}
            {showBulkActions}
            bind:headings={auditHeadings}
            bind:activeHeadingId={activeAuditHeadingId}
          />
        {:else}
          <ReleaseLinks.Root>
            <ReleaseLinks.Provenance
              presentation={sourceReleaseLinksPresentation}
              emptyLabel={m.api_release_unavailable()}
            />
          </ReleaseLinks.Root>
        {/if}
      </div>
    {/if}
  </ReleaseNav.Root>
</Main>
