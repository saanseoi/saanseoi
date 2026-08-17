<script lang="ts">
import { onMount } from 'svelte'
import * as ChoroplethMap from '#lib/bits/components/choroplethMap/index.js'
import type {
  DistrictDistributionPresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let {
  districtDistribution,
  labels,
}: {
  districtDistribution: DistrictDistributionPresentation
  labels: ReleaseStatsLabels
} = $props()
let mapReady = $state(false)

onMount(() => {
  const frame = requestAnimationFrame(() => (mapReady = true))
  return () => cancelAnimationFrame(frame)
})
</script>
<Section>
  <Header
    id="stats-records-by-district"
    eyebrow={labels.coverage}
    title={labels.recordsByDistrict}
  />
  {#if mapReady}
    <ChoroplethMap.Root
      ariaLabel={labels.recordsByDistrict}
      features={districtDistribution.features}
      values={districtDistribution.values}
      valueLabel={labels.records}
    />
  {:else}
    <div
      class="aspect-3/2 bg-data-surface-container-lowest lg:h-152 lg:aspect-auto"
      aria-busy="true"
      aria-label={labels.recordsByDistrict}
      role="img"
    ></div>
  {/if}
</Section>
