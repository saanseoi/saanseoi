<script lang="ts">
import type {
  TypeDistributionPresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import DistributionBar from './releaseStatsDistributionBar.svelte'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import Legend from './releaseStatsLegend.svelte'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let {
  distribution,
  labels,
}: { distribution: TypeDistributionPresentation; labels: ReleaseStatsLabels } = $props()
const legend = $derived([
  { label: labels.added, tone: 'bg-data-success' },
  { label: labels.changed, tone: 'bg-data-warning' },
  { label: labels.removed, tone: 'bg-data-error' },
  { label: labels.unchanged, tone: 'bg-data-neutral' },
])
</script>
{#snippet chart(
  rows: typeof distribution.rows,
)}
  <div
    class="grid grid-cols-[minmax(0,1fr)_minmax(40px,2fr)_max-content] gap-x-3 gap-y-3 px-5 py-5"
  >
    {#each rows as row}
      <div class="col-span-3 grid grid-cols-subgrid items-center">
        <p class="font-body text-label-md font-semibold text-primary wrap-break-word">
          {row.label}
        </p>
        <DistributionBar
          {row}
          maxVolume={distribution.maxVolume}
          ariaLabel={`${row.label}: ${row.count} ${distribution.valueLabel}`}
        />
        <p
          class="font-mono text-right text-label-md font-bold tabular-nums text-primary"
        >
          {row.count}
        </p>
      </div>
    {/each}
  </div>
{/snippet}
<Section id={distribution.id}
  ><Header
    eyebrow={distribution.showChangeLegend
      ? labels.changeDistribution
      : distribution.eyebrow}
    title={distribution.title}
    ><div class="flex items-center gap-3">
      {#if distribution.showChangeLegend}
        <Legend label={labels.typeLegend} items={legend} />
        <InfoTooltip
          label={labels.changeDistributionInfo}
          description={labels.changeDistributionInfoDescription}
        />
      {/if}
    </div></Header
  >

  {@render chart(distribution.rows.slice(0, 12))}
  {#if distribution.rows.length > 12}
    <details class="border-t border-data-outline-variant/60">
      <summary
        class="cursor-pointer px-5 py-4 text-label-md font-semibold text-data-primary focus-visible:outline-2 focus-visible:outline-data-primary"
      >
        Show {distribution.rows.length - 12} more
      </summary>
      {@render chart(distribution.rows.slice(12))}
    </details>
  {/if}
</Section>
