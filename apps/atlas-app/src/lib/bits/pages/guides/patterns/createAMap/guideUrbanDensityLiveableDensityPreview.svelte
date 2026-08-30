<script lang="ts">
import { onMount } from 'svelte'
import { fly } from 'svelte/transition'

import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import GuideUrbanDensityLiveableLegend from './guideUrbanDensityLiveableLegend.svelte'
import {
  addUrbanDensityLiveableLand,
  loadCachedDistrictLand,
} from './guideUrbanDensityLiveableMap.ts'
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

onMount(() => {
  void loadCachedDistrictLand()
    .then(() => {
      requestAnimationFrame(() => {
        showMetrics = true
      })
    })
    .catch(() => {
      // The map helper reports an unavailable cached result without leaving an unhandled promise.
    })
})
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
        onMapReady={addUrbanDensityLiveableLand}
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
