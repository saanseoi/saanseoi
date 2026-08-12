<script lang="ts">
import type { ActiveDataPacket } from './communitySectionTypes'

type Props = {
  packet: ActiveDataPacket
  element?: HTMLSpanElement
  onsettled: (packetId: number) => void
}

let { packet, element = $bindable(), onsettled }: Props = $props()
</script>

<span
  class="newsletter-packet"
  class:newsletter-packet-derezzing={packet.consumed}
  bind:this={element}
  onanimationend={() => onsettled(packet.id)}
  style={`--packet-origin-x: ${packet.originX}%; --packet-origin-y: ${packet.originY}%; --packet-eighth-x: ${packet.eighthX}%; --packet-eighth-y: ${packet.eighthY}%; --packet-quarter-x: ${packet.quarterX}%; --packet-quarter-y: ${packet.quarterY}%; --packet-three-eighth-x: ${packet.threeEighthX}%; --packet-three-eighth-y: ${packet.threeEighthY}%; --packet-midpoint-x: ${packet.midpointX}%; --packet-midpoint-y: ${packet.midpointY}%; --packet-five-eighth-x: ${packet.fiveEighthX}%; --packet-five-eighth-y: ${packet.fiveEighthY}%; --packet-three-quarter-x: ${packet.threeQuarterX}%; --packet-three-quarter-y: ${packet.threeQuarterY}%; --packet-seven-eighth-x: ${packet.sevenEighthX}%; --packet-seven-eighth-y: ${packet.sevenEighthY}%; --packet-target-x: ${packet.targetX}%; --packet-target-y: ${packet.targetY}%; --packet-duration: ${packet.duration}ms; --packet-rotation: ${packet.rotation}deg;`}
>
  {packet.label}
  {#if packet.consumed}
    <span class="newsletter-packet-fragments" aria-hidden="true">
      {#each packet.fragments as fragment}
        <span
          class="newsletter-packet-fragment"
          style={`--fragment-delay: ${fragment.delay}ms; --fragment-x: ${fragment.x}; --fragment-y: ${fragment.y};`}
        ></span>
      {/each}
    </span>
  {/if}
</span>
