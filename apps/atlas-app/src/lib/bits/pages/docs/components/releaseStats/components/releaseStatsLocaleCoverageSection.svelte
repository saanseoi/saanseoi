<script lang="ts">
import type {
  LocaleCoveragePresentation,
  ReleaseStatsLabels,
} from '../releaseStats.types'
import CoverageBar from './releaseStatsCoverageBar.svelte'
import InfoTooltip from './releaseStatsInfoTooltip.svelte'
import Legend from './releaseStatsLegend.svelte'
import Section from './releaseStatsSection.svelte'
import Header from './releaseStatsSectionHeader.svelte'
let { rows, labels }: { rows: LocaleCoveragePresentation; labels: ReleaseStatsLabels } =
  $props()
</script>
<Section
  ><Header
    id="stats-names-by-locale"
    eyebrow={labels.completeness}
    title={labels.namesByLocale}
    ><div class="flex items-center gap-3">
      <Legend
        label={labels.localeLegend}
        items={[{ label: labels.provided, tone: 'bg-data-success' }, { label: labels.inferred, tone: 'bg-data-alert' }]}
      />
      <InfoTooltip
        label={labels.completenessInfo}
        description={labels.completenessInfoDescription}
      />
    </div></Header
  >
  <div
    class="grid grid-cols-[max-content_minmax(0,1fr)_max-content] gap-x-3 gap-y-4 px-5 py-5"
  >
    {#each rows as row}
      <div class="col-span-3 grid grid-cols-subgrid items-center">
        <p class="font-body text-label-md font-semibold text-primary">{row.label}</p>
        <CoverageBar
          coverage={row.coverage}
          providedCoverage={row.providedCoverage}
          label={row.coverageLabel}
          ariaLabel={`${row.label}: ${row.coverageLabel}`}
        />
        <p class="font-mono text-label-md font-bold tabular-nums text-primary">
          {row.count}
        </p>
      </div>
    {/each}
  </div></Section
>
