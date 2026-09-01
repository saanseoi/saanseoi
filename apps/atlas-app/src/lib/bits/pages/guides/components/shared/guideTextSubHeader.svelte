<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  id?: string
  title?: string
}

let { children, class: className = '', id, title }: Props = $props()
</script>

<h4 {id} class={`font-display text-base font-bold text-primary ${className}`}>
  {#if title}
    {@html title}
  {:else}
    {@render children?.()}
  {/if}
</h4>
