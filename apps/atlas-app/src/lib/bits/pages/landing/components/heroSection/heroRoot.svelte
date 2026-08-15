<script lang="ts">
import type { Snippet } from 'svelte'

import { cn } from '#lib/bits/utilities/helpers/cn.js'

type Props = {
  children?: Snippet
  class?: string
}

let { children, class: className = '' }: Props = $props()
</script>

<section
  class={cn(
    'landing-hero relative h-[max(36.75rem,calc(100svh-var(--landing-header-height,4.5rem)))] min-h-147 overflow-hidden max-[785px]:h-[calc(100svh-var(--landing-header-height,4.5rem))] max-[785px]:min-h-0 min-[1024px]:h-[max(42.75rem,calc(100svh-var(--landing-header-height,4.5rem)))] min-[1024px]:min-h-171',
    className
  )}
>
  {@render children?.()}
</section>
