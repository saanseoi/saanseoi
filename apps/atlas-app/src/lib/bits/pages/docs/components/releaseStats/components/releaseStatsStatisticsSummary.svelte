<script lang="ts">
import type { StatisticsProfilePresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
let { metrics }: { metrics: StatisticsProfilePresentation['metrics'] } = $props()
</script>

<Section id="stats-overview">
  <h2 class="sr-only">Statistics overview</h2>
  <dl class="grid grid-cols-2 gap-px bg-data-outline-variant/60 sm:grid-cols-3">
    {#each metrics as metric}
      <div class="bg-data-surface-container-lowest px-5 py-5">
        <dt
          class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-foreground-alt"
        >
          {metric.label}
        </dt>
        <dd class="mt-2 font-mono text-title-lg font-bold tabular-nums text-primary">
          {metric.value}
        </dd>
      </div>
    {/each}
  </dl>
</Section>
