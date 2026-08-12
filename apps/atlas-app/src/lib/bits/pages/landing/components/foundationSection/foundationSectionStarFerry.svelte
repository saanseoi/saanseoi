<script lang="ts">
type Route = { id: string; d: string }
type Vessel = {
  route: Route | undefined
  duration: number
  offset: number
  scale: number
}

type Props = {
  isActive: boolean
  vessel: Vessel
}

let { isActive, vessel }: Props = $props()
</script>

{#if vessel.route}
  <g class="opacity-72">
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
      <ellipse
        class="fill-[color-mix(in_srgb,var(--secondary-fixed-dim)_72%,#163b2e)] stroke-[color-mix(in_srgb,#0e0e0c_86%,transparent)] stroke-[1.15]"
        cx="0"
        cy="0"
        rx="14"
        ry="4.8"
      />
      <ellipse
        class="fill-[color-mix(in_srgb,var(--secondary-fixed-dim)_78%,#ffffff)]"
        cx="1.4"
        cy="0"
        rx="8.8"
        ry="2.6"
      />
    </g>
  </g>
{/if}
