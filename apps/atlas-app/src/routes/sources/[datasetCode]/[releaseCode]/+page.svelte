<script lang="ts">
import { goto } from '$app/navigation'
import { page } from '$app/state'
import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'

import * as ReleaseAudit from '#lib/bits/pages/docs/components/releaseAudit/index.js'
import * as ReleaseDiff from '#lib/bits/pages/docs/components/releaseDiff/index.js'
import * as ReleaseHeader from '#lib/bits/pages/docs/components/releaseHeader/index.js'
import * as ReleaseLinks from '#lib/bits/pages/docs/components/releaseLinks/index.js'
import * as ReleaseNav from '#lib/bits/pages/docs/components/releaseNav/index.js'
import * as ReleaseNotes from '#lib/bits/pages/docs/components/releaseNotes/index.js'
import * as ReleaseStats from '#lib/bits/pages/docs/components/releaseStats/index.js'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'

import { getCurrentLocale, m, selectLocalisedRow } from '#lib/bits/internal/i18n.js'
import { createDeferredRemoteResource } from '#lib/remote/createDeferredRemoteResource.svelte.js'
import { diffMarkdown } from '#lib/registry/markdown.js'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import type { ReleaseContentHeading } from '#lib/bits/pages/docs/components/releaseContentOutline/index.js'
import type { ReleaseStatsDistrictArea } from '#lib/bits/pages/docs/components/releaseStats/index.js'
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
  ReleaseNavVersion,
} from '#lib/bits/pages/docs/components/releaseNav/releaseNav.types.js'
import {
  getDistrictCoverageMapData,
  getRegistryAccessMetricsData,
  getSourceReleaseAuditActionPage,
  getSourceReleaseAuditData,
} from '#lib/registry/meta.remote.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import SourceReleasePageSkeleton from './sourceReleasePageSkeleton.svelte'
import SourceRecordSamples from './sourceRecordSamples.svelte'
import SourceRecordSchema from './sourceRecordSchema.svelte'
import {
  getSourceReleaseContentQuery,
  preloadSourceReleaseContent,
} from './sourceReleaseContentPreload'
import {
  buildSourceReleaseStatsPresentation,
  buildSourceReleaseVersionLinks,
  getSourceRecordFamily,
  getSourceReleaseTabFromUrl,
  selectDistrictAreas,
  type SourceReleaseTab,
} from './sourceReleasePage.utils'

let { params, data } = $props()
let activeTab = $state<SourceReleaseTab>(getSourceReleaseTabFromUrl(page.url))
let locale = $derived(getCurrentLocale())
// The server load seeds direct and client navigations synchronously. Keep its
// last-ready value while the content query refreshes. A component-level
// await would block the whole page on every client navigation.
let initialShell = $derived(data?.sourceReleaseShell ?? null)
let lastReadyShell = $state<NonNullable<typeof initialShell> | null>(null)
$effect(() => {
  if (initialShell) lastReadyShell = initialShell
})
let shell = $derived(initialShell ?? lastReadyShell)
let source = $derived(shell?.source ?? null)
let shellVersion = $derived(shell?.version ?? null)
let previousVersion = $derived.by(() => {
  if (!shell || !shellVersion) return undefined

  const versions = shell.source.sourceVersions ?? []
  const currentIndex = versions.findIndex(item => item.code === shellVersion.code)

  return currentIndex >= 0 ? versions[currentIndex + 1] : undefined
})
let contentResource = createDeferredRemoteResource({
  createQuery: ({ datasetCode, releaseCode, tab }) =>
    getSourceReleaseContentQuery({
      datasetCode,
      releaseCode,
      previousReleaseCode: null,
      tab,
    }),
  getInput: () => ({
    datasetCode: params.datasetCode,
    releaseCode: params.releaseCode,
    tab: activeTab,
  }),
  getKey: input => `${input.datasetCode}/${input.releaseCode}/${input.tab}`,
  hasShell: () => Boolean(shell),
  retainAcrossKeys: false,
})
function preloadVersion(version: ReleaseNavVersion) {
  if (version.code === params.releaseCode) return

  preloadSourceReleaseContent({
    datasetCode: params.datasetCode,
    releaseCode: version.code,
    previousReleaseCode: null,
    tab: activeTab,
  })
}
let content = $derived(contentResource.current)
let contentVersion = $derived(content?.version ?? null)
let accessMetricsQuery = $derived(
  shellVersion
    ? getRegistryAccessMetricsData({
        entityId: shellVersion.id,
        scope: 'source_release',
      })
    : null,
)
let version = $derived(
  shellVersion && contentVersion
    ? ({
        ...shellVersion,
        ...contentVersion,
        accessMetrics: accessMetricsQuery?.ready
          ? accessMetricsQuery.current
          : shellVersion.accessMetrics,
      } as typeof shellVersion)
    : shellVersion
      ? {
          ...shellVersion,
          accessMetrics: accessMetricsQuery?.ready
            ? accessMetricsQuery.current
            : shellVersion.accessMetrics,
        }
      : contentVersion,
)
let isContentLoading = $derived(contentResource.loading)
let seoTitle = $derived.by(() => {
  const sourceName =
    selectLocalisedRow(source?.datasetI18n, locale)?.name ?? params.datasetCode
  const versionLabel = version?.sourceVersion ?? params.releaseCode
  return `${sourceName} · ${versionLabel}`
})
let seoDescription = $derived(`${seoTitle} — ${m.source_release_notes()}.`)

let notes = $derived(selectReleaseNotesMarkdown(content?.version?.notes, locale))
let previousNotes = $derived(selectReleaseNotesMarkdown(content?.previousNotes, locale))
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
let showNoteDiff = $state(page.url.searchParams.get('view') === 'diff')
$effect(() => {
  showNoteDiff = page.url.searchParams.get('view') === 'diff'
})
let showBulkActions = $state(false)
let bulkActions = $derived(
  version?.processingRules?.rulesets
    .flatMap(ruleset => ruleset.rules)
    .filter(rule => rule.type === 'bulk') ?? [],
)
let sourceRecordFamily = $derived(getSourceRecordFamily(source?.resourceTypes ?? []))
let sourceRecordsAvailable = $state<boolean | null>(null)
let sourceSampleRequest = $state(0)
let sourceSampleTarget = $state<string | null>(null)
$effect(() => {
  const target = sourceRecordFamily ? `${sourceRecordFamily}:${version?.code}` : null
  if (sourceSampleTarget === target) return
  sourceSampleTarget = target
  sourceRecordsAvailable = null
  sourceSampleRequest = 0
})
let districtMapData = $derived(
  activeTab === 'stats' ? getDistrictCoverageMapData(locale) : null,
)
let auditDataQuery = $derived(
  activeTab === 'audit' && (version?.processingActionCount ?? 0) > 0
    ? getSourceReleaseAuditData({
        datasetCode: params.datasetCode,
        releaseCode: params.releaseCode,
      })
    : null,
)
let auditSectionPageQueries = $derived(
  auditDataQuery?.ready
    ? auditDataQuery.current.sections.map(section => ({
        section,
        query: getSourceReleaseAuditActionPage({
          action: section.action,
          datasetCode: params.datasetCode,
          limit: 50,
          offset: 0,
          releaseCode: params.releaseCode,
        }),
      }))
    : [],
)
let auditData = $derived.by(() => {
  if (!auditDataQuery?.ready) return null

  const pageReadiness = auditSectionPageQueries.map(item => item.query.ready)
  if (pageReadiness.some(ready => !ready)) return null

  return {
    sections: auditSectionPageQueries.map(item => ({
      ...item.section,
      rows: item.query.current?.rows ?? [],
      hasMore: item.query.current?.hasMore ?? false,
      nextOffset: item.query.current?.nextOffset ?? 0,
    })),
  }
})
const loadMoreAuditSection = (action: string, offset: number, limit: number) =>
  getSourceReleaseAuditActionPage({
    action,
    datasetCode: params.datasetCode,
    limit,
    offset,
    releaseCode: params.releaseCode,
  })

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
      if (!cancelled) districtAreas = selectDistrictAreas(rows)
    })
    .catch(() => {
      if (!cancelled) districtAreas = []
    })

  return () => {
    cancelled = true
  }
})

let statsPresentation = $derived(buildSourceReleaseStatsPresentation(locale))
let hasContent = $derived.by(() => {
  if (isContentLoading) return true
  if (activeTab === 'notes') {
    return showNoteDiff
      ? noteDiff.changes.length > 0
      : notesPresentation.markdown.trim().length > 0
  }
  if (activeTab === 'stats') return Boolean(version?.stats?.length)
  if (activeTab === 'schema' || activeTab === 'samples')
    return Boolean(sourceRecordFamily)
  if (activeTab === 'audit') {
    return Boolean(
      (version?.processingActionCount ?? version?.processingActions?.length ?? 0) > 0 ||
        bulkActions.length,
    )
  }
  if (activeTab === 'assembly') return Boolean(version?.assembledWith?.length)
  return Boolean(version?.releaseAs?.length)
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
  if (!version?.sourceArchiveAssetId) return undefined

  const baseUrl = (PUBLIC_ATLAS_API_BASE_URL || 'http://localhost:8787').replace(
    /\/+$/,
    '',
  )

  return `${baseUrl}/v0/assets/${version.sourceArchiveAssetId}`
})

let versions = $derived(
  buildSourceReleaseVersionLinks({
    datasetCode: source?.code ?? params.datasetCode,
    versions: source?.sourceVersions ?? [],
    activeTab,
    showNoteDiff,
  }),
)
let sourceReleaseAssembliesPresentation = $derived(
  buildSourceReleaseAssembliesPresentation(
    (version?.assembledWith ?? []).map(source => ({
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
  showNoteDiff = enabled
  trackClientProductUsage({
    event: 'client.release_notes_diff',
    surface: 'source_release',
    entityType: 'action',
    entityId: enabled ? 'open' : 'close',
  })
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
  activeTab = tab as SourceReleaseTab
  trackClientProductUsage({
    event: 'client.release_tab_view',
    surface: 'source_release',
    entityType: 'tab',
    entityId: tab,
  })
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
  { compactLabel: m.source_notes(), id: 'notes', label: m.source_ingestion_notes() },
  ...(sourceRecordFamily
    ? [
        { id: 'schema', label: m.api_release_schema() },
        { id: 'samples', label: m.api_release_samples() },
      ]
    : []),
  { id: 'stats', label: m.source_tab_stats() },
  ...((activeTab === 'audit' && isContentLoading) ||
  (version?.processingActionCount ?? version?.processingActions?.length ?? 0) > 0 ||
  bulkActions.length
    ? [{ id: 'audit', label: m.api_release_audit() }]
    : []),
  { id: 'releases', label: m.source_tab_released_as() },
  { id: 'assembly', label: m.source_tab_assembly() },
])

let releaseQueryError = $derived(contentResource.error)
const refreshRelease = () => contentResource.query.refresh()

$effect(() => {
  const tab = getSourceReleaseTabFromUrl(page.url)
  activeTab =
    ((tab === 'schema' || tab === 'samples') && !sourceRecordFamily) ||
    (tab === 'audit' &&
      !(
        isContentLoading ||
        Boolean(
          (version?.processingActionCount ?? version?.processingActions?.length ?? 0) >
            0 || bulkActions.length,
        )
      ))
      ? 'notes'
      : tab
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
    : activeTab === 'releases'
      ? [
          {
            icon: 'proicons:info',
            id: 'releases-info',
            infoDescription: m.source_tab_released_as_description(),
            label: m.source_tab_released_as_info(),
          },
        ]
      : activeTab === 'assembly'
        ? [
            {
              icon: 'proicons:info',
              id: 'assembly-info',
              infoDescription: m.source_tab_assembly_description(),
              label: m.source_tab_assembly_info(),
            },
          ]
        : activeTab === 'samples' &&
            sourceRecordFamily &&
            sourceRecordsAvailable !== false
          ? [
              {
                icon: 'ion:reload-outline',
                id: 'more-samples',
                label: m.source_show_more(),
                onSelect: () => {
                  sourceSampleRequest += 1
                  trackClientProductUsage({
                    event: 'client.sample_control',
                    surface: 'source_release',
                    entityType: 'action',
                    entityId: version?.code ?? params.releaseCode,
                  })
                },
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
                        onSelect: () => {
                          showBulkActions = !showBulkActions
                          trackClientProductUsage({
                            event: 'client.audit_control',
                            surface: 'source_release',
                            entityType: 'action',
                            entityId: showBulkActions ? 'open_bulk' : 'close_bulk',
                          })
                        },
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
                      analyticsSurface: 'source_release',
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
  buildSourceReleaseLinksPresentation(version?.releaseAs),
)
let outline = $derived<ReleaseNavOutlineItem[]>(
  tocHeadings.map(heading => ({
    depth: heading.level,
    id: heading.id,
    label: 'label' in heading ? heading.label : heading.text,
  })),
)
$effect(() => {
  version?.code
  activeHeadingId = null
  activeStatsHeadingId = null
  activeAuditHeadingId = null
})
</script>

<Seo
  title={seoTitle}
  description={seoDescription}
  type="article"
  publishedTime={version?.publicationDate ?? version?.createdAt}
  modifiedTime={version?.updatedAt}
  noindex={page.url.searchParams.size > 0}
/>

<Main class="mx-auto w-full max-w-(--spacing-container-max) px-6 py-8 md:px-8">
  {#if source && shellVersion && version}
    <ReleaseHeader.SourceVariant {source} {version} {locale} />

    <ReleaseNav.Root
      analyticsSurface="source_release"
      {versions}
      currentVersionCode={params.releaseCode}
      loading={isContentLoading}
      activeOutlineId={activeTocHeadingId}
      {hasContent}
      nestedContent={activeTab === 'notes' && !showNoteDiff}
      {actions}
      {outline}
      {tabs}
      versionTitle={m.source_versions()}
      onTabChange={setActiveTab}
      onVersionPreload={preloadVersion}
      bind:activeTab
    >
      {#if isContentLoading && contentResource.showSkeleton}
        <ReleaseNav.ContentSkeleton
          tab={activeTab}
          diff={showNoteDiff}
          linksVariant={activeTab === 'assembly' ? 'assembly' : 'releases'}
        />
      {:else if releaseQueryError}
        <section
          class="rounded-md border border-error/30 bg-error-container px-5 py-4 font-body text-body-md text-on-error-container"
          role="alert"
        >
          <p>{m.source_release_load_error()}</p>
          <button
            class="mt-3 font-semibold underline underline-offset-4"
            onclick={() => void refreshRelease()}
            type="button"
          >
            {m.source_retry()}
          </button>
        </section>
      {:else}
        <div
          class="h-full min-h-0"
          transition:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
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
                  sourceTableColumns
                  bind:activeHeadingId
                />
              {/if}
            </div>
          {:else if activeTab === 'stats'}
            <ReleaseStats.Root
              measures={content?.measures ?? []}
              stats={version.stats}
              {districtAreas}
              {locale}
              presentation={statsPresentation}
              bind:headings={statsHeadings}
              bind:activeHeadingId={activeStatsHeadingId}
            />
          {:else if activeTab === 'schema' && sourceRecordFamily}
            <SourceRecordSchema
              resourceType={source.resourceTypes[0] ?? ''}
              source={source.publisherCode}
              sourceSchemaUrl={source.schemaURL}
              sourceSchemaVersion={version.sourceSchemaVersion}
              sourceVersion={version.sourceVersion}
            />
          {:else if activeTab === 'samples' && sourceRecordFamily}
            {#key `${sourceRecordFamily}:${version.code}`}
              <SourceRecordSamples
                family={sourceRecordFamily}
                onAvailabilityChange={available => (sourceRecordsAvailable = available)}
                request={sourceSampleRequest}
                sourceReleaseCode={version.code}
              />
            {/key}
          {:else if activeTab === 'audit'}
            <ReleaseAudit.Root
              analyticsSurface="source_release"
              actions={version.processingActions}
              actionSections={auditData?.sections}
              {bulkActions}
              {locale}
              {showBulkActions}
              onLoadMoreSection={loadMoreAuditSection}
              bind:headings={auditHeadings}
              bind:activeHeadingId={activeAuditHeadingId}
            />
          {:else if activeTab === 'releases'}
            <ReleaseLinks.Root>
              <ReleaseLinks.Provenance
                analyticsSurface="source_release"
                presentation={sourceReleaseLinksPresentation}
                copyRequestLabel={m.source_copy_request()}
                emptyLabel={m.source_released_as_empty()}
              />
            </ReleaseLinks.Root>
          {:else}
            <ReleaseLinks.Root>
              <ReleaseLinks.Provenance
                analyticsSurface="source_release"
                presentation={sourceReleaseAssembliesPresentation}
                copyRequestLabel={m.source_copy_request()}
                emptyLabel={m.source_assembly_empty()}
              />
            </ReleaseLinks.Root>
          {/if}
        </div>
      {/if}
    </ReleaseNav.Root>
  {:else if releaseQueryError}
    <section
      class="rounded-md border border-error/30 bg-error-container px-5 py-4 font-body text-body-md text-on-error-container"
      role="alert"
    >
      <p>{m.source_release_load_error()}</p>
      <button
        class="mt-3 font-semibold underline underline-offset-4"
        onclick={() => void refreshRelease()}
        type="button"
      >
        {m.source_retry()}
      </button>
    </section>
  {:else}
    <SourceReleasePageSkeleton />
  {/if}
</Main>
