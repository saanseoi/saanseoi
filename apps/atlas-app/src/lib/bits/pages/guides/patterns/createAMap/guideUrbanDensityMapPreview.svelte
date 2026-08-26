<script lang="ts">
import type { LayerSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import { nonLiveableLandUse } from './urbanDensityLandUse.ts'

type Props = {
  label: string
  showExclusions?: boolean
  styleUrl: string
  tilejsonUrl: string
}

let { label, showExclusions = true, styleUrl, tilejsonUrl }: Props = $props()

const notLiveableLayer: LayerSpecification = {
  id: 'not-liveable',
  type: 'fill',
  source: 'basemap',
  'source-layer': 'landuse',
  filter: ['in', 'kind', ...nonLiveableLandUse],
  paint: { 'fill-color': '#e76f51', 'fill-opacity': 0.62 },
}

const notLiveableOutlineLayer: LayerSpecification = {
  id: 'not-liveable-outline',
  type: 'line',
  source: 'basemap',
  'source-layer': 'landuse',
  filter: ['in', 'kind', ...nonLiveableLandUse],
  paint: { 'line-color': '#8c3427', 'line-width': 1 },
}
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${styleUrl}:${tilejsonUrl}:${showExclusions}`}
    <GuideMappingPreview
      ariaLabel={label}
      center={[114.165, 22.34]}
      renderer="maplibre"
      additionalLayers={showExclusions
        ? [notLiveableLayer, notLiveableOutlineLayer]
        : []}
      {styleUrl}
      {tilejsonUrl}
      zoom={10.5}
    />
  {/key}
  {#if showExclusions}
    <div
      class="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
    >
      <span class="text-[#ffad9d]">Excluded non-liveable land</span>
      <span class="truncate text-right text-white/60">{label}</span>
    </div>
  {/if}
</div>
