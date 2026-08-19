<script lang="ts">
import type { GenericStatGroupPresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
let { group }: { group: GenericStatGroupPresentation } = $props()
</script>
<Section class="p-5"
  ><h2
    id={group.id}
    class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
  >
    {group.label}
  </h2>
  <div
    class="mt-4 grid gap-px overflow-hidden border border-data-outline-variant/60 bg-data-outline-variant/60 sm:grid-cols-2"
  >
    {#each group.rows as row}
      <div
        class="flex items-start justify-between gap-4 bg-data-surface-container-lowest px-4 py-3"
      >
        <div class="min-w-0">
          <p
            class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            {row.dimension}
            · {row.metric}
          </p>
          <p class="mt-1 font-body text-label-md font-semibold text-primary">
            {row.groupValue}
          </p>
          {#if row.unit && row.unit !== 'count'}
            <p class="mt-1 font-body text-caption text-foreground-alt">{row.unit}</p>
          {/if}
        </div>
        <p class="shrink-0 font-mono text-label-md font-bold tabular-nums text-primary">
          {row.value}
        </p>
      </div>
    {/each}
  </div></Section
>
