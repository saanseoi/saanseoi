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
import { diffMarkdown } from '#lib/registry/markdown.js'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import type { ReleaseContentHeading } from '#lib/bits/pages/docs/components/releaseContentOutline/index.js'
import type {
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
} from '#lib/bits/pages/docs/components/releaseStats/index.js'
import {
  buildReleaseNotesPresentation,
  selectReleaseNotesMarkdown,
} from '#lib/registry/releaseNotesPresentation.js'
import { buildSourceReleaseAssembliesPresentation } from './releaseAssemblies.presentation'
import { buildSourceReleaseLinksPresentation } from './releaseLinks.presentation'
import type {
  ReleaseNavAction,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
} from '#lib/bits/pages/docs/components/releaseNav/releaseNav.types.js'
import {
  getDistrictCoverageMapData,
  getSourceDatasetPageData,
} from '#lib/registry/meta.remote.js'
import { error } from '@sveltejs/kit'

let { params } = $props()
let source = $derived(await getSourceDatasetPageData(params.datasetCode))

let version = $derived.by(() => {
  const selected = source.sourceVersions?.find(item => item.code === params.releaseCode)
  if (!selected) {
    // During client navigation, the remote query keeps its previous result
    // until the selected dataset is available. Avoid treating that short-lived
    // dataset/release mismatch as a missing release.
    if (source.code !== params.datasetCode) {
      return source.sourceVersions?.[0] ?? error(404, 'Source release not found.')
    }
    error(404, 'Source release not found.')
  }
  return selected
})
let locale = $derived(getCurrentLocale())
let previousVersion = $derived.by(() => {
  const versions = source.sourceVersions ?? []
  const currentIndex = versions.findIndex(item => item.code === version.code)

  return currentIndex >= 0 ? versions[currentIndex + 1] : undefined
})

let notes = $derived(selectReleaseNotesMarkdown(version.notes, locale))
let previousNotes = $derived(selectReleaseNotesMarkdown(previousVersion?.notes, locale))
let notesPresentation = $derived(
  buildReleaseNotesPresentation(notes, locale, [previousNotes]),
)
let noteDiff = $derived(diffMarkdown(previousNotes, notes))
let noteHeadings = $derived(notesPresentation.headings)
let activeHeadingId = $state<string | null>(null)
let statsHeadings = $state<ReleaseContentHeading[]>([])
let activeStatsHeadingId = $state<string | null>(null)
let auditHeadings = $state<MarkdownHeading[]>([])
let activeAuditHeadingId = $state<string | null>(null)
type SourceReleaseTab = 'notes' | 'releases' | 'assembly' | 'stats' | 'audit'
const getSourceReleaseTabFromUrl = (): SourceReleaseTab => {
  const tab = page.url.searchParams.get('tab') ?? ''
  return ['notes', 'releases', 'assembly', 'stats', 'audit'].includes(tab)
    ? (tab as SourceReleaseTab)
    : 'notes'
}
let activeTab = $state<SourceReleaseTab>(getSourceReleaseTabFromUrl())
let showNoteDiff = $derived(page.url.searchParams.get('view') === 'diff')
let showBulkActions = $state(false)
let bulkActions = $derived(
  version.processingRules?.rulesets
    .flatMap(ruleset => ruleset.rules)
    .filter(rule => rule.type === 'bulk') ?? [],
)
let districtMapData = $derived(
  activeTab === 'stats' ? getDistrictCoverageMapData(locale) : null,
)

const humaniseStat = (value: string | null | undefined) =>
  !value
    ? 'Unspecified'
    : value.trim().toLowerCase() === 'sar'
      ? 'SAR'
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
    dataset: m.source_dataset(),
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
    const [rawMode, ...rawAction] = code.split(':')
    return {
      issue: humaniseStat(rawAction.join(':')),
      outcome: 'Processed',
      mode: rawMode === 'manual' ? 'Manual' : 'Automatic',
    }
  },
  qualityDescription: humaniseStat,
})
let hasContent = $derived.by(() => {
  if (activeTab === 'notes') {
    return showNoteDiff
      ? noteDiff.changes.length > 0
      : notesPresentation.markdown.trim().length > 0
  }
  if (activeTab === 'stats') return Boolean(version.stats?.length)
  if (activeTab === 'audit') {
    return Boolean(version.processingActions?.length || bulkActions.length)
  }
  if (activeTab === 'assembly') return Boolean(version.assembledWith?.length)
  return Boolean(version.releaseAs?.length)
})
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
let sourceArchiveUrl = $derived.by(() => {
  if (!version.sourceArchiveAssetId) return undefined

  const baseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
    /\/+$/,
    '',
  )

  return `${baseUrl}/v0/assets/${version.sourceArchiveAssetId}`
})

let versions = $derived(
  (source.sourceVersions ?? []).map((item, index, releases) => ({
    code: item.code,
    href: (() => {
      const searchParams = new URLSearchParams()
      if (activeTab !== 'notes') searchParams.set('tab', activeTab)
      if (activeTab === 'notes' && showNoteDiff && index < releases.length - 1)
        searchParams.set('view', 'diff')

      const search = searchParams.toString()
      return `/sources/${source.code}/${item.code}${search ? `?${search}` : ''}`
    })(),
    label: item.sourceVersion || item.code,
  })),
)
let sourceReleaseAssembliesPresentation = $derived(
  buildSourceReleaseAssembliesPresentation(
    (version.assembledWith ?? []).map(source => ({
      datasetCode: source.datasetCode,
      href: `/sources/${source.datasetCode}/${source.sourceReleaseCode}`,
      label: selectLocalisedRow(source.datasetI18n, locale)?.name ?? source.datasetCode,
      publisherName: selectLocalisedRow(source.publisherI18n, locale)?.name,
      role: source.role,
      sourceVersion: source.sourceVersion,
    })),
  ),
)
function setShowNoteDiff(enabled: boolean) {
  const url = new URL(page.url.href)
  if (enabled) url.searchParams.set('view', 'diff')
  else url.searchParams.delete('view')
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    shallow: true,
    replace: true,
  })
}
function setActiveTab(tab: string) {
  const url = new URL(page.url.href)
  if (tab === 'notes') url.searchParams.delete('tab')
  else url.searchParams.set('tab', tab)
  url.hash = ''
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    shallow: true,
  })
}
let tabs = $derived<ReleaseNavTab[]>([
  { compactLabel: m.source_notes(), id: 'notes', label: m.source_ingestion_notes() },
  { id: 'stats', label: m.source_tab_stats() },
  ...(version.processingActions?.length || bulkActions.length
    ? [{ id: 'audit', label: 'Audit' }]
    : []),
  { id: 'releases', label: m.source_tab_released_as() },
  ...(version.assembledWith?.length ? [{ id: 'assembly', label: 'Assembly' }] : []),
])

$effect(() => {
  const tab = getSourceReleaseTabFromUrl()
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
    : activeTab === 'audit'
      ? [
          ...(bulkActions.length
            ? [
                {
                  icon: 'ion:layers-outline',
                  id: 'bulk',
                  label: m.source_bulk_actions(),
                  onSelect: () => (showBulkActions = !showBulkActions),
                  pressed: showBulkActions,
                },
              ]
            : []),
          sourceArchiveUrl
            ? {
                download: true,
                href: sourceArchiveUrl,
                icon: 'ion:download-outline',
                id: 'download',
                label: m.source_download_archive(),
              }
            : {
                disabled: true,
                icon: 'ion:download-outline',
                id: 'download',
                label: m.source_download_archive(),
              },
        ]
      : [],
)
let sourceReleaseLinksPresentation = $derived(
  buildSourceReleaseLinksPresentation(version.releaseAs),
)
let outline = $derived<ReleaseNavOutlineItem[]>(
  tocHeadings.map(heading => ({
    depth: heading.level,
    id: heading.id,
    label: 'label' in heading ? heading.label : heading.text,
  })),
)
$effect(() => {
  version.code
  activeHeadingId = null
  activeStatsHeadingId = null
  activeAuditHeadingId = null
})
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  <ReleaseHeader.SourceVariant {source} {version} {locale} />

  <ReleaseNav.Root
    {versions}
    currentVersionCode={version.code}
    activeOutlineId={activeTocHeadingId}
    {hasContent}
    nestedContent={activeTab === 'notes' && !showNoteDiff}
    {actions}
    {outline}
    {tabs}
    versionTitle={m.source_versions()}
    onTabChange={setActiveTab}
    bind:activeTab
  >
    {#if activeTab === 'notes'}
      <div class:contents={showNoteDiff} class="h-full min-h-0">
        {#if showNoteDiff && previousVersion}
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
        stats={version.stats}
        {districtAreas}
        {locale}
        presentation={statsPresentation}
        bind:headings={statsHeadings}
        bind:activeHeadingId={activeStatsHeadingId}
      />
    {:else if activeTab === 'audit'}
      <ReleaseAudit.Root
        actions={version.processingActions}
        {bulkActions}
        {locale}
        {showBulkActions}
        bind:headings={auditHeadings}
        bind:activeHeadingId={activeAuditHeadingId}
      />
    {:else if activeTab === 'releases'}
      <ReleaseLinks.Root>
        <ReleaseLinks.Provenance
          presentation={sourceReleaseLinksPresentation}
          copyRequestLabel="Copy request"
          emptyLabel={m.source_released_as_empty()}
        />
      </ReleaseLinks.Root>
    {:else}
      <ReleaseLinks.Root>
        <ReleaseLinks.Provenance
          presentation={sourceReleaseAssembliesPresentation}
          copyRequestLabel="Copy request"
          emptyLabel="No assembled source releases."
        />
      </ReleaseLinks.Root>
    {/if}
  </ReleaseNav.Root>
</Main>
