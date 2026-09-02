<script lang="ts">
import GuideMappingPreview from './guideMappingPreview.svelte'
import type { CreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'
import type { StyleSpecification } from 'maplibre-gl'

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
      zoom={openingPosition.zoom}
    />
  {/key}
  <div
    class="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
  >
    <span>Sample places</span>
    <span class="truncate text-right text-white/60">{label}</span>
  </div>
</div>
