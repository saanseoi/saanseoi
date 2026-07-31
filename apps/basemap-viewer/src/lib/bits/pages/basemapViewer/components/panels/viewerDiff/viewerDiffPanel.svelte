<script lang="ts">
import type { Readable } from 'svelte/store'
import type { Callbacks, ViewerUiState } from '../../../../../../ctx/app'
import type { AppState } from '../../../../../../types'
import type { ViewerText } from '../../../i18n'
import LabelChanges from './viewerDiffPanelLabelChanges.svelte'
import Summary from './viewerDiffPanelSummary.svelte'
import Visibility from './viewerDiffPanelVisibility.svelte'

let {
  callbacks,
  state: viewerState,
  ui,
  text,
}: {
  callbacks: Callbacks
  state: Readable<AppState>
  ui: Readable<ViewerUiState>
  text: ViewerText
} = $props()

const visibleChanges = $derived(
  ($ui.diffSummary?.labelChanges ?? []).filter(
    change => $viewerState.diffVisibility[change.status],
  ),
)
</script>

{#if $viewerState.comparisonVersion && $viewerState.comparisonMode === 'diff'}
  <aside
    aria-label={text.diff}
    class="fixed top-[calc(var(--header-height)+12px)] left-3.5 z-2 grid max-h-[calc(100vh-var(--header-height)-24px)] grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden rounded-[7px] border border-(--bar-border) bg-(--bar-background) px-3 py-3 text-[12px] text-(--bar-text) shadow-[0_8px_24px_var(--bar-shadow)] max-[700px]:left-2.5"
    data-bar-theme={$viewerState.theme}
  >
    <Summary
      comparisonVersion={$viewerState.comparisonVersion}
      primaryVersion={$viewerState.version}
      summary={$ui.diffSummary}
      {text}
      versions={$ui.versions}
    />
    <Visibility
      {callbacks}
      summary={$ui.diffSummary}
      {text}
      visibility={$viewerState.diffVisibility}
    />

    {#if visibleChanges.length}
      <LabelChanges {callbacks} changes={visibleChanges} {text} />
    {/if}
  </aside>
{/if}
