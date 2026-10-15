<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let { profile }: { profile: PlaceProfile } = $props()
</script>
<Section id="stats-place-overview">
  <Header eyebrow="Places" title="Place coverage" />
  <dl class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each profile.metrics as measure}
      <div
        class="flex flex-col rounded-lg border border-data-outline-variant/50 bg-data-surface-container-lowest p-4"
      >
        <dt class="text-label-md text-foreground-alt">{measure.label}</dt>
        <dd
          class="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 font-mono text-headline-md font-bold tabular-nums text-primary"
        >
          {measure.value}
          {#if measure.coverage}
            <span class="text-label-md text-data-primary">{measure.coverage}</span>
          {/if}
        </dd>
        {#if measure.coverageValue !== undefined}
          <div
            class="mt-4 h-1.5 overflow-hidden rounded-full bg-data-track"
            role="img"
            aria-label={`${measure.label}: ${measure.coverage}`}
          >
            <div
              class="h-full rounded-full bg-data-success"
              style:width={`${Math.max(0, Math.min(100, measure.coverageValue))}%`}
            ></div>
          </div>
        {/if}
      </div>
    {/each}
  </dl>
</Section>
