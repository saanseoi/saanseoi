<script lang="ts">
import { Tooltip } from 'bits-ui'
import { createReleaseStatsPresentation } from '../releaseStatsPresentation'
import type {
  ReleaseStat,
  ReleaseStatsCopy,
  ReleaseStatsDistrictArea,
  ReleaseStatsDistrictName,
} from '../releaseStats.types'
import type { ReleaseContentHeading } from '../../releaseContentOutline'
import OutlineTracker from '../../releaseContentOutline/releaseContentOutlineTracker.svelte'
import EmptyState from './releaseStatsEmptyState.svelte'
import Panel from './releaseStatsPanel.svelte'
import Results from './releaseStatsResults.svelte'

type Props = {
  stats?: ReleaseStat[]
  districtAreas?: ReleaseStatsDistrictArea[]
  districtNames?: ReleaseStatsDistrictName[]
  locale: string
  presentation: ReleaseStatsCopy
  headings?: ReleaseContentHeading[]
  activeHeadingId?: string | null
}
let {
  stats = [],
  districtAreas = [],
  districtNames = [],
  locale,
  presentation: copy,
  headings = $bindable<ReleaseContentHeading[]>([]),
  activeHeadingId = $bindable<string | null>(null),
}: Props = $props()
let model = $derived(
  createReleaseStatsPresentation({ stats, districtAreas, districtNames, locale, copy }),
)
let panel = $state<HTMLElement>()
$effect(() => {
  headings = model.headings
})
</script>
<Tooltip.Provider delayDuration={200}
  ><Panel bind:element={panel}
    >{#if stats.length}
      <Results presentation={model} labels={copy.labels} />
    {:else}
      <EmptyState label={copy.labels.noStats} />
    {/if}</Panel
  ><OutlineTracker
    content={panel}
    headings={model.headings}
    bind:activeHeadingId
  /></Tooltip.Provider
>
