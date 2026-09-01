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
const darkAreaTitleClasses: Record<string, string> = {
  'Hong Kong Island': 'text-[#5b8ff9]',
  Kowloon: 'text-[#f6bd16]',
  'New Territories': 'text-[#5ad8a6]',
}

type Props = {
  appearance: 'light' | 'dark'
  label: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  styleUrl: string
  tilejsonUrl: string
}

let { appearance, label, renderer, styleUrl, tilejsonUrl }: Props = $props()
</script>

<div
  class="guide-map-preview relative h-full min-h-[16.9rem] overflow-hidden border border-[#596074] bg-[#10151a] font-body text-[#d6e4ff] shadow-inner"
>
  <div class="size-full">
    {#key `${renderer}:${styleUrl}:${tilejsonUrl}`}
      <GuideMappingPreview
        ariaLabel={label}
        center={[114.165, 22.34]}
        {renderer}
        {styleUrl}
        {tilejsonUrl}
        zoom={11.5}
      />
    {/key}
    <p
      class="absolute top-3 left-3 rounded-sm bg-[#10151a]/90 px-2 py-1 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
    >
      {m.guide_data_urban_density_preview_density_title()}
    </p>
  </div>
  <section
    class="absolute inset-x-3 bottom-10 z-10 grid grid-cols-1 gap-2 sm:inset-x-8 sm:bottom-13 sm:grid-cols-3 sm:gap-3"
    aria-label={m.guide_data_urban_density_preview_density_label()}
  >
    {#each metrics as metric}
      <article
        class={`p-3 shadow-[0_12px_32px_rgb(0_0_0/24%)] sm:px-6 sm:py-4 ${appearance === 'dark' ? 'border border-white/20 bg-[#10151a]/92' : 'bg-[#fff9ed]'}`}
      >
        <p
          class={`font-body text-xs sm:text-sm ${appearance === 'dark' ? darkAreaTitleClasses[metric.name] : 'text-[#10151a]'}`}
        >
          {metric.name}
        </p>
        <strong
          class={`font-body text-[1.35rem] leading-none tracking-tight tabular-nums sm:my-1 sm:block sm:text-[2rem] ${appearance === 'dark' ? 'text-white' : 'text-[#10151a]'}`}
          >{Math.round(metric.peoplePerSqKm).toLocaleString()}</strong
        >
        <span
          class={`ml-0.75 inline font-body text-[0.68rem] leading-tight sm:ml-0 sm:block sm:text-xs ${appearance === 'dark' ? '' : 'text-[#10151a]'}`}
        >
          {#if appearance === 'dark'}
            <span class="text-white"
              >{m.guide_data_urban_density_preview_density_unit()}</span
            ><span class="text-white/65"
              >{m.guide_data_urban_density_preview_density_area_connector()}</span
            ><span class="text-white font-bold">{metric.landAreaSqKm.toFixed(1)}</span
            ><span class="text-white"
              >{m.guide_data_urban_density_preview_density_area_unit()}</span
            >
          {:else}
            {m.guide_data_urban_density_preview_density_for_area({
              area: metric.landAreaSqKm.toFixed(1),
            })}
          {/if}
        </span>
      </article>
    {/each}
  </section>
</div>
