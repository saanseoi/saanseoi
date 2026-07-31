<script lang="ts">
import { IconButton } from '../../../../../primitives/iconButton'
import type { Callbacks } from '../../../../../../ctx/app'
import type { Theme } from '../../../../../../types'
import type { ViewerText } from '../../../i18n'
import PanelHeader from '../panelHeader.svelte'

let {
  callbacks,
  text,
  theme,
}: {
  callbacks: Callbacks
  text: ViewerText
  theme: Theme
} = $props()
</script>

<PanelHeader alignmentClass="items-center" eyebrow="SaanSeoi" title={text.diagnostics}>
  <div class="flex items-center gap-1.5">
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
