<script lang="ts">
import { env } from '$env/dynamic/public'

import {
  Main,
  ApiReleases,
  ReleaseAudit,
  ReleaseDiff,
  ReleaseHeader,
  ReleaseNav,
  ReleaseNotes,
  ReleaseStats,
} from '$lib/bits'
import { getCurrentLocale } from '$lib/bits/internal/i18n'
import {
  diffMarkdown,
  getMarkdownHeadings,
  selectLocaleMarkdown,
} from '$lib/registry/markdown'
import type { MarkdownHeading } from '$lib/registry/markdown'
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
let notes = $derived(selectLocaleMarkdown(version.notes, locale))
let previousVersion = $derived.by(() => {
  const versions = source.sourceVersions ?? []
  const currentIndex = versions.findIndex(item => item.code === version.code)
  return currentIndex >= 0 ? versions[currentIndex + 1] : undefined
})
let noteDiff = $derived(
  diffMarkdown(
    previousVersion ? selectLocaleMarkdown(previousVersion.notes, locale) : '',
    notes,
  ),
)
let noteHeadings = $derived(
  getMarkdownHeadings(notes).filter(heading => heading.level >= 2),
)
let activeHeadingId = $state<string | null>(null)
let statsHeadings = $state<MarkdownHeading[]>([])
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
let hasContent = $derived.by(() => {
  if (activeTab === 'notes') {
    return showNoteDiff ? noteDiff.changes.length > 0 : notes.trim().length > 0
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
    sourceCode={source.code}
    versions={source.sourceVersions ?? []}
    currentVersionCode={version.code}
    headings={tocHeadings}
    activeHeadingId={activeTocHeadingId}
    {hasContent}
    releases={version.releaseAs}
    showAudit={Boolean(version.processingActions?.length || bulkActions.length)}
    hasBulkActions={Boolean(bulkActions.length)}
    {sourceArchiveUrl}
    bind:activeTab
    bind:showNoteDiff
    bind:showBulkActions
  >
    {#if activeTab === 'notes'}
      <div class:contents={showNoteDiff} class="h-full min-h-0">
        {#if showNoteDiff && previousVersion}
          <ReleaseDiff.Root changes={noteDiff.changes} {locale} />
        {:else}
          <ReleaseNotes.Root
            source={notes}
            {locale}
            headings={noteHeadings}
            bind:activeHeadingId
          />
        {/if}
      </div>
    {:else if activeTab === 'stats'}
      {#if districtMapData}
        {#await districtMapData then districtAreas}
          <ReleaseStats.Root
            stats={version.stats}
            {districtAreas}
            {locale}
            bind:headings={statsHeadings}
            bind:activeHeadingId={activeStatsHeadingId}
          />
        {:catch}
          <ReleaseStats.Root
            stats={version.stats}
            {locale}
            bind:headings={statsHeadings}
            bind:activeHeadingId={activeStatsHeadingId}
          />
        {/await}
      {:else}
        <ReleaseStats.Root
          stats={version.stats}
          {locale}
          bind:headings={statsHeadings}
          bind:activeHeadingId={activeStatsHeadingId}
        />
      {/if}
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
      <ApiReleases.SourceVariant releases={version.releaseAs} />
    {/if}
  </ReleaseNav.Root>
</Main>
