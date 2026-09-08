<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import { untrack, type Snippet } from 'svelte'
import type { MarkdownHeading } from '#lib/registry/markdown.js'
import {
  getRetainedSourceAudit,
  getRetainedApiAudit,
} from '#lib/registry/audit.remote.js'
import RetainedAuditRelease from './retainedAuditRelease.svelte'
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
$effect(() => {
  if (!panel) return
  const element = panel
  let visible: HTMLElement[] = []
  const updateActive = () => {
    const offset = Math.min(160, window.innerHeight * 0.25)
    activeHeadingId =
      (
        [...visible]
          .reverse()
          .find(heading => heading.getBoundingClientRect().top <= offset) ?? visible[0]
      )?.id ?? null
  }
  const update = () => {
    visible = [...element.querySelectorAll<HTMLElement>('h3')].filter(
      heading => heading.getClientRects().length > 0,
    )
    const next = visible.map(heading => {
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
      return { id: heading.id, level: 2, text }
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
  window.addEventListener('resize', update)
  untrack(update)
  return () => {
    observer.disconnect()
    window.removeEventListener('scroll', updateActive)
    window.removeEventListener('resize', update)
    headings = []
    activeHeadingId = null
  }
})
let audit = $derived(
  familyType
    ? getRetainedApiAudit({ familyType, releaseCode })
    : getRetainedSourceAudit({ datasetCode: datasetCode ?? '', releaseCode }),
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
    {#each visibleResources as resource (resource.releaseId)}
      <RetainedAuditRelease
        manifest={resource.manifest}
        hash={resource.hash}
        resourceType={resource.resourceType}
        showResourceHeading={selectedResourceType === undefined}
      />
    {/each}
  </div>
{:else}
  {@render children?.()}
{/if}
