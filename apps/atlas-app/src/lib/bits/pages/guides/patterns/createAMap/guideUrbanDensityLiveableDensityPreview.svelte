<script lang="ts">
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import { calculateUrbanDensityLiveableMetrics } from './urbanDensityExampleData.ts'

const metrics = calculateUrbanDensityLiveableMetrics()

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()

const liveableSource: StyleSpecification['sources'] = {
  'liveable-districts': {
    type: 'geojson',
    data: '/guides/urban-density-census-districts.geojson',
  },
}
const quietLandUse = [
  'aerodrome',
  'airfield',
  'allotments',
  'bare_rock',
  'beach',
  'cemetery',
  'dam',
  'dog_park',
  'farmland',
  'forest',
  'garden',
  'golf_course',
  'grass',
  'grassland',
  'industrial',
  'meadow',
  'military',
  'nature_reserve',
  'park',
  'pedestrian',
  'pier',
  'pitch',
  'platform',
  'playground',
  'railway',
  'recreation_ground',
  'runway',
  'sand',
  'scrub',
  'wetland',
  'wood',
  'zoo',
]
const liveableLayers: LayerSpecification[] = [
  {
    id: 'liveable-districts',
    type: 'fill',
    source: 'liveable-districts',
    paint: { 'fill-color': '#36a269', 'fill-opacity': 0.5 },
  },
  {
    id: 'no-residences',
    type: 'fill',
    source: 'basemap',
    'source-layer': 'landuse',
    filter: ['in', 'kind', ...quietLandUse],
    paint: { 'fill-color': '#e76f51', 'fill-opacity': 0.62 },
  },
  {
    id: 'no-residences-outline',
    type: 'line',
    source: 'basemap',
    'source-layer': 'landuse',
    filter: ['in', 'kind', ...quietLandUse],
    paint: { 'line-color': '#8c3427', 'line-width': 1 },
  },
]
</script>

<div
  class="guide-map-preview flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div class="guide-map-preview-canvas relative min-h-64 flex-1 overflow-hidden">
    {#key `${styleUrl}:${tilejsonUrl}`}
      <GuideMappingPreview
        ariaLabel={label}
        additionalLayers={liveableLayers}
        additionalSources={liveableSource}
        center={[114.165, 22.34]}
        renderer="maplibre"
        {styleUrl}
        {tilejsonUrl}
        zoom={10.25}
      />
    {/key}
    <p
      class="absolute top-3 left-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
    >
      Calculated liveable-area density
    </p>
    <p
      class="absolute right-3 bottom-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] text-white/80 shadow-sm"
    >
      SaanSeoi Basemap
    </p>
  </div>
  <section
    class="shrink-0 grid gap-px bg-[#26433d] shadow-[0_12px_32px_rgb(0_0_0_/_24%)] sm:grid-cols-3"
    aria-label="Liveable-area population density"
  >
    {#each metrics as metric}
      <article class="bg-[#fff9ed] p-4 sm:px-5">
        <p class="font-body text-sm text-[#10151a]">{metric.name}</p>
        <strong class="my-1 block font-body text-[2rem] leading-none text-[#10151a]"
          >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
        >
        <span class="block font-body text-xs text-[#52615d]">people per km²</span>
        <div
          class="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-body text-xs text-[#52615d]"
        >
          <span>{metric.landAreaSqKm.toFixed(1)} km² liveable land</span>
          <span>{metric.liveablePercentage.toFixed(0)}% liveable</span>
        </div>
      </article>
    {/each}
  </section>
</div>

<style>
:global([data-guide-map-expanded="true"]) .guide-map-preview-canvas {
  height: auto;
  flex: 1 1 auto;
}
</style>
