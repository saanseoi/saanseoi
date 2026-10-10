<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { untrack, type Snippet } from 'svelte'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import { resourceLabel } from '#lib/registry/resourceLabels.js'
import { getSourceAudit, getApiAudit } from '#lib/registry/audit.remote.js'
import { getReleaseNavDocumentActive } from '../../releaseNav/releaseNavScroll'
import AuditRelease from './auditRelease.svelte'
import PreparationSummary from './auditPreparationSummary.svelte'
import AuditStageHeading from './auditStageHeading.svelte'
import Controls from './releaseAuditControls.svelte'
import { auditResourceTypes, auditStageEntries, groupAuditStages } from './auditStages'
let {
  datasetCode,
  familyType,
  releaseCode,
  children,
  selectedResourceType,
  onResourceTypesChange,
  headings = $bindable<MarkdownHeading[]>([]),
  activeHeadingId = $bindable<string | null>(null),
}: {
  datasetCode?: string
  familyType?: string
  releaseCode: string
  children?: Snippet
  selectedResourceType?: string
  onResourceTypesChange?: (resourceTypes: string[]) => void
  headings?: MarkdownHeading[]
  activeHeadingId?: string | null
} = $props()
let panel = $state<HTMLDivElement>()
type AuditSearchState = {
  failed: boolean
  filteredCount: number
  loading: boolean
  totalCount: number
}
let query = $state('')
let searchStates = $state.raw<Record<string, AuditSearchState>>({})
$effect(() => {
  if (!panel) return
  const element = panel
  let visible: HTMLElement[] = []
  const updateActive = () => {
    activeHeadingId = getReleaseNavDocumentActive(visible)
  }
  const update = () => {
    visible = [
      ...element.querySelectorAll<HTMLElement>(
        '[data-audit-stage-heading], [data-audit-source-heading], h3',
      ),
    ].filter(heading => heading.getClientRects().length > 0)
    const next = visible.map(heading => {
      const isStage = heading.hasAttribute('data-audit-stage-heading')
      const isResource = heading.hasAttribute('data-audit-source-heading')
      const text =
        heading.dataset.auditTocTitle?.trim() ||
        heading.dataset.auditSourceLabel ||
        heading.firstChild?.textContent?.trim() ||
        heading.textContent?.trim() ||
        m.source_audit_section()
      if (!isStage && !isResource) {
        const resource =
          heading.closest('[data-audit-release]')?.getAttribute('data-audit-release') ??
          ''
        heading.id = `audit-${encodeURIComponent(resource)}-${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`
      }
      heading.style.scrollMarginTop = '10rem'
      return {
        id: heading.id,
        level: isStage ? 2 : isResource ? 3 : 4,
        emphasis: heading.dataset.auditSourceEmphasis,
        text,
      }
    })
    if (JSON.stringify(headings) !== JSON.stringify(next)) headings = next
    updateActive()
  }
  const observer = new MutationObserver(update)
  observer.observe(element, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'open', 'data-audit-toc-title'],
  })
  window.addEventListener('scroll', updateActive, { passive: true })
  window.addEventListener('release-nav:anchor', updateActive)
  window.addEventListener('resize', update)
  untrack(update)
  return () => {
    observer.disconnect()
    window.removeEventListener('scroll', updateActive)
    window.removeEventListener('release-nav:anchor', updateActive)
    window.removeEventListener('resize', update)
    headings = []
    activeHeadingId = null
  }
})
let audit = $derived(
  familyType
    ? getApiAudit({ familyType, releaseCode })
    : getSourceAudit({ datasetCode: datasetCode ?? '', releaseCode }),
)
$effect(() => {
  const resourceTypes = audit.ready
    ? [...new Set(audit.current.map(resource => resource.resourceType))]
    : []
  untrack(() => onResourceTypesChange?.(resourceTypes))
})
let visibleResources = $derived(
  audit.ready
    ? audit.current.filter(
        resource =>
          datasetCode !== undefined ||
          selectedResourceType === undefined ||
          resource.resourceType ===
            (selectedResourceType || audit.current[0]?.resourceType),
      )
    : [],
)
let stages = $derived(groupAuditStages(visibleResources))
let orderedResourceTypes = $derived(auditResourceTypes(visibleResources))
const stageLabel = (stage: string) =>
  ({
    preparation: m.source_audit_stage_preparation_label(),
    ingestion: m.source_audit_stage_ingestion_label(),
    assembly: m.source_audit_stage_assembly_label(),
    composition: m.source_audit_stage_composition_label(),
  })[stage] ?? stage
const stageFlow = (stage: string) =>
  ({
    preparation: m.source_audit_stage_preparation(),
    ingestion: m.source_audit_stage_ingestion(),
    assembly: m.source_audit_stage_assembly(),
    composition: m.source_audit_stage_composition(),
  })[stage] ?? stage
const resourceTypeTitle = (type: string) => type.charAt(0).toUpperCase() + type.slice(1)
let searchState = $derived.by(() => {
  const states = visibleResources.map(
    resource => searchStates[resource.hash ?? resource.resourceReleaseId],
  )
  if (states.some(state => !state)) return null
  if (states.some(state => state?.failed)) return { failed: true }
  return {
    filteredCount: states.reduce(
      (total, state) => total + (state?.filteredCount ?? 0),
      0,
    ),
    loading: states.some(state => state?.loading),
    totalCount: states.reduce((total, state) => total + (state?.totalCount ?? 0), 0),
  }
})
const updateSearchState = (resourceReleaseId: string, state: AuditSearchState) => {
  const current = searchStates[resourceReleaseId]
  if (
    current?.failed === state.failed &&
    current.filteredCount === state.filteredCount &&
    current.loading === state.loading &&
    current.totalCount === state.totalCount
  )
    return
  searchStates = { ...searchStates, [resourceReleaseId]: state }
}
// Keep hidden audit components mounted so subsequent searches can update their results.
const hasSearchResults = (key: string) => {
  if (!query.trim()) return true
  const state = searchStates[key]
  return !state || state.loading || state.failed || state.filteredCount > 0
}
const sourceKindLabels: Record<string, string> = {
  district: 'District',
  pu: 'PU',
  'new-town': 'New Town',
}
const sourceVariantLabels: Record<string, string> = {
  'hkgov-censtatd-landclipped': 'Landclipped',
  'hkgov-censtatd': 'Territory',
}
const sourceKindLabel = (value?: string | null) =>
  value ? (sourceKindLabels[value.toLowerCase()] ?? value) : value
const sourceVariantLabel = (value?: string | null) =>
  value ? sourceVariantLabels[value.toLowerCase()] : undefined
const sourceOutlineLabel = (resource: {
  resourceType: Parameters<typeof resourceLabel>[0]
  sourcePublisherShortName?: string
  sourceKind?: string | null
  sourceVariant?: string | null
}) =>
  [
    resourceLabel(resource.resourceType),
    resource.sourcePublisherShortName,
    sourceKindLabel(resource.sourceKind),
    sourceVariantLabel(resource.sourceVariant),
  ]
    .filter(Boolean)
    .join(' · ')
const sourceHeadingLabel = (resource: {
  resourceType: Parameters<typeof resourceLabel>[0]
  sourcePublisherName?: string
  sourceKind?: string | null
  sourceVariant?: string | null
}) =>
  [
    resource.sourcePublisherName,
    resourceLabel(resource.resourceType),
    sourceKindLabel(resource.sourceKind),
    sourceVariantLabel(resource.sourceVariant),
  ]
    .filter(Boolean)
    .join(' · ')
const sourceHeadingId = (resourceReleaseId: string) =>
  `audit-source-${encodeURIComponent(resourceReleaseId)}`
</script>

{#if audit.error}
  <p role="alert">
    {m.source_audit_load_retained_error()}
    <button type="button" class="underline" onclick={() => audit.refresh()}>
      {m.source_audit_retry()}
    </button>
  </p>
{:else if !audit.ready}
  <p class="py-4 text-sm opacity-60">{m.source_audit_loading_summaries()}</p>
{:else if audit.current.length}
  <div class="space-y-8" bind:this={panel}>
    <Controls
      bind:query
      filteredCount={searchState?.failed
        ? '—'
        : (searchState?.filteredCount ?? 0).toLocaleString()}
      totalCount={searchState?.failed
        ? '—'
        : (searchState?.totalCount ?? 0).toLocaleString()}
      loading={searchState === null || Boolean(searchState?.loading)}
      infoLabel={m.source_audit_search_info()}
      infoDescription={m.source_audit_search_info_description()}
      placeholder={m.source_audit_search_retained_placeholder()}
    />
    {#each stages as stage (stage.id)}
      {@const summaryResource =
        stage.id === 'preparation'
          ? stage.resources.find(resource =>
              resource.manifest.bulk.some(
                rule => rule.id === 'prepare-curated-division-edition',
              ),
            )
          : undefined}
      <section class="space-y-6 pb-4" data-audit-stage={stage.id}>
        <AuditStageHeading
          stage={stage.id}
          label={stageLabel(stage.id)}
          flow={stageFlow(stage.id)}
        />
        {#if !stage.resources.some(resource => hasSearchResults(resource.hash))}
          <p role="status" class="text-sm text-foreground-alt">
            {m.source_audit_no_matches()}
          </p>
        {/if}
        {#if summaryResource}
          <PreparationSummary
            manifest={summaryResource.manifest}
            hash={summaryResource.hash}
            releaseCode={summaryResource.code}
            {query}
          />
        {/if}
        {#each auditStageEntries(
          stage,
          familyType
            ? [...new Set(stage.resources.map(resource => resource.resourceType))]
            : orderedResourceTypes,
        ) as entry (entry.key)}
          {@const resource = entry.resource}
          <section
            class="space-y-3"
            hidden={resource ? !hasSearchResults(resource.hash) : Boolean(query.trim())}
          >
            <h3
              id={sourceHeadingId(entry.key)}
              class="text-lg font-semibold"
              data-audit-source-heading
              data-audit-source-emphasis={familyType && resource
                ? resourceLabel(resource.resourceType)
                : undefined}
              data-audit-source-label={familyType && resource
                ? sourceOutlineLabel(resource)
                : resourceTypeTitle(entry.resourceType)}
            >
              {familyType && resource
                ? sourceHeadingLabel(resource)
                : resourceTypeTitle(entry.resourceType)}
            </h3>
            {#if resource}
              <AuditRelease
                manifest={resource.manifest}
                releaseCode={resource.code}
                hash={resource.hash}
                resourceType={resource.resourceType}
                showControls={false}
                showResourceHeading={false}
                bind:query
                onSearchStateChange={state =>
                  updateSearchState(resource.hash ?? resource.resourceReleaseId, state)}
              />
            {:else}
              <p class="text-sm text-foreground-alt">
                {m.source_audit_no_stage_evidence()}
              </p>
            {/if}
          </section>
        {/each}
      </section>
    {/each}
  </div>
{:else if datasetCode}
  <p class="py-4 text-sm text-foreground-alt">{m.source_audit_no_source_evidence()}</p>
{:else}
  {@render children?.()}
{/if}
