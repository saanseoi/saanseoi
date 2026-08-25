<script lang="ts">
import GuideMappingPreview from './guideMappingPreview.svelte'

type Props = {
  label: string
  styleUrl: string
  tilejsonUrl: string
}

let { label, styleUrl, tilejsonUrl }: Props = $props()
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  {#key `${styleUrl}:${tilejsonUrl}`}
    <GuideMappingPreview
      ariaLabel={label}
      center={[114.1694, 22.3193]}
      renderer="maplibre"
      {styleUrl}
      {tilejsonUrl}
      zoom={10.5}
    />
  {/key}
  <div
    class="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
  >
    <span>SaanSeoi Basemap</span>
    <span class="truncate text-right text-white/60">{label}</span>
  </div>
</div>
