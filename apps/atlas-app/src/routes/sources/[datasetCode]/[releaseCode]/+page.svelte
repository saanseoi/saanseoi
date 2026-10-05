<script lang="ts">
import { goto } from '$app/navigation'
import { navigating, page } from '$app/state'

import { PUBLIC_ATLAS_API_BASE_URL } from '$app/env/public'
import { prefersReducedMotion } from 'svelte/motion'
import { fade } from 'svelte/transition'

import * as ReleaseDiff from '#lib/bits/pages/docs/components/releaseDiff/index.js'
import * as ReleaseHeader from '#lib/bits/pages/docs/components/releaseHeader/index.js'
import * as ReleaseLinks from '#lib/bits/pages/docs/components/releaseLinks/index.js'
import * as ReleaseNav from '#lib/bits/pages/docs/components/releaseNav/index.js'
import * as ReleaseNotes from '#lib/bits/pages/docs/components/releaseNotes/index.js'
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
  getRegistryAccessMetricsData,
  getSourceReleaseAuditActionPage,
  getSourceReleaseAuditData,
} from '#lib/registry/meta.remote.js'
import { getDistrictCoverageMapData } from '#lib/registry/district.remote.js'
import { trackClientProductUsage } from '#lib/analytics/clientProductUsage.js'
import SourceReleasePageSkeleton from './sourceReleasePageSkeleton.svelte'
import SourceReleaseLoadError from './sourceReleaseLoadError.svelte'
import SourceRecordSamples from './sourceRecordSamples.svelte'
import { sourceRecordChangesCopy } from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChanges.copy.js'
import SourceRecordChanges from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChanges.svelte'
import type { SourceChangeType } from '#lib/bits/pages/sources/components/sourceRecordChanges/sourceRecordChanges.copy.js'
import SourceRecordSchema from './sourceRecordSchema.svelte'
import { resourceLabel } from '#lib/registry/resourceLabels.js'
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
let changingRelease = $derived(
  Boolean(
    navigating.to?.params?.releaseCode &&
      (navigating.to.params.releaseCode !== params.releaseCode ||
        navigating.to.params.datasetCode !== params.datasetCode),
  ),
)
let currentUrl = $derived(page.shallow?.url ?? page.url)
let showAssembly = $derived(currentUrl.searchParams.get('view') === 'assembly')
let changesOnly = $state(true)
let activeTab = $state<SourceReleaseTab>(
  getSourceReleaseTabFromUrl(page.shallow?.url ?? page.url),
)
// Keep closed Stats and Audit tabs, including their map code, off the Notes path.
let statsRoot = $derived(
  activeTab === 'stats'
    ? import(
        '#lib/bits/pages/docs/components/releaseStats/components/releaseStatsRoot.svelte'
      )
    : undefined,
)
let auditComponents = $derived(
  activeTab === 'audit'
    ? Promise.all([
        import(
          '#lib/bits/pages/docs/components/releaseAudit/components/auditRoot.svelte'
        ),
        import(
          '#lib/bits/pages/docs/components/releaseAudit/components/releaseAuditRoot.svelte'
        ),
      ])
    : undefined,
)
// Start selected-tab downloads alongside the content query. The await blocks
// render import failures once the content is ready, so handle early rejections.
$effect(() => {
  void statsRoot?.catch(() => {})
  void auditComponents?.catch(() => {})
})
let locale = $derived(getCurrentLocale())
let changeCopy = $derived(sourceRecordChangesCopy[locale])
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
    tab: activeTab === 'usage' && showAssembly ? ('assembly' as const) : activeTab,
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
    tab: activeTab === 'usage' && showAssembly ? ('assembly' as const) : activeTab,
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
let auditResourceTypes = $state<string[]>([])
let selectedAuditResourceType = $state('')
let showNoteDiff = $state(
  (page.shallow?.url ?? page.url).searchParams.get('view') === 'diff',
)
$effect(() => {
  showNoteDiff = currentUrl.searchParams.get('view') === 'diff'
})
let showBulkActions = $state(false)
let bulkActions = $derived(
  version?.processingRules?.rulesets
    .flatMap(ruleset => ruleset.rules)
    .filter(rule => rule.kind === 'bulk') ?? [],
)
let sourceRecordFamily = $derived(getSourceRecordFamily(source?.resourceTypes ?? []))
let hasAuditFamily = $derived(
  source?.resourceTypes.some(type =>
    ['division', 'divisionArea', 'divisionBoundary', 'divisionStatistic'].includes(
      type,
    ),
  ) ?? false,
)
let sourceRecordsAvailable = $state<boolean | null>(null)
let sourceSampleRequest = $state(0)
let sourceSampleInclude = $state('')
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

let changeType = $derived.by<SourceChangeType | undefined>(() => {
  const value = currentUrl.searchParams.get('changes')
  return value === 'added' || value === 'changed' || value === 'removed'
    ? value
    : undefined
})
function selectRecordChanges(type?: SourceChangeType) {
  const url = new URL(currentUrl.href)
  url.searchParams.set('tab', 'changes')
  if (activeTab === 'changes' && changeType === type) url.searchParams.delete('changes')
  else if (type) url.searchParams.set('changes', type)
  else url.searchParams.delete('changes')
  url.hash = ''
  void goto(`${url.pathname}${url.search}`, { shallow: true, state: {} })
}
function toggleAssembly() {
  const url = new URL(currentUrl.href)
  if (showAssembly) url.searchParams.delete('view')
  else url.searchParams.set('view', 'assembly')
  void goto(`${url.pathname}${url.search}`, { shallow: true, state: {} })
}

let statsPresentation = $derived(buildSourceReleaseStatsPresentation(locale))
let selectedResourceId = $state('')
let resources = $derived(version?.resources ?? [])
let selectedResource = $derived(
  resources.find(resource => resource.id === selectedResourceId) ?? resources[0],
)
$effect(() => {
  if (selectedResource) selectedResourceId = selectedResource.id
})
let hasContent = $derived.by(() => {
  if (isContentLoading) return true
  if (activeTab === 'notes') {
    return showNoteDiff
      ? noteDiff.changes.length > 0
      : notesPresentation.markdown.trim().length > 0
  }
  if (activeTab === 'changes') return true
  if (activeTab === 'stats')
    return Boolean(selectedResource?.stats.length ?? version?.stats?.length)
  if (activeTab === 'schema' || activeTab === 'samples')
    return Boolean(sourceRecordFamily)
  if (activeTab === 'audit') {
    return Boolean(
      hasAuditFamily ||
        (version?.processingActionCount ?? version?.processingActions?.length ?? 0) >
          0 ||
        bulkActions.length,
    )
  }
  if (activeTab === 'usage' && showAssembly)
    return Boolean(version?.assembledWith?.length)
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
    showAssembly,
    changeType,
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
  const url = new URL(currentUrl.href)
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
  const url = new URL(currentUrl.href)
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
  { id: 'changes', label: changeCopy.changes },
  { id: 'stats', label: m.source_tab_stats() },
  ...((activeTab === 'audit' && isContentLoading) ||
  hasAuditFamily ||
  (version?.processingActionCount ?? version?.processingActions?.length ?? 0) > 0 ||
  bulkActions.length
    ? [{ id: 'audit', label: m.api_release_audit() }]
    : []),
  { id: 'usage', label: changeCopy.usage },
])

let releaseQueryError = $derived(contentResource.error)
const refreshRelease = () => contentResource.query.refresh()

// Restore the selected tab when the visible URL changes, including shallow history.
$effect(() => {
  activeTab = getSourceReleaseTabFromUrl(currentUrl)
})

$effect(() => {
  const unavailable =
    ((activeTab === 'schema' || activeTab === 'samples') && !sourceRecordFamily) ||
    (activeTab === 'audit' &&
      !hasAuditFamily &&
      !isContentLoading &&
      (version?.processingActionCount ?? version?.processingActions?.length ?? 0) ===
        0 &&
      bulkActions.length === 0)

  if (unavailable) activeTab = 'notes'
})

let actions = $derived<ReleaseNavAction[]>(
  (activeTab === 'stats' || activeTab === 'changes') && resources.length > 1
    ? [
        {
          id: 'stats-resource',
          label: m.source_resource_type(),
          value: selectedResourceId,
          options: resources.map(resource => ({
            value: resource.id,
            label: resourceLabel(resource.resourceType),
          })),
          onValueChange: value => {
            selectedResourceId = value
          },
        },
      ]
    : activeTab === 'notes' && versions[1]
      ? [
          {
            icon: 'proicons:diff',
            id: 'diff',
            label: m.source_diff_since_last_release(),
            onSelect: () => setShowNoteDiff(!showNoteDiff),
            pressed: showNoteDiff,
          },
        ]
      : activeTab === 'usage'
        ? [
            {
              id: 'assembly',
              icon: 'proicons:layers',
              label: showAssembly
                ? m.source_tab_released_as()
                : m.source_tab_assembly(),
              onSelect: toggleAssembly,
            },
          ]
        : activeTab === 'samples' &&
            sourceRecordFamily &&
            sourceRecordsAvailable !== false
          ? [
              {
                id: 'include',
                label: m.source_samples_include(),
                value: sourceSampleInclude,
                options: [
                  { value: '', label: m.source_samples_include_none() },
                  { value: 'geometry', label: 'geometry' },
                ],
                onValueChange: value => {
                  sourceSampleInclude = value
                },
              },
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
                ...(auditResourceTypes.length > 1
                  ? [
                      {
                        id: 'audit-resource',
                        label: m.source_resource_type(),
                        value: selectedAuditResourceType,
                        options: auditResourceTypes.map(resourceType => ({
                          value: resourceType,
                          label: resourceLabel(resourceType),
                        })),
                        onValueChange: (value: string) => {
                          selectedAuditResourceType = value
                        },
                      },
                    ]
                  : []),
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
  noindex={currentUrl.searchParams.size > 0}
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
      actions={activeTab === 'changes'
        ? [
            ...actions,
            {
              id: 'changes-mode',
              icon: changesOnly ? 'proicons:diff' : 'proicons:brackets',
              label: changesOnly ? changeCopy.changesOnly : changeCopy.full,
              pressed: !changesOnly,
              onSelect: () => {
                changesOnly = !changesOnly
              },
            },
          ]
        : actions}
      {outline}
      {tabs}
      versionTitle={m.source_versions()}
      onTabChange={setActiveTab}
      onVersionPreload={preloadVersion}
      bind:activeTab
    >
      {#if (activeTab === 'changes' && changingRelease) ||
        (isContentLoading && contentResource.showSkeleton)}
        <div
          data-release-nav-loading-layer
          transition:fade={{ duration: prefersReducedMotion.current ? 0 : 180 }}
        >
          <ReleaseNav.ContentSkeleton
            tab={activeTab}
            diff={showNoteDiff}
            linksVariant={showAssembly ? 'assembly' : 'releases'}
          />
        </div>
      {:else if releaseQueryError}
        <SourceReleaseLoadError
          message={m.source_release_load_error()}
          onRetry={refreshRelease}
          retryLabel={m.source_retry()}
        />
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
          {:else if activeTab === 'changes'}
            {#key `${params.datasetCode}:${params.releaseCode}:${selectedResource?.id}:${changeType}`}
              <SourceRecordChanges
                stats={selectedResource?.stats ?? version.stats}
                family={sourceRecordFamily ?? ''}
                fromRelease={previousVersion?.code}
                toRelease={selectedResource?.id ?? ''}
                resourceType={selectedResource?.resourceType ?? ''}
                presentation={statsPresentation}
                type={changeType}
                diff={changesOnly}
                onTypeChange={selectRecordChanges}
                {locale}
              />
            {/key}
          {:else if activeTab === 'stats'}
            {#if statsRoot}
              {#await statsRoot}
                <ReleaseNav.ContentSkeleton tab="stats" />
              {:then module}
                {@const ReleaseStatsRoot = module.default}
                <ReleaseStatsRoot
                  onChangeSelect={previousVersion &&
                  sourceRecordFamily &&
                  selectedResource
                    ? type => selectRecordChanges(type)
                    : undefined}
                  isFirstRelease={!previousVersion}
                  resourceType={selectedResource?.resourceType ??
                    source.resourceTypes[0]}
                  stats={selectedResource?.stats ?? version.stats}
                  {districtAreas}
                  {locale}
                  presentation={statsPresentation}
                  bind:headings={statsHeadings}
                  bind:activeHeadingId={activeStatsHeadingId}
                />
              {:catch}
                <SourceReleaseLoadError
                  message={m.source_release_load_error()}
                  onRetry={() => window.location.reload()}
                  retryLabel={m.source_retry()}
                />
              {/await}
            {/if}
          {:else if activeTab === 'schema' && sourceRecordFamily}
            <SourceRecordSchema
              measures={content?.measures ?? []}
              family={sourceRecordFamily}
              sourceReleaseCode={version.code}
              resourceType={source.resourceTypes[0] ?? ''}
              source={source.publisherCode}
              sourceSchemaUrl={source.schemaURL}
              sourceSchemaVersion={version.sourceSchemaVersion}
              sourceVersion={version.sourceVersion}
            />
          {:else if activeTab === 'samples' && sourceRecordFamily}
            {#key `${sourceRecordFamily}:${version.code}:${sourceSampleInclude}`}
              <SourceRecordSamples
                includeGeometry={sourceSampleInclude === 'geometry'}
                family={sourceRecordFamily}
                onAvailabilityChange={available => (sourceRecordsAvailable = available)}
                request={sourceSampleRequest}
                sourceReleaseCode={version.code}
              />
            {/key}
          {:else if activeTab === 'audit'}
            {#if auditComponents}
              {#await auditComponents}
                <ReleaseNav.ContentSkeleton tab="audit" />
              {:then modules}
                {@const Audit = modules[0].default}
                {@const ReleaseAuditRoot = modules[1].default}
                <Audit
                  selectedResourceType={selectedAuditResourceType}
                  onResourceTypesChange={resourceTypes => {
                    auditResourceTypes = resourceTypes
                    if (!resourceTypes.includes(selectedAuditResourceType)) {
                      selectedAuditResourceType = resourceTypes[0] ?? ''
                    }
                  }}
                  bind:headings={auditHeadings}
                  bind:activeHeadingId={activeAuditHeadingId}
                  datasetCode={params.datasetCode}
                  releaseCode={params.releaseCode}
                >
                  <ReleaseAuditRoot
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
                </Audit>
              {:catch}
                <SourceReleaseLoadError
                  message={m.source_release_load_error()}
                  onRetry={() => window.location.reload()}
                  retryLabel={m.source_retry()}
                />
              {/await}
            {/if}
          {:else if activeTab === 'usage' && !showAssembly}
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
    <SourceReleaseLoadError
      message={m.source_release_load_error()}
      onRetry={refreshRelease}
      retryLabel={m.source_retry()}
    />
  {:else}
    <SourceReleasePageSkeleton />
  {/if}
</Main>
