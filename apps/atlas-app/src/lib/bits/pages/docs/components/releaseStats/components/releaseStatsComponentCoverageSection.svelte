<script lang="ts">
import type {
  ComponentCoveragePresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let {
  rows,
  labels,
}: { rows: ComponentCoveragePresentation; labels: ReleaseStatsLabels } = $props()
</script>
<Section id="stats-address-components"
  ><Header eyebrow="Availability" title={labels.addressComponents}>
    <InfoTooltip
      label="About address component availability"
      description="The share of addresses whose formatted labels include each optional component. A missing component does not mean the address is incomplete."
    />
  </Header>
  <div class="grid gap-3 px-5 py-5">
    {#each rows as row}
      <div class="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-3">
        <div class="min-w-0">
          <p class="font-body text-label-md font-semibold text-primary">{row.label}</p>
          <div class="mt-1.5 h-2 overflow-hidden bg-data-track">
            <span
              class="block h-full bg-data-success"
              style={`width: ${row.value}%`}
            ></span>
          </div>
        </div>
        <p class="font-mono text-label-md font-bold tabular-nums text-primary">
          {row.formattedValue}
        </p>
      </div>
    {/each}
  </div></Section
>
