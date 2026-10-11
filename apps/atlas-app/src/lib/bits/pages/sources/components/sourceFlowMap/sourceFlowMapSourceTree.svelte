<script lang="ts">
import Icon from '#lib/bits/primitives/icon/icon.svelte'
import { slide } from 'svelte/transition'
import { m } from '#lib/bits/internal/i18n.js'
import SourceFlowMapInput from './sourceFlowMapInput.svelte'
import type { SourceFlowInput } from './sourceFlowMapTypes'
let {
  input,
  expandAll = false,
  showPlanned = true,
  sourceFilterActive = false,
}: {
  input: SourceFlowInput
  expandAll?: boolean
  showPlanned?: boolean
  sourceFilterActive?: boolean
} = $props()
let expanded = $state<boolean | null>(null)
let children = $derived(
  (input.inputs ?? []).filter(child => showPlanned || !child.planned),
)
let open = $derived(expanded ?? (expandAll || sourceFilterActive))
$effect(() => {
  expandAll
  sourceFilterActive
  expanded = null
})
let root = $state<HTMLElement>()
let paths = $state<string[]>([])
$effect(() => {
  if (!root) return
  const element = root
  const measure = () => {
    const panel = element.querySelector('[data-source-children]')
    if (!panel) {
      paths = []
      return
    }
    const bounds = panel.getBoundingClientRect()
    paths = Array.from(element.querySelectorAll('[data-source-child]')).map(child => {
      const rect = child.getBoundingClientRect()
      const y = rect.top - bounds.top + rect.height / 2
      return `M 48 ${y} H 32 Q 24 ${y} 24 ${y - 8} V 2`
    })
  }
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  measure()
  return () => observer.disconnect()
})
</script>

<div class="relative" bind:this={root}>
  <div class="relative" data-source-parent data-source-root>
    <SourceFlowMapInput {input} />
    {#if children.length}
      <button
        type="button"
        class="absolute right-3 bottom-2 z-10 flex items-center gap-1 rounded border border-white/50 bg-black/20 p-1.5 text-xs font-semibold text-white hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        title={`${open ? m.sources_flow_hide() : m.sources_flow_show()} ${m.nav_sources()}`}
        aria-expanded={open}
        aria-controls={`source-inputs-${input.id}`}
        aria-label={`${open ? m.sources_flow_hide() : m.sources_flow_show()} ${input.source}: ${children.length}`}
        onclick={() => {
          expanded = !open
        }}
      >
        <Icon
          icon={open ? 'proicons:chevron-up' : 'proicons:chevron-down'}
          class="size-4"
        />
      </button>
    {/if}
  </div>
  <div id={`source-inputs-${input.id}`}>
    {#if open && children.length}
      <div
        class="relative grid gap-3 pt-3 pl-[48px]"
        data-source-children
        transition:slide={{ duration: 180 }}
      >
        <svg
          class="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-secondary"
          aria-hidden="true"
        >
          <defs>
            <marker
              id={`source-arrow-${input.id}`}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L6 3 L0 6" fill="currentColor" />
            </marker>
          </defs>
          {#each paths as path}
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              marker-end={`url(#source-arrow-${input.id})`}
            />
          {/each}
        </svg>
        {#each children as child (child.id)}
          <div data-source-child><SourceFlowMapInput input={child} /></div>
        {/each}
      </div>
    {/if}
  </div>
</div>
