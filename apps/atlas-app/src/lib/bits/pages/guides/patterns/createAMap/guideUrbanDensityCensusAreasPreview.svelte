<script lang="ts">
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()

const censusDistrictsSource: StyleSpecification['sources'] = {
  'census-districts': {
    type: 'geojson',
    data: '/guides/urban-density-census-districts.geojson',
  },
}

const censusDistrictLayers: LayerSpecification[] = [
  {
    id: 'census-districts',
    type: 'fill',
    source: 'census-districts',
    paint: {
      'fill-color': [
        'match',
        ['get', 'area'],
        'Hong Kong Island',
        '#5b8ff9',
        'Kowloon',
        '#f6bd16',
        '#5ad8a6',
      ],
      'fill-opacity': 0.45,
    },
  },
  {
    id: 'census-districts-outline',
    type: 'line',
    source: 'census-districts',
    paint: { 'line-color': '#17253d', 'line-width': 1 },
  },
]
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${styleUrl}:${tilejsonUrl}`}
    <GuideMappingPreview
      ariaLabel={label}
      additionalLayers={censusDistrictLayers}
      additionalSources={censusDistrictsSource}
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
    Land-clipped C&amp;SD census districts · 2021
  </p>
</div>
