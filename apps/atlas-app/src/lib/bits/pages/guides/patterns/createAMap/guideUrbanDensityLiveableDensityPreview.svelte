<script lang="ts">
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import { nonLiveableLandUse } from './urbanDensityLandUse.ts'
import { calculateUrbanDensityLiveableMetrics } from './urbanDensityExampleData.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
const metrics = calculateUrbanDensityLiveableMetrics()

const liveableDistrictsSource = {
  'liveable-districts': {
    type: 'geojson',
    data: '/guides/urban-density-liveable-districts.geojson',
  },
} satisfies StyleSpecification['sources']

const liveableLayers: LayerSpecification[] = [
  {
    id: 'liveable-districts',
    type: 'fill',
    source: 'liveable-districts',
    paint: { 'fill-color': '#36a269', 'fill-opacity': 0.5 },
  },
  {
    id: 'not-liveable',
    type: 'fill',
    source: 'basemap',
    'source-layer': 'landuse',
    filter: ['in', 'kind', ...nonLiveableLandUse],
    paint: { 'fill-color': '#e76f51', 'fill-opacity': 0.62 },
  },
  {
    id: 'not-liveable-outline',
    type: 'line',
    source: 'basemap',
    'source-layer': 'landuse',
    filter: ['in', 'kind', ...nonLiveableLandUse],
    paint: { 'line-color': '#8c3427', 'line-width': 1 },
  },
]
</script>

<div
  class="guide-map-preview flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div
    class="relative min-h-64 flex-1 overflow-hidden in-data-[guide-map-expanded=true]:h-auto in-data-[guide-map-expanded=true]:flex-[1_1_auto]"
  >
    {#key `${styleUrl}:${tilejsonUrl}`}
      <GuideMappingPreview
        ariaLabel={label}
        additionalLayers={liveableLayers}
        additionalSources={liveableDistrictsSource}
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
  {#if metrics}
    <section
      class="shrink-0 grid grid-cols-3 gap-px bg-[#26433d] shadow-[0_12px_32px_rgb(0_0_0/24%)]"
      aria-label="Liveable-area population density"
    >
      {#each metrics as metric}
        <article class="bg-[#fff9ed] p-2.5 sm:px-5 sm:py-4">
          <p class="font-body text-xs text-[#10151a] sm:text-sm">{metric.name}</p>
          <strong
            class="font-body text-[1.35rem] leading-none tracking-tight tabular-nums text-[#10151a] sm:my-1 sm:block sm:text-[2rem]"
            >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
          >
          <span
            class="ml-0.75 inline font-body text-[0.68rem] leading-tight text-[#52615d] sm:ml-0 sm:block sm:text-xs"
            >people per km²</span
          >
          <p
            class="mt-1 font-body text-[0.68rem] leading-tight text-[#52615d] sm:mt-2 sm:text-xs"
          >
            <strong class="font-semibold text-[#10151a]"
              >{metric.liveablePercentage.toFixed(0)}%</strong
            >
            or
            <strong class="font-semibold text-[#10151a]"
              >{metric.landAreaSqKm.toFixed(1)}
              km²</strong
            >
            liveable land
          </p>
        </article>
      {/each}
    </section>
  {/if}
</div>
