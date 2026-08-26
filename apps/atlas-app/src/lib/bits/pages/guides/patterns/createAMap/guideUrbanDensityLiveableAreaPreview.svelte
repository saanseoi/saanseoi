<script lang="ts">
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()

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

const liveableSource: StyleSpecification['sources'] = {
  'liveable-districts': {
    type: 'geojson',
    data: '/guides/urban-density-census-districts.geojson',
  },
}

const liveableLayers: LayerSpecification[] = [
  {
    id: 'liveable-districts',
    type: 'fill',
    source: 'liveable-districts',
    paint: { 'fill-color': '#36a269', 'fill-opacity': 0.48 },
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

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
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
