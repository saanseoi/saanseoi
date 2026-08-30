<script lang="ts">
import { onMount } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  addUrbanDensityLiveableLand,
  landAnalysisPath,
  loadCachedDistrictLand,
} from './guideUrbanDensityLiveableMap.ts'
import type { DistrictLand } from './urbanDensityCensusDistricts.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
let districtLand = $state.raw<DistrictLand | undefined>(undefined)
let resultReady = $state(false)

onMount(async () => {
  districtLand = await loadCachedDistrictLand()
  resultReady = true
})
</script>

<div class="relative h-full overflow-hidden bg-[#10151a]">
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
  <div
    class="absolute inset-0 flex items-center justify-center bg-[#10151a]/55 p-4 sm:p-8"
  >
    <dialog
      open
      class="m-0 flex max-h-full w-full max-w-[32.5rem] flex-col overflow-hidden border border-white/20 bg-[#171c25] p-5 font-body text-white shadow-2xl sm:p-7"
      aria-labelledby="liveable-result-preview-title"
    >
      <h2
        id="liveable-result-preview-title"
        class="font-mono text-label-sm font-bold tracking-[0.08em] text-[#79e7d1] uppercase"
      >
        {m.guide_data_urban_density_liveable_result_preview_title()}
      </h2>
      <p class="mt-2 text-body-sm leading-6 text-white/80">
        {m.guide_data_urban_density_liveable_result_preview_description()}
      </p>
      {#if resultReady && districtLand}
        <a
          class="mt-5 block w-full border border-[#79e7d1] bg-[#43c6ad] px-4 py-2.5 text-center font-mono text-base font-bold text-[#10151a] no-underline hover:bg-[#79e7d1]"
          download="land-analysis.json"
          href={landAnalysisPath}
        >
          {m.guide_data_urban_density_liveable_result_preview_download()}
        </a>
      {:else}
        <p class="mt-5 text-body-sm text-white/80" role="status">
          {m.guide_data_urban_density_liveable_result_preview_loading()}
        </p>
      {/if}
    </dialog>
  </div>
</div>
