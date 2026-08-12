<script lang="ts">
import type {
  ComponentCoveragePresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
let {
  rows,
  labels,
}: { rows: ComponentCoveragePresentation; labels: ReleaseStatsLabels } = $props()
</script>
<Section class="p-5"
  ><p
    class="font-body text-caption font-semibold uppercase tracking-[0.08em] text-data-primary"
  >
    {labels.coverage}
  </p>
  <h2
    id="stats-address-components"
    class="mt-1 font-display text-title-lg font-bold text-primary"
  >
    {labels.addressComponents}
  </h2>
  <div class="mt-5 grid gap-3">
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
