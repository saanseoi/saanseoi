<script lang="ts">
import type { StatisticsProfilePresentation } from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let {
  distribution,
}: { distribution: StatisticsProfilePresentation['distributions'][number] } = $props()
</script>

<Section>
  <Header
    id={distribution.id}
    eyebrow={`${distribution.unit} distribution`}
    title={distribution.title}
  />
  <dl
    class="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_max-content] gap-x-3 gap-y-3 px-5 py-5"
  >
    {#each distribution.rows as row}
      <div class="col-span-3 grid grid-cols-subgrid items-center">
        <dt class="min-w-0 wrap-break-word text-label-md font-semibold text-primary">
          {row.label}
        </dt>
        <dd class="h-5 overflow-hidden bg-data-outline-variant/30" aria-hidden="true">
          <div
            class="h-full bg-data-success"
            style:width={`${row.percentage / Math.max(...distribution.rows.map(item => item.percentage), 1) * 100}%`}
          ></div>
        </dd>
        <dd
          class="shrink-0 font-mono text-label-md font-semibold tabular-nums text-primary"
        >
          {row.value}
        </dd>
      </div>
    {/each}
  </dl>
</Section>
