<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  main: Snippet
  card?: Snippet
  showBackground?: boolean
}

let { main, card: aside, showBackground = false }: Props = $props()
</script>

<div
  class={`grid gap-8 px-6 py-7 md:px-8 lg:gap-10 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''} ${showBackground ? 'release-header-image-content bg-surface-container-lowest/60' : ''}`}
>
  {@render main()}
  {#if aside}
    {@render aside()}
  {/if}
</div>

<style>
.release-header-image-content {
  text-shadow:
    0 1px 1px color-mix(in srgb, var(--surface-container-lowest) 86%, transparent),
    0 1px 0.75rem color-mix(in srgb, var(--surface-container-lowest) 68%, transparent);
}
</style>
