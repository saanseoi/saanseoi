<script lang="ts">
import { onMount } from 'svelte'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  loadCensusDistricts,
  type CensusDistrictCollection,
} from './urbanDensityCensusDistricts.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
let censusDistricts = $state<CensusDistrictCollection>()
let error = $state<string>()

const censusDistrictsSource = $derived<StyleSpecification['sources']>(
  censusDistricts
    ? { 'census-districts': { type: 'geojson', data: censusDistricts } }
    : {},
)

onMount(() => {
  void loadCensusDistricts()
    .then(value => (censusDistricts = value))
    .catch(cause => {
      error =
        cause instanceof Error ? cause.message : 'Census areas could not be loaded.'
    })
})

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
  {#if censusDistricts}
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
  {:else}
    <div
      class="grid size-full place-items-center px-6 text-center font-body text-body-sm text-white/70"
    >
      {error ?? 'Loading census areas…'}
    </div>
  {/if}
  <p
    class="pointer-events-none absolute top-3 left-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/85 uppercase shadow-sm"
  >
    Land-clipped C&amp;SD census districts · 2021
  </p>
</div>
