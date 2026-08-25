<script lang="ts">
import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  calculateUrbanDensityMetrics,
  urbanDensityDivisionsResponse,
  urbanDensityStatsResponses,
} from './urbanDensityExampleData.ts'

const [populationResponse, landAreaResponse] = urbanDensityStatsResponses
const metrics = calculateUrbanDensityMetrics(
  urbanDensityDivisionsResponse,
  populationResponse.values,
  landAreaResponse.values,
)

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
</script>

<div
  class="overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div class="relative h-52 overflow-hidden sm:h-64">
    {#key `${styleUrl}:${tilejsonUrl}`}
      <GuideMappingPreview
        ariaLabel={label}
        center={[114.165, 22.34]}
        renderer="maplibre"
        {styleUrl}
        {tilejsonUrl}
        zoom={10.5}
      />
    {/key}
    <p
      class="absolute top-3 left-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
    >
      Calculated district-land density
    </p>
    <p
      class="absolute right-3 bottom-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] text-white/80 shadow-sm"
    >
      SaanSeoi Basemap
    </p>
  </div>
  <section
    class="grid divide-y divide-[#596074] bg-[#131722] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    aria-label="District-land population density"
  >
    {#each metrics as metric}
      <article class="p-4">
        <p class="text-label-sm font-semibold text-[#a5d6ff]">{metric.name}</p>
        <strong class="mt-1 block text-2xl leading-none text-white"
          >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
        >
        <span class="mt-1 block text-xs text-white/60">people per km²</span>
        <span class="mt-3 block text-xs text-white/45"
          >{metric.population.toLocaleString()}
          people · {metric.landAreaSqKm.toFixed(2)} km²</span
        >
      </article>
    {/each}
  </section>
</div>
