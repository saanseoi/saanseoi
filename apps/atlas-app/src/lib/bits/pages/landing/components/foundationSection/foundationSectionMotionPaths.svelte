<script lang="ts">
type Route = { id: string; d: string }

type Props = {
  visibleRoutes: readonly Route[]
  orangeRoutes: readonly Route[]
}

let { visibleRoutes, orangeRoutes }: Props = $props()
</script>

<g class="invisible" clip-path="url(#foundation-map-clip)" aria-hidden="true">
  {#each visibleRoutes as route}
    <path id={route.id} d={route.d} />
  {/each}
  {#each orangeRoutes as route}
    <path id={route.id} d={route.d} />
  {/each}
</g>
