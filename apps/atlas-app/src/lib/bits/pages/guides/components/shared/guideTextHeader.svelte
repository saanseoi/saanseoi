<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  as?: 'h2' | 'h3' | 'h4' | 'span'
  children?: Snippet
  class?: string
  id?: string
  title?: string
}

let { as = 'h2', children, class: className = '', id, title }: Props = $props()
</script>

<svelte:element
  this={as}
  {id}
  class={`block font-display text-headline-md leading-tight font-bold text-primary ${className}`}
>
  {#if title}
    {@html title}
  {:else}
    {@render children?.()}
  {/if}
</svelte:element>
