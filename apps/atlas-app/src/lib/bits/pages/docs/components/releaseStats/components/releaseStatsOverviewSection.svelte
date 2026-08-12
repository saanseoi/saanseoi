<script lang="ts">
import type { OverviewPresentation, ReleaseStatsLabels } from '../releaseStats.types'
import ChurnMetric from './releaseStatsChurnMetric.svelte'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import Section from './releaseStatsSection.svelte'
let {
  overview,
  labels,
}: { overview: OverviewPresentation; labels: ReleaseStatsLabels } = $props()
</script>
<Section
  ><div
    class="flex flex-wrap items-start justify-between gap-4 border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-5"
  >
    <div>
      <p
        class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
      >
        {labels.dataset}
      </p>
      <h2
        id="stats-overview"
        class="mt-1 font-mono text-title-lg font-bold tabular-nums text-primary"
      >
        {overview.recordCount} {labels.records}
      </h2>
    </div>
    {#if overview.churn}
      <span class="ml-auto"
        ><InfoTooltip
          label={labels.changeSummary}
          description={overview.churn.baseline ? labels.comparisonBaseline : labels.comparisonPrevious}
        /></span
      >
    {/if}
  </div>
  {#if overview.churn}
    <div class="grid grid-cols-2 gap-px bg-data-outline-variant/60 sm:grid-cols-4">
      {#each overview.churn.metrics as metric}
        <ChurnMetric {metric} />
      {/each}
    </div>
  {/if}</Section
>
