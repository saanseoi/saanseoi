<script lang="ts">
import topoImage from '$lib/assets/topo.jpg'

type Props = {
  accent: string
  index: number
  isDragging?: boolean
  muted?: boolean
}

let { accent, index, isDragging = false, muted = false }: Props = $props()
let style = $derived(
  `--release-accent: ${accent}; --release-topo-image: url('${topoImage}'); --release-topo-x: ${(index % 4) * 25}%; --release-topo-y: ${(Math.floor(index / 4) % 4) * 25}%; --release-topo-scale-x: ${index % 2 === 0 ? 1 : -1}; --release-topo-scale-y: ${index % 3 === 0 ? -1 : 1};`,
)
</script>

<span
  class={`pointer-events-none absolute inset-[-10%] z-1 bg-(image:--release-topo-image) bg-no-repeat bg-position-[var(--release-topo-x)_var(--release-topo-y)] bg-size-[70rem_auto] opacity-[0.14] mix-blend-multiply filter-[saturate(.58)_contrast(.92)] transform-[scale(var(--release-topo-scale-x),var(--release-topo-scale-y))] transition-[opacity,background-size] duration-500 group-hover:bg-size-[74rem_auto] group-hover:opacity-[0.2] group-focus-within:bg-size-[74rem_auto] group-focus-within:opacity-[0.2] ${muted ? 'opacity-[0.08] group-hover:opacity-[0.12] group-focus-within:opacity-[0.12]' : ''} ${isDragging ? 'opacity-[0.2]' : ''}`}
  {style}
  aria-hidden="true"
></span>
