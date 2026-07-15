<script lang="ts">
import FoundationSectionOrangeVessel from './foundationSectionOrangeVessel.svelte'
import FoundationSectionStarFerry from './foundationSectionStarFerry.svelte'

type Route = { id: string; d: string }
type StarFerry = {
  route: Route | undefined
  duration: number
  offset: number
  scale: number
}
type OrangeVessel = StarFerry & {
  tone: string
}

type Props = {
  isActive: boolean
  starFerryFleet: readonly StarFerry[]
  orangeVesselFleet: readonly OrangeVessel[]
}

let { isActive, starFerryFleet, orangeVesselFleet }: Props = $props()
</script>

<g clip-path="url(#foundation-map-clip)" aria-hidden="true">
  {#each starFerryFleet as vessel}
    <FoundationSectionStarFerry {isActive} {vessel} />
  {/each}

  {#each orangeVesselFleet as vessel}
    <FoundationSectionOrangeVessel {isActive} {vessel} />
  {/each}
</g>
