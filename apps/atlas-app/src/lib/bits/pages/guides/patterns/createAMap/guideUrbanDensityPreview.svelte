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
  class="guide-map-preview flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div class="guide-map-preview-canvas relative h-52 shrink-0 overflow-hidden sm:h-64">
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
    class="grid gap-px bg-[#26433d] shadow-[0_12px_32px_rgb(0_0_0/24%)] sm:grid-cols-3"
    aria-label="Urban population density"
  >
    {#each metrics as metric}
      <article class="bg-[#fff9ed] p-4 sm:px-5">
        <p class="font-body text-sm text-[#10151a]">{metric.name}</p>
        <strong class="my-1 block font-body text-[2rem] leading-none text-[#10151a]"
          >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
        >
        <span class="block font-body text-xs text-[#10151a]"
          >people per km² on {metric.landAreaSqKm.toFixed(1)} km²</span
        >
      </article>
    {/each}
  </section>
</div>

<style>
:global([data-guide-map-expanded="true"]) .guide-map-preview-canvas {
  height: auto;
  flex: 1 1 auto;
}
</style>
