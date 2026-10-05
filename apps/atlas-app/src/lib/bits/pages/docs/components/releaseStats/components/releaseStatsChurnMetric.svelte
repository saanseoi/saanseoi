<script lang="ts">
import type { ChurnMetricPresentation } from '../releaseStats.types'
let {
  measure,
  onSelect,
  selected = false,
}: {
  measure: ChurnMetricPresentation
  selected?: boolean
  onSelect?: () => void
} = $props()
const styles = {
  added: ['border-data-success', 'bg-data-success', 'bg-data-success/25'],
  changed: ['border-data-warning', 'bg-data-warning', 'bg-data-warning/25'],
  removed: ['border-data-error', 'bg-data-error', 'bg-data-error/25'],
  unchanged: ['border-data-neutral', 'bg-data-neutral', 'bg-data-neutral/25'],
} as const
</script>
{#snippet contents()}
  <div class="flex items-center gap-2">
    <span class={`size-2 rounded-full ${styles[measure.key][1]}`}></span>
    <span class="font-body text-label-sm text-foreground-alt">{measure.label}</span>
  </div>
  <span class="mt-3 block font-mono text-title-lg font-bold tabular-nums text-primary"
    >{measure.formattedValue}</span
  >
{/snippet}
{#if onSelect}
  <button
    type="button"
    onclick={onSelect}
    aria-pressed={selected}
    class={`w-full border-t-8 ${selected ? styles[measure.key][2] : 'bg-data-surface-container-low hover:bg-surface-container'} px-5 py-5 text-left transition focus-visible:outline-2 focus-visible:outline-primary ${styles[measure.key][0]}`}
    aria-label={`${measure.label}: ${measure.formattedValue}`}
  >
    {@render contents()}
  </button>
{:else}
  <div
    class={`border-t-8 bg-data-surface-container-low px-5 py-5 ${styles[measure.key][0]}`}
  >
    {@render contents()}
  </div>
{/if}
