<script lang="ts">
import { Tooltip } from 'bits-ui'
import { createReleaseStatsPresentation } from '../releaseStatsPresentation'
import type {
  ReleaseStat,
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
  ReleaseStatsDistrictName,
  ReleaseStatsMeasure,
} from '../releaseStats.types'
import type { ReleaseContentHeading } from '../../releaseContentOutline'
import OutlineTracker from '../../releaseContentOutline/releaseContentOutlineTracker.svelte'
import EmptyState from './releaseStatsEmptyState.svelte'
import Panel from './releaseStatsPanel.svelte'
import Results from './releaseStatsResults.svelte'

type Props = {
  statisticsSource?: { sourceCode: string; releaseCode: string }
  onChangeSelect?: (type: 'added' | 'changed' | 'removed') => void
  resourceType?: string
  isFirstRelease?: boolean
  stats?: ReleaseStat[]
  districtAreas?: ReleaseStatsDistrictArea[]
  districtNames?: ReleaseStatsDistrictName[]
  measures?: ReleaseStatsMeasure[]
  locale: 'en' | 'zh-Hant' | 'zh-Hans'
  presentation: ReleaseStatsCopy
  headings?: ReleaseContentHeading[]
  activeHeadingId?: string | null
}
let {
  statisticsSource,
  resourceType,
  onChangeSelect,
  isFirstRelease = false,
  stats = [],
  districtAreas = [],
  districtNames,
  measures = [],
  locale,
  presentation: copy,
  headings = $bindable<ReleaseContentHeading[]>([]),
  activeHeadingId = $bindable<string | null>(null),
}: Props = $props()
let model = $derived(
  createReleaseStatsPresentation({
    resourceType,
    isFirstRelease,
    stats,
    districtAreas,
    districtNames: districtNames ?? [],
    measures,
    locale,
    copy,
  }),
)
let panel = $state<HTMLElement>()
$effect(() => {
  headings = model.headings
})
</script>
<Tooltip.Provider delayDuration={200}
  ><Panel bind:element={panel}
    >{#if statisticsSource}
      <p class="mb-4 text-caption text-foreground-alt">
        Statistics for the primary place resource ·
        <a
          class="font-semibold text-data-primary underline decoration-data-primary/30 underline-offset-4 hover:decoration-data-primary"
          href={`/sources/${statisticsSource.sourceCode}/${statisticsSource.releaseCode}?tab=stats`}
        >
          {statisticsSource.releaseCode}
        </a>
      </p>
    {/if}
    {#if stats.length}
      <Results
        {onChangeSelect}
        {districtNames}
        {locale}
        presentation={model}
        labels={copy.labels}
      />
    {:else}
      <EmptyState label={copy.labels.noStats} />
    {/if}</Panel
  ><OutlineTracker
    content={panel}
    headings={model.headings}
    bind:activeHeadingId
  /></Tooltip.Provider
>
