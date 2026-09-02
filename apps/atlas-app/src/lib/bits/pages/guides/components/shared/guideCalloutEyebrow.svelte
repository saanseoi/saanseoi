<script lang="ts">
import type { Snippet } from 'svelte'

type Props = {
  children?: Snippet
  class?: string
  text?: string
}

let { children, class: className = '', text }: Props = $props()
</script>

<p
  class={`font-mono text-[0.7rem] font-bold tracking-[0.08em] text-secondary uppercase ${className}`}
>
  {#if text}
    {@html text}
  {:else}
    {@render children?.()}
  {/if}
</p>
