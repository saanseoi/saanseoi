<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '#lib/bits/utilities/helpers/cn.js'
type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>
<h1
  class={cn('max-w-6xl font-display text-display-md leading-[0.98] font-bold text-primary md:text-[4.5rem]', className)}
>
  {@render children?.()}
</h1>
