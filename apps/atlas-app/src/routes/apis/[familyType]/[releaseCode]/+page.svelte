<script lang="ts">
import {
  Main,
  ReleaseAudit,
  ReleaseHeader,
  ReleaseLinks,
  ReleaseNav,
  ReleaseNotes,
  ReleaseStats,
} from '$lib/bits'
import { getCurrentLocale, m } from '$lib/bits/internal/i18n'
import { getApiReleasePageData } from '$lib/registry/meta.remote'
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
let notes = $derived(selectReleaseNotesMarkdown(release.notes, locale))
let notesPresentation = $derived(buildReleaseNotesPresentation(notes, locale))
let noteHeadings = $derived(notesPresentation.headings)
let activeTab = $state('notes')
let activeHeadingId = $state<string | null>(null)
let statsHeadings = $state<ReleaseContentHeading[]>([])
let activeStatsHeadingId = $state<string | null>(null)
let auditHeadings = $state<MarkdownHeading[]>([])
let activeAuditHeadingId = $state<string | null>(null)
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
  (api.releases ?? []).map(item => ({
    code: item.code,
    href: `/apis/${api.familyType}/${item.code}`,
    label: getReleaseVersionLabel(item.code, api.familyType),
  })),
)
let tabs = $derived<ReleaseNavTab[]>([
  { id: 'notes', label: m.api_release_notes() },
  { id: 'stats', label: m.api_release_stats() },
  ...(release.processingActions?.length || release.bulkActions?.length
    ? [{ id: 'audit', label: 'Audit' }]
    : []),
  { id: 'sources', label: m.pipeline_sources_eyebrow() },
])
let actions = $derived<ReleaseNavAction[]>(
  activeTab === 'audit' && release.bulkActions?.length
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
  buildApiReleaseLinksPresentation(release.contributingSources),
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
  tocHeadings.map(heading => ({
    depth: heading.level,
    id: heading.id,
    label: 'label' in heading ? heading.label : heading.text,
  })),
)
let hasContent = $derived(
  activeTab === 'notes'
    ? Boolean(notesPresentation.markdown.trim())
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
    nestedContent={activeTab === 'notes'}
    {outline}
    {actions}
    versionTitle={m.api_release_versions()}
    {tabs}
    bind:activeTab
  >
    {#if activeTab === 'notes'}
      <ReleaseNotes.Root
        markdown={notesPresentation.markdown}
        headings={noteHeadings}
        labels={notesPresentation.labels}
        transclusions={notesPresentation.transclusions}
        bind:activeHeadingId
      />
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
