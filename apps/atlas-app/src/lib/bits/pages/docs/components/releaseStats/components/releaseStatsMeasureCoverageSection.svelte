<script lang="ts">
import type { ObservationMeasureCoveragePresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'

let { coverage }: { coverage: ObservationMeasureCoveragePresentation } = $props()
</script>

<Section class="p-5">
  <h2
    id={coverage.id}
    class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
  >
    {coverage.title}
  </h2>
  <div
    class="mt-4 grid gap-px overflow-hidden border border-data-outline-variant/60 bg-data-outline-variant/60 sm:grid-cols-2"
  >
    {#each coverage.rows as row}
      <div
        class="flex items-start justify-between gap-4 bg-data-surface-container-lowest px-4 py-3"
      >
        <p
          class="min-w-0 font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
        >
          {row.label}
        </p>
        <p class="shrink-0 font-mono text-label-md font-bold tabular-nums text-primary">
          {row.value}
        </p>
      </div>
    {/each}
  </div>
  {#if coverage.exceptions.length}
    <div
      class="mt-4 grid gap-px overflow-hidden border border-data-outline-variant/60 bg-data-outline-variant/60 sm:grid-cols-2"
    >
      {#each coverage.exceptions as exception}
        <div
          class="flex items-center justify-between gap-4 bg-data-surface-container-lowest px-4 py-3"
        >
          <p class="min-w-0 font-body text-label-md font-semibold text-primary">
            {exception.label}
          </p>
          <p
            class="shrink-0 font-mono text-label-md font-bold tabular-nums text-primary"
          >
            {exception.value}
          </p>
        </div>
      {/each}
    </div>
  {/if}
</Section>
