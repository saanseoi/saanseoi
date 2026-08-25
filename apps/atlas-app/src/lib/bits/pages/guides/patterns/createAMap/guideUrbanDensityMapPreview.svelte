<script lang="ts">
type Props = {
  label: string
  src: string
}

let { label, src }: Props = $props()
</script>

<div class="relative h-full overflow-hidden bg-[#10151a] shadow-inner">
  <img class="h-full w-full object-cover opacity-90" {src} alt="">
  <div
    class="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-sm border border-white/20 bg-[#10151a]/90 px-3 py-2 font-mono text-[0.68rem] font-semibold tracking-[0.08em] text-white/80 uppercase shadow-sm"
  >
    <span>MapLibre preview</span>
    <span class="truncate text-right text-white/60">{label}</span>
  </div>
</div>
