<script lang="ts">
import type { Snippet } from 'svelte'
import { cn } from '$lib/bits/utilities/helpers/cn'
type Props = { id?: string; children?: Snippet; class?: string }
let { id, children, class: className = '' }: Props = $props()
</script>
<section {id} class={cn('mt-16', className)}>{@render children?.()}</section>
