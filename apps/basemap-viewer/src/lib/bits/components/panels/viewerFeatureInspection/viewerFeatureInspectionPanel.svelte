<script lang="ts">
import type { Readable } from 'svelte/store'
import { IconButton } from '../../../primitives/iconButton'
import type { Callbacks, ViewerUiState } from '../../../../ctx/app'
import type { AppState } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import PanelHeader from '../panelHeader.svelte'
import Details from './viewerFeatureInspectionDetails.svelte'

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
</script>

<aside
  aria-label={text.featureInspection}
  class="pointer-events-auto grid w-full gap-3 rounded-[7px] border border-(--bar-border) bg-(--panel-background) p-3 text-[13px] text-(--bar-text) shadow-[0_8px_24px_var(--bar-shadow)]"
  data-bar-theme={$viewerState.theme}
>
  <PanelHeader
    alignmentClass="items-center"
    eyebrow={text.inspect}
    title={text.featureInspection}
  >
    <IconButton
      icon="close"
      label={text.closeInspection}
      onclick={() => callbacks.onInspect(false)}
      theme={$viewerState.theme}
    />
  </PanelHeader>

  {#if $ui.diagnostics.feature}
    <Details feature={$ui.diagnostics.feature} {text} />
  {:else}
    <p
      class="m-0 border-t border-(--bar-divider) pt-2 text-[11px] leading-[1.35] text-(--bar-muted)"
    >
      {text.inspectHint}
    </p>
  {/if}
</aside>
