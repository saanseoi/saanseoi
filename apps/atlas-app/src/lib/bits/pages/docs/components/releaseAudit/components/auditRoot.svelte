<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { untrack, type Snippet } from 'svelte'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import { resourceLabel } from '#lib/registry/resourceLabels.js'
import { getSourceAudit, getApiAudit } from '#lib/registry/audit.remote.js'
import { getReleaseNavDocumentActive } from '../../releaseNav/releaseNavScroll'
import AuditRelease from './auditRelease.svelte'
import Controls from './releaseAuditControls.svelte'
import { releaseAuditHeadingId } from './releaseAuditUtils'
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
    const sectionElements = [...element.querySelectorAll<HTMLElement>('h3')].filter(
      heading => heading.getClientRects().length > 0,
    )
    const auditHeading = element.querySelector<HTMLElement>(`#${releaseAuditHeadingId}`)
    const sectionHeadings = sectionElements.map(heading => {
      const resource =
        heading.closest('[data-audit-release]')?.getAttribute('data-audit-release') ??
        ''
      const text =
        heading.getAttribute('data-audit-toc-title')?.trim() ||
        heading.firstChild?.textContent?.trim() ||
        heading.textContent?.trim() ||
        m.source_audit_section()
      heading.id = `audit-${encodeURIComponent(resource)}-${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}`
      heading.style.scrollMarginTop = '10rem'
      return {
        id: heading.id,
        level: familyType ? 3 : 2,
        resource,
        text,
      }
    })
    const sourceHeadings = [
      ...element.querySelectorAll<HTMLElement>('[data-audit-source-heading]'),
    ]
    visible = [
      ...(auditHeading ? [auditHeading] : []),
      ...element.querySelectorAll<HTMLElement>('[data-audit-source-heading], h3'),
    ].filter(heading => heading.getClientRects().length > 0)
    const next = [
      {
        id: releaseAuditHeadingId,
        level: 2,
        text: m.source_audit_title(),
      },
      ...(familyType
        ? sourceHeadings.flatMap(source => [
            {
              emphasis: source.dataset.auditSourceEmphasis,
              id: source.id,
              level: 2,
              text: source.dataset.auditSourceLabel ?? m.source_audit_section(),
            },
            ...sectionHeadings
              .filter(section => section.resource === source.dataset.auditReleaseId)
              .map(({ resource: _resource, ...section }) => section),
          ])
        : sectionHeadings.map(({ resource: _resource, ...section }) => section)),
    ]
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
          selectedResourceType === undefined ||
          resource.resourceType ===
            (selectedResourceType || audit.current[0]?.resourceType),
      )
    : [],
)
let searchState = $derived.by(() => {
  const states = visibleResources.map(resource => searchStates[resource.releaseId])
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
const updateSearchState = (releaseId: string, state: AuditSearchState) => {
  const current = searchStates[releaseId]
  if (
    current?.failed === state.failed &&
    current.filteredCount === state.filteredCount &&
    current.loading === state.loading &&
    current.totalCount === state.totalCount
  )
    return
  searchStates = { ...searchStates, [releaseId]: state }
}
const sourceSubTypeLabels: Record<string, string> = {
  district: 'District',
  pu: 'PU',
  'new-town': 'New Town',
}
const sourceVariantLabels: Record<string, string> = {
  'hkgov-censtatd-landclipped': 'Landclipped',
  'hkgov-censtatd': 'Territory',
}
const sourceSubTypeLabel = (value?: string | null) =>
  value ? (sourceSubTypeLabels[value.toLowerCase()] ?? value) : value
const sourceVariantLabel = (value?: string | null) =>
  value ? sourceVariantLabels[value.toLowerCase()] : undefined
const sourceOutlineLabel = (resource: {
  resourceType: Parameters<typeof resourceLabel>[0]
  sourcePublisherShortName?: string
  sourceSubType?: string | null
  sourceVariant?: string | null
}) =>
  [
    resourceLabel(resource.resourceType),
    resource.sourcePublisherShortName,
    sourceSubTypeLabel(resource.sourceSubType),
    sourceVariantLabel(resource.sourceVariant),
  ]
    .filter(Boolean)
    .join(' · ')
const sourceHeadingLabel = (resource: {
  resourceType: Parameters<typeof resourceLabel>[0]
  sourcePublisherName?: string
  sourceSubType?: string | null
  sourceVariant?: string | null
}) =>
  [
    resource.sourcePublisherName,
    resourceLabel(resource.resourceType),
    sourceSubTypeLabel(resource.sourceSubType),
    sourceVariantLabel(resource.sourceVariant),
  ]
    .filter(Boolean)
    .join(' · ')
const sourceHeadingId = (releaseId: string) =>
  `audit-source-${encodeURIComponent(releaseId)}`
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
      totalCount={searchState?.failed ? '—' : (searchState?.totalCount ?? 0).toLocaleString()}
      loading={searchState === null || Boolean(searchState?.loading)}
      infoLabel={m.source_audit_search_info()}
      infoDescription={m.source_audit_search_info_description()}
      placeholder={m.source_audit_search_retained_placeholder()}
    />
    {#each visibleResources as resource, index (resource.releaseId)}
      <section
        class={familyType
          ? index === 0
            ? 'space-y-1'
            : 'space-y-1 border-t border-border-card/60 pt-8'
          : ''}
      >
        {#if familyType}
          <div>
            <h2
              id={sourceHeadingId(resource.releaseId)}
              class="font-mono text-label-sm uppercase tracking-[0.12em] text-foreground-alt"
              data-audit-source-heading
              data-audit-source-emphasis={resourceLabel(resource.resourceType)}
              data-audit-release-id={resource.releaseId}
              data-audit-source-label={sourceOutlineLabel(resource)}
            >
              {sourceHeadingLabel(resource)}
            </h2>
          </div>
        {/if}
        <AuditRelease
          manifest={resource.manifest}
          releaseCode={resource.code}
          hash={resource.hash}
          resourceType={resource.resourceType}
          showControls={false}
          showResourceHeading={!familyType && selectedResourceType === undefined}
          bind:query
          onSearchStateChange={state => updateSearchState(resource.releaseId, state)}
        />
      </section>
    {/each}
  </div>
{:else}
  {@render children?.()}
{/if}
