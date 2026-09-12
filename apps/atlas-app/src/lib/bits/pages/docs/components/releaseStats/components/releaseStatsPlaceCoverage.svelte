<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let { profile }: { profile: PlaceProfile } = $props()
</script>
<Section id="stats-place-overview">
  <Header eyebrow="Places" title="Place coverage" />
  <dl class="grid grid-cols-2 gap-px bg-data-outline-variant/60 sm:grid-cols-3">
    {#each profile.metrics as metric}
      <div class="bg-data-surface-container px-5 py-5">
        <dt class="text-label-md text-foreground-alt">{metric.label}</dt>
        <dd
          class="mt-2 flex flex-wrap items-baseline gap-x-2 font-mono text-headline-md font-bold tabular-nums text-primary"
        >
          {metric.value}
          {#if metric.coverage}
            <span class="text-label-md text-data-primary">{metric.coverage}</span>
          {/if}
        </dd>
      </div>
    {/each}
  </dl>
</Section>
