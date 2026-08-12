<script lang="ts">
import * as ChoroplethMap from '$lib/bits/components/choroplethMap'
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
</script>
<Section
  ><Header
    id="stats-records-by-district"
    eyebrow={labels.coverage}
    title={labels.recordsByDistrict}
  />
  <ChoroplethMap.Root
    ariaLabel={labels.recordsByDistrict}
    features={districtDistribution.features}
    values={districtDistribution.values}
    valueLabel={labels.records}
  /></Section
>
