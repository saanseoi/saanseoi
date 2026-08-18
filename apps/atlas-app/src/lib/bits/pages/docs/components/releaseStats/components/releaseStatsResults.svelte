<script lang="ts">
import type {
  ReleaseStatsPresentation,
  ReleaseStatsDistrictName,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import ComponentCoverage from './releaseStatsComponentCoverageSection.svelte'
import District from './releaseStatsDistrictSection.svelte'
import GenericGroups from './releaseStatsGenericGroups.svelte'
import Geometry from './releaseStatsGeometrySection.svelte'
import LocaleCoverage from './releaseStatsLocaleCoverageSection.svelte'
import MeasureCoverage from './releaseStatsMeasureCoverageSection.svelte'
import Overview from './releaseStatsOverviewSection.svelte'
import Processing from './releaseStatsProcessingSection.svelte'
import Quality from './releaseStatsQualitySection.svelte'
import TypeDistribution from './releaseStatsTypeDistributionSection.svelte'
let {
  presentation,
  labels,
  locale,
  districtNames,
}: {
  presentation: ReleaseStatsPresentation
  labels: ReleaseStatsLabels
  locale: 'en' | 'zh-Hant' | 'zh-Hans'
  districtNames?: ReleaseStatsDistrictName[]
} = $props()
</script>
<div class="grid gap-6">
  {#if presentation.overview}
    <Overview overview={presentation.overview} {labels} />
  {/if}
  {#if presentation.districtDistribution}
    <District districtDistribution={presentation.districtDistribution} {labels} />
  {/if}
  {#if presentation.geometry}
    <Geometry {districtNames} geometry={presentation.geometry} {labels} {locale} />
  {/if}
  {#if presentation.localeCoverage}
    <LocaleCoverage rows={presentation.localeCoverage} {labels} />
  {/if}
  {#if presentation.componentCoverage}
    <ComponentCoverage rows={presentation.componentCoverage} {labels} />
  {/if}
  {#if presentation.sourceLayerDistribution}
    <TypeDistribution distribution={presentation.sourceLayerDistribution} {labels} />
  {/if}
  {#if presentation.measureCoverage}
    <MeasureCoverage coverage={presentation.measureCoverage} />
  {/if}
  {#each presentation.recordDistributions as distribution}
    <TypeDistribution {distribution} {labels} />
  {/each}
  {#if presentation.processing}
    <Processing processing={presentation.processing} {labels} />
  {/if}
  {#if presentation.quality}
    <Quality quality={presentation.quality} {labels} />
  {/if}
  <GenericGroups groups={presentation.genericGroups} />
</div>
