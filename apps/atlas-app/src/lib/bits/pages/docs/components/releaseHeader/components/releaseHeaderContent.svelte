<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  main: Snippet
  card?: Snippet
}

let { main, card: aside }: Props = $props()
</script>

<div
  class={`grid gap-8 px-6 py-7 md:px-8 lg:gap-10 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}
>
  {@render main()}
  {#if aside}
    {@render aside()}
  {/if}
</div>
