<script lang="ts">
import type { Readable } from 'svelte/store'
import type { Callbacks, ViewerUiState } from '../../../../../../ctx/app'
import type { AppState } from '../../../../../../types'
import type { ViewerText } from '../../../i18n'
import Errors from './viewerDiagnosticsErrors.svelte'
import Header from './viewerDiagnosticsHeader.svelte'
import Release from './viewerDiagnosticsRelease.svelte'
import Tools from './viewerDiagnosticsTools.svelte'

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

{#if $ui.diagnostics.open}
  <aside
    aria-label={text.diagnostics}
    class="pointer-events-auto grid w-full gap-3 rounded-[7px] border border-(--bar-border) bg-(--bar-background) p-3 text-[13px] text-(--bar-text) shadow-[0_8px_24px_var(--bar-shadow)]"
    data-bar-theme={$viewerState.theme}
  >
    <Header {callbacks} {text} theme={$viewerState.theme} />
    <Release
      diagnostics={$ui.diagnostics}
      locale={$viewerState.locale}
      {text}
      theme={$viewerState.theme}
    />
    <Tools {callbacks} debug={$ui.diagnostics.debug} {text} />

    {#if $ui.diagnostics.errors.length}
      <Errors errors={$ui.diagnostics.errors} {text} />
    {/if}
  </aside>
{/if}
