<script lang="ts">
let {
  region,
  version,
  pbfUrl,
}: {
  region: string
  version: string
  pbfUrl: string | null
} = $props()
</script>
<div class="mr-3 flex gap-2">
  {#if pbfUrl}
    <a
      class="rounded-default border border-outline-variant px-3 py-1.5 text-label-md hover:border-primary hover:text-primary"
      href={pbfUrl}
      >OSM PBF</a
    >
  {/if}
  <a
    class="rounded-default border border-outline-variant px-3 py-1.5 text-label-md hover:border-primary hover:text-primary"
    href={`https://tiles.saanseoi.hk/downloads/${region}/${version}.pmtiles`}
    >PMTiles</a
  >
</div>
