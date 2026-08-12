<script lang="ts">
import type { ProcessingPresentation, ReleaseStatsLabels } from '../releaseStats.types'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import ProcessingMetric from './releaseStatsProcessingMetric.svelte'
import Section from './releaseStatsSection.svelte'
let {
  processing,
  labels,
}: { processing: ProcessingPresentation; labels: ReleaseStatsLabels } = $props()
</script>
<Section
  ><div
    class="flex w-full items-center gap-1.5 border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-5"
  >
    <h2
      id="stats-processing-actions"
      class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
    >
      {labels.processingActions}
    </h2>
    <span class="ml-auto"
      ><InfoTooltip
        label={labels.processingActionsInfo}
        description={labels.processingActionsInfoDescription}
      /></span
    >
  </div>
  <div class="grid gap-px bg-data-outline-variant/60 sm:grid-cols-2">
    {#each processing as metric}
      <ProcessingMetric {metric} />
    {/each}
    {#if processing.length % 2}
      <div aria-hidden="true" class="min-h-28 bg-data-surface-container-lowest"></div>
    {/if}
  </div></Section
>
