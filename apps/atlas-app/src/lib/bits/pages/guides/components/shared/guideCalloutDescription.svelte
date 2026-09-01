<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  description?: string
}

let { children, class: className = '', description }: Props = $props()
</script>

<p
  class={`mt-[0.45rem] font-body text-sm leading-[1.6] text-foreground-alt ${className}`}
>
  {#if description}
    {@html description}
  {:else}
    {@render children?.()}
  {/if}
</p>
