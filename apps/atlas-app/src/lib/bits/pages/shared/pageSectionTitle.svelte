<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '$lib/bits/utilities/helpers/cn'
type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>
<h2 class={cn('font-display text-headline-md font-bold text-primary', className)}>
  {@render children?.()}
</h2>
