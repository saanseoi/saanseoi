<script lang="ts">
type CoastlinePath = { d: string }

type Props = {
  paths: readonly CoastlinePath[]
}

let { paths }: Props = $props()
</script>

<g
  class="fill-none stroke-secondary opacity-64 [stroke-linecap:round] [stroke-linejoin:round] stroke-[0.925]"
  filter="url(#harbour-glow)"
>
  {#each paths as path}
    <path d={path.d} />
  {/each}
</g>
