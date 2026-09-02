<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

import GuideMappingPreview from './guideMappingPreview.svelte'
import { urbanDensityCensusDistricts } from './urbanDensityCensusDistricts.ts'

type Props = {
  label: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  styleUrl: string
  tilejsonUrl: string
}

let { label, renderer, styleUrl, tilejsonUrl }: Props = $props()
const censusDistricts = urbanDensityCensusDistricts
const censusAreaLegend = [
  {
    colour: '#5b8ff9',
    label: m.guide_data_urban_density_census_legend_hong_kong_island(),
  },
  { colour: '#f6bd16', label: m.guide_data_urban_density_census_legend_kowloon() },
  {
    colour: '#5ad8a6',
    label: m.guide_data_urban_density_census_legend_new_territories(),
  },
]

const censusDistrictsSource = $derived<StyleSpecification['sources']>(
  censusDistricts
    ? { 'census-districts': { type: 'geojson', data: censusDistricts } }
    : {},
)

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
  {#key `${renderer}:${styleUrl}:${tilejsonUrl}`}
    <GuideMappingPreview
      ariaLabel={label}
      additionalLayers={censusDistrictLayers}
      additionalSources={censusDistrictsSource}
      center={[114.165, 22.34]}
      {renderer}
      {styleUrl}
      {tilejsonUrl}
      zoom={10.25}
    />
  {/key}
  <p
    class="pointer-events-none absolute top-3 left-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/85 uppercase shadow-sm"
  >
    {m.guide_data_urban_density_census_preview_title()}
  </p>
  <ul
    class="pointer-events-none absolute right-3 bottom-3 flex flex-wrap justify-end gap-1.5 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/85 uppercase"
  >
    {#each censusAreaLegend as area}
      <li
        class="flex items-center gap-1.5 rounded-sm bg-[#10151a]/90 px-2 py-1 shadow-sm"
      >
        <span
          class="size-2 shrink-0"
          style={`background-color: ${area.colour}`}
          aria-hidden="true"
        ></span>
        {area.label}
      </li>
    {/each}
  </ul>
</div>
