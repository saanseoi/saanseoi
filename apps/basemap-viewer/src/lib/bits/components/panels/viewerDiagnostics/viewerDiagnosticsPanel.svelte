<script lang="ts">
import type { Readable } from 'svelte/store'
import type { Callbacks, ViewerUiState } from '../../../../ctx/app'
import type { AppState } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import Notice from '../../viewerStatus/viewerStatusNotice.svelte'
import Errors from './viewerDiagnosticsErrors.svelte'
import Header from './viewerDiagnosticsHeader.svelte'
import Release from './viewerDiagnosticsRelease.svelte'
import TileWeight from './viewerDiagnosticsTileWeight.svelte'

let {
  callbacks,
  dismissLabel,
  notice,
  state: viewerState,
  ui,
  text,
}: {
  callbacks: Callbacks
  dismissLabel?: string
  notice?: string | null
  state: Readable<AppState>
  ui: Readable<ViewerUiState>
  text: ViewerText
} = $props()
</script>

{#if $ui.diagnostics.open}
  <aside
    aria-label={text.diagnostics}
    class="pointer-events-auto relative grid w-full gap-3 rounded-[7px] border border-(--bar-border) bg-(--panel-background) p-3 text-[13px] text-(--bar-text) shadow-[0_8px_24px_var(--bar-shadow)]"
    data-bar-theme={$viewerState.theme}
  >
    <Header
      {callbacks}
      diagnostics={$ui.diagnostics}
      {text}
      theme={$viewerState.theme}
    />
    {#if notice && dismissLabel}
      <Notice {callbacks} {dismissLabel} inline {notice} />
    {/if}
    <Release
      diagnostics={$ui.diagnostics}
      locale={$viewerState.locale}
      {text}
      theme={$viewerState.theme}
    />
    <TileWeight diagnostics={$ui.diagnostics} locale={$viewerState.locale} {text} />
    {#if $ui.diagnostics.errors.length}
      <Errors errors={$ui.diagnostics.errors} {text} />
    {/if}
  </aside>
{/if}
