<script lang="ts">
type Route = { id: string; d: string }
type Vessel = {
  route: Route | undefined
  duration: number
  offset: number
  scale: number
  tone: string
}

type Props = {
  isActive: boolean
  vessel: Vessel
}

let { isActive, vessel }: Props = $props()
</script>

{#if vessel.route}
  <g class:opacity-48={vessel.tone === 'dim'}>
    {#if isActive}
      <animateMotion
        dur={`${vessel.duration}s`}
        begin={`-${vessel.offset}s`}
        repeatCount="indefinite"
        rotate="auto"
      >
        <mpath href={`#${vessel.route.id}`} />
      </animateMotion>
    {/if}
    <g transform={`scale(${vessel.scale})`}>
      <path
        class={`stroke-[color-mix(in_srgb,#0e0e0c_82%,transparent)] stroke-[0.35] [shape-rendering:geometricPrecision] ${
          vessel.tone === 'warm'
            ? 'fill-tertiary-fixed-dim'
            : vessel.tone === 'dim'
              ? 'fill-[color-mix(in_srgb,var(--on-tertiary-container)_70%,transparent)]'
              : 'fill-on-tertiary-container'
        }`}
        d="M -9 -4.2 L 10 0 L -9 4.2 Z"
      />
    </g>
  </g>
{/if}
