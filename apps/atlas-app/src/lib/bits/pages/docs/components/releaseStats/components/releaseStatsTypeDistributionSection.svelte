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
<Section
  ><Header
    id={distribution.id}
    eyebrow={distribution.showChangeLegend ? labels.changeDistribution : distribution.eyebrow}
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
  <div
    class="grid grid-cols-[max-content_minmax(0,1fr)_max-content] gap-x-3 gap-y-3 px-5 py-5"
  >
    {#each distribution.rows as row}
      <div class="col-span-3 grid grid-cols-subgrid items-center">
        <p class="font-body text-label-md font-semibold text-primary">{row.label}</p>
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
  </div></Section
>
