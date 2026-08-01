<script lang="ts">
import type { Readable } from 'svelte/store'
import type { Callbacks } from '../../../ctx/app'
import type { AppState } from '../../../types'
import Notice from './viewerStatusNotice.svelte'
import ReleaseLabels from './viewerStatusReleaseLabels.svelte'

let {
  state: viewerState,
  callbacks,
  compact = false,
  notice,
  noticeId,
  latest,
  dismissLabel,
  panelOpen = false,
  panelHeight = 0,
  suppressNotice = false,
  versions,
}: {
  state: Readable<AppState>
  callbacks: Callbacks
  compact?: boolean
  notice: string | null
  noticeId: number
  latest: string
  dismissLabel: string
  panelOpen?: boolean
  panelHeight?: number
  suppressNotice?: boolean
  versions: string[]
} = $props()

$effect(() => {
  noticeId
  if (!notice) return
  const timeout = window.setTimeout(callbacks.onDismissNotice, 5_000)
  return () => window.clearTimeout(timeout)
})
</script>

{#if $viewerState.comparisonVersion && $viewerState.comparisonMode !== 'diff'}
  <ReleaseLabels
    comparisonMode={$viewerState.comparisonMode}
    comparisonVersion={$viewerState.comparisonVersion}
    {callbacks}
    {compact}
    {latest}
    {panelOpen}
    {panelHeight}
    primaryVersion={$viewerState.version}
    theme={$viewerState.theme}
    {versions}
  />
{/if}

{#if notice && !suppressNotice}
  <Notice {callbacks} {dismissLabel} {notice} />
{/if}

<output
  aria-live="polite"
  class="absolute -m-px size-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]"
  >{notice ?? ''}</output
>
