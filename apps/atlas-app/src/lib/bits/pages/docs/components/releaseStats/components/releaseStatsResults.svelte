<script lang="ts">
import type {
  ReleaseStatsPresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import ComponentCoverage from './releaseStatsComponentCoverageSection.svelte'
import District from './releaseStatsDistrictSection.svelte'
import GenericGroups from './releaseStatsGenericGroups.svelte'
import LocaleCoverage from './releaseStatsLocaleCoverageSection.svelte'
import Overview from './releaseStatsOverviewSection.svelte'
import Processing from './releaseStatsProcessingSection.svelte'
import Quality from './releaseStatsQualitySection.svelte'
import TypeDistribution from './releaseStatsTypeDistributionSection.svelte'
let {
  presentation,
  labels,
}: { presentation: ReleaseStatsPresentation; labels: ReleaseStatsLabels } = $props()
</script>
<div class="grid gap-6">
  {#if presentation.overview}
    <Overview overview={presentation.overview} {labels} />
  {/if}
  {#if presentation.districtDistribution}
    <District districtDistribution={presentation.districtDistribution} {labels} />
  {/if}
  {#if presentation.localeCoverage}
    <LocaleCoverage rows={presentation.localeCoverage} {labels} />
  {/if}
  {#if presentation.componentCoverage}
    <ComponentCoverage rows={presentation.componentCoverage} {labels} />
  {/if}
  {#if presentation.typeDistribution}
    <TypeDistribution distribution={presentation.typeDistribution} {labels} />
  {/if}
  {#if presentation.processing}
    <Processing processing={presentation.processing} {labels} />
  {/if}
  {#if presentation.quality}
    <Quality quality={presentation.quality} {labels} />
  {/if}
  <GenericGroups groups={presentation.genericGroups} />
</div>
