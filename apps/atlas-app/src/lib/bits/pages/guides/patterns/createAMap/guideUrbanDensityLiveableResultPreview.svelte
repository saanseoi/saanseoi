<script lang="ts">
import { onMount } from 'svelte'

import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import {
  addUrbanDensityLiveableLand,
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

function serialiseResult() {
  if (!districtLand) return
  return JSON.stringify(
    {
      liveableDistrictLand: {
        type: 'FeatureCollection',
        features: districtLand.liveableDistrictLand,
      },
      excludedDistrictLand: {
        type: 'FeatureCollection',
        features: districtLand.excludedDistrictLand,
      },
    },
    null,
    2,
  )
}

function downloadResult() {
  const resultJson = serialiseResult()
  if (!resultJson) return
  const download = document.createElement('a')
  const downloadUrl = URL.createObjectURL(
    new Blob([resultJson], { type: 'application/json' }),
  )
  download.href = downloadUrl
  download.download = 'land-analysis.json'
  download.click()
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
}
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
      class="m-0 flex max-h-full w-full max-w-3xl flex-col overflow-hidden border border-white/20 bg-[#171c25] p-5 font-body text-white shadow-2xl sm:p-7"
      aria-labelledby="liveable-result-preview-title"
    >
      <p
        class="font-mono text-label-sm font-bold tracking-[0.08em] text-[#79e7d1] uppercase"
      >
        {m.guide_data_urban_density_liveable_result_preview_title()}
      </p>
      <p class="mt-2 text-body-sm leading-6 text-white/80">
        {m.guide_data_urban_density_liveable_result_preview_description()}
      </p>
      {#if resultReady && districtLand}
        <button
          class="mt-5 border border-[#79e7d1] bg-[#43c6ad] px-4 py-2.5 font-mono text-label-sm font-bold text-[#10151a] hover:bg-[#79e7d1]"
          type="button"
          onclick={downloadResult}
        >
          {m.guide_data_urban_density_liveable_result_preview_download()}
        </button>
      {:else}
        <p class="mt-5 text-body-sm text-white/80" role="status">
          {m.guide_data_urban_density_liveable_result_preview_loading()}
        </p>
      {/if}
    </dialog>
  </div>
</div>
