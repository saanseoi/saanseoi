<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  title?: string
}

let { children, class: className = '', title }: Props = $props()
</script>

<h1
  class={`max-w-[58rem] font-display text-display-md leading-[0.98] font-bold text-primary md:text-[4.5rem] ${className}`}
>
  {#if title}
    {@html title}
  {:else}
    {@render children?.()}
  {/if}
</h1>
