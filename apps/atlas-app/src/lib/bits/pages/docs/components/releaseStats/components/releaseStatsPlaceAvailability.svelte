<script lang="ts">
import type { PlaceProfile } from '../placeProfile'
import Header from './releaseStatsSectionHeader.svelte'
import Section from './releaseStatsSection.svelte'
let { rows }: { rows: PlaceProfile['availability'] } = $props()
</script>

<Section id="stats-place-availability">
  <Header eyebrow="Completeness" title="Field coverage" />
  <dl class="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
    {#each rows as row}
      <div>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-label-md text-primary">{row.label}</dt>
          <dd class="shrink-0 font-mono text-label-md tabular-nums text-data-primary">
            {row.coverageLabel}
          </dd>
        </div>
        <div
          class="mt-2 h-1.5 overflow-hidden rounded-full bg-data-track"
          role="img"
          aria-label={`${row.label}: ${row.count} places, ${row.coverageLabel}; ${row.missing} missing`}
        >
          <div
            class="h-full rounded-full bg-data-success"
            style:width={`${Math.max(0, Math.min(100, row.coverage))}%`}
          ></div>
        </div>
        <dd class="mt-1 font-mono text-caption tabular-nums text-foreground-alt">
          {row.count}
          places · {row.missing} missing
        </dd>
      </div>
    {/each}
  </dl>
  <p class="px-5 pb-5 text-caption text-foreground-alt">
    Each field counts a place once. Percentages use all places in this release; fields
    overlap. Missing optional fields indicate availability, not errors. District
    coverage includes resolved assignments only.
  </p>
</Section>
