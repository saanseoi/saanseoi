<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
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
import { getApiReleasePageData } from '$lib/registry/meta.remote'
import { diffMarkdown } from '$lib/registry/markdown'
import { getReleaseVersionLabel } from '$lib/registry/releaseCode'
import {
  buildReleaseNotesPresentation,
  selectReleaseNotesMarkdown,
} from '$lib/registry/releaseNotesPresentation'
import type {
  ReleaseNavAction,
  ReleaseNavOutlineItem,
  ReleaseNavTab,
} from '$lib/bits/pages/docs/components/releaseNav/releaseNav.types'
import type { ReleaseContentHeading } from '$lib/bits/pages/docs/components/releaseContentOutline'
import type { ReleaseStatsCopy } from '$lib/bits/pages/docs/components/releaseStats'
import type { MarkdownHeading } from '$lib/registry/markdown'
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
let previousRelease = $derived.by(() => {
  const releases = api.releases ?? []
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
const humaniseStat = (value: string | null | undefined) =>
  !value
    ? 'Unspecified'
    : value
        .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll(/[_-]/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase())
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
  (api.releases ?? []).map((item, index, releases) => ({
    code: item.code,
    href: `/apis/${api.familyType}/${item.code}${showNoteDiff && index < releases.length - 1 ? '?view=diff' : ''}`,
    label: getReleaseVersionLabel(item.code, api.familyType),
  })),
)
function setShowNoteDiff(enabled: boolean) {
  const url = new URL(page.url)
  if (enabled) url.searchParams.set('view', 'diff')
  else url.searchParams.delete('view')
  void goto(`${url.pathname}${url.search}${url.hash}`, {
    keepFocus: true,
    noScroll: true,
    replaceState: true,
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
  buildApiReleaseLinksPresentation(release.contributingSources, api.familyType),
)
let sourceHeadings = $derived(
  sourceReleaseLinksPresentation.groups.flatMap(group =>
    group.entries.length && group.id && group.title
      ? [
          {
            id: group.id,
            label: group.label ? `${group.label} · ${group.title}` : group.title,
            level: 2,
          },
        ]
      : [],
  ),
)
let tocHeadings = $derived(
  activeTab === 'notes'
    ? noteHeadings
    : activeTab === 'stats'
      ? statsHeadings
      : activeTab === 'audit'
        ? auditHeadings
        : sourceHeadings,
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
  tocHeadings.map(heading => ({
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
  activeTab = 'notes'
  activeHeadingId = null
  activeStatsHeadingId = null
  activeAuditHeadingId = null
})
</script>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  <ReleaseHeader.ApiVariant {api} {release} {locale} />
  <ReleaseNav.Root
    {versions}
    currentVersionCode={release.code}
    activeOutlineId={activeTocHeadingId}
    {hasContent}
    nestedContent={activeTab === 'notes' && !showNoteDiff}
    {outline}
    {actions}
    versionTitle={m.api_release_versions()}
    {tabs}
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
