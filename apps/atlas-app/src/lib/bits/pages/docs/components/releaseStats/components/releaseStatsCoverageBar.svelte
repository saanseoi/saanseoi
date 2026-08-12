<script lang="ts">
let {
  coverage,
  providedCoverage = coverage,
  label,
  ariaLabel,
}: {
  coverage: number
  providedCoverage?: number
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
  <span
    class="absolute inset-y-0 left-0 bg-data-success"
    style={`width: ${providedCoverage}%`}
  ></span>
  {#if coverage > providedCoverage}
    <span
      class="absolute inset-y-0 bg-data-alert"
      style={`left: ${providedCoverage}%; width: ${coverage - providedCoverage}%`}
    ></span>
  {/if}
  <span
    class={`absolute inset-y-0 flex font-mono text-caption font-normal tabular-nums ${labelFits === undefined ? 'invisible' : ''} ${labelFits ? 'left-0 items-center justify-end pr-2 text-data-on-primary' : 'items-center text-data-primary'}`}
    style={labelFits ? `width: ${coverage}%` : `left: ${coverage}%; transform: translateX(0.5rem)`}
    ><span bind:this={text} use:measure class="w-max">{label}</span></span
  >
</div>
