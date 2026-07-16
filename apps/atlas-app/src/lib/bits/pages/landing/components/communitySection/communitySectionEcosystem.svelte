<script lang="ts">
import CommunitySectionPacket from './communitySectionPacket.svelte'
import type { ActiveDataPacket, GreenCreatureState } from './communitySectionTypes'

type Props = {
  packets: ActiveDataPacket[]
  collectors: GreenCreatureState[]
  packetElements: Record<number, HTMLSpanElement | undefined>
  collectorElements: Record<number, HTMLSpanElement | undefined>
  signal?: HTMLDivElement
  orangeCreature?: HTMLSpanElement
  onpacketsettled: (packetId: number) => void
}

let {
  packets,
  collectors,
  packetElements = $bindable(),
  collectorElements = $bindable(),
  signal = $bindable(),
  orangeCreature = $bindable(),
  onpacketsettled,
}: Props = $props()
</script>

<div class="newsletter-signal" aria-hidden="true" bind:this={signal}>
  <span class="newsletter-orange-route">
    <span class="newsletter-orange-platform newsletter-orange-platform-first">水</span>
    <span class="newsletter-orange-platform newsletter-orange-platform-second">山</span>
    <span
      class="newsletter-creature newsletter-creature-orange"
      bind:this={orangeCreature}
    ></span>
  </span>

  {#each collectors as collector, collectorIndex (collector.id)}
    <span
      class={`newsletter-creature newsletter-creature-collector newsletter-creature-collector-${String.fromCharCode(97 + collectorIndex)}`}
      class:newsletter-creature-collector-glowing={collector.glowing}
      bind:this={collectorElements[collector.id]}
      style={`width: ${collector.size}px; transform: translate(${collector.x}px, ${collector.y}px) rotate(${collector.rotation}deg); --collector-duration: ${collector.duration}ms;`}
    ></span>
  {/each}

  {#each packets as packet (packet.id)}
    <CommunitySectionPacket
      {packet}
      bind:element={packetElements[packet.id]}
      onsettled={onpacketsettled}
    />
  {/each}
</div>
