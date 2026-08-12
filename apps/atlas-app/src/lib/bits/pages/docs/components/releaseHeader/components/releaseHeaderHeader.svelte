<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  label: string
  labelAction?: Snippet
  statusLabel: string
  statusClass: string
  statusDotClass: string
  showBackground?: boolean
}

let {
  label,
  labelAction,
  statusLabel,
  statusClass,
  statusDotClass,
  showBackground = false,
}: Props = $props()
</script>

<div
  class={`border-b border-outline-variant/60 px-6 py-3 dark:border-outline-variant md:px-8 ${showBackground ? 'bg-surface-container-low/60' : 'bg-surface-container-low'}`}
>
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <div class="flex max-w-full items-center gap-1.5">
      <p
        class="shrink-0 font-body text-caption font-semibold uppercase tracking-[0.14em] text-secondary"
      >
        {label}
      </p>
      {#if labelAction}
        <div class="min-w-0">{@render labelAction()}</div>
      {/if}
    </div>
    <span
      class={`inline-flex items-center gap-2 border px-3 py-1 font-body text-label-sm font-semibold capitalize ${statusClass}`}
    >
      <span class={`size-1.5 rounded-full ${statusDotClass}`}></span>
      {statusLabel}
    </span>
  </div>
</div>
