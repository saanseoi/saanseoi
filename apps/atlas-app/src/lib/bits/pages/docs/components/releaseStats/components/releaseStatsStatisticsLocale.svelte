<script lang="ts">
import type { StatisticsProfilePresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
import CoverageBar from './releaseStatsCoverageBar.svelte'
let { rows }: { rows: StatisticsProfilePresentation['localeCoverage'] } = $props()
</script>

<Section id="stats-profile-locale">
  <Header eyebrow="Locale" title="Field label coverage" />
  <div
    class="grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-4 gap-y-3 p-5"
  >
    {#each rows as row, index}
      <p class="font-body text-label-md font-semibold text-primary">{row.label}</p>
      <div class="group relative min-w-0">
        <button
          type="button"
          class="block w-full text-left"
          aria-label={`${row.label}: ${row.value}`}
          aria-describedby={`stats-locale-count-${index}`}
        >
          <CoverageBar
            coverage={row.percentage}
            segments={[{ tone: 'provided', value: row.percentage }]}
            label={row.value}
            ariaLabel={`${row.label}: ${row.value}`}
          />
        </button>
        <span
          id={`stats-locale-count-${index}`}
          role="tooltip"
          class="pointer-events-none absolute bottom-full right-0 z-10 mb-2 hidden max-w-full rounded-default border border-border-card/60 bg-background-alt px-3 py-2 font-body text-label-sm text-foreground shadow-popover group-hover:block group-focus-within:block"
        >
          {row.count}
          field labels · {row.unverified} unverified
        </span>
      </div>
    {/each}
  </div>
</Section>
