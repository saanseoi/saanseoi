<script lang="ts">
import { onMount } from 'svelte'
import type { Feature } from 'geojson'
import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  calculateLiveableMetrics,
  deriveLiveableDistricts,
  loadUrbanDensityData,
  type DistrictGeometry,
} from './urbanDensityCensusDistricts.ts'
import { nonLiveableLandUse } from './urbanDensityLandUse.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
let densityData = $state<Awaited<ReturnType<typeof loadUrbanDensityData>>>()
let metrics = $state<ReturnType<typeof calculateLiveableMetrics>>()
let error = $state<string>()

onMount(() => {
  void loadUrbanDensityData()
    .then(value => (densityData = value))
    .catch(cause => {
      error =
        cause instanceof Error ? cause.message : 'Density data could not be loaded.'
    })
})

const addLiveableDistricts = (map: MapLibreMap) => {
  if (!densityData) return
  try {
    const nonLiveableFeatures = map
      .querySourceFeatures('basemap', {
        sourceLayer: 'landuse',
        filter: ['in', 'kind', ...nonLiveableLandUse],
      })
      .flatMap(feature =>
        feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'
          ? [feature as unknown as Feature<DistrictGeometry>]
          : [],
      )
    const liveableDistricts = deriveLiveableDistricts(
      densityData.censusDistricts,
      nonLiveableFeatures,
    )
    map.addSource('liveable-districts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: liveableDistricts },
    })
    map.addLayer(
      {
        id: 'liveable-districts',
        type: 'fill',
        source: 'liveable-districts',
        paint: { 'fill-color': '#36a269', 'fill-opacity': 0.5 },
      },
      'not-liveable',
    )
    metrics = calculateLiveableMetrics(
      liveableDistricts,
      densityData.populationByDistrict,
      densityData.landAreaByDistrict,
    )
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : 'Liveable areas could not be calculated.'
  }
}

const liveableLayers: LayerSpecification[] = [
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
  <div class="guide-map-preview-canvas relative min-h-64 flex-1 overflow-hidden">
    {#if densityData}
      {#key `${styleUrl}:${tilejsonUrl}`}
        <GuideMappingPreview
          ariaLabel={label}
          additionalLayers={liveableLayers}
          center={[114.165, 22.34]}
          onMapReady={addLiveableDistricts}
          renderer="maplibre"
          {styleUrl}
          {tilejsonUrl}
          zoom={10.25}
        />
      {/key}
    {:else}
      <div
        class="grid size-full place-items-center px-6 text-center text-body-sm text-white/70"
      >
        {error ?? 'Loading census areas…'}
      </div>
    {/if}
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
      class="shrink-0 grid gap-px bg-[#26433d] shadow-[0_12px_32px_rgb(0_0_0/24%)] sm:grid-cols-3"
      aria-label="Liveable-area population density"
    >
      {#each metrics as metric}
        <article class="bg-[#fff9ed] p-4 sm:px-5">
          <p class="font-body text-sm text-[#10151a]">{metric.name}</p>
          <strong class="my-1 block font-body text-[2rem] leading-none text-[#10151a]"
            >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
          >
          <span class="block font-body text-xs text-[#52615d]">people per km²</span>
          <p class="mt-2 font-body text-xs text-[#52615d]">
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

<style>
:global([data-guide-map-expanded="true"]) .guide-map-preview-canvas {
  height: auto;
  flex: 1 1 auto;
}
</style>
