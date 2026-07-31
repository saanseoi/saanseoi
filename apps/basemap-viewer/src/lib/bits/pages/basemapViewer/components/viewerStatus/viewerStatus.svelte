<script lang="ts">
import type { Readable } from 'svelte/store'
import type { Callbacks } from '../../../../../ctx/app'
import type { AppState } from '../../../../../types'
import Notice from './viewerStatusNotice.svelte'
import ReleaseLabels from './viewerStatusReleaseLabels.svelte'

let {
  state: viewerState,
  callbacks,
  notice,
  noticeId,
  latest,
  dismissLabel,
}: {
  state: Readable<AppState>
  callbacks: Callbacks
  notice: string | null
  noticeId: number
  latest: string
  dismissLabel: string
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
    {latest}
    primaryVersion={$viewerState.version}
    theme={$viewerState.theme}
  />
{/if}

{#if notice}
  <Notice {callbacks} {dismissLabel} {notice} />
{/if}

<output
  aria-live="polite"
  class="absolute -m-px size-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]"
  >{notice ?? ''}</output
>
