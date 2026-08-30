<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import GuideUrbanDensityLiveableLegend from './guideUrbanDensityLiveableLegend.svelte'
import { addUrbanDensityLiveableLand } from './guideUrbanDensityLiveableMap.ts'
import { calculateUrbanDensityLiveableMetrics } from './urbanDensityExampleData.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
const metrics = calculateUrbanDensityLiveableMetrics()
</script>

<div
  class="guide-map-preview flex h-full min-h-0 flex-col overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div
    class="relative min-h-64 flex-1 overflow-hidden in-data-[guide-map-expanded=true]:h-auto in-data-[guide-map-expanded=true]:flex-[1_1_auto]"
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
  {#if metrics}
    <section
      class="shrink-0 grid grid-cols-3 gap-px bg-[#26433d] shadow-[0_12px_32px_rgb(0_0_0/24%)]"
      aria-label={m.guide_data_urban_density_liveable_density_label()}
    >
      {#each metrics as metric}
        <article class="bg-[#fff9ed] p-2.5 sm:px-5 sm:py-4">
          <p class="font-body text-xs text-[#10151a] sm:text-sm">{metric.name}</p>
          <strong
            class="font-body text-[1.35rem] leading-none tracking-tight tabular-nums text-[#10151a] sm:my-1 sm:block sm:text-[2rem]"
            >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
          >
          <span
            class="ml-0.75 inline font-body text-[0.68rem] leading-tight text-[#52615d] sm:ml-0 sm:block sm:text-xs"
            >{m.guide_data_urban_density_people_per_square_kilometre()}</span
          >
          <p
            class="mt-1 font-body text-[0.68rem] leading-tight text-[#52615d] sm:mt-2 sm:text-xs"
          >
            <strong class="font-semibold text-[#10151a]"
              >{metric.liveablePercentage.toFixed(0)}%</strong
            >
            {m.guide_data_urban_density_liveable_density_or()}
            <strong class="font-semibold text-[#10151a]"
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
