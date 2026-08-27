<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

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
  <div class="relative min-h-52 flex-1 overflow-hidden">
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
      {m.guide_data_urban_density_preview_density_title()}
    </p>
    <p
      class="absolute right-3 bottom-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] text-white/80 shadow-sm"
    >
      SaanSeoi Basemap
    </p>
  </div>
  <section
    class="grid grid-cols-3 gap-px bg-[#26433d] shadow-[0_12px_32px_rgb(0_0_0/24%)]"
    aria-label={m.guide_data_urban_density_preview_density_label()}
  >
    {#each metrics as metric}
      <article class="bg-[#fff9ed] p-2.5 sm:px-5 sm:py-4">
        <p class="font-body text-xs text-[#10151a] sm:text-sm">{metric.name}</p>
        <strong
          class="font-body text-[1.35rem] leading-none tracking-tight tabular-nums text-[#10151a] sm:my-1 sm:block sm:text-[2rem]"
          >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
        >
        <span
          class="ml-0.75 inline font-body text-[0.68rem] leading-tight text-[#10151a] sm:ml-0 sm:block sm:text-xs"
          >{m.guide_data_urban_density_preview_density_for_area({
            area: metric.landAreaSqKm.toFixed(1),
          })}</span
        >
      </article>
    {/each}
  </section>
</div>
