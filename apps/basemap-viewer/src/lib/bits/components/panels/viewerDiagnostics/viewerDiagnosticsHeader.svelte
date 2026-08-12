<script lang="ts">
import { IconButton } from '../../../primitives/iconButton'
import type { Callbacks } from '../../../../ctx/app'
import type { ViewerDiagnostics } from '../../../../../diagnostics'
import type { Theme } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import PanelHeader from '../panelHeader.svelte'

let {
  callbacks,
  diagnostics,
  text,
  theme,
}: {
  callbacks: Callbacks
  diagnostics: ViewerDiagnostics
  text: ViewerText
  theme: Theme
} = $props()
</script>

<PanelHeader alignmentClass="items-center" eyebrow="SaanSeoi" title={text.diagnostics}>
  <div class="flex items-center gap-1.5">
    {#if diagnostics.primary.tilejsonUrl}
      <a
        class="font-mono text-[10px] font-semibold text-(--bar-accent) uppercase hover:underline"
        href={diagnostics.primary.tilejsonUrl}
        target="_blank"
        >{text.tilejson}</a
      >
    {/if}
    {#if diagnostics.primary.tilejsonUrl && diagnostics.primary.manifestUrl}
      <span aria-hidden="true" class="text-(--bar-muted)">·</span>
    {/if}
    {#if diagnostics.primary.manifestUrl}
      <a
        class="font-mono text-[10px] font-semibold text-(--bar-accent) uppercase hover:underline"
        href={diagnostics.primary.manifestUrl}
        target="_blank"
        >{text.manifest}</a
      >
    {/if}
    <IconButton
      ghost
      icon="copy"
      label={text.copyReport}
      onclick={callbacks.onCopyReport}
      {theme}
    />
    <IconButton
      icon="close"
      label={text.closeDiagnostics}
      onclick={() => callbacks.onDiagnostics(false)}
      {theme}
    />
  </div>
</PanelHeader>
