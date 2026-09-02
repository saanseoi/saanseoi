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
  class={`font-body text-label-md font-semibold tracking-[0.12em] text-secondary uppercase ${className}`}
>
  {#if text}
    {@html text}
  {:else}
    {@render children?.()}
  {/if}
</p>
