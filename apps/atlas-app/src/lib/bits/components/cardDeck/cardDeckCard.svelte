<script lang="ts">
import type { Snippet } from 'svelte'
import { fly } from 'svelte/transition'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = {
  as?: 'a' | 'article' | 'button' | 'div'
  children?: Snippet
  class?: string
  intro?: { delay?: number; duration?: number; y?: number }
  [attribute: string]: unknown
}

let {
  as = 'div',
  children,
  class: className = '',
  intro,
  ...attributes
}: Props = $props()

const maybeFly = (node: Element) => (intro ? fly(node, intro) : { duration: 0 })
</script>

<svelte:element this={as} in:maybeFly class={cn(className)} {...attributes}>
  {@render children?.()}
</svelte:element>
