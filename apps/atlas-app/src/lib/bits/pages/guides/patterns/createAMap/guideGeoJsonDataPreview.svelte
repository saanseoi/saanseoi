<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import type { CreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'

type Props = {
  label: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  sampleDataUrl: string
  styleUrl: string
  tilejsonUrl: string
  openingPosition: CreateAMapOpeningPosition
}

let { label, renderer, sampleDataUrl, styleUrl, tilejsonUrl, openingPosition }: Props =
  $props()
const additionalSources = $derived({
  places: {
    type: 'geojson' as const,
    data: sampleDataUrl,
  },
} satisfies StyleSpecification['sources'])
let selectedPlaceName = $state<string>()

const showPlaceName = (map: MapLibreMap) => {
  map.on('click', 'places-outline', event => {
    const name = event.features?.[0]?.properties?.name
    selectedPlaceName = typeof name === 'string' ? name : undefined
  })
  map.on('mouseenter', 'places-outline', () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'places-outline', () => {
    map.getCanvas().style.cursor = ''
  })
}

const additionalLayers = [
  {
    id: 'places-outline',
    type: 'circle' as const,
    source: 'places',
    paint: {
      'circle-radius': 8,
      'circle-color': '#2dd4bf',
      'circle-stroke-color': '#0f766e',
      'circle-stroke-width': 2,
    },
  },
]
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${renderer}:${styleUrl}:${tilejsonUrl}:${sampleDataUrl}:${openingPosition.center.join(',')}:${openingPosition.zoom}`}
    <GuideMappingPreview
      ariaLabel={label}
      {additionalLayers}
      {additionalSources}
      center={openingPosition.center}
      {renderer}
      {styleUrl}
      {tilejsonUrl}
      onMapReady={showPlaceName}
      zoom={openingPosition.zoom}
    />
  {/key}
  <div
    class="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
  >
    <span>{m.guide_data_import_preview_instruction()}</span>
    <span class="truncate text-right text-white/60">
      {selectedPlaceName
        ? m.guide_data_import_preview_selected({ name: selectedPlaceName })
        : label}
    </span>
  </div>
</div>
