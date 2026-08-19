<script lang="ts">
import type { DivisionLinkagePresentation } from '../releaseStats.types'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import Section from './releaseStatsSection.svelte'

let { linkage }: { linkage: DivisionLinkagePresentation } = $props()
</script>

<Section>
  <div
    class="flex w-full items-center gap-1.5 border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-5"
  >
    <div>
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
      >
        Coverage
      </p>
      <h2
        id={linkage.id}
        class="mt-1 font-display text-title-lg font-bold text-primary"
      >
        Division linkage
      </h2>
    </div>
    <span class="ml-auto"
      ><InfoTooltip
        label="About division linkage"
        description="Addresses may be linked to more than one level in the selected Divisions snapshot. Each value is the number linked to that level."
      /></span
    >
  </div>
  <div class="grid gap-px bg-data-outline-variant/60 sm:grid-cols-2 lg:grid-cols-4">
    {#each linkage.rows as row}
      <div class="min-w-0 bg-data-surface-container-lowest px-4 py-3">
        <p
          class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
        >
          {row.label}
        </p>
        <p class="mt-3 font-mono text-title-lg font-bold tabular-nums text-primary">
          {row.value}
        </p>
      </div>
    {/each}
  </div>
</Section>
