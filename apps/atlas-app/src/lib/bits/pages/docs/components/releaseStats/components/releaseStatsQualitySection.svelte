<script lang="ts">
import type { QualityPresentation, ReleaseStatsLabels } from '../releaseStats.types'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import QualityMetric from './releaseStatsQualityMetric.svelte'
import Section from './releaseStatsSection.svelte'
let { quality, labels }: { quality: QualityPresentation; labels: ReleaseStatsLabels } =
  $props()
let placeholderCount = $derived(
  quality.issues.length ? (4 - (quality.issues.length % 4)) % 4 : 0,
)
</script>
<Section
  ><div
    class="flex w-full items-center gap-1.5 border-b border-data-outline-variant/60 bg-data-surface-container-lowest px-5 py-5"
  >
    <h2
      id="stats-quality-checks"
      class="font-body text-caption font-medium uppercase tracking-[0.08em] text-data-alert"
    >
      {labels.qualityChecks}
    </h2>
    <span class="ml-auto"
      ><InfoTooltip
        label={labels.qualityInfo}
        description={labels.qualityInfoDescription}
      /></span
    >
  </div>
  {#if quality.issues.length}
    <div class="grid gap-px bg-data-outline-variant/60 sm:grid-cols-2 lg:grid-cols-4">
      {#each quality.issues as metric}
        <QualityMetric {metric} />
      {/each}
      {#each Array(placeholderCount) as _}
        <div
          aria-hidden="true"
          class="hidden min-w-0 border-l-4 border-transparent bg-data-surface-container-lowest px-4 py-3 lg:block"
        ></div>
      {/each}
    </div>
  {:else}
    <p class="px-5 py-4 font-body text-body-md text-primary">{labels.qualityNone}</p>
  {/if}</Section
>
