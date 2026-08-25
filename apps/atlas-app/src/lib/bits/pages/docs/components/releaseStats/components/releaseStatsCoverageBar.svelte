<script lang="ts">
let {
  coverage,
  segments,
  label,
  ariaLabel,
}: {
  coverage: number
  segments: Array<{
    tone: 'provided' | 'inferred' | 'ai-translated' | 'human-translated'
    value: number
  }>
  label: string
  ariaLabel: string
} = $props()
let labelFits = $state<boolean>()
let text = $state<HTMLElement>()
function measure(node: HTMLElement) {
  const update = () => {
    const track = node.parentElement
    if (!track) return
    const fill = (track.clientWidth * coverage) / 100
    const width = node.getBoundingClientRect().width
    labelFits = fill >= width + 16 || track.clientWidth - fill < width + 8
  }
  const observer = new ResizeObserver(update)
  observer.observe(node.parentElement ?? node)
  update()
  return { update, destroy: () => observer.disconnect() }
}
</script>
<div
  class="relative h-5 overflow-hidden bg-data-track"
  role="img"
  aria-label={ariaLabel}
>
  {#each segments as segment, index}
    <span
      class={`absolute inset-y-0 ${
        segment.tone === 'provided'
          ? 'bg-data-success'
          : segment.tone === 'inferred'
            ? 'bg-data-inferred'
            : segment.tone === 'ai-translated'
              ? 'bg-data-ai-translated'
              : 'bg-data-human-translated'
      }`}
      style={`left: ${segments.slice(0, index).reduce((total, item) => total + item.value, 0)}%; width: ${segment.value}%`}
    ></span>
  {/each}
  <span
    class={`absolute inset-y-0 flex font-mono text-caption font-normal tabular-nums ${labelFits === undefined ? 'invisible' : ''} ${labelFits ? 'left-0 items-center justify-end pr-2 text-data-on-primary' : 'items-center text-data-primary'}`}
    style={labelFits ? `width: ${coverage}%` : `left: ${coverage}%; transform: translateX(0.5rem)`}
    ><span bind:this={text} use:measure class="w-max">{label}</span></span
  >
</div>
