<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '$lib/bits/utilities/helpers/cn'
type Props = { children?: Snippet; class?: string }
let { children, class: className = '' }: Props = $props()
</script>
<div class={cn('flex items-center gap-2', className)}>{@render children?.()}</div>
