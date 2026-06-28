<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  children?: Snippet
  class?: string
  for?: string
}

let { children, class: className = '', for: htmlFor }: Props = $props()
</script>

{#if htmlFor}
  <!-- biome-ignore lint/a11y/noLabelWithoutControl: this wrapper associates with the control via the forwarded for prop. -->
  <label
    class={cn('font-body text-[0.84rem] font-semibold -tracking-display-lg text-foreground', className)}
    for={htmlFor}
  >
    {@render children?.()}
  </label>
{:else}
  <span
    class={cn('font-body text-[0.84rem] font-semibold -tracking-display-lg text-foreground', className)}
  >
    {@render children?.()}
  </span>
{/if}
