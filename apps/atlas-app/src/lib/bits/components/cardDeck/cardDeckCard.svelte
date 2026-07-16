<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Props = {
  as?: 'a' | 'article' | 'button' | 'div'
  children?: Snippet
  class?: string
  [attribute: string]: unknown
}

let { as = 'div', children, class: className = '', ...attributes }: Props = $props()
</script>

<svelte:element this={as} class={cn(className)} {...attributes}>
  {@render children?.()}
</svelte:element>
