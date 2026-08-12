<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '$lib/bits/utilities/helpers/cn'
type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>
<div
  class={cn('flex flex-col gap-2 border-b border-outline-variant pb-4 sm:flex-row sm:items-end sm:justify-between', className)}
>
  {@render children?.()}
</div>
