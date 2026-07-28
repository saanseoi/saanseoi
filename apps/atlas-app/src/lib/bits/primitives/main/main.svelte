<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '$lib/bits/utilities/helpers/cn'

type Variant = 'default' | 'page'

type Props = {
  children?: Snippet
  class?: string
  style?: string
  variant?: Variant
}

const variantClasses: Record<Variant, string> = {
  default: '',
  page: 'mx-auto w-full max-w-(--spacing-container-max) px-6 md:px-8',
}

let {
  children,
  class: className = '',
  style = '',
  variant = 'default',
}: Props = $props()
</script>

<main class={cn(variantClasses[variant], className)} {style}>
  {@render children?.()}
</main>
