<script lang="ts">
import { m } from '#lib/bits/internal/i18n.js'

import GuideMappingPreview from './guideMappingPreview.svelte'
import { landAnalysisPath } from './guideUrbanDensityLiveableMap.ts'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
</script>

<div class="relative h-full overflow-hidden bg-[#10151a]">
  {#key `${styleUrl}:${tilejsonUrl}`}
    <GuideMappingPreview
      ariaLabel={label}
      center={[114.16, 22.32]}
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
      class="m-0 w-full max-w-130 border border-white/20 bg-[#171c25] p-5 text-white shadow-2xl"
      aria-labelledby="liveable-result-preview-title"
    >
      <h2
        id="liveable-result-preview-title"
        class="m-0 mb-4 font-mono text-sm font-bold leading-5 tracking-[0.08em] text-[#79e7d1] uppercase"
      >
        {m.guide_data_urban_density_liveable_result_preview_title()}
      </h2>
      <a
        class="block w-full border border-[#79e7d1] bg-[#43c6ad] px-4 py-2.5 text-center font-mono text-base font-bold text-[#10151a] no-underline hover:bg-[#79e7d1]"
        download="land-analysis.json.gz"
        href={landAnalysisPath}
      >
        {m.guide_data_urban_density_liveable_result_preview_download()}
      </a>
    </dialog>
  </div>
</div>
