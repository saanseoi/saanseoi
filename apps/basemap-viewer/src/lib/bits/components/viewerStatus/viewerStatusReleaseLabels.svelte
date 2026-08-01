<script lang="ts">
import type { AppState } from '../../../types'
import { formatReleaseVersion } from '../../../release-order'
import Badge from './viewerStatusReleaseBadge.svelte'
import type { Callbacks } from '../../../ctx/app'
import { releaseOptions } from '../../pages/basemapViewer/controlOptions'

let {
  comparisonMode,
  comparisonVersion,
  callbacks,
  compact = false,
  latest,
  panelOpen = false,
  panelHeight = 0,
  primaryVersion,
  theme,
  versions,
}: {
  comparisonMode: AppState['comparisonMode']
  comparisonVersion: string
  callbacks: Callbacks
  compact?: boolean
  latest: string
  panelOpen?: boolean
  panelHeight?: number
  primaryVersion: string
  theme: AppState['theme']
  versions: string[]
} = $props()

const topClass = $derived(
  compact ? (panelOpen ? '' : 'top-2') : 'top-[calc(var(--header-height)+10px)]',
)
const topStyle = $derived(
  compact && panelOpen ? `top: ${panelHeight + 10}px` : undefined,
)
const options = $derived(releaseOptions(versions, { latest }))
</script>

{#if comparisonMode === 'overlay'}
  <div class={`fixed ${topClass} left-3.5 z-2 flex gap-2`} style={topStyle}>
    <Badge
      label={formatReleaseVersion(primaryVersion, latest)}
      onValueChange={callbacks.onVersion}
      {options}
      {theme}
      value={primaryVersion}
    />
    <Badge
      label={formatReleaseVersion(comparisonVersion, latest)}
      onValueChange={callbacks.onComparisonVersion}
      {options}
      {theme}
      value={comparisonVersion}
    />
  </div>
{:else}
  <Badge
    className={`fixed ${topClass} left-3.5 z-2`}
    label={formatReleaseVersion(primaryVersion, latest)}
    onValueChange={callbacks.onVersion}
    {options}
    style={topStyle}
    {theme}
    value={primaryVersion}
  />
  <Badge
    className={`fixed ${topClass} left-[calc(50%+10px)] z-2`}
    label={formatReleaseVersion(comparisonVersion, latest)}
    onValueChange={callbacks.onComparisonVersion}
    {options}
    style={topStyle}
    {theme}
    value={comparisonVersion}
  />
{/if}
