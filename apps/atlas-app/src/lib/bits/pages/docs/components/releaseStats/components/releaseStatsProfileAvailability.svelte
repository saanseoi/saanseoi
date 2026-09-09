<script lang="ts">
import type { StatisticsProfilePresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
import Legend from './releaseStatsLegend.svelte'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
let { rows }: { rows: StatisticsProfilePresentation['availability'] } = $props()
const colour = {
  published: 'bg-data-primary',
  suppressed: 'bg-data-warning',
  unavailable: 'bg-foreground-alt/45',
  other: 'bg-data-outline-variant',
}
</script>

<Section id="stats-profile-availability">
  <Header eyebrow="Value availability" title="Observations by status">
    <div class="flex items-center gap-3">
      <Legend
        label="Observation status"
        items={rows.map(row => ({ label: row.label, tone: colour[row.tone] }))}
      />
      <InfoTooltip
        label="Value availability details"
        description={rows.map(row => `${row.label}: ${row.value} (${row.percentageLabel}). ${row.description}`).join(' ')}
      />
    </div>
  </Header>
  <div class="px-5 py-5">
    <div
      class="flex h-5 overflow-hidden bg-data-outline-variant/20"
      role="img"
      aria-label={rows.map(row => `${row.label}: ${row.value} (${row.percentageLabel})`).join(', ')}
    >
      {#each rows as row}
        <div
          class={`h-full ${colour[row.tone]}`}
          style:width={`${row.percentage}%`}
        ></div>
      {/each}
    </div>
  </div>
</Section>
