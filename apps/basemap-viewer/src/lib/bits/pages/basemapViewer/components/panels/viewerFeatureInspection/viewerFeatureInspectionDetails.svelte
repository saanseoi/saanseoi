<script lang="ts">
import type { FeatureDiagnostic } from '../../../../../../../diagnostics'
import type { ViewerText } from '../../../i18n'
import DefinitionItem from '../panelDefinitionItem.svelte'
import Layer from './viewerFeatureInspectionLayer.svelte'

let {
  feature,
  text,
}: {
  feature: FeatureDiagnostic
  text: ViewerText
} = $props()
</script>

<section class="grid gap-2 border-t border-(--bar-divider) pt-2">
  <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 leading-[1.25]">
    <DefinitionItem label={text.featureRelease} valueClass="truncate font-medium">
      {feature.release}
    </DefinitionItem>
    <DefinitionItem label={text.featureLongitude} valueClass="font-mono font-medium">
      {feature.longitude.toFixed(5)}
    </DefinitionItem>
    <DefinitionItem label={text.featureLatitude} valueClass="font-mono font-medium">
      {feature.latitude.toFixed(5)}
    </DefinitionItem>
    <DefinitionItem label={text.featureZoom} valueClass="font-mono font-medium">
      z{feature.zoom.toFixed(2)}
    </DefinitionItem>
  </dl>

  {#if feature.layers.length}
    <div class="grid gap-2">
      {#each feature.layers as layer}
        <Layer {layer} {text} />
      {/each}
    </div>
  {:else}
    <p class="m-0 text-[11px] leading-[1.35] text-(--bar-muted)">
      {text.noFeatureProperties}
    </p>
  {/if}
</section>
