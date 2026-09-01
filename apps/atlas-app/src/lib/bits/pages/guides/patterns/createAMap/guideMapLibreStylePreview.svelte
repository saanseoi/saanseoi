<script lang="ts">
import GuideMappingPreview from './guideMappingPreview.svelte'
import type { CreateAMapOpeningPosition } from '#lib/guides/createAMapSelections.js'

type Props = {
  label: string
  renderer: 'leaflet' | 'mapbox' | 'maplibre'
  styleUrl: string
  tilejsonUrl: string
  openingPosition: CreateAMapOpeningPosition
}

let { label, renderer, styleUrl, tilejsonUrl, openingPosition }: Props = $props()

const previewTilejsonUrl = $derived(
  import.meta.env.VITE_SAANSEOI_API_KEY
    ? `${tilejsonUrl}?access_token=${encodeURIComponent(import.meta.env.VITE_SAANSEOI_API_KEY)}`
    : tilejsonUrl,
)
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${renderer}:${styleUrl}:${previewTilejsonUrl}:${openingPosition.center.join(',')}:${openingPosition.zoom}`}
    <GuideMappingPreview
      ariaLabel={label}
      center={openingPosition.center}
      {renderer}
      {styleUrl}
      tilejsonUrl={previewTilejsonUrl}
      zoom={openingPosition.zoom}
    />
  {/key}
  <div
    class="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
  >
    <span>SaanSeoi Basemap</span>
    <span class="truncate text-right text-white/60">{label}</span>
  </div>
</div>
