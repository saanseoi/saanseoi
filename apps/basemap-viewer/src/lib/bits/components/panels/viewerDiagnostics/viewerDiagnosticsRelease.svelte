<script lang="ts">
import type { ViewerDiagnostics } from '../../../../../diagnostics'
import type { AppState } from '../../../../types'
import type { ViewerText } from '../../../pages/basemapViewer/i18n'
import DefinitionItem from '../panelDefinitionItem.svelte'

let {
  diagnostics,
  locale,
  text,
  theme,
}: {
  diagnostics: ViewerDiagnostics
  locale: AppState['locale']
  text: ViewerText
  theme: AppState['theme']
} = $props()
</script>

<section class="grid gap-2 border-t border-(--bar-divider) pt-2">
  <h3 class="m-0 text-[11px] font-bold uppercase tracking-[0.06em] text-(--bar-muted)">
    {text.release}
  </h3>
  <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 leading-tight">
    <DefinitionItem
      label={text.diagnosticPrimary}
      valueClass="truncate font-mono font-medium"
    >
      {diagnostics.primary.version ?? '—'}
    </DefinitionItem>
    {#if diagnostics.comparison}
      <DefinitionItem
        label={text.diagnosticComparison}
        valueClass="truncate font-mono font-medium"
      >
        {diagnostics.comparison.version ?? '—'}
      </DefinitionItem>
    {/if}
    <DefinitionItem label={text.diagnosticTiles} valueClass="font-mono font-medium">
      {diagnostics.tileRequests}
      {text.tileRequests}
      · {diagnostics.tileFailures} {text.tileFailures}
    </DefinitionItem>
    <DefinitionItem label={text.diagnosticLastTile} valueClass="font-mono font-medium">
      {diagnostics.lastTileDurationMs ?? '—'}
      {text.milliseconds}
    </DefinitionItem>
    <DefinitionItem
      label={text.diagnosticBoundary}
      valueClass="truncate font-mono font-medium"
    >
      {diagnostics.primary.boundary}
    </DefinitionItem>
    <DefinitionItem label={text.diagnosticZoom} valueClass="font-mono font-medium">
      {diagnostics.primary.minZoom ?? '—'}–{diagnostics.primary.maxZoom ?? '—'}
    </DefinitionItem>
    <DefinitionItem
      label={text.diagnosticLayers}
      valueClass="wrap-break-word font-mono font-medium"
      valueTitle={diagnostics.primary.vectorLayers.join(', ')}
    >
      {diagnostics.primary.vectorLayers.join(', ') || '—'}
    </DefinitionItem>
    <DefinitionItem label={text.diagnosticLocale} valueClass="font-mono font-medium">
      {locale}
    </DefinitionItem>
    <DefinitionItem label={text.diagnosticTheme} valueClass="font-mono font-medium">
      {text[theme]}
    </DefinitionItem>
  </dl>
</section>
