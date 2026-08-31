<script lang="ts">
import { fly } from 'svelte/transition'
import type { Map as MapLibreMap } from 'maplibre-gl'

import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import GuideUrbanDensityLiveableLegend from './guideUrbanDensityLiveableLegend.svelte'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'
import { calculateUrbanDensityLiveableMetrics } from './urbanDensityExampleData.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
const metrics = calculateUrbanDensityLiveableMetrics()
let showMetrics = $state(false)
const areaColour = (name: string) =>
  name === 'Hong Kong Island' ? '#5b8ff9' : name === 'Kowloon' ? '#f6bd16' : '#5ad8a6'
const nonLiveableLandUse = [
  'aerodrome',
  'airfield',
  'allotments',
  'bare_rock',
  'beach',
  'cemetery',
  'commercial',
  'construction',
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
const addIllustrativeLiveableLand = (map: MapLibreMap) => {
  const firstLabelLayerId = map
    .getStyle()
    .layers?.find(layer => layer.type === 'symbol')?.id
  map.addSource('preview-liveable-districts', {
    type: 'geojson',
    data: urbanDensityCensusDistricts,
  })
  map.addLayer(
    {
      id: 'preview-liveable-districts',
      type: 'fill',
      source: 'preview-liveable-districts',
      paint: { 'fill-color': '#36a269', 'fill-opacity': 0.48 },
    },
    firstLabelLayerId,
  )
  map.addLayer(
    {
      id: 'preview-excluded-districts',
      type: 'fill',
      source: 'basemap',
      'source-layer': 'landuse',
      filter: ['in', 'kind', ...nonLiveableLandUse],
      paint: { 'fill-color': '#ff503d', 'fill-opacity': 0.62 },
    },
    firstLabelLayerId,
  )
  map.addLayer(
    {
      id: 'preview-excluded-districts-outline',
      type: 'line',
      source: 'basemap',
      'source-layer': 'landuse',
      filter: ['in', 'kind', ...nonLiveableLandUse],
      paint: { 'line-color': '#8c3427', 'line-width': 1 },
    },
    firstLabelLayerId,
  )
}
const showLiveableLand = async (map: MapLibreMap) => {
  addIllustrativeLiveableLand(map)
  requestAnimationFrame(() => {
    showMetrics = true
  })
}
</script>

<div
  class="guide-map-preview relative h-full min-h-0 overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div
    class="relative h-full min-h-64 overflow-hidden in-data-[guide-map-expanded=true]:h-auto"
  >
    {#key `${styleUrl}:${tilejsonUrl}`}
      <GuideMappingPreview
        ariaLabel={label}
        center={[114.16, 22.32]}
        onMapReady={showLiveableLand}
        renderer="maplibre"
        {styleUrl}
        {tilejsonUrl}
        zoom={10.75}
      />
    {/key}
    <GuideUrbanDensityLiveableLegend />
  </div>
  {#if showMetrics}
    <section
      class="absolute inset-x-4 bottom-4 z-10 grid grid-cols-3 gap-3"
      aria-label={m.guide_data_urban_density_liveable_density_label()}
    >
      {#each metrics as metric, index}
        <article
          class="border border-white/20 bg-[#10151a]/92 px-3 py-2.5 text-white shadow-[0_12px_32px_rgb(0_0_0/24%)] backdrop-blur-sm sm:px-6 sm:py-4"
          in:fly={{ y: 8, duration: 360, delay: index * 80 }}
        >
          <p class="text-xs sm:text-sm" style:color={areaColour(metric.name)}>
            {metric.name}
          </p>
          <strong
            class="my-1 block text-[1.35rem] leading-none tracking-tight tabular-nums sm:text-[2rem]"
            >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
          >
          <span class="block text-[0.68rem] leading-tight text-white/65 sm:text-xs"
            >{m.guide_data_urban_density_people_per_square_kilometre()}</span
          >
          <p class="mt-2 text-[0.68rem] leading-tight text-white/65 sm:text-xs">
            <strong class="font-bold text-white"
              >{metric.liveablePercentage.toFixed(0)}%</strong
            >
            {m.guide_data_urban_density_liveable_density_or()}
            <strong class="font-bold text-white"
              >{metric.landAreaSqKm.toFixed(1)}
              km²</strong
            >
            {m.guide_data_urban_density_liveable_legend_liveable()}
          </p>
        </article>
      {/each}
    </section>
  {/if}
</div>
