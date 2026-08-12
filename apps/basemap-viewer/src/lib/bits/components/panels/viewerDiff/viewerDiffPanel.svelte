<script lang="ts">
import { fly } from 'svelte/transition'
import type { Readable } from 'svelte/store'
import type { Callbacks, ViewerUiState } from '../../../../ctx/app'
import type { AppState } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import LabelChanges from './viewerDiffPanelLabelChanges.svelte'
import Summary from './viewerDiffPanelSummary.svelte'
import Visibility from './viewerDiffPanelVisibility.svelte'

let {
  callbacks,
  compact = false,
  mobileHosted = false,
  onClose,
  open = true,
  state: viewerState,
  ui,
  text,
}: {
  callbacks: Callbacks
  compact?: boolean
  mobileHosted?: boolean
  onClose?: () => void
  open?: boolean
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

{#if open && $viewerState.comparisonVersion && $viewerState.comparisonMode === 'labels'}
  <aside
    aria-label={text.labels}
    in:fly={{ x: compact ? 0 : -24, y: compact ? -120 : 0, duration: 180 }}
    out:fly={{ x: compact ? 0 : -24, y: compact ? -120 : 0, duration: 160 }}
    class={`${mobileHosted ? 'w-full max-h-[50dvh] rounded-none border-x-0' : 'fixed top-[calc(var(--header-height)+10px)] left-2.5 z-20 w-[min(390px,calc(100vw-20px))] max-h-[calc(100vh-var(--header-height)-20px)] rounded-[7px] shadow-[0_8px_24px_var(--bar-shadow)]'} grid grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 overflow-hidden border border-(--bar-border) bg-(--panel-background) px-3 py-3 text-[12px] text-(--bar-text) ${compact && !mobileHosted ? 'top-0! left-0! bottom-auto! w-full! max-h-[50dvh]! rounded-none border-x-0' : ''}`}
    data-bar-theme={$viewerState.theme}
  >
    <Summary
      comparisonVersion={$viewerState.comparisonVersion}
      {compact}
      {onClose}
      primaryVersion={$viewerState.version}
      summary={$ui.diffSummary}
      {text}
      theme={$viewerState.theme}
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
