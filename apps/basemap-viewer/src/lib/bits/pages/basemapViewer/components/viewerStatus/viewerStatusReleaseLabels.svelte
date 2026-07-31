<script lang="ts">
import type { AppState } from '../../../../../types'
import { formatReleaseVersion } from '../../../../../release-order'
import Badge from './viewerStatusReleaseBadge.svelte'

let {
  comparisonMode,
  comparisonVersion,
  latest,
  primaryVersion,
  theme,
}: {
  comparisonMode: AppState['comparisonMode']
  comparisonVersion: string
  latest: string
  primaryVersion: string
  theme: AppState['theme']
} = $props()
</script>

{#if comparisonMode === 'overlay'}
  <div class="fixed top-[calc(var(--header-height)+10px)] left-3.5 z-2 flex gap-2">
    <Badge label={formatReleaseVersion(primaryVersion, latest)} {theme} />
    <Badge label={formatReleaseVersion(comparisonVersion, latest)} {theme} />
  </div>
{:else}
  <Badge
    className="fixed top-[calc(var(--header-height)+10px)] left-3.5 z-2"
    label={formatReleaseVersion(primaryVersion, latest)}
    {theme}
  />
  <Badge
    className="fixed top-[calc(var(--header-height)+10px)] left-[calc(50%+10px)] z-2"
    label={formatReleaseVersion(comparisonVersion, latest)}
    {theme}
  />
{/if}
