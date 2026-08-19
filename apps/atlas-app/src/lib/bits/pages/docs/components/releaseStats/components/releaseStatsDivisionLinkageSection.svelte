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
        Linkage
      </p>
      <h2
        id={linkage.id}
        class="mt-1 font-display text-title-lg font-bold text-primary"
      >
        Divisions & Streets
      </h2>
    </div>
    <span class="ml-auto"
      ><InfoTooltip
        label="About divisions and streets linkage"
        description="Each rate is the share of primary addresses linked to the selected Divisions or Streets snapshot. Division levels can overlap, so their rates do not add up."
      /></span
    >
  </div>
  <div class="grid gap-px bg-data-outline-variant/60 sm:grid-cols-3">
    {#each linkage.rows as row}
      <div class="min-w-0 bg-data-surface-container-lowest px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <p
            class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
          >
            {row.label}
          </p>
          <p class="font-mono text-caption font-bold tabular-nums text-data-primary">
            {row.coverageLabel}
          </p>
        </div>
        <p class="mt-3 font-mono text-title-lg font-bold tabular-nums text-primary">
          {row.value}
        </p>
      </div>
    {/each}
  </div>
</Section>
