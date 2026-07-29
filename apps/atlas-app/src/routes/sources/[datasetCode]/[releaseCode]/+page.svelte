<script lang="ts">
import { env } from '$env/dynamic/public'

import {
  Main,
  ReleaseAudit,
  ReleaseDiff,
  ReleaseHeader,
  ReleaseLinks,
  ReleaseNav,
  ReleaseNotes,
  ReleaseStats,
} from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { diffMarkdown } from '$lib/registry/markdown'
import type { MarkdownHeading } from '$lib/registry/markdown'
import type { ReleaseContentHeading } from '$lib/bits/pages/docs/components/releaseContentOutline'
import type {
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
} from '$lib/bits/pages/docs/components/releaseStats'
import {
  buildReleaseNotesPresentation,
  selectReleaseNotesMarkdown,
} from '$lib/registry/releaseNotesPresentation'
import { buildSourceReleaseLinksPresentation } from './releaseLinks.presentation'
import type {
  ReleaseNavAction,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
} from '$lib/bits/pages/docs/components/releaseNav/releaseNav.types'
import {
  getDistrictCoverageMapData,
  getSourceDatasetPageData,
} from '$lib/registry/meta.remote'
import { error } from '@sveltejs/kit'

let { params } = $props()

let source = $derived(await getSourceDatasetPageData(params.datasetCode))
let version = $derived.by(() => {
  const selected = source.sourceVersions?.find(item => item.code === params.releaseCode)
  if (!selected) error(404, 'Source release not found.')
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
let activeTab = $state<'notes' | 'released-as' | 'stats' | 'audit'>('notes')
let showNoteDiff = $state(false)
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
            ? [{ divisionId: row.divisionId, geometry: row.geometry, name: row.name }]
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
  },
  localeName: code =>
    ({
      en: m.source_locale_en(),
      'zh-hant': m.source_locale_zh_hant(),
      'zh-hans': m.source_locale_zh_hans(),
    })[code] ?? code,
  statLabel: humaniseStat,
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
  const baseUrl = (env.PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
    /\/+$/,
    '',
  )
  return `${baseUrl}/v0/assets/${version.sourceArchiveAssetId}`
})
let versions = $derived(
  (source.sourceVersions ?? []).map(item => ({
    code: item.code,
    href: `/sources/${source.code}/${item.code}`,
    label: item.sourceVersion || item.code,
  })),
)
let tabs = $derived<ReleaseNavTab[]>([
  { compactLabel: m.source_notes(), id: 'notes', label: m.source_ingestion_notes() },
  { id: 'stats', label: m.source_tab_stats() },
  ...(version.processingActions?.length || bulkActions.length
    ? [{ id: 'audit', label: 'Audit' }]
    : []),
  { id: 'released-as', label: m.source_tab_released_as() },
])
let actions = $derived<ReleaseNavAction[]>(
  activeTab === 'notes' && versions[1]
    ? [
        {
          icon: 'ion:git-compare-outline',
          id: 'diff',
          label: m.source_diff_since_last_release(),
          onSelect: () => (showNoteDiff = !showNoteDiff),
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
  activeTab === 'released-as'
    ? sourceReleaseLinksPresentation.groups.flatMap(group =>
        group.entries.map(entry => ({
          depth: 2,
          id: entry.id ?? entry.href,
          label: `${entry.eyebrow} · ${entry.title}`,
        })),
      )
    : tocHeadings.map(heading => ({
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
    {:else}
      <ReleaseLinks.Root>
        <ReleaseLinks.Provenance
          presentation={sourceReleaseLinksPresentation}
          copyRequestLabel="Copy request"
          emptyLabel={m.source_released_as_empty()}
        />
      </ReleaseLinks.Root>
    {/if}
  </ReleaseNav.Root>
</Main>
