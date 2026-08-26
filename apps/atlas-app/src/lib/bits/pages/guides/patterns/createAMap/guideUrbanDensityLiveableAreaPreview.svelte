<script lang="ts">
import type { Feature } from 'geojson'
import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  getUrbanDensityLiveableDistricts,
  type DistrictGeometry,
} from './urbanDensityCensusDistricts.ts'
import { nonLiveableLandUse } from './urbanDensityLandUse.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()

const addLiveableDistricts = (map: MapLibreMap) => {
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
    const liveableDistricts = getUrbanDensityLiveableDistricts(nonLiveableFeatures)
    map.addSource('liveable-districts', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: liveableDistricts },
    })
    map.addLayer(
      {
        id: 'liveable-districts',
        type: 'fill',
        source: 'liveable-districts',
        paint: { 'fill-color': '#36a269', 'fill-opacity': 0.48 },
      },
      'not-liveable',
    )
  } catch (cause) {
    console.error('Liveable areas could not be calculated.', cause)
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

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
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
  <p
    class="pointer-events-none absolute top-3 left-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/85 uppercase shadow-sm"
  >
    Green · liveable district land
  </p>
  <p
    class="pointer-events-none absolute top-3 right-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-[#ffad9d] uppercase shadow-sm"
  >
    Coral · excluded land
  </p>
</div>
