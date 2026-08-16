<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { source_geometry_district_fallback } from '@repo/i18n/messages'
import {
  Main,
  ReleaseAudit,
  ReleaseDiff,
  ReleaseHeader,
  ReleaseLinks,
  ReleaseNav,
  ReleaseNotes,
  ReleaseStats,
} from '#lib/bits/index.js'

import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import {
  getApiReleasePageData,
  getDistrictCoverageMapData,
  getDistrictGeometryNames,
} from '#lib/registry/meta.remote.js'
import { diffMarkdown } from '#lib/registry/markdown.js'
import { getReleaseVersionLabel } from '#lib/registry/releaseCode.js'
import { getReleaseHeaderDomainOptions } from '#lib/bits/pages/docs/components/releaseHeader/releaseHeaderDomainOptions.js'
import {
  buildReleaseNotesPresentation,
  selectReleaseNotesMarkdown,
} from '#lib/registry/releaseNotesPresentation.js'
import type {
  ReleaseNavAction,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
} from '#lib/bits/pages/docs/components/releaseNav/releaseNav.types.js'
import type { ReleaseContentHeading } from '#lib/bits/pages/docs/components/releaseContentOutline/index.js'
import type {
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
  ReleaseStatsDistrictName,
} from '#lib/bits/pages/docs/components/releaseStats/index.js'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import { error } from '@sveltejs/kit'
import { buildApiReleaseLinksPresentation } from './releaseLinks.presentation'

let { params } = $props()
let api = $derived(await getApiReleasePageData(params.familyType))

let release = $derived.by(() => {
  const selected = api.releases?.find(item => item.code === params.releaseCode)

  if (!selected) error(404, 'API release not found.')

  return selected
})

let locale = $derived(getCurrentLocale())
let currentDomainCode = $derived(release.domainCode ?? 'default')
let domainReleases = $derived(
  (api.releases ?? []).filter(
    item => (item.domainCode ?? 'default') === currentDomainCode,
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
let activeTab = $state('notes')
let activeHeadingId = $state<string | null>(null)
let statsHeadings = $state<ReleaseContentHeading[]>([])
let activeStatsHeadingId = $state<string | null>(null)
let auditHeadings = $state<MarkdownHeading[]>([])
let activeAuditHeadingId = $state<string | null>(null)
let showNoteDiff = $derived(page.url.searchParams.get('view') === 'diff')
let showBulkActions = $state(false)
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
let districtNames = $state<ReleaseStatsDistrictName[]>([])
let districtGeometryIds = $derived([
  ...new Set(
    (release.stats ?? []).flatMap(row =>
      row.dimension === 'geometry' && row.groupBy === 'district' && row.groupValue
        ? [row.groupValue]
        : [],
    ),
  ),
])

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

$effect(() => {
  const request =
    activeTab === 'stats' && districtGeometryIds.length
      ? getDistrictGeometryNames({ districtIds: districtGeometryIds, locale })
      : null
  let cancelled = false
  if (!request) {
    districtNames = []
    return
  }

  void request
    .then(rows => {
      if (!cancelled) districtNames = rows
    })
    .catch(() => {
      if (!cancelled) districtNames = []
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
  statLabel: humaniseStat,
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
  qualityDescription: humaniseStat,
})
let versions = $derived(
  domainReleases.map((item, index, releases) => ({
    code: item.code,
    href: `/apis/${api.familyType}/${item.code}${showNoteDiff && index < releases.length - 1 ? '?view=diff' : ''}`,
    label: getReleaseVersionLabel(item.code, api.familyType),
  })),
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
  const url = new URL(page.url.href)
  if (enabled) url.searchParams.set('view', 'diff')
  else url.searchParams.delete('view')
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    reset: false,
    replaceState: true,
  })
}
function setActiveTab(tab: string) {
  const url = new URL(page.url.href)
  url.hash = tab === 'notes' ? '' : tab
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    reset: false,
  })
}
let tabs = $derived<ReleaseNavTab[]>([
  { compactLabel: m.source_notes(), id: 'notes', label: m.api_release_notes() },
  { id: 'stats', label: m.api_release_stats() },
  ...(release.processingActions?.length || release.bulkActions?.length
    ? [{ id: 'audit', label: 'Audit' }]
    : []),
  { id: 'sources', label: m.pipeline_sources_eyebrow() },
])

$effect(() => {
  const tab = page.url.hash.slice(1)
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
let hasContent = $derived(
  activeTab === 'notes'
    ? showNoteDiff
      ? noteDiff.changes.length > 0
      : Boolean(notesPresentation.markdown.trim())
    : activeTab === 'stats'
      ? Boolean(release.stats?.length)
      : activeTab === 'audit'
        ? Boolean(release.processingActions?.length || release.bulkActions?.length)
        : Boolean(release.contributingSources?.length),
)

$effect(() => {
  release.code
  activeHeadingId = null
  activeStatsHeadingId = null
  activeAuditHeadingId = null
})
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  <ReleaseHeader.ApiVariant {api} {release} {locale} />

  <ReleaseNav.Root
    {versions}
    {domains}
    domainTitle="Domains"
    {currentDomainCode}
    currentVersionCode={release.code}
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
        {districtNames}
        {locale}
        presentation={statsPresentation}
        bind:headings={statsHeadings}
        bind:activeHeadingId={activeStatsHeadingId}
      />
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
  </ReleaseNav.Root>
</Main>
